/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  CheckCircle2,
  FileText,
  TrendingDown,
  Sparkles,
  Radar,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { PARAMS } from '../engine/params.ts';
import { isolatedSource } from '../engine/trace.ts';
import { Badge, Button, EmptyState, Meter, Modal, Notice, PageHeader, Panel, useToast } from './design-system/index.ts';
import { INCIDENT_STATUS_TONES, canHandOff, isActiveIncident } from './presentation.ts';

const STOP_PCT = Math.round(PARAMS.trace.stopPosterior * 100);

export const TraceHuntView: React.FC = () => {
  const {
    user,
    incidents,
    reaches,
    accessPoints,
    exposureSites,
    startTraceDrill,
    performTraceCheck,
    confirmIncidentAdvisory,
    handoffIncident,
  } = useApp();

  const { showToast } = useToast();
  const [showHandoffModal, setShowHandoffModal] = useState<boolean>(false);

  // The hunt on screen is the newest incident that is still open. Closed ones stay on the
  // coordinator console's incident board.
  const activeIncident = incidents.find(isActiveIncident) ?? null;

  // Candidate reaches with probabilities, sorted descending
  const candidateReachesSorted = useMemo(() => {
    if (!activeIncident) return [];
    return Object.entries(activeIncident.posterior)
      .map(([reachId, prob]) => {
        const reach = reaches.find((r) => r._id === reachId);
        const ap = accessPoints.find((a) => a.reachId === reachId);
        return {
          reachId,
          prob,
          name: reach?.name || reachId,
          accessPointName: ap?.name || 'Public Access Point',
        };
      })
      .sort((a, b) => b.prob - a.prob);
  }, [activeIncident, reaches, accessPoints]);

  // Who is exposed: the reported reach itself first, then each reach downstream with its arrival window
  const exposedReaches = useMemo(() => {
    if (!activeIncident) return [];
    const withSites = (reachId: string) => ({
      reachId,
      reachName: reaches.find((r) => r._id === reachId)?.name || reachId,
      sites: exposureSites.filter((e) => e.reachId === reachId),
    });
    const origin = { ...withSites(activeIncident.originReachId), eta: 'Reported here' };
    const downstream = activeIncident.downstream.map((d) => ({
      ...withSites(d.reachId),
      eta: `ETA ${Math.round(d.etaMinMinutes)}m – ${Math.round(d.etaMaxMinutes)}m`,
    }));
    return origin.sites.length > 0 ? [origin, ...downstream] : downstream;
  }, [activeIncident, reaches, exposureSites]);

  // Highest probability candidate. Whether it counts as isolated, and whether the incident can be
  // handed off, are decided by the same rules the missions and the console use.
  const topCandidate = candidateReachesSorted[0];
  const sourceIsolated = activeIncident !== null && isolatedSource(activeIncident.posterior) !== undefined;
  const handoffAllowed = activeIncident !== null && canHandOff(activeIncident);
  const isCoordinator = user.role === 'coordinator';
  const exposedSiteNames = exposedReaches.flatMap((d) => d.sites.map((s) => s.name || s.kind));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trace Hunts"
        description="When visible pollution is reported, Naiad works out when it could reach the schools and dog parks downstream, and guides an upstream bisection hunt that isolates the source reach in fewer checks than walking upstream (measured on the Evidence page)."
        icon={<Radar className="h-5 w-5" />}
        tone="danger"
      >
        {activeIncident && (
          <>
            {activeIncident.isDrill && <Badge>Practice Drill</Badge>}
            <Badge tone={INCIDENT_STATUS_TONES[activeIncident.status]} className="uppercase">
              Status: {activeIncident.status}
            </Badge>
          </>
        )}
      </PageHeader>

      {activeIncident ? (
        <>
          <Notice tone={INCIDENT_STATUS_TONES[activeIncident.status]} icon={<ShieldAlert className="h-4 w-4" />}>
            <strong>{activeIncident.title}</strong>
            <span className="block text-2xs">
              Opened {new Date(activeIncident.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·
              origin reach {activeIncident.originReachId}
            </span>
          </Notice>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Downstream: who is exposed, and when */}
            <div className="space-y-4 lg:col-span-5">
              <Panel
                title="Downstream Arrival Windows"
                description="Screening model estimate: the exposure sites on the reported reach, and arrival timing at those below it."
                icon={<Clock className="h-4 w-4" />}
                action={
                  <span className="font-mono text-3xs text-slate-400">
                    vMin {PARAMS.trace.vMin} m/s · vMax {PARAMS.trace.vMax.toFixed(1)} m/s
                  </span>
                }
              >
                {exposedReaches.length > 0 ? (
                  <ul className="space-y-2.5">
                    {exposedReaches.map((d) => (
                      <li key={d.reachId} className="well space-y-2 p-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong className="text-slate-100">{d.reachName}</strong>
                          <Badge tone="primary" className="font-mono">
                            {d.eta}
                          </Badge>
                        </div>

                        {d.sites.length > 0 && (
                          <ul className="space-y-1.5 border-t border-slate-800 pt-2">
                            {d.sites.map((s) => (
                              <li key={s._id} className="flex items-start gap-1.5 text-2xs">
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" aria-hidden="true" />
                                <span>
                                  <span className="block font-medium text-amber-400">{s.name}</span>
                                  <span className="block text-3xs capitalize text-slate-400">
                                    {s.pillar} · {s.kind.replace(/_/g, ' ')}
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-center text-xs italic text-slate-400">
                    Origin is at the terminal outfall, with no exposure site on record: no downstream reaches affected.
                  </p>
                )}
              </Panel>

              <Panel title="Community Advisory Gate" icon={<ShieldAlert className="h-4 w-4" />}>
                <div className="space-y-3 text-xs">
                  <p className="text-slate-300">
                    Rule: An advisory requires at least <strong>two independent positive checks</strong> from
                    different volunteers and coordinator wording approval before public broadcast.
                  </p>
                  <p className="text-2xs text-slate-400">
                    This demo counts every positive check, whoever made it, and sends nothing to the public.
                  </p>

                  <div className="well flex items-center justify-between gap-2 p-2.5">
                    <span>Positive Checks So Far:</span>
                    <strong className="text-slate-50">{activeIncident.observations.filter((o) => o.positive).length}</strong>
                  </div>

                  {activeIncident.status === 'watch' && (
                    <p className="text-2xs italic text-slate-400">
                      Status is 'Watch'. Waiting for a second positive observation before an advisory can be confirmed.
                    </p>
                  )}

                  {activeIncident.status === 'advisory' && (
                    <>
                      <Notice tone="warning">Two positive checks received. Ready for coordinator approval.</Notice>
                      {isCoordinator ? (
                        <Button
                          variant="warning"
                          className="w-full"
                          onClick={() => confirmIncidentAdvisory(activeIncident._id)}
                        >
                          Confirm Downstream Advisory
                        </Button>
                      ) : (
                        <p className="text-2xs italic text-slate-400">
                          Approval is a coordinator's step. In this demo, switch the role to Coordinator to give it.
                        </p>
                      )}
                    </>
                  )}

                  {activeIncident.status === 'confirmed' && (
                    <Notice tone="success" icon={<CheckCircle2 className="h-4 w-4" />}>
                      Downstream Advisory Confirmed
                    </Notice>
                  )}
                </div>
              </Panel>
            </div>

            {/* Upstream: where it comes from */}
            <Panel
              className="lg:col-span-7"
              title="Upstream Bayesian Source Probability Tree"
              icon={<TrendingDown className="h-4 w-4" />}
              action={<span className="text-3xs text-slate-400">Stopping threshold: ≥{STOP_PCT}% on one reach</span>}
            >
              <div className="space-y-5">
                {topCandidate && (
                  <div className="well space-y-2 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-slate-300">
                        Highest Suspect Reach: <strong className="text-slate-50">{topCandidate.name}</strong>
                      </span>
                      <span className={`text-base font-extrabold tabular-nums ${sourceIsolated ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {Math.round(topCandidate.prob * 100)}% posterior
                      </span>
                    </div>

                    <div className="relative">
                      <Meter value={topCandidate.prob * 100} tone={sourceIsolated ? 'success' : 'danger'} />
                      {/* The stopping threshold */}
                      <span
                        className="absolute -inset-y-0.5 w-0.5 rounded-full bg-slate-50"
                        style={{ left: `${STOP_PCT}%` }}
                        title={`${STOP_PCT}% stopping threshold`}
                      />
                    </div>

                    <div className="flex justify-between gap-2 text-3xs text-slate-400">
                      <span>Prior: Uniform by channel length</span>
                      <span className="font-bold text-amber-400">{STOP_PCT}% threshold for handoff</span>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-200">
                    Candidate Upstream Reaches ({candidateReachesSorted.length}):
                  </h3>
                  <ul className="@container space-y-1.5">
                    {candidateReachesSorted.map((c) => {
                      const probPct = Math.round(c.prob * 100);
                      return (
                        <li
                          key={c.reachId}
                          className="well flex flex-col gap-2.5 p-2.5 text-xs @md:flex-row @md:items-center @md:gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="truncate font-medium text-slate-200">{c.name}</span>
                              <span className="font-bold tabular-nums text-slate-200">{probPct}%</span>
                            </div>
                            <Meter value={probPct} />
                          </div>

                          {/* Record what a volunteer saw on this reach */}
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => performTraceCheck(activeIncident._id, c.reachId, true)}
                              className="cursor-pointer whitespace-nowrap rounded-lg border border-rose-800 bg-rose-950 px-2.5 py-1.5 text-2xs font-bold text-rose-300 transition-colors hover:bg-rose-900"
                              title="Simulate a volunteer reporting that the sign IS PRESENT at this reach"
                            >
                              + Sign Present
                            </button>
                            <button
                              type="button"
                              onClick={() => performTraceCheck(activeIncident._id, c.reachId, false)}
                              className="cursor-pointer whitespace-nowrap rounded-lg border border-emerald-800 bg-emerald-950 px-2.5 py-1.5 text-2xs font-bold text-emerald-300 transition-colors hover:bg-emerald-900"
                              title="Simulate a volunteer reporting that the sign is ABSENT at this reach"
                            >
                              − Sign Absent
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="space-y-2 border-t border-slate-800 pt-4">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    <FileText className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    Audit Trail of Observations ({activeIncident.observations.length}):
                  </h3>
                  <ul className="space-y-1.5">
                    {activeIncident.observations.map((obs, idx) => (
                      <li key={idx} className="well flex items-center justify-between gap-2 px-2.5 py-2 text-2xs">
                        <span className="text-slate-300">
                          Reach {obs.reachId} checked by <strong className="text-slate-50">{obs.userNickname}</strong>
                        </span>
                        <Badge tone={obs.positive ? 'danger' : 'success'}>{obs.positive ? 'Sign Present' : 'Sign Absent'}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>

                {topCandidate && sourceIsolated && (
                  <Notice tone="success" icon={<Sparkles className="h-4 w-4" />}>
                    <strong className="block">Source Isolated with at least {STOP_PCT}% Confidence!</strong>
                    <p className="mt-0.5 text-2xs">
                      Bisection reached the stopping threshold on {topCandidate.name}.{' '}
                      {handoffAllowed
                        ? isCoordinator
                          ? 'Prepare the municipal handoff report.'
                          : "The handoff is a coordinator's step: in this demo, switch the role to Coordinator to prepare it."
                        : activeIncident.status === 'advisory'
                          ? 'The handoff report opens once a coordinator has confirmed the advisory.'
                          : 'The handoff report opens once the advisory is confirmed: that takes a second positive check and a coordinator.'}
                    </p>
                    {handoffAllowed && isCoordinator && (
                      <Button
                        variant="success"
                        className="mt-3 w-full"
                        leftIcon={<FileText className="h-4 w-4" />}
                        onClick={() => setShowHandoffModal(true)}
                      >
                        View Municipal Handoff Report
                      </Button>
                    )}
                  </Notice>
                )}
              </div>
            </Panel>
          </div>
        </>
      ) : (
        <EmptyState
          className="mx-auto max-w-xl"
          icon={<ShieldAlert className="h-5 w-5" />}
          tone="danger"
          title="No Active Incident Reports"
          description="No pollution sign has an open report in this city. You can launch a simulated Trace Drill (such as reported sewage or foam) to test the Bayesian bisection algorithm."
          actionLabel="Start Simulated Trace Drill"
          onAction={startTraceDrill}
        />
      )}

      {showHandoffModal && activeIncident && topCandidate && (
        <Modal
          onClose={() => setShowHandoffModal(false)}
          title="Naiad Municipal Stream Segment Handoff Report"
          icon={<FileText className="h-5 w-5" />}
          tone="success"
          maxWidth="2xl"
        >
          <div className="space-y-4 text-xs">
            <Notice tone="warning">
              <strong className="block">Standard Ethical Boundary Notice:</strong>
              <p className="mt-0.5 text-2xs">
                This report names a <strong>stream reach segment</strong>, never a private individual, company, or
                specific building property. Volunteers remain on public paths at all times. Physical inspection of
                outfall pipes must be conducted by municipal authorities.
              </p>
            </Notice>

            <dl className="well space-y-2 p-4">
              {[
                { label: 'Target Segment ID:', value: <span className="font-mono">{topCandidate.reachId}</span> },
                { label: 'Stream Name & Reach:', value: topCandidate.name },
                { label: 'Reported Contaminant Sign:', value: <span className="uppercase">{activeIncident.sign.replace(/_/g, ' ')}</span> },
                { label: 'Posterior Probability:', value: `${Math.round(topCandidate.prob * 100)}%` },
                { label: 'Nearest Public Access:', value: topCandidate.accessPointName },
              ].map((row) => (
                <div key={row.label} className="flex justify-between gap-4">
                  <dt className="text-slate-400">{row.label}</dt>
                  <dd className="text-right font-semibold text-slate-50">{row.value}</dd>
                </div>
              ))}
            </dl>

            <div className="space-y-1">
              <h3 className="font-semibold text-slate-200">Downstream Warning Horizon:</h3>
              <p className="text-2xs text-slate-400">
                Flow travels downstream at about {PARAMS.trace.vMin} to {PARAMS.trace.vMax.toFixed(1)} m/s.{' '}
                {exposedSiteNames.length > 0
                  ? `Exposure sites at and below the origin reach: ${exposedSiteNames.join(', ')}.`
                  : 'No exposure sites are recorded at or below the origin reach.'}
              </p>
            </div>

            <div>
              <h3 className="mb-1.5 font-semibold text-slate-200">Timeline of Citizen Ground-Truth Checks:</h3>
              <ol className="well space-y-1 p-2.5">
                {activeIncident.observations.map((obs, i) => (
                  <li key={i} className="flex justify-between gap-2 text-2xs text-slate-300">
                    <span>
                      Check #{i + 1} at Reach {obs.reachId}
                    </span>
                    <strong className={obs.positive ? 'text-rose-400' : 'text-emerald-400'}>
                      {obs.positive ? 'SIGN PRESENT' : 'SIGN ABSENT'}
                    </strong>
                  </li>
                ))}
              </ol>
            </div>

            <p className="text-2xs text-slate-400">
              In this demo, confirming only marks the incident as handed off: nothing is sent to the municipality.
            </p>
            <Button
              variant="success"
              className="w-full"
              onClick={() => {
                handoffIncident(activeIncident._id);
                setShowHandoffModal(false);
                showToast('success', 'Incident Marked as Handed Off', 'It stays on the coordinator console\'s incident board.');
              }}
            >
              Confirm Handoff to Municipal Environmental Division
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};
