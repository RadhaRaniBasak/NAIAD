/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FlaskConical, Play, Sparkles } from 'lucide-react';
import { CITIZEN_AUDIT_DATA, COVERAGE_SIMULATION_DATA, PILOT_STUDY_DATA } from '../data/evidenceData.ts';
import { PARAMS } from '../engine/params.ts';
import {
  checksQuantile,
  emptyBenchmarkRow,
  runTrials,
  seededRng,
  type BenchmarkRow,
  type HuntTally,
} from '../engine/simulation.ts';
import { Badge, Button, Chips, Notice, PageHeader, Panel, StatCard, Table } from './design-system/index.ts';

type Study = 'audit' | 'trace' | 'coverage' | 'pilot';

const STUDIES: { id: Study; label: string }[] = [
  { id: 'audit', label: '1. Data Audit (Illustrative)' },
  { id: 'trace', label: '2. Trace Bisection Simulation' },
  { id: 'coverage', label: '3. Coverage Model (Illustrative)' },
  { id: 'pilot', label: '4. Pilot Design (Illustrative)' },
];

const { demandPull, freeRoaming } = COVERAGE_SIMULATION_DATA;

// Trace benchmark (study 2): simulated live by the engine in src/engine/simulation.ts.
const BENCHMARK_SIZES = [30, 60, 120]; // candidate reaches per row
const KEY_FINDING_SIZE = 60;
const FIRST_RUN_TRIALS = 200; // run when the page opens, so the table is never empty
const TRIALS_PER_RUN = 1000;
const TRIALS_PER_TICK = 10; // small batches keep the page responsive while a run is in progress
const BENCHMARK_SEED = 2026; // fixed, so the same number of trials always gives the same figures

const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;
const medianChecks = (tally: HuntTally) => checksQuantile(tally, 0.5);
const interquartile = (tally: HuntTally) => `${checksQuantile(tally, 0.25)} to ${checksQuantile(tally, 0.75)}`;
const accuracy = (tally: HuntTally) => `${((100 * tally.correct) / tally.trials).toFixed(1)}%`;

/** Above the one study whose numbers are computed on this page. */
const ComputedLive: React.FC = () => (
  <p className="text-2xs text-slate-400">
    <Badge tone="success" className="mr-1.5">Computed live</Badge>
    Simulated in this browser by <code>src/engine/simulation.ts</code>.
  </p>
);

/**
 * Above a study whose numbers are examples. Nobody measured them: they were written for the
 * prototype (src/data/evidenceData.ts) to show what the study would report, and the page says so.
 */
const Illustrative: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Notice tone="warning">
    <strong>Illustrative example, not a result.</strong> {children}
  </Notice>
);

export const EvidenceView: React.FC = () => {
  const [activeStudy, setActiveStudy] = useState<Study>('trace');
  const [benchmark, setBenchmark] = useState<BenchmarkRow[]>(() => BENCHMARK_SIZES.map(emptyBenchmarkRow));
  const [trialsQueued, setTrialsQueued] = useState<number>(FIRST_RUN_TRIALS);
  const rng = useRef(seededRng(BENCHMARK_SEED));

  const trialsDone = benchmark[0].bisection.trials;
  const keyRow = benchmark.find((row) => row.reaches === KEY_FINDING_SIZE) ?? benchmark[0];

  // Runs the queued trials a few at a time, so the table fills in while the simulation works.
  // ponytail: runs on the main thread in small batches; move to a Web Worker if it janks on slow phones.
  useEffect(() => {
    if (trialsQueued === 0) return;
    const timer = setTimeout(() => {
      const batch = Math.min(TRIALS_PER_TICK, trialsQueued);
      setBenchmark(benchmark.map((row) => runTrials(row, batch, rng.current)));
      setTrialsQueued(trialsQueued - batch);
    }, 0);
    return () => clearTimeout(timer);
  }, [trialsQueued, benchmark]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evidence & Studies"
        description={
          'One study is computed on this page: the trace-hunt simulation. The other three are illustrative examples of the evidence a pilot would collect. No audit and no pilot has been run.'
        }
        icon={<FlaskConical className="h-5 w-5" />}
      />

      <Chips label="Study" options={STUDIES} value={activeStudy} onChange={setActiveStudy} />

      {/* Study 1: audit of citizen submissions */}
      {activeStudy === 'audit' && (
        <div className="space-y-4">
          <Illustrative>
            These numbers show what an audit of public citizen submissions would report. No audit was run for this
            prototype.
          </Illustrative>
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
            <StatCard
              label="Total Public Submissions"
              value={CITIZEN_AUDIT_DATA.totalSubmissions}
              caption="Example size of the audited set."
            />
            <StatCard
              label="Single-Visit Dropoff Rate"
              value={<span className="text-rose-400">{CITIZEN_AUDIT_DATA.singleVisitSitesPct}%</span>}
              caption={
                <>
                  In this example <strong>83% of sites are visited only once</strong>: the pattern demand-pull is
                  meant to change.
                </>
              }
            />
            <StatCard
              label="Usable Without Quality Flags"
              value={`${CITIZEN_AUDIT_DATA.usableSubmissions} / ${CITIZEN_AUDIT_DATA.totalSubmissions}`}
              caption="In this example 43 entries are flagged for swapped coordinates, duplicates or missing codes."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Example: Submissions by City" flush>
              <Table
                caption="Example citizen submissions per city"
                data={CITIZEN_AUDIT_DATA.cityBreakdown}
                keyExtractor={(row) => row.city}
                columns={[
                  { key: 'city', header: 'City', className: 'font-medium text-slate-200' },
                  { key: 'total', header: 'Total', className: 'font-mono' },
                  { key: 'usable', header: 'Usable', className: 'font-mono text-emerald-400' },
                  { key: 'repeatSites', header: 'Repeat Sites', className: 'font-mono' },
                ]}
              />
            </Panel>

            <Panel title="Example: Quality Flags">
              <ul className="space-y-2">
                {CITIZEN_AUDIT_DATA.flagReasons.map((flag) => (
                  <li key={flag.reason} className="well flex items-center justify-between gap-3 p-3 text-xs">
                    <span className="text-slate-300">{flag.reason}</span>
                    <Badge tone="danger" className="font-mono">
                      {flag.count}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      )}

      {/* Study 2: the trace-hunt benchmark, simulated on this page */}
      {activeStudy === 'trace' && (
        <div className="space-y-4">
          <ComputedLive />
          <Panel
            title="Trace Hunt Simulation: Information-Gain Bisection vs Walking Upstream"
            description={
              <>
                <strong className="text-slate-200">{trialsDone.toLocaleString('en-US')} trials per row</strong>, run by
                the same engine that guides live trace hunts.
              </>
            }
            action={
              <Button
                size="sm"
                leftIcon={<Play className="h-3.5 w-3.5" />}
                isLoading={trialsQueued > 0}
                onClick={() => setTrialsQueued(TRIALS_PER_RUN)}
              >
                {trialsQueued > 0
                  ? `Running: ${trialsQueued.toLocaleString('en-US')} trials left`
                  : `Run +${TRIALS_PER_RUN.toLocaleString('en-US')} Monte Carlo Runs`}
              </Button>
            }
            flush
          >
            <p className="border-b border-slate-800 px-4 py-3 text-2xs text-slate-400 sm:px-5">
              Noise model: {percent(PARAMS.trace.fn)} false negative (volunteer misses sign), {percent(PARAMS.trace.fp)}{' '}
              false positive. Each trial draws a random stream network and a hidden source, then both strategies hunt
              until one reach holds {percent(PARAMS.trace.stopPosterior)} of the probability. Bisection may check any
              reach; walking upstream may only check reaches next to where the sign was already seen.
            </p>

            {trialsDone === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-400">Simulating…</p>
            ) : (
              <Table
                caption="Checks needed to locate the source, by network size and strategy"
                data={benchmark}
                keyExtractor={(row) => String(row.reaches)}
                columns={[
                  { key: 'reaches', header: 'Candidate Reaches', className: 'font-bold text-slate-50', render: (row) => `${row.reaches} reaches` },
                  { key: 'perfectBisection', header: 'Perfect: Bisection', className: 'font-mono', render: (row) => `${medianChecks(row.perfectBisection)} checks` },
                  { key: 'perfectWalking', header: 'Perfect: Walk Upstream', className: 'font-mono', render: (row) => `${medianChecks(row.perfectWalking)} checks` },
                  {
                    key: 'bisection',
                    header: 'Noisy: Bisection (Median [IQR])',
                    className: 'font-mono font-bold text-cyan-400',
                    render: (row) => `${medianChecks(row.bisection)} (${interquartile(row.bisection)})`,
                  },
                  {
                    key: 'walking',
                    header: 'Noisy: Walk Upstream (Median [IQR])',
                    className: 'font-mono font-bold text-rose-400',
                    render: (row) => `${medianChecks(row.walking)} (${interquartile(row.walking)})`,
                  },
                  {
                    key: 'accuracy',
                    header: 'Accuracy (Bisection / Walk)',
                    className: 'font-mono',
                    render: (row) => `${accuracy(row.bisection)} / ${accuracy(row.walking)}`,
                  },
                ]}
              />
            )}
          </Panel>

          <Notice tone="primary" icon={<Sparkles className="h-4 w-4" />}>
            {trialsDone === 0 ? (
              'The key finding appears once the first trials have run.'
            ) : (
              <>
                <strong>Key Finding:</strong> In a {keyRow.reaches}-reach network, information-gain bisection locates
                the pollution source in <strong>{medianChecks(keyRow.bisection)} checks</strong> (median), compared to{' '}
                {medianChecks(keyRow.walking)} checks for walking upstream:{' '}
                {percent(1 - medianChecks(keyRow.bisection) / medianChecks(keyRow.walking))} fewer checks, with{' '}
                {accuracy(keyRow.bisection)} and {accuracy(keyRow.walking)} of hunts naming the right reach.
              </>
            )}
          </Notice>
        </div>
      )}

      {/* Study 3: coverage over a year */}
      {activeStudy === 'coverage' && (
        <div className="space-y-4">
          <Illustrative>
            These numbers show what a one-year model of demand-pull against free roaming would compare. No such model
            was run for this prototype.
          </Illustrative>
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
            <StatCard
              label="Median Water Data Age"
              value={`${demandPull.medianWaterDataAgeDays} days vs ${freeRoaming.medianWaterDataAgeDays} days`}
              caption="In this example demand-pull keeps the data 3.8× fresher."
            />
            <StatCard
              label="Storm Runoff Checked <72h"
              value={`${demandPull.stormCheckedWithin72hPct}% vs ${freeRoaming.stormCheckedWithin72hPct}%`}
              caption="What storm missions are meant to achieve."
            />
            <StatCard
              label="Spatial Gini Coefficient"
              value={`${demandPull.evenCoverageGini} vs ${freeRoaming.evenCoverageGini}`}
              caption={`In this example free roaming clusters at convenient bridges (Gini ${freeRoaming.evenCoverageGini}).`}
            />
          </div>

          <Panel
            title="What a One-Year Coverage Model Would Compare"
            description={`The example assumes ${COVERAGE_SIMULATION_DATA.volunteerCount} volunteers making the same total of ${demandPull.totalMissionsFulfilled} checks in a year with ${COVERAGE_SIMULATION_DATA.annualRainDaysOver20mm} days of more than 20 mm of rain.`}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="well space-y-2 p-4">
                <h3 className="text-xs font-bold text-cyan-400">Demand-Pull (Expected)</h3>
                <ul className="list-disc space-y-1 pl-4 text-2xs text-slate-300">
                  <li>Stale reaches receive priority bounties automatically</li>
                  <li>After storms, nearby volunteers alerted within 60 minutes</li>
                  <li>Even coverage across all reaches (Gini {demandPull.evenCoverageGini})</li>
                  <li>Reaches watched consecutively: median 12 weeks</li>
                </ul>
              </div>

              <div className="well space-y-2 p-4">
                <h3 className="text-xs font-bold text-slate-300">Supply-Push (Expected)</h3>
                <ul className="list-disc space-y-1 pl-4 text-2xs text-slate-400">
                  <li>Volunteers check familiar park bridges repeatedly</li>
                  <li>Outer tributaries left unmonitored for &gt;45 days</li>
                  <li>76% of rain shock events completely missed</li>
                  <li>Dropoff after initial weekend enthusiasm</li>
                </ul>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* Study 4: the randomized pilot */}
      {activeStudy === 'pilot' && (
        <div className="space-y-4">
          <Illustrative>
            This is the design of a pilot, with example values for its outcomes. No pilot was run and no volunteers
            took part.
          </Illustrative>
          <section className="card space-y-2 p-4 sm:p-5">
            <Badge tone="warning">Pilot design, not run</Badge>
            <h2 className="text-lg font-bold tracking-tight text-slate-50">
              Planned Pilot on the Rio Selho: 28 Volunteers Randomized 1:1 for 14 Days
            </h2>
            <p className="max-w-3xl text-xs text-slate-300">
              Primary outcome the pilot would measure: the proportion of participants submitting at least one valid
              stream check in week 2 (days 8–14).
            </p>
          </section>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard
              label="Primary: Week 2 Retention"
              value={
                <>
                  <span className="text-emerald-400">{PILOT_STUDY_DATA.missionsArm.week2ActiveRetentionPct}%</span> vs{' '}
                  <span className="text-rose-400">{PILOT_STUDY_DATA.plainArm.week2ActiveRetentionPct}%</span>
                </>
              }
              caption="Example values: 10 of 14 against 3 of 14."
            />
            <StatCard
              label="Checks Per Participant"
              value={`${PILOT_STUDY_DATA.missionsArm.checksPerPerson} vs ${PILOT_STUDY_DATA.plainArm.checksPerPerson}`}
              caption="Example values."
            />
            <StatCard
              label="Corroboration Rate"
              value={`${PILOT_STUDY_DATA.missionsArm.corroborationRatePct}% vs ${PILOT_STUDY_DATA.plainArm.corroborationRatePct}%`}
              caption="Example values: checks corroborated within a half-life."
            />
            <StatCard
              label="Speed of Check Form"
              value={`${PILOT_STUDY_DATA.missionsArm.avgSecondsPerCheck}s vs ${PILOT_STUDY_DATA.plainArm.avgSecondsPerCheck}s`}
              caption="Example values: the micro-check aims at under 60 s."
            />
          </div>

          <Panel
            title="Field Trace Drill (Planned)"
            description={
              'A referee would pick a secret "source" reach on the pilot stream, and Naiad would guide volunteers to it by bisection. Example values:'
            }
            icon={<CheckCircle2 className="h-4 w-4" />}
          >
            <div className="well space-y-1.5 p-3 text-xs">
              <dl className="space-y-1.5">
                {[
                  { label: 'Target Reach Identified:', value: PILOT_STUDY_DATA.drillResult.secretSourceReach },
                  { label: 'Checks Needed:', value: `${PILOT_STUDY_DATA.drillResult.checksNeeded} checks` },
                  { label: 'Elapsed Time:', value: `${PILOT_STUDY_DATA.drillResult.timeToLocateMinutes} minutes` },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between gap-4">
                    <dt className="text-slate-400">{row.label}</dt>
                    <dd className="text-right font-semibold text-slate-50">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="pt-1 text-2xs text-slate-400">{PILOT_STUDY_DATA.drillResult.volunteerConfirmation}</p>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
};
