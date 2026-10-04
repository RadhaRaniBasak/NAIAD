/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The rules behind the demo state: what a check earns and changes, how a storm discounts earlier
 * checks, how incidents take evidence and move from watch to handoff, and which missions are open.
 */

import { assert } from '../../../test/assert.ts';
import { canHandOff, missionPoints } from '../../components/presentation.ts';
import { getCityExposureSites, getCityReaches } from '../../data/networks.ts';
import { DAY_MS, freshnessOf } from '../../engine/freshness.ts';
import { isolatedSource } from '../../engine/trace.ts';
import type { Check, FhirServiceRequest, FhirTask, Incident, Reach } from '../../types/index.ts';
import {
  generateMissions,
  incidentsAfterCheck,
  isoWeekIndex,
  joinCodeFor,
  openIncident,
  settleCheck,
  withObservation,
} from '../AppContext.tsx';

console.log('--- RUNNING DEMO STATE RULES SUITE ---');

// A Sunday, so "this week" started six days ago
const NOW = new Date('2026-10-04T12:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY_MS).toISOString();
const DRY = { maxRain24hMm: 0, heatSpell: false, currentTempC: 20, rainTodayMm: 0 };
const STORM = { ...DRY, maxRain24hMm: 26, rainAt: ago(0.01) };

const coimbra = getCityReaches('coimbra');
const reach = (id: string, lastWater: string | undefined, extra: Partial<Reach> = {}): Reach => ({
  ...coimbra.find((r) => r._id === id)!,
  lastCheckAt: lastWater ? { water: lastWater } : {},
  ...extra,
});
const check = (reachId: string, takenAt: string, extra: Partial<Check> = {}): Check => ({
  _id: `chk_${reachId}_${takenAt}_${Math.random()}`,
  idempotencyKey: 'key',
  reachId,
  accessPointId: 'ap',
  userId: 'user_test',
  userNickname: 'Tester',
  groups: ['water'],
  answers: {},
  confirmedUnchanged: [],
  signs: [],
  location: { type: 'Point', coordinates: [0, 0] },
  accuracyM: 5,
  takenAt,
  receivedAt: takenAt,
  points: 0,
  status: 'pending',
  ...extra,
});

// 1. A storm discounts the checks made before it, not the ones made after
const beforeStorm = { water: ago(1) };
const afterStorm = { water: ago(0) };
assert(
  Math.abs(freshnessOf(beforeStorm, 'water', NOW, STORM) - 0.3 * 0.5 ** (1 / 3)) < 1e-9,
  'A check made before the storm is discounted by the rain shock'
);
assert(freshnessOf(afterStorm, 'water', NOW, STORM) === 1, 'A check made after the storm began is fully fresh');
assert(
  freshnessOf(afterStorm, 'water', NOW, { maxRain24hMm: 26, heatSpell: false }) === 0.3,
  'Without a time for the rain, it counts as fallen since the last check'
);

// 2. What a check earns and changes
const stale = reach('coi:r03', ago(8), { streakWeeks: 9, labGap: true }); // 8 days old: last ISO week
const first = settleCheck(stale, check('coi:r03', ago(0)), DRY);
assert(first.check.points === 84, `A patrol check pays 100 x (1 - freshness) at that moment (${first.check.points})`);
assert(
  first.check.freshnessBefore === 16 && first.check.freshnessAfter === 100,
  'The receipt carries the freshness before and after'
);
assert(first.reach.streakWeeks === 10, 'A first water check this week extends a streak kept up last week');
assert(first.reach.labGap === false, 'A water check closes the lab gap ("no citizen patrol") on the reach');

const second = settleCheck(first.reach, check('coi:r03', ago(0)), DRY);
assert(second.check.points === 0, 'A second check of a reach that was just checked earns nothing');
assert(second.reach.streakWeeks === 10, 'A second check in the same ISO week does not add to the streak');

const inStorm = settleCheck(stale, check('coi:r03', ago(0)), STORM);
assert(
  inStorm.check.points === 95 && inStorm.check.freshnessAfter === 100,
  'In a storm the first check pays more, and leaves the reach fresh'
);
assert(
  settleCheck(inStorm.reach, check('coi:r03', ago(0)), STORM).check.points === 0,
  'In a storm too, repeating the check earns nothing'
);

// The demo's seeded ages are relative to today: whatever the weekday, the first check of a reach
// last checked 8 days earlier adds exactly one week.
const weekdays = [...Array(7).keys()].map((day) => new Date(Date.UTC(2026, 9, 5 + day, 9))); // Mon 5 Oct to Sun 11 Oct
assert(
  weekdays.every((at) => {
    const eightDaysBefore = new Date(at.getTime() - 8 * DAY_MS).toISOString();
    const settled = settleCheck(reach('coi:r03', eightDaysBefore, { streakWeeks: 9 }), check('coi:r03', at.toISOString()), DRY);
    return settled.reach.streakWeeks === 10;
  }),
  'On every weekday, checking a reach last checked 8 days before adds one week to its streak'
);
const neverChecked = settleCheck(reach('coi:r01', undefined, { streakWeeks: 0 }), check('coi:r01', ago(0)), DRY);
assert(
  neverChecked.reach.streakWeeks === 1 && neverChecked.check.points === 100,
  'A first ever check starts a streak and pays the full 100'
);

const late = settleCheck(reach('coi:r02', ago(0)), check('coi:r02', ago(2)), DRY);
assert(late.reach.lastCheckAt.water === ago(0), 'A check synced late never moves a newer check back in time');
assert(late.check.points === 0, 'A late check of a reach someone checked since earns nothing');

const traceCheck = settleCheck(reach('coi:r02', ago(0)), check('coi:r02', ago(0), { requestId: 'mis:trace:inc_1:coi:r02' }), DRY);
assert(traceCheck.check.points === 100, 'A trace-hunt check pays a flat 100 however fresh the reach is');

const vegOnly = settleCheck(
  reach('coi:r02', ago(1), { streakWeeks: 4 }),
  check('coi:r02', ago(0), { groups: ['vegetation'] }),
  DRY
);
assert(
  vegOnly.reach.streakWeeks === 4 && vegOnly.reach.lastCheckAt.water === ago(1) && vegOnly.check.points === 100,
  'A vegetation check is paid by vegetation freshness and leaves the water check and streak alone'
);

// 3. ISO weeks run Monday to Sunday (UTC)
assert(
  isoWeekIndex(new Date('2026-09-28T00:00:00Z')) === isoWeekIndex(new Date('2026-10-04T23:59:59Z')),
  'Monday and the following Sunday are in the same ISO week'
);
assert(
  isoWeekIndex(new Date('2026-10-05T00:00:00Z')) === isoWeekIndex(new Date('2026-10-04T23:59:59Z')) + 1,
  'The next Monday starts the next ISO week'
);

// 4. Incidents: evidence, and the steps from watch to handoff
const report = { checkId: 'chk_origin', reachId: 'coi:r05', positive: true, userId: 'u1', userNickname: 'Ana', at: ago(0) };
const drill = openIncident(coimbra, report, 'sewage', true)!;
assert(
  drill.status === 'watch' && Object.keys(drill.posterior).sort().join() === 'coi:r01,coi:r02,coi:r03,coi:r04,coi:r05',
  'A report opens a watch whose candidates are the reach and everything upstream of it'
);
assert(drill.downstream.map((d) => d.reachId).join() === 'coi:r06,coi:r07,coi:r08', 'It lists the reaches downstream');
assert(isolatedSource(drill.posterior) === undefined, 'Five candidates: no source is isolated yet');

const observe = (inc: Incident, reachId: string, positive: boolean) =>
  withObservation(inc, { ...report, checkId: `chk_${Math.random()}`, reachId, positive }, coimbra);

// Sign absent on both upstream branches, twice: the source must be the origin reach itself
let onlyOrigin = drill;
for (const reachId of ['coi:r03', 'coi:r04', 'coi:r03', 'coi:r04']) onlyOrigin = observe(onlyOrigin, reachId, false);
assert(isolatedSource(onlyOrigin.posterior) === 'coi:r05', 'Absent signs upstream isolate the origin reach as the source');
assert(
  onlyOrigin.status === 'watch' && !canHandOff(onlyOrigin),
  'Isolating the source confirms nothing: with one positive check the incident stays at watch'
);

const twoPositives = observe(drill, 'coi:r04', true);
assert(twoPositives.status === 'advisory', 'A second positive check makes it an advisory awaiting approval');
assert(
  Math.round(twoPositives.posterior['coi:r04'] * 100) === 79 && isolatedSource(twoPositives.posterior) === undefined,
  'One positive upstream puts that reach at 79%: under the threshold, so not isolated'
);
assert(
  isolatedSource({ a: 0.796, b: 0.204 }) === 'a' && isolatedSource({ a: 0.794, b: 0.206 }) === undefined,
  'Isolation follows the whole percentage shown: 79.6% reads, and counts, as 80%'
);
const threePositives = observe(twoPositives, 'coi:r04', true);
assert(isolatedSource(threePositives.posterior) === 'coi:r04', 'A further positive there isolates it');
assert(
  threePositives.status === 'advisory' && !canHandOff(threePositives),
  'An advisory that no coordinator confirmed cannot be handed off, isolated or not'
);
assert(canHandOff({ ...threePositives, status: 'confirmed' }), 'Confirmed and isolated: it can be handed off');
assert(!canHandOff({ ...twoPositives, status: 'confirmed' }), 'Confirmed but not isolated: not yet');

const headwater = openIncident(coimbra, { ...report, reachId: 'coi:r04' }, 'foam', false)!;
assert(
  isolatedSource(headwater.posterior) === 'coi:r04' && headwater.status === 'watch' && !canHandOff(headwater),
  'A single report on a headwater reach has one candidate, and still stays at watch'
);

// Checks as evidence
const missionCheck = (signs: string[]) =>
  check('coi:r02', ago(0), { requestId: `mis:trace:${drill._id}:coi:r02`, signs });
const absent = incidentsAfterCheck([drill], missionCheck([]), coimbra);
assert(
  absent.length === 1 && absent[0].observations.length === 2 && absent[0].observations[1].positive === false,
  'A trace-mission check without the sign is recorded on its hunt as "sign absent"'
);
const present = incidentsAfterCheck([drill], missionCheck(['sewage']), coimbra);
assert(
  present.length === 1 && present[0].observations[1].positive && present[0].status === 'advisory',
  'A trace-mission check with the sign is a positive observation for its hunt, not a new incident'
);
const otherSign = incidentsAfterCheck([drill], missionCheck(['foam']), coimbra);
assert(
  otherSign.length === 2 && otherSign[0].sign === 'foam' && otherSign[1].observations[1].positive === false,
  'A different sign opens its own incident, and is "sign absent" for the hunt that asked'
);

const real = openIncident(coimbra, report, 'sewage', false)!;
const corroborated = incidentsAfterCheck([real], check('coi:r03', ago(0), { signs: ['sewage'] }), coimbra);
assert(
  corroborated.length === 1 && corroborated[0].status === 'advisory',
  'The same sign reported on a candidate reach corroborates the open incident'
);
assert(
  incidentsAfterCheck([drill], check('coi:r03', ago(0), { signs: ['sewage'] }), coimbra).length === 2,
  'A real report is never absorbed by a practice drill'
);
assert(
  incidentsAfterCheck([real], check('coi:r08', ago(0), { signs: ['sewage'] }), coimbra).length === 2,
  'The same sign on a reach that is not a candidate opens a second incident'
);
assert(
  incidentsAfterCheck([real], check('coi:r03', ago(0)), coimbra)[0] === real,
  'A routine check with no sign and no trace mission leaves the incident alone'
);
assert(
  incidentsAfterCheck([{ ...real, status: 'handed-off' }], check('coi:r03', ago(0), { signs: ['sewage'] }), coimbra).length === 2,
  'A closed incident takes no more evidence'
);

// 5. Missions
const graphOf = (reaches: Reach[]) => {
  const up = new Map<string, Set<string>>(reaches.map((r) => [r._id, new Set([r._id])]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of reaches) {
      for (const d of r.downstream) {
        for (const x of up.get(r._id)!) {
          if (!up.get(d)!.has(x)) {
            up.get(d)!.add(x);
            changed = true;
          }
        }
      }
    }
  }
  return up;
};
const missionsFor = (
  reaches: Reach[],
  weather = DRY,
  incidents: Incident[] = [],
  tasks: FhirTask[] = [],
  requests: FhirServiceRequest[] = []
) => generateMissions(reaches, weather, incidents, tasks, requests, graphOf(reaches));

const liveStorm = { ...DRY, maxRain24hMm: 26, rainAt: new Date().toISOString() };
assert(
  missionsFor(coimbra, liveStorm).filter((m) => m.source === 'weather').length === 8,
  'A storm opens a runoff mission on every reach checked before it'
);
const checkedInStorm = coimbra.map((r) =>
  r._id === 'coi:r03' ? settleCheck(r, check(r._id, new Date(Date.now() + 1000).toISOString()), liveStorm).reach : r
);
assert(
  !missionsFor(checkedInStorm, liveStorm).some((m) => m.reachId === 'coi:r03'),
  'The storm mission of a reach closes once it is checked after the rain'
);

const traceMissions = (incidents: Incident[]) => missionsFor(coimbra, DRY, incidents).filter((m) => m.source === 'trace');
assert(
  traceMissions([drill]).length === 1 && traceMissions([drill])[0].reachId in drill.posterior,
  'An open hunt asks for a check on one of its candidate reaches'
);
assert(traceMissions([onlyOrigin]).length === 0, 'Once the source is isolated the hunt asks for no more checks');
assert(traceMissions([headwater]).length === 0, 'A hunt with a single candidate never asks for a check elsewhere');
assert(traceMissions([{ ...drill, status: 'handed-off' }]).length === 0, 'A closed hunt asks for nothing');
const traceMission = traceMissions([drill])[0];
assert(
  missionPoints(traceMission, coimbra, NOW, DRY) === 100,
  'The trace mission card shows the flat 100 its check-in credits'
);

const request: FhirServiceRequest = {
  resourceType: 'ServiceRequest',
  id: 'sr-1',
  status: 'active',
  intent: 'order',
  category: [],
  code: { coding: [] },
  subject: { reference: 'Location/coi:r07', display: 'r07' },
  authoredOn: ago(0),
  requester: { reference: 'Organization/vet', display: 'Vet Hospital' },
  reasonCode: [{ text: 'Is there visible scum?' }],
};
const task: FhirTask = {
  resourceType: 'Task',
  id: 'task-1',
  status: 'requested',
  intent: 'order',
  focus: { reference: 'ServiceRequest/sr-1' },
  for: { reference: 'Location/coi:r07' },
};
const fhirMission = missionsFor(coimbra, DRY, [], [task], [request]).find((m) => m.source === 'external');
assert(
  fhirMission?.reason === 'Vet Hospital asks: Is there visible scum?' && fhirMission.requester.name === 'Vet Hospital (FHIR)',
  'A FHIR mission states who asks and why'
);
assert(
  !missionsFor(coimbra, DRY, [], [{ ...task, status: 'completed' }], [request]).some((m) => m.source === 'external'),
  'An answered FHIR task has no mission'
);

// 6. Crew join codes
assert(joinCodeFor('Coselhas Kids', ['COSELHAS26', 'CHOUPAL42']) === 'COSELHAS27', 'A join code never repeats an existing one');
assert(joinCodeFor('Rio 🌊🌊 crew', []) === 'RIOCREW26', 'A join code keeps letters and digits only');
assert(joinCodeFor('🌊🌊', []) === 'CREW26', 'A name without letters still gets a code');

// 7. The derived cities do not show Coimbra's places
const toulouse = getCityReaches('toulouse');
assert(
  toulouse.every((r) => r.oahSiteCodes.every((code) => !code.includes('COI'))),
  'Toulouse reaches carry their own research-site codes'
);
assert(
  getCityExposureSites('toulouse').every((site) => /Le Touch/.test(site.name ?? '') && !/Coselhas|Choupal/.test(site.name ?? '')),
  'Toulouse exposure sites are named after their kind and reach, not after Coimbra places'
);
assert(
  getCityExposureSites('coimbra').some((site) => site.name === 'Escola Básica 1º Ciclo de Coselhas'),
  'Coimbra keeps its own places'
);

console.log('✅ ALL DEMO STATE RULES CHECKS PASSED!\n');
