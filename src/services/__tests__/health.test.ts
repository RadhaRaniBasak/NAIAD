/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Health Probes & Monitoring Verification Test Suite
 * Exercises the report behind GET /api/health and proves:
 * 1. A healthy system reports "ok" with per-component status and latency.
 * 2. A queue backlog (dead letter surge) degrades the report without taking it out of rotation.
 * 3. A failing database, or a shutdown in progress, makes it "unhealthy".
 */

import { assert } from '../../../test/assert.ts';
import { getDb } from '../../db/index.ts';
import { getHealthReport } from '../health.ts';

console.log('--- STARTING HEALTH PROBES & MONITORING TESTS ---');

const db = getDb(':memory:');

// ============================================================================
// 1. Healthy System
// ============================================================================
console.log('\n--- 1. Testing Healthy Report ---');

const healthy = await getHealthReport(false, () => db);

assert(healthy.status === 'ok', 'Aggregated system health is OK');
assert(healthy.components.database.status === 'ok', 'Database probe returned alive signal');
assert(healthy.components.database.latencyMs < 100, `Database probe executed quickly (${healthy.components.database.latencyMs}ms < 100ms)`);
assert(healthy.components.cache.status === 'ok', 'Cache read-after-write probe succeeded');
assert(healthy.components.cache.latencyMs < 50, `Cache probe executed quickly (${healthy.components.cache.latencyMs}ms < 50ms)`);
assert(healthy.components.queue.status === 'ok', 'Queue component is OK');
assert(
  healthy.components.queue.pendingJobs === 0 && healthy.components.queue.deadLetterJobs === 0,
  'Queue reports an empty backlog and an empty dead letter queue'
);

// ============================================================================
// 2. Background Job Queue Backlog
// ============================================================================
console.log('\n--- 2. Testing Degraded Queue ---');

const insertJob = db.prepare("INSERT INTO background_jobs (id, name, payload_json, status) VALUES (?, 'send_email', '{}', ?)");
insertJob.run('job-pending-1', 'pending');
for (let i = 0; i < 11; i++) insertJob.run(`job-failed-${i}`, 'failed');

const degraded = await getHealthReport(false, () => db);

assert(degraded.components.queue.pendingJobs === 1, 'Queue pending depth is counted');
assert(degraded.components.queue.deadLetterJobs === 11, 'Dead letter queue size is counted');
assert(degraded.components.queue.status === 'degraded', 'More than 10 dead-lettered jobs degrades the queue');
assert(degraded.status === 'degraded', 'A degraded queue degrades the overall status (still served as HTTP 200)');

// ============================================================================
// 3. Database Failure & Shutdown
// ============================================================================
console.log('\n--- 3. Testing Unhealthy Report ---');

const dbDown = await getHealthReport(false, () => {
  throw new Error('database is locked');
});

assert(dbDown.components.database.status === 'unhealthy', 'A failing database probe is reported as unhealthy');
assert(dbDown.components.database.error === 'database is locked', 'The probe failure reason is included');
assert(dbDown.status === 'unhealthy', 'A dead database makes the overall status unhealthy (HTTP 503)');

const draining = await getHealthReport(true, () => db);
assert(draining.status === 'unhealthy', 'A shutdown in progress reports unhealthy so traffic drains');

console.log('\n✅ ALL HEALTH PROBE & MONITORING TESTS PASSED!\n');
