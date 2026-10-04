/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Trace-hunt Monte Carlo: network generator, both strategies, and the tallies behind the Evidence page.
 */

import { assert } from '../../../test/assert.ts';
import { topoOrder, upstreamClosure, type GraphReach } from '../graph.ts';
import {
  checksQuantile,
  emptyBenchmarkRow,
  NO_NOISE,
  randomStreamNetwork,
  runTrials,
  seededRng,
  simulateHunt,
  type StreamNetwork,
} from '../simulation.ts';

console.log('--- RUNNING TRACE SIMULATION TESTS ---');

// 1. Seeded generator
const a = seededRng(42);
const b = seededRng(42);
const draws = Array.from({ length: 1000 }, () => a());
assert(draws.every((x) => x === b() && x >= 0 && x < 1), 'seededRng repeats exactly for a seed and stays in [0, 1)');
assert(seededRng(43)() !== draws[0], 'A different seed gives a different sequence');

// 2. Random stream networks are trees draining to one outlet, with at most two tributaries per reach
for (const size of [1, 2, 30, 61, 120]) {
  const network = randomStreamNetwork(size, seededRng(size));
  const links = [...network.tributaries.values()].reduce((sum, t) => sum + t.length, 0);
  assert(
    network.reachIds.length === size &&
      links === size - 1 &&
      network.up.get(network.outlet)!.size === size &&
      [...network.tributaries.values()].every((t) => t.length <= 2),
    `randomStreamNetwork(${size}) is a ${size}-reach binary tree draining to its outlet`
  );
}

// 3. Known answers on a single channel of 8 reaches (r0 is the outlet, r7 the headwater)
const chainReaches = new Map<string, GraphReach>(
  Array.from({ length: 8 }, (_, i) => [
    `r${i}`,
    { id: `r${i}`, lengthM: 250, downstream: i === 0 ? [] : [`r${i - 1}`], observable: true },
  ])
);
const chain: StreamNetwork = {
  outlet: 'r0',
  reachIds: [...chainReaches.keys()],
  up: upstreamClosure(chainReaches, topoOrder(chainReaches)),
  tributaries: new Map(Array.from({ length: 8 }, (_, i) => [`r${i}`, i === 7 ? [] : [`r${i + 1}`]])),
};
const rng = seededRng(1);
const perfect = (source: string, strategy: 'bisection' | 'walk') => simulateHunt(chain, source, strategy, NO_NOISE, rng);

assert(
  chain.reachIds.every((source) => {
    const hunt = perfect(source, 'bisection');
    return hunt.correct && hunt.checks === 3;
  }),
  'Perfect bisection finds any source on an 8-reach channel in exactly 3 checks (log2 8)'
);
assert(
  perfect('r0', 'walk').checks === 1 && perfect('r5', 'walk').checks === 6 && perfect('r7', 'walk').checks === 7,
  'Perfect walking checks one reach at a time: 1, 6 and 7 checks for sources r0, r5 and r7'
);
assert(
  chain.reachIds.every((source) => perfect(source, 'walk').correct),
  'Perfect walking always names the right reach'
);

// 4. Noisy benchmark: reproducible, calibrated, and bisection never slower than walking
const row = runTrials(emptyBenchmarkRow(30), 300, seededRng(2026));
const again = runTrials(emptyBenchmarkRow(30), 300, seededRng(2026));
assert(JSON.stringify(row) === JSON.stringify(again), 'The same seed reproduces a benchmark run exactly');
assert(
  [row.bisection, row.walking, row.perfectBisection, row.perfectWalking].every((t) => t.trials === 300),
  'Every strategy is tallied once per trial'
);
assert(
  row.perfectBisection.correct === 300 && row.perfectWalking.correct === 300,
  'Without noise both strategies always find the source'
);
assert(checksQuantile(row.perfectBisection, 0.5) === 5, 'Perfect bisection takes a median of 5 checks on 30 reaches (log2 30)');
const accuracy = (t: { correct: number; trials: number }) => t.correct / t.trials;
assert(
  accuracy(row.bisection) > 0.8 && accuracy(row.walking) > 0.8,
  `Stopping at an 80% posterior is right more than 80% of the time (bisection ${(100 * accuracy(row.bisection)).toFixed(1)}%, walking ${(100 * accuracy(row.walking)).toFixed(1)}%)`
);
assert(
  checksQuantile(row.bisection, 0.5) < checksQuantile(row.walking, 0.5) &&
    checksQuantile(row.perfectBisection, 0.5) < checksQuantile(row.perfectWalking, 0.5),
  `Bisection needs fewer checks than walking upstream (median ${checksQuantile(row.bisection, 0.5)} vs ${checksQuantile(row.walking, 0.5)} with noise)`
);

// 5. Adding trials accumulates into the same row
const more = runTrials(row, 100, seededRng(7));
assert(more.bisection.trials === 400 && row.bisection.trials === 300, 'runTrials adds to a row without mutating the one it was given');

// 6. Quantiles from a tally (hunts of 1, 3, 3 and 4 checks)
const tally = { trials: 4, correct: 4, checks: [0, 1, 0, 2, 1] };
assert(
  checksQuantile(tally, 0.25) === 1 && checksQuantile(tally, 0.5) === 3 && checksQuantile(tally, 0.75) === 3 && checksQuantile(tally, 1) === 4,
  'checksQuantile returns nearest-rank quartiles'
);
assert(checksQuantile({ trials: 0, correct: 0, checks: [] }, 0.5) === 0, 'An empty tally has a median of 0');

console.log('✅ Trace simulation verified.');
