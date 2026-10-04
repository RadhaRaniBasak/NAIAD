/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The rules that turn engine values into what the screens show: freshness states, age labels,
 * the network summary on the Overview and the console, mission points and ranking.
 */

import { assert } from '../../../test/assert.ts';
import { getCityReaches } from '../../data/networks.ts';
import { DAY_MS } from '../../engine/freshness.ts';
import type { Incident, Reach, RequestMission } from '../../types/index.ts';
import {
  ageLabel,
  freshnessState,
  isActiveIncident,
  isCrewReach,
  missionPoints,
  networkFreshness,
  rankMissions,
  simulatedDistanceKm,
} from '../presentation.ts';

console.log('--- RUNNING PRESENTATION RULES SUITE ---');

const NOW = new Date('2026-10-03T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS).toISOString();
const DRY = { maxRain24hMm: 0, heatSpell: false };

// 1. Freshness states follow the whole percentage that is displayed
assert(freshnessState(1).id === 'fresh' && freshnessState(0.75).id === 'fresh', 'Freshness of 75% or more is Fresh');
assert(freshnessState(0.746).id === 'fresh', 'A value that displays as 75% counts as Fresh');
assert(freshnessState(0.744).id === 'aging' && freshnessState(0.4).id === 'aging', 'Freshness of 40 to 74% is Aging');
assert(freshnessState(0.397).id === 'aging', 'A value that displays as 40% counts as Aging, not Stale');
assert(freshnessState(0.394).id === 'stale' && freshnessState(0).id === 'stale', 'Freshness under 40% is Stale');

// 2. Age labels are words
assert(ageLabel(undefined, NOW) === 'Never checked', 'A reach without a check reads "Never checked"');
assert(ageLabel(daysAgo(0.2), NOW) === '<24h fresh', 'A check from today reads "<24h fresh"');
assert(ageLabel(daysAgo(1), NOW) === '1 day old', 'One day is singular');
assert(ageLabel(daysAgo(4), NOW) === '4 days old', 'Several days are plural');

// 3. Network summary: the mean water freshness and the number of reaches in each state
const [first, second, third] = getCityReaches('coimbra');
const reaches: Reach[] = [
  { ...first, lastCheckAt: { water: daysAgo(0) } }, // 100%
  { ...second, lastCheckAt: { water: daysAgo(3) } }, // one half-life: 50%
  { ...third, lastCheckAt: {} }, // never checked: 0%
];
const summary = networkFreshness(reaches, NOW, DRY);
assert(Math.abs(summary.average - 0.5) < 1e-9, `Network freshness is the mean of the reaches (${summary.average})`);
assert(
  summary.counts.fresh === 1 && summary.counts.aging === 1 && summary.counts.stale === 1,
  'Each reach is counted in exactly one state'
);
const stormy = networkFreshness(reaches, NOW, { maxRain24hMm: 26, heatSpell: false });
assert(stormy.counts.fresh === 0 && stormy.average < summary.average, 'A rain shock lowers the network freshness');
assert(networkFreshness([], NOW, DRY).average === 0, 'An empty network has freshness 0, not NaN');

// 4. Mission points: the figure on a mission card is what its check-in credits
const mission = (id: string, source: RequestMission['source'], reachId: string, value: number): RequestMission => ({
  _id: id,
  source,
  reachId,
  groups: ['water'],
  reason: id,
  requester: { kind: 'naiad', name: 'Test' },
  value,
  opensAt: daysAgo(0),
  expiresAt: daysAgo(-1),
  status: 'open',
});
const points = (m: RequestMission, weather = DRY) => missionPoints(m, reaches, NOW, weather);
assert(points(mission('a', 'staleness', second._id, 0.9)) === 50, 'A patrol mission pays 100 x (1 - freshness): 50 at one half-life');
assert(points(mission('b', 'lab-gap', first._id, 0.92)) === 0, 'A reach checked a moment ago pays nothing, whatever the mission value');
assert(points(mission('c', 'staleness', third._id, 0.1)) === 100, 'A reach never checked pays the full 100');
assert(points(mission('d', 'weather', first._id, 0.5), { maxRain24hMm: 26, heatSpell: false }) === 70, 'A rain shock raises what a fresh reach pays');
assert(points(mission('e', 'trace', first._id, 0.2)) === 100, 'A trace check pays a flat 100');
assert(points(mission('f', 'disagreement', first._id, 0.2)) === 80, 'A second opinion pays a flat 80');
assert(points(mission('g', 'staleness', 'no:such', 0.5)) === 100, 'A mission on an unknown reach counts as never checked');

// 5. Ranking
const crewReaches: Reach[] = [
  { ...first, crewId: undefined },
  { ...second, crewId: 'crew-a' },
  { ...third, crewId: undefined },
];
const unranked = [
  mission('plain-low', 'staleness', first._id, 0.1),
  mission('crew', 'staleness', second._id, 0.1),
  mission('plain-high', 'staleness', first._id, 0.9),
  mission('trace', 'trace', third._id, 0.1),
];
const ranked = rankMissions(unranked, crewReaches, 'crew-a').map((m) => m._id);
assert(ranked[0] === 'trace', 'Trace hunts come first');
assert(ranked[1] === 'crew', "Then the missions on the volunteer's crew reaches");
assert(ranked[2] === 'plain-high' && ranked[3] === 'plain-low', 'At the same distance, the more valuable mission comes first');
assert(unranked[0]._id === 'plain-low', 'Ranking does not reorder the list it was given');
assert(
  isCrewReach(crewReaches[1], 'crew-a') && !isCrewReach(crewReaches[0], 'crew-a') && !isCrewReach(crewReaches[0], undefined),
  'A reach nobody adopted is not a crew reach, also for a volunteer without a crew'
);
const rankedWithoutCrew = rankMissions(unranked, crewReaches, undefined).map((m) => m._id);
assert(
  rankedWithoutCrew[0] === 'trace' && rankedWithoutCrew[1] === 'plain-high',
  'Without a crew no reach is promoted: the most valuable mission follows the trace hunt'
);
const distance = simulatedDistanceKm(first._id);
assert(distance >= 0.2 && distance <= 2.6, `The simulated distance stays between 0.2 and 2.6 km (${distance})`);

// 6. Which incidents still need attention
const withStatus = (status: Incident['status']) => ({ status }) as Incident;
assert(
  (['watch', 'advisory', 'confirmed'] as const).every((status) => isActiveIncident(withStatus(status))),
  'Watch, advisory and confirmed incidents are active'
);
assert(
  (['handed-off', 'resolved', 'dismissed'] as const).every((status) => !isActiveIncident(withStatus(status))),
  'Handed-off, resolved and dismissed incidents are not'
);

console.log('✅ ALL PRESENTATION RULES CHECKS PASSED!\n');
