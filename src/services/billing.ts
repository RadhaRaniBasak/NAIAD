/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Subscription Billing & Webhook Management (Stripe-compatible)
 * Features:
 * - Webhook as source of truth for subscription state
 * - HMAC signature verification over the raw request body, with Stripe's five-minute replay window
 * - Idempotency via the processed_webhook_events table in src/db/schema.sql (safe to replay twice)
 * - Event handling: invoice.paid, invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted, charge.refunded
 * - Single helper feature gating: hasFeature(orgOrPlan, feature)
 */

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { env } from '../config/env.ts';
import { getDb } from '../db/index.ts';
import { logger } from '../utils/logger.ts';
import type { SubscriptionPlan } from './permissions.ts';

export type FeatureKey =
  | 'standard_missions'
  | 'community_checks'
  | 'crews'
  | 'weather_demand'
  | 'custom_access_points'
  | 'trace_bisection'
  | 'fhir_bridge'
  | 'unlimited_crews'
  | 'custom_retention';

const PLAN_CONFIG: Record<
  SubscriptionPlan,
  {
    name: string;
    monthlyPriceCents: number;
    features: FeatureKey[];
  }
> = {
  pilot: {
    name: 'Pilot (Academic & Community)',
    monthlyPriceCents: 0,
    features: ['standard_missions', 'community_checks'],
  },
  standard: {
    name: 'Standard Municipality',
    monthlyPriceCents: 4900, // $49.00
    features: [
      'standard_missions',
      'community_checks',
      'crews',
      'weather_demand',
      'custom_access_points',
    ],
  },
  enterprise: {
    name: 'Enterprise Basin Authority',
    monthlyPriceCents: 24900, // $249.00
    features: [
      'standard_missions',
      'community_checks',
      'crews',
      'weather_demand',
      'custom_access_points',
      'trace_bisection',
      'fhir_bridge',
      'unlimited_crews',
      'custom_retention',
    ],
  },
};

/** The parts of a Stripe event this service reads. Other fields are accepted and ignored. */
export const StripeEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.object({
    object: z.looseObject({
      client_reference_id: z.string().nullish(),
      amount_refunded: z.number().nullish(),
      metadata: z
        .looseObject({ organization_id: z.string().optional(), plan_tier: z.string().optional() })
        .nullish(),
    }),
  }),
});
export type StripeEvent = z.infer<typeof StripeEventSchema>;

/** Stripe's replay window: a signature whose timestamp is further than this from now is refused. */
const SIGNATURE_TOLERANCE_S = 300;

export class BillingService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync = getDb()) {
    this.db = db;
  }

  /**
   * Single helper to gate features by plan.
   */
  public hasFeature(orgOrPlan: { subscription_plan?: string } | string, feature: FeatureKey): boolean {
    const plan = (typeof orgOrPlan === 'string' ? orgOrPlan : orgOrPlan.subscription_plan || 'pilot') as SubscriptionPlan;
    const config = PLAN_CONFIG[plan] || PLAN_CONFIG.pilot;
    return config.features.includes(feature);
  }

  /**
   * Verify a Stripe webhook signature (header format: `t=timestamp,v1=signature[,v1=...]`).
   * `rawPayload` must be the request body exactly as received: the signature covers its bytes.
   */
  public verifySignature(rawPayload: string, signatureHeader: string, now = Date.now()): boolean {
    const parts = signatureHeader.split(',').map((part) => part.trim());
    const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2);
    const signatures = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
    if (!timestamp || signatures.length === 0) return false;

    // Written so that a timestamp that is not a number is refused too.
    if (!(Math.abs(now / 1000 - Number(timestamp)) <= SIGNATURE_TOLERANCE_S)) return false;

    const expected = Buffer.from(
      crypto
        .createHmac('sha256', env.STRIPE_WEBHOOK_SECRET)
        .update(`${timestamp}.${rawPayload}`)
        .digest('hex'),
      'utf8'
    );

    // Stripe sends one v1 signature per active secret. timingSafeEqual throws on unequal
    // lengths, so a wrong-sized signature is rejected first.
    return signatures.some((signature) => {
      const received = Buffer.from(signature, 'utf8');
      return received.length === expected.length && crypto.timingSafeEqual(received, expected);
    });
  }

  /**
   * Idempotent webhook event processor.
   * If event was previously processed, exits cleanly without duplicating effects.
   */
  public handleWebhookEvent(event: StripeEvent): { status: 'processed' | 'already_processed'; eventId: string } {
    // 1. Check idempotency: has this event already been processed?
    const existing = this.db
      .prepare('SELECT event_id FROM processed_webhook_events WHERE event_id = ?')
      .get(event.id);

    if (existing) {
      logger.info(`[BillingService] Event ${event.id} already processed. Skipping idempotently.`);
      return { status: 'already_processed', eventId: event.id };
    }

    const payloadObj = event.data.object;
    const orgId = payloadObj.metadata?.organization_id || payloadObj.client_reference_id;

    // 2. Handle state transitions by event type
    switch (event.type) {
      case 'invoice.paid': {
        if (orgId) {
          this.db
            .prepare(`
              UPDATE organizations 
              SET is_active = 1, updated_at = CURRENT_TIMESTAMP 
              WHERE id = ?
            `)
            .run(orgId);
        }
        break;
      }

      case 'invoice.payment_failed': {
        logger.warn(`[BillingService] Payment failed for organization: ${orgId}`);
        // Can trigger email notification job
        break;
      }

      case 'customer.subscription.updated': {
        const newPlan = payloadObj.metadata?.plan_tier || 'standard';
        if (orgId && Object.hasOwn(PLAN_CONFIG, newPlan)) {
          this.db
            .prepare(`
              UPDATE organizations 
              SET subscription_plan = ?, updated_at = CURRENT_TIMESTAMP 
              WHERE id = ?
            `)
            .run(newPlan, orgId);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        if (orgId) {
          // Downgrade to free pilot plan
          this.db
            .prepare(`
              UPDATE organizations 
              SET subscription_plan = 'pilot', updated_at = CURRENT_TIMESTAMP 
              WHERE id = ?
            `)
            .run(orgId);
        }
        break;
      }

      case 'charge.refunded': {
        const amountCents = payloadObj.amount_refunded || 0;
        logger.info(`[BillingService] Recorded refund of ${amountCents} cents for org: ${orgId}`);
        break;
      }

      default:
        logger.info(`[BillingService] Unhandled event type: ${event.type}`);
    }

    // 3. Record event as processed
    this.db
      .prepare(`
        INSERT INTO processed_webhook_events (event_id, event_type, organization_id)
        VALUES (?, ?, ?)
      `)
      .run(event.id, event.type, orgId || null);

    return { status: 'processed', eventId: event.id };
  }
}
