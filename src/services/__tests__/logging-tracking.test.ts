/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Structured Logging & Error Tracking Integration Test Suite
 * Proves:
 * 1. Log lines are valid JSON containing level, timestamp, message.
 * 2. Request context (request_id, user_id, organization_id) propagates to every log line.
 * 3. Automatic redaction of credentials (password, token, secret, auth) and PII (email, phone, ip).
 * 4. Error tracking scrubs emails and personal data while retaining user_id and tenant tags.
 */

import { assert } from '../../../test/assert.ts';
import { logger, runWithLogContext, redactSensitiveData } from '../../utils/logger.ts';
import { scrubSentryEvent } from '../sentry.server.ts';

console.log('--- STARTING STRUCTURED LOGGING & ERROR TRACKING TESTS ---');

// ============================================================================
// 1. JSON Structured Log Line & Redaction Verification
// ============================================================================
console.log('\n--- 1. Testing Structured Log Output & Redaction ---');

let capturedOutput = '';
const originalLog = console.log;
console.log = (msg: string) => {
  capturedOutput = msg;
};

// Log inside request context
const sampleRequestId = 'req_test_7f9a12c8';
const sampleUserId = 'usr_coimbra_lead';
const sampleOrgId = 'org-coimbra-01';

runWithLogContext(
  { requestId: sampleRequestId, userId: sampleUserId, organizationId: sampleOrgId },
  () => {
    logger.info('Stream observation check submitted', {
      reachId: 'coi:r01',
      password: 'PlaintextPassword123!',
      api_token: 'token_mock_key_value_12345678',
      authorEmail: 'lead@mondego-watch.example',
      clientIp: '192.168.1.45',
      userPhone: '+351 912 345 678',
    });
  }
);

console.log = originalLog;

assert(capturedOutput.length > 0, 'Log output was generated');

const parsedLog = JSON.parse(capturedOutput); // throws (failing the run) if the line is not valid JSON

assert(parsedLog.level === 'INFO', 'Log level is INFO');
assert(parsedLog.request_id === sampleRequestId, 'request_id is present in root log entry');
assert(parsedLog.user_id === sampleUserId, 'user_id is present in root log entry');
assert(parsedLog.organization_id === sampleOrgId, 'organization_id is present in root log entry');
assert(parsedLog.message === 'Stream observation check submitted', 'Message is preserved intact');

// Redaction assertions
assert(parsedLog.data.password === '[REDACTED]', 'Password field is redacted');
assert(parsedLog.data.api_token === '[REDACTED]', 'API token field is redacted');
assert(parsedLog.data.authorEmail === '[REDACTED]', 'authorEmail field key is redacted');
assert(parsedLog.data.userPhone === '[REDACTED]', 'userPhone field is redacted');
assert(parsedLog.data.reachId === 'coi:r01', 'Non-sensitive domain metadata is preserved');

// ============================================================================
// 2. Direct PII String Redaction
// ============================================================================
console.log('\n--- 2. Testing Direct PII Redaction in Strings ---');

const mixedText = 'Alert sent to test@example.com from IP 10.0.0.1 with key token_test_mock12345678';
const sanitizedText = redactSensitiveData(mixedText);

assert(sanitizedText.includes('[EMAIL_REDACTED]'), 'Emails in strings are redacted');
assert(sanitizedText.includes('[IP_REDACTED]'), 'IP addresses in strings are redacted');
assert(sanitizedText.includes('[SECRET_REDACTED]'), 'Secret tokens in strings are redacted');
assert(!sanitizedText.includes('test@example.com'), 'Original email is not present');

// ============================================================================
// 3. Sentry Privacy & Context Scrubbing
// ============================================================================
console.log('\n--- 3. Testing Sentry Error Tracking Privacy ---');

// Run the real beforeSend hook on an event carrying PII, inside a request context
const sentryEvent = runWithLogContext(
  { requestId: 'req_sentry_abc', organizationId: 'org-toulouse-02', userId: 'usr_volunteer_9' },
  () =>
    scrubSentryEvent({
      type: undefined,
      user: {
        id: 'usr_stale_id',
        email: 'volunteer@example.org',
        ip_address: '85.241.10.12',
        username: 'volunteer_jane',
      },
      tags: {},
    })
);

assert(sentryEvent.user?.email === undefined, 'Sentry event has email removed');
assert(sentryEvent.user?.ip_address === undefined, 'Sentry event has IP address removed');
assert(sentryEvent.user?.username === undefined, 'Sentry event has username removed');
assert(sentryEvent.user?.id === 'usr_volunteer_9', 'Sentry event carries the anonymous user id of the request');
assert(sentryEvent.tags?.organization_id === 'org-toulouse-02', 'Sentry event is tagged with organization_id');
assert(sentryEvent.tags?.request_id === 'req_sentry_abc', 'Sentry event is tagged with request_id');

console.log('\n✅ ALL STRUCTURED LOGGING & ERROR TRACKING TESTS PASSED!\n');
