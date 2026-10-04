/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Server-Side Error Tracking Integration (Sentry-compatible)
 * Features:
 * - Attaches user_id, organization_id, and request_id to every error
 * - Strictly strips emails, IP addresses, and personal data from Sentry payloads
 * - Environment separation (staging vs production)
 */

import * as Sentry from '@sentry/node';
import { env } from '../config/env.ts';
import { logContextStore } from '../utils/logger.ts';

let isInitialized = false;

/**
 * Runs on every outgoing event: removes PII (email, IP, username) and attaches the
 * request & tenant context from AsyncLocalStorage.
 */
export function scrubSentryEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete event.user.username;
  }

  const context = logContextStore.getStore();
  if (context) {
    if (context.userId) {
      event.user = { ...event.user, id: context.userId };
    }

    event.tags = {
      ...event.tags,
      ...(context.organizationId ? { organization_id: context.organizationId } : {}),
      ...(context.requestId ? { request_id: context.requestId } : {}),
    };
  }

  return event;
}

export function initServerSentry() {
  if (isInitialized) return;

  Sentry.init({
    dsn: env.SENTRY_DSN || undefined, // If no DSN, operates in silent mock/noop mode
    environment: env.NODE_ENV,
    release: 'naiad@1.0.0',
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.2 : 1.0,
    beforeSend: scrubSentryEvent,
  });

  isInitialized = true;
}

export function captureServerError(err: unknown, extraContext?: Record<string, unknown>) {
  initServerSentry();

  const context = logContextStore.getStore();
  Sentry.withScope((scope) => {
    if (context?.organizationId) {
      scope.setTag('organization_id', context.organizationId);
    }
    if (context?.requestId) {
      scope.setTag('request_id', context.requestId);
    }
    if (context?.userId) {
      scope.setUser({ id: context.userId });
    }
    if (extraContext) {
      scope.setExtras(extraContext);
    }
    Sentry.captureException(err);
  });
}
