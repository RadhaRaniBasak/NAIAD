/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PARAMS } from './params.ts';

export interface TraceObservation {
  reachId: string;
  positive: boolean;
}

/** How reliable a single check is. Defaults to the volunteer noise model in PARAMS.trace. */
export interface TraceNoise {
  fn: number; // chance of missing a sign that is there (false negative)
  fp: number; // chance of reporting a sign that is not there (false positive)
}

// Binary entropy in bits
export const hb = (p: number): number => {
  if (p <= 0 || p >= 1) return 0;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
};

/** 
 * Probability that the source sits on each candidate reach, given every check so far.
 * Uses Bayesian updating with false negative (miss rate fn=0.20) and false positive (fp=0.05).
 */
export function posterior(
  prior: Map<string, number>,
  up: Map<string, Set<string>>,
  observations: TraceObservation[],
  { fn, fp }: TraceNoise = PARAMS.trace
): Map<string, number> {
  const post = new Map<string, number>();
  let total = 0;

  for (const [s, p0] of prior) {
    let p = p0;
    for (const o of observations) {
      const upstreamSet = up.get(o.reachId);
      const isUpstream = upstreamSet ? upstreamSet.has(s) : false;
      const pPositive = isUpstream ? 1 - fn : fp;
      p *= o.positive ? pPositive : 1 - pPositive;
    }
    post.set(s, p);
    total += p;
  }

  // Normalize
  if (total > 0) {
    for (const [s, p] of post) {
      post.set(s, p / total);
    }
  } else {
    // Fallback uniform if zeroed
    const count = prior.size || 1;
    for (const s of prior.keys()) {
      post.set(s, 1 / count);
    }
  }

  return post;
}

/** 
 * Bits of information a check is expected to give when a share m of probability lies at or upstream of it.
 */
export function expectedInfoGain(m: number, { fn, fp }: TraceNoise = PARAMS.trace): number {
  const pPositive = m * (1 - fn) + (1 - m) * fp;
  return hb(pPositive) - (m * hb(fn) + (1 - m) * hb(fp));
}

/** 
 * The observable reach whose check is expected to teach us the most (maximum expected information gain).
 */
export function nextCheck(
  post: Map<string, number>,
  up: Map<string, Set<string>>,
  observable: string[],
  noise: TraceNoise = PARAMS.trace
): { reachId: string; gain: number } {
  if (!observable.length) {
    return { reachId: '', gain: 0 };
  }

  let best = { reachId: observable[0], gain: -1 };
  for (const r of observable) {
    let m = 0;
    const upSet = up.get(r);
    if (upSet) {
      for (const s of upSet) {
        m += post.get(s) ?? 0;
      }
    }
    const gain = expectedInfoGain(m, noise);
    if (gain > best.gain) {
      best = { reachId: r, gain };
    }
  }
  return best;
}

/**
 * The reach a hunt has isolated: the candidate holding at least `stop` of the probability, if any.
 * It follows the whole percentage that is shown, so a reach displayed at the threshold counts.
 */
export function isolatedSource(
  post: Record<string, number>,
  stop: number = PARAMS.trace.stopPosterior
): string | undefined {
  return Object.keys(post).find((reachId) => Math.round(post[reachId] * 100) >= Math.round(stop * 100));
}
