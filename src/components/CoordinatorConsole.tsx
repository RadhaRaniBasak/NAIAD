/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, Gauge, Radar, Users, Waves, ListChecks, Siren, Inbox } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { daysSince, freshnessOf } from '../engine/freshness.ts';
import { Badge, Button, PageHeader, Panel, Segmented, StatCard, Table } from './design-system/index.ts';
import {
  INCIDENT_STATUS_TONES,
  MISSION_SOURCES,
  canHandOff,
  freshnessState,
  isActiveIncident,
  missionPoints,
  networkFreshness,
  plural,
} from './presentation.ts';

const SUB_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'queue', label: 'Queue' },
  { id: 'incidents', label: 'Incidents' },
  { id: 'fhir', label: 'External FHIR' },
] as const;

export const CoordinatorConsole: React.FC = () => {
  const {
    reaches,
    missions,
    incidents,
    crews,
    weather,
    fhirRequests,
    fhirTasks,
    approveFhirServiceRequest,
    confirmIncidentAdvisory,
    handoffIncident,
    dismissIncident,
  } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<(typeof SUB_TABS)[number]['id']>('overview');

  const now = new Date();
  const network = networkFreshness(reaches, now, weather);
  const observableReaches = reaches.filter((r) => r.observable).length;
  const activeIncidents = incidents.filter(isActiveIncident);

  // The registry, stalest water data first
  const reachRows = reaches
    .map((reach) => ({ reach, f: freshnessOf(reach.lastCheckAt, 'water', now, weather) }))
    .sort((a, b) => a.f - b.f);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coordinator Console"
        description="Supervise urban stream coverage, authorize outside health requests, review community pollution advisories, and prepare municipal handoff reports."
        icon={<ShieldCheck className="h-5 w-5" />}
        tone="info"
      >
        <Segmented label="Console section" options={SUB_TABS} value={activeSubTab} onChange={setActiveSubTab} />
      </PageHeader>

      {activeSubTab === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard
              label="Network Freshness"
              value={`${Math.round(network.average * 100)}%`}
              caption={`${network.counts.fresh} fresh · ${network.counts.aging} aging · ${network.counts.stale} stale`}
              icon={<Gauge className="h-5 w-5" />}
              tone={freshnessState(network.average).tone}
            />
            <StatCard
              label="Active Incidents"
              value={activeIncidents.length}
              caption="Watch, advisory and confirmed"
              icon={<Radar className="h-5 w-5" />}
              tone={activeIncidents.length > 0 ? 'danger' : 'success'}
            />
            <StatCard
              label="Community Crews"
              value={crews.length}
              caption="Adopting active reaches"
              icon={<Users className="h-5 w-5" />}
              tone="success"
            />
            <StatCard
              label="Total Reaches"
              value={`${observableReaches}/${reaches.length}`}
              caption="Observable from public access"
              icon={<Waves className="h-5 w-5" />}
              tone="info"
            />
          </div>

          <Panel
            title="Reach Monitoring Status (Urban Stream Registry)"
            description="Sorted by freshness need: the stalest water data first."
            icon={<Waves className="h-4 w-4" />}
            flush
          >
            <Table
              caption="Reaches with the age of their last water check, streak, exposure and freshness state"
              data={reachRows}
              keyExtractor={(row) => row.reach._id}
              columns={[
                { key: 'id', header: 'Reach ID', render: ({ reach }) => <span className="font-mono font-semibold text-cyan-400">{reach._id}</span> },
                { key: 'name', header: 'Name', render: ({ reach }) => <span className="text-slate-200">{reach.name}</span> },
                {
                  key: 'checked',
                  header: 'Water Checked',
                  render: ({ reach }) => {
                    if (!reach.lastCheckAt.water) return 'Never';
                    const days = Math.floor(daysSince(reach.lastCheckAt.water, now));
                    return days === 0 ? 'Today' : `${days}d ago`;
                  },
                },
                { key: 'streak', header: 'Streak', className: 'font-semibold', render: ({ reach }) => `${reach.streakWeeks} wks` },
                {
                  key: 'exposure',
                  header: 'Exposure (H/A/E)',
                  className: 'font-mono text-2xs text-slate-400',
                  render: ({ reach }) => `${reach.exposure.human}H / ${reach.exposure.animal}A / ${reach.exposure.ecosystem}E`,
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: ({ f }) => {
                    const state = freshnessState(f);
                    return (
                      <Badge tone={state.tone}>
                        {state.label} · {Math.round(f * 100)}%
                      </Badge>
                    );
                  },
                },
              ]}
            />
          </Panel>
        </>
      )}

      {activeSubTab === 'queue' && (
        <Panel
          title={`Live Demand Queue (${missions.length} active requests)`}
          description="Generated dynamically by weather shock, freshness half-life, and external FHIR requests."
          icon={<ListChecks className="h-4 w-4" />}
        >
          {missions.length > 0 ? (
            <ul className="space-y-2.5">
              {missions.map((m) => (
                <li key={m._id} className="well flex flex-col justify-between gap-3 p-3 text-xs sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={MISSION_SOURCES[m.source].tone}>{MISSION_SOURCES[m.source].label}</Badge>
                      <strong className="text-slate-100">Target Reach: {m.reachId}</strong>
                      <span className="text-3xs text-slate-400">Priority Value: {Math.round(m.value * 100)}%</span>
                    </div>
                    <p className="mt-1 text-2xs italic text-slate-300">"{m.reason}"</p>
                  </div>
                  <Badge tone="success" className="self-start sm:self-auto">
                    Bounty: {missionPoints(m, reaches, now, weather)} pts
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-xs text-slate-400">No open requests: no reach needs a check right now.</p>
          )}
        </Panel>
      )}

      {activeSubTab === 'incidents' && (
        <Panel
          title="Pollution Incidents Board"
          description="Track volunteer reports, review advisories, and confirm municipal handoff reports."
          icon={<Siren className="h-4 w-4" />}
        >
          {incidents.length > 0 ? (
            <ul className="space-y-3">
              {incidents.map((inc) => (
                <li key={inc._id} className="well space-y-3 p-4 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-50">{inc.title}</span>
                      <Badge tone={INCIDENT_STATUS_TONES[inc.status]} className="uppercase">
                        {inc.status}
                      </Badge>
                    </div>
                    <span className="font-mono text-2xs text-slate-400">
                      Opened: {new Date(inc.openedAt).toLocaleTimeString()}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-2xs text-slate-300">
                    <span>
                      Observations: <strong>{plural(inc.observations.length, 'check')}</strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Origin: <strong>Reach {inc.originReachId}</strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Downstream Affected: <strong>{plural(inc.downstream.length, 'reach', 'reaches')}</strong>
                    </span>
                  </div>

                  {isActiveIncident(inc) && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
                      {inc.status === 'advisory' && (
                        <Button variant="warning" size="sm" onClick={() => confirmIncidentAdvisory(inc._id)}>
                          Confirm Advisory
                        </Button>
                      )}
                      {canHandOff(inc) && (
                        <Button variant="success" size="sm" onClick={() => handoffIncident(inc._id)}>
                          Handoff to City
                        </Button>
                      )}
                      {inc.status === 'confirmed' && !canHandOff(inc) && (
                        <span className="text-2xs italic text-slate-400">
                          Handoff opens once the hunt has isolated the source reach.
                        </span>
                      )}
                      <Button variant="secondary" size="sm" onClick={() => dismissIncident(inc._id)}>
                        Dismiss
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-xs text-slate-400">No incidents recorded.</p>
          )}
        </Panel>
      )}

      {activeSubTab === 'fhir' && (
        <Panel
          title="External Partner FHIR ServiceRequest Queue"
          description="Hospital, veterinary clinic, and municipal partner inquiries awaiting authorization."
          icon={<Inbox className="h-4 w-4" />}
        >
          <ul className="space-y-3">
            {fhirRequests.map((sr) => {
              const task = fhirTasks.find((t) => t.focus.reference === `ServiceRequest/${sr.id}`);

              return (
                <li key={sr.id} className="well flex flex-col justify-between gap-3 p-4 text-xs sm:flex-row sm:items-center">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-slate-50">{sr.requester.display}</strong>
                      <Badge tone="primary" className="font-mono">
                        {sr.subject.reference}
                      </Badge>
                    </div>
                    <p className="text-2xs italic text-slate-300">"{sr.reasonCode[0].text}"</p>
                  </div>

                  {task ? (
                    <span className="flex shrink-0 items-center gap-1 text-2xs font-bold text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />{' '}
                      {task.status === 'completed' ? 'Answered' : 'Active Task'}
                    </span>
                  ) : (
                    <Button variant="success" size="sm" className="shrink-0" onClick={() => approveFhirServiceRequest(sr.id)}>
                      Approve Request
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
};
