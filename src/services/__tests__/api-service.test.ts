/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Comprehensive Domain Service, Security & Webhook Test Suite
 * Tests:
 * 1. Missions CRUD & Cursor Pagination
 * 2. Multi-Tenant Isolation & Role Authorization (can)
 * 3. Background Job Queue Idempotency & Failed Job DLQ
 * 4. Billing Webhook Signatures, Replay & Feature Gating (hasFeature)
 */

import crypto from 'node:crypto';
import { assert, caught } from '../../../test/assert.ts';
import { env } from '../../config/env.ts';
import { getDb } from '../../db/index.ts';
import { MissionsService } from '../missions.service.ts';
import { type AuthContext, ForbiddenError, NotFoundError } from '../permissions.ts';
import { JobQueue } from '../queue.ts';
import { BillingService } from '../billing.ts';

console.log('--- RUNNING NAIAD API SERVICE, TENANT & BILLING TESTS ---');

// 1. Setup isolated in-memory database
const db = getDb(':memory:');

// Seed 2 organizations and 2 reaches
db.exec(`
  INSERT INTO organizations (id, name, slug, primary_city_id, subscription_plan)
  VALUES
    ('org-coimbra', 'Coimbra Water', 'coi', 'coimbra', 'standard'),
    ('org-toulouse', 'Toulouse Water', 'tou', 'toulouse', 'enterprise');

  INSERT INTO reaches (id, organization_id, name, city_id, length_meters, topo_index, geometry_json)
  VALUES
    ('coi:r01', 'org-coimbra', 'Coselhas Reach', 'coimbra', 250, 0, '{}'),
    ('tou:r01', 'org-toulouse', 'Touch Reach', 'toulouse', 250, 0, '{}');
`);

const missionsService = new MissionsService(db);

const coiCoordinator: AuthContext = {
  userId: 'usr-coi-coord',
  organizationId: 'org-coimbra',
  role: 'coordinator',
  subscriptionPlan: 'standard',
};

const coiCitizen: AuthContext = {
  userId: 'usr-coi-cit',
  organizationId: 'org-coimbra',
  role: 'citizen',
  subscriptionPlan: 'standard',
};

const touCoordinator: AuthContext = {
  userId: 'usr-tou-coord',
  organizationId: 'org-toulouse',
  role: 'coordinator',
  subscriptionPlan: 'enterprise',
};

// ============================================================================
// PART 1: MISSIONS SERVICE TESTS (CRUD & AUTHORIZATION)
// ============================================================================

// Test 1: Coordinator creates mission successfully
const createdMission = missionsService.createMission(coiCoordinator, {
  reachId: 'coi:r01',
  source: 'weather',
  reason: 'Inspect storm runoff turbidity along Coselhas',
  targetGroup: 'water',
  priorityValue: 0.85,
  bountyCents: 450,
  pointsAward: 80,
});

assert(createdMission.id.startsWith('mis_'), 'Mission created with valid ID prefix');
assert(createdMission.organizationId === 'org-coimbra', 'Mission assigned to correct tenant');
assert(createdMission.bountyCents === 450, 'Bounty cents recorded accurately as integer');
console.log(`• Created mission ${createdMission.id} for org-coimbra`);

// Test 2: Role check rejection: Citizen cannot create manual mission (403 Forbidden)
assert(
  caught(() =>
    missionsService.createMission(coiCitizen, {
      reachId: 'coi:r01',
      source: 'staleness',
      reason: 'Citizen ad-hoc mission',
      targetGroup: 'water',
    })
  ) instanceof ForbiddenError,
  'Citizen was blocked from creating manual mission via can()'
);

// Test 3: Cross-tenant isolation rejection: Toulouse coordinator cannot view Coimbra mission (404)
assert(
  caught(() => missionsService.getMission(touCoordinator, createdMission.id)) instanceof NotFoundError,
  'Cross-tenant mission access refused with 404 Not Found'
);

// Test 4: Cursor-based pagination
// Create 2 additional missions
missionsService.createMission(coiCoordinator, {
  reachId: 'coi:r01',
  source: 'staleness',
  reason: 'Staleness check 2',
  targetGroup: 'vegetation',
});
missionsService.createMission(coiCoordinator, {
  reachId: 'coi:r01',
  source: 'lab-gap',
  reason: 'Lab gap anomaly check 3',
  targetGroup: 'water',
});

const page1 = missionsService.listMissions(coiCoordinator, { limit: 2 });
assert(page1.data.length === 2, `Page 1 returned 2 items (limit 2)`);
assert(page1.pagination.hasMore === true, 'Pagination correctly indicates hasMore = true');
assert(typeof page1.pagination.nextCursor === 'string', 'Page 1 provided nextCursor token');

const page2 = missionsService.listMissions(coiCoordinator, {
  limit: 2,
  cursor: page1.pagination.nextCursor!,
});
assert(page2.data.length === 1, 'Page 2 returned remaining 1 item using cursor');
assert(page2.pagination.hasMore === false, 'Page 2 indicates hasMore = false');
console.log('• Cursor pagination verified with continuous nextCursor tokens');

// Test 5: Soft delete
missionsService.deleteMission(coiCoordinator, createdMission.id);
assert(
  caught(() => missionsService.getMission(coiCoordinator, createdMission.id)) instanceof NotFoundError,
  'Soft-deleted mission successfully hidden from queries'
);

// ============================================================================
// PART 2: BACKGROUND JOBS QUEUE TESTS (IDEMPOTENCY & DLQ)
// ============================================================================
console.log('\n--- TESTING BACKGROUND JOB QUEUE ---');

const queue = new JobQueue(db);
let emailDispatchedCount = 0;

queue.registerHandler('send_email', async () => {
  emailDispatchedCount += 1;
});

// Enqueue with deterministic ID twice (idempotency check)
queue.enqueue('job-email-001', 'send_email', { to: 'sara@example.org', subject: 'Mission ready' });
queue.enqueue('job-email-001', 'send_email', { to: 'sara@example.org', subject: 'Mission ready' });

// Process jobs
await queue.processNextJobs();
assert(emailDispatchedCount === 1, `Job executed exactly once despite being enqueued twice (count: ${emailDispatchedCount})`);
console.log('• Idempotent enqueue verified: duplicate job ID ignored cleanly');

// Test failed job handling & DLQ
queue.registerHandler('sync_weather_api', async () => {
  throw new Error('Open-Meteo 503 Service Unavailable');
});

queue.enqueue('job-fail-001', 'sync_weather_api', { cityId: 'coimbra' }, 1); // 1 max attempt
await queue.processNextJobs();

const failedJobs = queue.getFailedJobs();
assert(failedJobs.some((j) => j.id === 'job-fail-001'), 'Failed job captured in DLQ table');
assert(Boolean(failedJobs[0]?.last_error?.includes('Open-Meteo 503')), 'Failure error context recorded in database');
console.log(`• DLQ captures failure: ${failedJobs[0].last_error}`);

// ============================================================================
// PART 3: SUBSCRIPTION BILLING & WEBHOOK TESTS
// ============================================================================
console.log('\n--- TESTING BILLING, WEBHOOK REPLAY & FEATURE GATING ---');

const billing = new BillingService(db);

// Test 1: Feature gating helper (hasFeature)
assert(billing.hasFeature('pilot', 'standard_missions') === true, 'Pilot has standard_missions');
assert(billing.hasFeature('pilot', 'trace_bisection') === false, 'Pilot DOES NOT have trace_bisection');
assert(billing.hasFeature('enterprise', 'trace_bisection') === true, 'Enterprise HAS trace_bisection');
assert(billing.hasFeature('enterprise', 'fhir_bridge') === true, 'Enterprise HAS fhir_bridge');
console.log('• hasFeature() correctly gates tiers');

// Test 2: Webhook Idempotency (replay event twice)
const mockWebhookEvent = {
  id: 'evt_stripe_test_1001',
  type: 'customer.subscription.updated',
  data: {
    object: {
      client_reference_id: 'org-coimbra',
      metadata: { plan_tier: 'enterprise' },
    },
  },
};

// First webhook run
const res1 = billing.handleWebhookEvent(mockWebhookEvent);
assert(res1.status === 'processed', 'First webhook call was processed');

// Verify organization upgraded
const orgAfterUpgrade = db
  .prepare('SELECT subscription_plan FROM organizations WHERE id = ?')
  .get('org-coimbra') as { subscription_plan: string };
assert(orgAfterUpgrade.subscription_plan === 'enterprise', 'Org upgraded to enterprise plan');

// Replay identical webhook event (second run)
const res2 = billing.handleWebhookEvent(mockWebhookEvent);
assert(res2.status === 'already_processed', 'Second webhook call recognized as already processed');
console.log('• Webhook replay idempotency verified: duplicate event safely acknowledged');

// Test 3: Webhook signature verification (Stripe format: t=timestamp,v1=signature)
const rawPayload = JSON.stringify(mockWebhookEvent);
const signedAt = 1_700_000_000; // seconds, as Stripe sends it
const now = signedAt * 1000;
const validSignature = crypto
  .createHmac('sha256', env.STRIPE_WEBHOOK_SECRET)
  .update(`${signedAt}.${rawPayload}`)
  .digest('hex');
const header = `t=${signedAt},v1=${validSignature}`;

assert(billing.verifySignature(rawPayload, header, now), 'Valid webhook signature accepted');
assert(!billing.verifySignature(rawPayload, `t=${signedAt + 1},v1=${validSignature}`, now), 'Signature for a different timestamp rejected');
assert(!billing.verifySignature(rawPayload, `t=${signedAt},v1=deadbeef`, now), 'Wrong-length signature rejected without throwing');
assert(!billing.verifySignature(`${rawPayload} `, header, now), 'A body that differs by one byte is rejected');
assert(!billing.verifySignature(rawPayload, '', now), 'A missing signature header is rejected');
assert(!billing.verifySignature(rawPayload, `t=soon,v1=${validSignature}`, now), 'A timestamp that is not a number is rejected');
assert(!billing.verifySignature(rawPayload, header, now + 301_000), 'A signature older than five minutes is rejected (replay window)');
assert(billing.verifySignature(rawPayload, header, now + 299_000), 'A signature inside the five-minute window is accepted');
assert(
  billing.verifySignature(rawPayload, `t=${signedAt},v1=${'0'.repeat(64)},v1=${validSignature}`, now),
  'Any of several v1 signatures may match (Stripe secret rotation)'
);

// Test 4: An unknown plan name never reaches the database
const planBefore = db.prepare('SELECT subscription_plan FROM organizations WHERE id = ?').get('org-toulouse') as { subscription_plan: string };
billing.handleWebhookEvent({
  id: 'evt_stripe_test_1002',
  type: 'customer.subscription.updated',
  data: { object: { client_reference_id: 'org-toulouse', metadata: { plan_tier: 'toString' } } },
});
const planAfter = db.prepare('SELECT subscription_plan FROM organizations WHERE id = ?').get('org-toulouse') as { subscription_plan: string };
assert(planAfter.subscription_plan === planBefore.subscription_plan, 'A plan name that is not a plan leaves the organization unchanged');

console.log('\n✅ ALL API SERVICE, AUTHORIZATION, QUEUE, AND BILLING TESTS PASSED!\n');
