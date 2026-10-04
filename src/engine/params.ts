/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Every tunable number sits in one file.
 * All of these are assumptions based on the OneAquaHealth Hackathon 2026 specification.
 */

export const PARAMS = {
  reachLengthM: 250,
  geofenceM: 75,
  halfLifeDays: {
    water: 3,
    vegetation: 45,
    structure: 365,
  },
  groupWeight: {
    water: 1.0,
    vegetation: 0.6,
    structure: 0.4,
  },
  rainShockMm24h: 20, // a day this wet makes the last water check much less trustworthy
  rainShockFactor: 0.3,
  heatSpell: {
    tmaxC: 30,
    minDays: 5,
    halfLifeFactor: 0.5,
  },
  confirmFreshness: 0.9, // freshness restored by a one-tap "no change"
  trace: {
    fn: 0.2, // chance a volunteer misses a sign that is there (false negative)
    fp: 0.05, // chance a volunteer reports a sign that is not there (false positive)
    vMin: 0.1, // m/s, slow water (screening arrival calculation)
    vMax: 1.0, // m/s, fast water
    stopPosterior: 0.8, // stop trace hunt when one reach holds 80% probability
    maxChecks: 20,
  },
} as const;

export type Group = keyof typeof PARAMS.halfLifeDays;
export type Pillar = 'human' | 'animal' | 'ecosystem';
