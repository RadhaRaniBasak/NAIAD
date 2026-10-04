/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Monte Carlo benchmark of trace-hunt strategies.
 * It drives the same posterior() and nextCheck() the app uses, on randomly generated stream
 * networks. Pure: all randomness comes from the injected `rng`, so a seeded generator
 * reproduces a run exactly.
 */

import { topoOrder, upstreamClosure, type GraphReach } from './graph.ts';
import { PARAMS } from './params.ts';
import { nextCheck, posterior, type TraceNoise } from './trace.ts';

/** Uniform random numbers in [0, 1). */
export type Rng = () => number;

/** Deterministic generator (mulberry32) for reproducible runs. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StreamNetwork {
  /** Where the sign was first reported; every other reach drains to it. */
  outlet: string;
  reachIds: string[];
  /** up(r) = r plus every reach that drains into it. */
  up: Map<string, Set<string>>;
  /** The reaches that drain directly into r. */
  tributaries: Map<string, string[]>;
}

/**
 * A random stream network of `size` reaches drawn from Shreve's random-topology model, in which
 * every binary tree shape is equally likely (Rémy's algorithm): each step picks a random reach,
 * inserts a new reach just downstream of it and gives that new reach a second, headwater
 * tributary. An even `size` gets its last reach inserted without a tributary.
 */
export function randomStreamNetwork(size: number, rng: Rng): StreamNetwork {
  const downstreamOf = new Map<string, string | null>([['r0', null]]);
  const ids = ['r0'];

  const insertBelowRandomReach = (): string => {
    const above = ids[Math.floor(rng() * ids.length)];
    const id = `r${ids.length}`;
    ids.push(id);
    downstreamOf.set(id, downstreamOf.get(above) ?? null);
    downstreamOf.set(above, id);
    return id;
  };

  while (ids.length + 2 <= size) {
    const confluence = insertBelowRandomReach();
    const headwater = `r${ids.length}`;
    ids.push(headwater);
    downstreamOf.set(headwater, confluence);
  }
  if (ids.length < size) insertBelowRandomReach();

  const reaches = new Map<string, GraphReach>();
  const tributaries = new Map<string, string[]>(ids.map((id) => [id, []]));
  let outlet = ids[0];
  for (const [id, below] of downstreamOf) {
    reaches.set(id, { id, lengthM: PARAMS.reachLengthM, downstream: below ? [below] : [], observable: true });
    if (below) tributaries.get(below)!.push(id);
    else outlet = id;
  }

  return { outlet, reachIds: ids, up: upstreamClosure(reaches, topoOrder(reaches)), tributaries };
}

/**
 * - `bisection`: check whichever reach is expected to teach the most (what the app recommends).
 * - `walk`: the same rule, but only reaches next to where the sign has already been seen may be
 *   checked, so the hunt moves upstream one reach at a time and can never jump ahead.
 */
export type Strategy = 'bisection' | 'walk';

/** A perfect observer, for the noise-free reference columns. */
export const NO_NOISE: TraceNoise = { fn: 0, fp: 0 };

/** Safety cap so a hunt that cannot settle still ends. Far above what either strategy needs. */
const MAX_SIMULATED_CHECKS = 200;

function mostLikely(post: Map<string, number>): { reachId: string; probability: number } {
  let best = { reachId: '', probability: -1 };
  for (const [reachId, probability] of post) {
    if (probability > best.probability) best = { reachId, probability };
  }
  return best;
}

/**
 * Hunts for a hidden `source` and reports how many checks it took to put at least
 * PARAMS.trace.stopPosterior on one reach, and whether that reach was the right one.
 */
export function simulateHunt(
  network: StreamNetwork,
  source: string,
  strategy: Strategy,
  noise: TraceNoise,
  rng: Rng
): { checks: number; correct: boolean } {
  const signSeen = new Set([network.outlet]);
  let post = new Map(network.reachIds.map((id) => [id, 1 / network.reachIds.length]));
  let checks = 0;

  while (checks < MAX_SIMULATED_CHECKS && mostLikely(post).probability < PARAMS.trace.stopPosterior) {
    const allowed =
      strategy === 'bisection'
        ? network.reachIds
        : [...signSeen].flatMap((id) => [id, ...network.tributaries.get(id)!]);
    const { reachId } = nextCheck(post, network.up, allowed, noise);

    const signPresent = network.up.get(reachId)!.has(source);
    const positive = rng() < (signPresent ? 1 - noise.fn : noise.fp);
    if (positive) signSeen.add(reachId);

    // Bayes' rule is sequential: updating the current belief with the one new check gives the
    // same result as recomputing from the first prior with every check so far.
    post = posterior(post, network.up, [{ reachId, positive }], noise);
    checks += 1;
  }

  return { checks, correct: mostLikely(post).reachId === source };
}

export interface HuntTally {
  trials: number;
  correct: number;
  /** checks[k] = how many hunts needed exactly k checks. */
  checks: number[];
}

export interface BenchmarkRow {
  reaches: number;
  bisection: HuntTally;
  walking: HuntTally;
  perfectBisection: HuntTally;
  perfectWalking: HuntTally;
}

const emptyTally = (): HuntTally => ({ trials: 0, correct: 0, checks: [] });

export const emptyBenchmarkRow = (reaches: number): BenchmarkRow => ({
  reaches,
  bisection: emptyTally(),
  walking: emptyTally(),
  perfectBisection: emptyTally(),
  perfectWalking: emptyTally(),
});

function record(tally: HuntTally, hunt: { checks: number; correct: boolean }): HuntTally {
  const checks = [...tally.checks];
  checks[hunt.checks] = (checks[hunt.checks] ?? 0) + 1;
  return { trials: tally.trials + 1, correct: tally.correct + (hunt.correct ? 1 : 0), checks };
}

/**
 * Adds `trials` simulated incidents to a benchmark row. Each trial draws a fresh network and a
 * random source reach, then runs both strategies with noisy and with perfect observations.
 */
export function runTrials(
  row: BenchmarkRow,
  trials: number,
  rng: Rng,
  noise: TraceNoise = PARAMS.trace
): BenchmarkRow {
  let next = row;
  for (let i = 0; i < trials; i++) {
    const network = randomStreamNetwork(row.reaches, rng);
    const source = network.reachIds[Math.floor(rng() * network.reachIds.length)];
    next = {
      reaches: row.reaches,
      bisection: record(next.bisection, simulateHunt(network, source, 'bisection', noise, rng)),
      walking: record(next.walking, simulateHunt(network, source, 'walk', noise, rng)),
      perfectBisection: record(next.perfectBisection, simulateHunt(network, source, 'bisection', NO_NOISE, rng)),
      perfectWalking: record(next.perfectWalking, simulateHunt(network, source, 'walk', NO_NOISE, rng)),
    };
  }
  return next;
}

/** The q-quantile (nearest rank) of the number of checks in a tally; 0 when it holds no trials. */
export function checksQuantile(tally: HuntTally, q: number): number {
  const rank = Math.max(1, Math.ceil(q * tally.trials));
  let seen = 0;
  for (let k = 0; k < tally.checks.length; k++) {
    seen += tally.checks[k] ?? 0;
    if (seen >= rank) return k;
  }
  return 0;
}
