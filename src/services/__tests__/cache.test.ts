/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Cache-Aside & Multi-Tenant Isolation Test Suite
 * Proves:
 * 1. Cache hit avoids re-fetching underlying query.
 * 2. Cache is invalidated immediately on data update/write.
 * 3. Two different organizations NEVER receive each other's cached data.
 * 4. Cache bypass flag forces fresh fetch for debugging.
 * 5. The cache never holds more than its maximum number of entries.
 */

import { assert } from '../../../test/assert.ts';
import { CacheService } from '../cache.service.ts';

console.log('--- STARTING CACHE-ASIDE & MULTI-TENANT ISOLATION TESTS ---');

const cache = new CacheService();

// ============================================================================
// 1. Basic Cache-Aside & Hit Verification
// ============================================================================
console.log('\n--- 1. Testing Cache-Aside Pattern ---');

let queryExecutionCount = 0;
const expensiveCalculation = async () => {
  queryExecutionCount++;
  return { result: 'computed-reach-freshness-matrix', count: 42 };
};

const key1 = CacheService.formatTenantKey('org-coimbra-01', 'reaches', 'summary');

// First call: MISS -> executes fetcher
const res1 = await cache.getOrSet(key1, expensiveCalculation, 60);
assert(res1.hit === false, 'First call is a cache MISS');
assert(queryExecutionCount === 1, 'Fetcher was invoked exactly once');

// Second call: HIT -> returns cached without executing fetcher
const res2 = await cache.getOrSet(key1, expensiveCalculation, 60);
assert(res2.hit === true, 'Second call is a cache HIT');
assert(queryExecutionCount === 1, 'Fetcher was NOT invoked on cache hit');
assert(res2.data.result === 'computed-reach-freshness-matrix', 'Cached data matches original calculation');

// ============================================================================
// 2. Invalidation on Update
// ============================================================================
console.log('\n--- 2. Testing Invalidation on Update ---');

// Simulate a write update affecting reaches in org-coimbra-01
const invalidatedCount = await cache.invalidatePattern('org:org-coimbra-01:reaches:*');
assert(invalidatedCount === 1, 'Invalidated exactly 1 key matching pattern');

// Next call after update: must be a MISS and re-compute fresh data
const res3 = await cache.getOrSet(key1, expensiveCalculation, 60);
assert(res3.hit === false, 'Call after update invalidation is a cache MISS');
assert(queryExecutionCount === 2, 'Fetcher was re-executed to obtain fresh data');

// ============================================================================
// 3. Multi-Tenant Cache Isolation (Zero Cross-Tenant Leakage)
// ============================================================================
console.log('\n--- 3. Testing Multi-Tenant Cache Isolation ---');

const orgACoimbra = 'org-coimbra-01';
const orgBToulouse = 'org-toulouse-02';

// Both orgs request identical query params: reaches in their city
const keyOrgA = CacheService.formatTenantKey(orgACoimbra, 'reaches', 'city:mondego');
const keyOrgB = CacheService.formatTenantKey(orgBToulouse, 'reaches', 'city:mondego');

await cache.set(keyOrgA, { tenant: orgACoimbra, secretSensors: ['coi-sensor-01', 'coi-sensor-02'] }, 60);
await cache.set(keyOrgB, { tenant: orgBToulouse, secretSensors: ['tou-sensor-99'] }, 60);

type TenantEntry = { tenant: string; secretSensors: string[] };
const cachedA = await cache.get<TenantEntry>(keyOrgA);
const cachedB = await cache.get<TenantEntry>(keyOrgB);

assert(cachedA?.tenant === orgACoimbra, 'Org A retrieves only Org A cached data');
assert(cachedB?.tenant === orgBToulouse, 'Org B retrieves only Org B cached data');
assert(!cachedA?.secretSensors.includes('tou-sensor-99'), 'Org A does NOT receive Org B sensors');
assert(!cachedB?.secretSensors.includes('coi-sensor-01'), 'Org B does NOT receive Org A sensors');

// Invalidation isolation test: purging Org A must NOT purge Org B
await cache.invalidatePattern(`org:${orgACoimbra}:*`);

const afterPurgeA = await cache.get<TenantEntry>(keyOrgA);
const afterPurgeB = await cache.get<TenantEntry>(keyOrgB);

assert(afterPurgeA === null, 'Org A cache was cleanly invalidated');
assert(afterPurgeB?.tenant === orgBToulouse, 'Org B cache remained completely intact after Org A invalidation');

// Only "*" is a wildcard: an organization ID that looks like a regex must not purge other tenants
await cache.invalidatePattern('org:.*:reaches:*');
assert((await cache.get(keyOrgB)) !== null, 'Regex characters in an organization ID are matched literally');

// ============================================================================
// 4. Debug Cache Bypass (X-Cache-Bypass)
// ============================================================================
console.log('\n--- 4. Testing Debug Cache Bypass ---');

let bypassQueryCount = 0;
const debugQuery = async () => {
  bypassQueryCount++;
  return { snapshot: `run_${bypassQueryCount}` };
};

const bypassKey = CacheService.formatTenantKey(orgBToulouse, 'debug', 'metric');

// Initial population
await cache.getOrSet(bypassKey, debugQuery, 60);
assert(bypassQueryCount === 1, 'Initial query ran');

// Normal call with cache: hit, count stays 1
const normalCall = await cache.getOrSet(bypassKey, debugQuery, 60, false);
assert(normalCall.hit === true, 'Normal call hits cache');
assert(bypassQueryCount === 1, 'Query count did not increment');

// Bypass call with bypass = true: forces fresh query, count increments to 2
const bypassCall = await cache.getOrSet(bypassKey, debugQuery, 60, true);
assert(bypassCall.hit === false, 'Bypass call reports cache MISS');
assert(bypassQueryCount === 2, 'Query was re-executed despite key present in cache');
assert(bypassCall.data.snapshot === 'run_2', 'Bypass returns freshly re-computed data');

// ============================================================================
// 5. Bounded Size
// ============================================================================
console.log('\n--- 5. Testing the Entry Limit ---');

const small = new CacheService(3);
for (const key of ['a', 'b', 'c', 'd']) {
  await small.set(key, key, 60);
}
assert((await small.get('a')) === null, 'A full cache drops its oldest entry to make room');
assert(
  (await small.get('b')) === 'b' && (await small.get('c')) === 'c' && (await small.get('d')) === 'd',
  'The newer entries stay'
);
await small.set('b', 'updated', 60);
assert((await small.get('c')) === 'c' && (await small.get('b')) === 'updated', 'Updating an existing key evicts nothing');

console.log('\n✅ ALL CACHING & MULTI-TENANT ISOLATION TESTS PASSED!\n');
