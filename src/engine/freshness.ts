/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PARAMS, type Group } from './params.ts';

export const DAY_MS = 86_400_000;

export interface WeatherSince {
  maxRain24hMm: number;
  heatSpell: boolean;
  /**
   * When the wettest 24 hours ended (ISO). A check made after it has already seen the storm
   * water, so the rain shock does not discount it. Omitted: the rain fell since the last check.
   */
  rainAt?: string;
}

/** 
 * How much we still trust the last check of this group: 1 = just checked, 0 = unknown.
 */
export function freshness(
  group: Group,
  lastCheckAt: Date | null,
  now: Date,
  weather: WeatherSince
): number {
  if (!lastCheckAt) return 0;
  let halfLife: number = PARAMS.halfLifeDays[group];
  if (group === 'water' && weather.heatSpell) {
    halfLife *= PARAMS.heatSpell.halfLifeFactor;
  }
  const ageDays = Math.max(0, now.getTime() - lastCheckAt.getTime()) / DAY_MS;
  let f = Math.pow(0.5, ageDays / halfLife);
  const rainedSinceCheck = !weather.rainAt || lastCheckAt.getTime() < new Date(weather.rainAt).getTime();
  if (group === 'water' && weather.maxRain24hMm >= PARAMS.rainShockMm24h && rainedSinceCheck) {
    f *= PARAMS.rainShockFactor;
  }
  return Math.max(0, Math.min(1, f));
}

/** Days elapsed between an ISO timestamp and `now` (fractional). */
export const daysSince = (iso: string, now: Date): number => (now.getTime() - new Date(iso).getTime()) / DAY_MS;

/** freshness() for one group of a reach's ISO "last checked" timestamps. */
export function freshnessOf(
  lastCheckAt: Partial<Record<Group, string>>,
  group: Group,
  now: Date,
  weather: WeatherSince
): number {
  const iso = lastCheckAt[group];
  return freshness(group, iso ? new Date(iso) : null, now, weather);
}

export interface ReachContext {
  hasOahSite: boolean;
  exposureCount: number;
  labGap: boolean;
}

/** 
 * 0..1: how much a new check of this group on this reach is worth right now.
 */
export function demand(group: Group, f: number, ctx: ReachContext): number {
  const priority =
    1 +
    (ctx.hasOahSite ? 0.5 : 0) +
    Math.min(ctx.exposureCount, 5) * 0.1 +
    (ctx.labGap ? 0.5 : 0);
  return Math.min(1, ((1 - f) * PARAMS.groupWeight[group] * priority) / 2.5);
}

/**
 * Patrol check points: 100 * (1 - freshness).
 * First check after storm pays a lot; second check 5 mins later pays <= 5.
 */
export const patrolPoints = (f: number): number => Math.round(100 * (1 - f));

/** Why a check was asked for, as far as its points go. */
export type CheckKind = 'patrol' | 'trace' | 'disagreement';

/** Points a check pays: trace checks and second opinions pay a flat amount, a patrol check pays by need. */
export const checkPoints = (kind: CheckKind, f: number): number =>
  kind === 'trace' ? 100 : kind === 'disagreement' ? 80 : patrolPoints(f);
