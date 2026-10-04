/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Client-Side Error Tracking Integration (Sentry-compatible)
 * Features:
 * - Captures unhandled React exceptions and window errors without transmitting emails or PII
 * - Environment separation (staging vs production)
 */

import * as Sentry from '@sentry/react';

export function initClientSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    return; // Silent no-op if DSN not configured
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: 'naiad-client@1.0.0',
    beforeSend(event) {
      // Scrub any accidental client-side PII
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
        delete event.user.username;
      }
      return event;
    },
  });
}
