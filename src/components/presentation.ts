/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * How domain values are shown on screen, shared by the views: freshness states and age labels,
 * mission sources, points and ranking. The numbers themselves come from src/engine/.
 */

import { Award, Clock, CloudRain, FileQuestion, HelpCircle, ShieldAlert, type LucideIcon } from 'lucide-react';
import { checkPoints, daysSince, freshnessOf, type WeatherSince } from '../engine/freshness.ts';
import { isolatedSource } from '../engine/trace.ts';
import type { Incident, Reach, RequestMission, RequestSource } from '../types/index.ts';
import type { Tone } from './design-system/index.ts';

/**
 * The three freshness states, from freshest to stalest. A reach is in the first state whose `minPct`
 * its freshness reaches. The colour is always shown next to a text label, never as the only signal.
 */
export const FRESHNESS_STATES = [
  { id: 'fresh', label: 'Fresh', range: '75% or more', minPct: 75, tone: 'success', node: 'fill-emerald-500/25 stroke-emerald-500', dot: 'fill-emerald-500', text: 'fill-emerald-400', arc: 'stroke-emerald-500' },
  { id: 'aging', label: 'Aging', range: '40 to 74%', minPct: 40, tone: 'warning', node: 'fill-amber-500/25 stroke-amber-500', dot: 'fill-amber-500', text: 'fill-amber-400', arc: 'stroke-amber-500' },
  { id: 'stale', label: 'Stale', range: 'under 40%', minPct: 0, tone: 'danger', node: 'fill-rose-500/25 stroke-rose-500', dot: 'fill-rose-500', text: 'fill-rose-400', arc: 'stroke-rose-500' },
] as const satisfies readonly { id: string; label: string; range: string; minPct: number; tone: Tone; node: string; dot: string; text: string; arc: string }[];

export type FreshnessState = (typeof FRESHNESS_STATES)[number];

/** The state of a freshness value (0..1). It follows the whole percentage that is shown: 39.7% reads, and counts, as 40%. */
export const freshnessState = (f: number): FreshnessState =>
  FRESHNESS_STATES.find((state) => Math.round(f * 100) >= state.minPct) ?? FRESHNESS_STATES[2];

/** Plain-text age of the last check in whole days, e.g. "3 days old". Under a day reads "<24h fresh". */
export function ageLabel(lastCheckIso: string | undefined, now: Date): string {
  if (!lastCheckIso) return 'Never checked';
  const days = Math.floor(daysSince(lastCheckIso, now));
  if (days === 0) return '<24h fresh';
  return days === 1 ? '1 day old' : `${days} days old`;
}

/** Water freshness across a network: the mean, and how many reaches are in each state. */
export function networkFreshness(reaches: Reach[], now: Date, weather: WeatherSince) {
  const counts: Record<FreshnessState['id'], number> = { fresh: 0, aging: 0, stale: 0 };
  let sum = 0;
  for (const reach of reaches) {
    const f = freshnessOf(reach.lastCheckAt, 'water', now, weather);
    counts[freshnessState(f).id] += 1;
    sum += f;
  }
  return { average: reaches.length > 0 ? sum / reaches.length : 0, counts };
}

/** How each mission source is named and marked. */
export const MISSION_SOURCES: Record<RequestSource, { label: string; icon: LucideIcon; tone: Tone }> = {
  weather: { label: 'Storm Demand', icon: CloudRain, tone: 'primary' },
  trace: { label: 'Trace Hunt', icon: ShieldAlert, tone: 'danger' },
  'lab-gap': { label: 'Lab Anomaly', icon: FileQuestion, tone: 'warning' },
  external: { label: 'FHIR Partner', icon: Award, tone: 'info' },
  disagreement: { label: '2nd Opinion', icon: HelpCircle, tone: 'warning' },
  staleness: { label: 'Staleness', icon: Clock, tone: 'neutral' },
};

/**
 * Points a mission pays right now: what its check-in will credit. Patrol missions pay by the
 * reach's need at this moment, so the figure falls as soon as someone else checks the reach.
 */
export function missionPoints(mission: RequestMission, reaches: Reach[], now: Date, weather: WeatherSince): number {
  const reach = reaches.find((r) => r._id === mission.reachId);
  const freshness = reach ? freshnessOf(reach.lastCheckAt, mission.groups[0] ?? 'water', now, weather) : 0;
  const kind = mission.source === 'trace' || mission.source === 'disagreement' ? mission.source : 'patrol';
  return checkPoints(kind, freshness);
}

/** Simulated distance from the volunteer to a reach, in km (0.2 to 2.6): the demo has no real position. */
export function simulatedDistanceKm(reachId: string): number {
  const hash = reachId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return Math.round(((hash % 25) / 10 + 0.2) * 10) / 10;
}

/** True when the reach is adopted by this crew. A volunteer without a crew has no crew reaches. */
export const isCrewReach = (reach: Reach | undefined, crewId: string | undefined): boolean =>
  crewId !== undefined && reach?.crewId === crewId;

/** Missions in the order a volunteer sees them: trace hunts, then their crew's reaches, then value per distance. */
export function rankMissions(missions: RequestMission[], reaches: Reach[], crewId: string | undefined): RequestMission[] {
  const onCrewReach = (m: RequestMission) => isCrewReach(reaches.find((r) => r._id === m.reachId), crewId);
  const score = (m: RequestMission) => m.value / (1 + simulatedDistanceKm(m.reachId));

  return [...missions].sort((a, b) => {
    if (a.source === 'trace' && b.source !== 'trace') return -1;
    if (b.source === 'trace' && a.source !== 'trace') return 1;
    if (onCrewReach(a) !== onCrewReach(b)) return onCrewReach(a) ? -1 : 1;
    return score(b) - score(a);
  });
}

/** The colour that goes with each incident status. The status word is always shown with it. */
export const INCIDENT_STATUS_TONES: Record<Incident['status'], Tone> = {
  watch: 'danger',
  advisory: 'warning',
  confirmed: 'success',
  'handed-off': 'info',
  resolved: 'neutral',
  dismissed: 'neutral',
};

/** Incidents that still need attention. */
export const isActiveIncident = (incident: Incident): boolean =>
  incident.status === 'watch' || incident.status === 'advisory' || incident.status === 'confirmed';

/**
 * A handoff to the municipality needs both: an advisory a coordinator has confirmed (so at least
 * two positive checks) and a source reach the hunt has isolated.
 */
export const canHandOff = (incident: Incident): boolean =>
  incident.status === 'confirmed' && isolatedSource(incident.posterior) !== undefined;

/** A count with its noun: "1 check", "3 checks". */
export const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;
