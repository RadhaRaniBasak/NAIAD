/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Standalone Engine Test Runner verifying Golden Values from Hackathon Specification Section 4.5.2 & 4.5.3.
 */

import { assert, caught } from '../../../test/assert.ts';
import { checkPoints, freshness, patrolPoints } from '../freshness.ts';
import { topoOrder, upstreamClosure, downstreamArrivals, type GraphReach } from '../graph.ts';
import { posterior, nextCheck } from '../trace.ts';

function approx(val: number, expected: number, tol = 0.005) {
  return Math.abs(val - expected) < tol;
}

console.log('--- RUNNING NAIAD ENGINE SCIENTIFIC TESTS ---');

const now = new Date(1760000000000);
const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
const dryWeather = { maxRain24hMm: 2, heatSpell: false };

// 1. Freshness Golden Values (Section 4.5.2)
// water, 3 days ago, dry -> 0.500
const fW3 = freshness('water', daysAgo(3), now, dryWeather);
assert(approx(fW3, 0.500), `Water 3 days dry = 0.500 (got ${fW3.toFixed(3)})`);

// water, 7 days ago, dry -> 0.198
const fW7 = freshness('water', daysAgo(7), now, dryWeather);
assert(approx(fW7, 0.198), `Water 7 days dry = 0.198 (got ${fW7.toFixed(3)})`);

// water, 1 day ago, then a 24 mm day -> 0.238 (pays 76 points)
const rainWeather = { maxRain24hMm: 24, heatSpell: false };
const fW1Rain = freshness('water', daysAgo(1), now, rainWeather);
assert(approx(fW1Rain, 0.238), `Water 1 day + 24mm rain shock = 0.238 (got ${fW1Rain.toFixed(3)})`);
const pts = patrolPoints(fW1Rain);
assert(pts === 76, `Points for 24mm rain shock = 76 (got ${pts})`);
assert(
  checkPoints('patrol', fW1Rain) === 76 && checkPoints('trace', fW1Rain) === 100 && checkPoints('disagreement', fW1Rain) === 80,
  'A patrol check pays by need; trace checks pay a flat 100 and second opinions a flat 80'
);

// water, 3 days ago, during a heat spell -> 0.250
const heatWeather = { maxRain24hMm: 0, heatSpell: true };
const fW3Heat = freshness('water', daysAgo(3), now, heatWeather);
assert(approx(fW3Heat, 0.250), `Water 3 days heatwave = 0.250 (got ${fW3Heat.toFixed(3)})`);

// vegetation, checked 30 days ago -> 0.630
const fVeg30 = freshness('vegetation', daysAgo(30), now, dryWeather);
assert(approx(fVeg30, 0.630), `Vegetation 30 days = 0.630 (got ${fVeg30.toFixed(3)})`);

// structure, checked 30 days ago -> 0.945
const fStruct30 = freshness('structure', daysAgo(30), now, dryWeather);
assert(approx(fStruct30, 0.945), `Structure 30 days = 0.945 (got ${fStruct30.toFixed(3)})`);

// never checked -> 0
const fNever = freshness('water', null, now, dryWeather);
assert(fNever === 0, `Never checked = 0 (got ${fNever})`);

// 2. Graph Kahn's Topo Order & Upstream Closure (Section 4.5.3)
const reaches = new Map<string, GraphReach>([
  ['r1', { id: 'r1', lengthM: 250, downstream: ['r2'], observable: true }],
  ['r2', { id: 'r2', lengthM: 250, downstream: ['r4'], observable: true }],
  ['r3', { id: 'r3', lengthM: 250, downstream: ['r4'], observable: true }],
  ['r4', { id: 'r4', lengthM: 250, downstream: [], observable: true }],
]);

const order = topoOrder(reaches);
assert(
  order.indexOf('r1') < order.indexOf('r2') &&
    order.indexOf('r2') < order.indexOf('r4') &&
    order.indexOf('r3') < order.indexOf('r4'),
  'Kahn topo order preserves upstream flow order'
);

const upMap = upstreamClosure(reaches, order);
assert(upMap.get('r4')!.has('r1') && upMap.get('r4')!.has('r3'), 'r4 contains upstream r1 and r3');

// Cycle detection throws
const cycleReaches = new Map<string, GraphReach>([
  ['r1', { id: 'r1', lengthM: 250, downstream: ['r2'], observable: true }],
  ['r2', { id: 'r2', lengthM: 250, downstream: ['r1'], observable: true }],
]);
assert(caught(() => topoOrder(cycleReaches)) instanceof Error, 'Cycle detection throws error on looped stream');

// 3. Downstream arrivals
const arrivals = downstreamArrivals(reaches, order, 'r1');
assert(arrivals.length === 2, `r1 downstream arrivals count = 2 (got ${arrivals.length})`);
assert(arrivals[0].reachId === 'r2', 'first downstream is r2');

// 4. Bayesian Trace Hunt (Section 4.5.4)
const prior = new Map<string, number>([
  ['r1', 0.333],
  ['r2', 0.333],
  ['r3', 0.334],
]);
const obs = [{ reachId: 'r2', positive: true }];
const post = posterior(prior, upMap, obs);
assert(post.get('r3')! < post.get('r1')!, 'r3 probability decreases after positive at r2');

const bestCheck = nextCheck(post, upMap, ['r1', 'r2', 'r3']);
assert(bestCheck.reachId.length > 0, `nextCheck finds reach ${bestCheck.reachId}`);

console.log('✅ ALL ENGINE TESTS PASSED SUCCESSFULLY!');
