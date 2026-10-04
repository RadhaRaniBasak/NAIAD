/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { MapPin, Sparkles, ArrowRight, CheckCircle2, Timer } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import type { RequestMission, RequestSource } from '../types/index.ts';
import { Badge, Button, Chips, EmptyState, PageHeader } from './design-system/index.ts';
import { MISSION_SOURCES, isCrewReach, missionPoints, rankMissions, simulatedDistanceKm } from './presentation.ts';

type SourceFilter = RequestSource | 'all';

const SOURCE_FILTERS: { id: SourceFilter; label: string }[] = [
  { id: 'all', label: 'All Sources' },
  ...(['weather', 'trace', 'lab-gap', 'staleness', 'external'] as const).map((id) => ({
    id,
    label: MISSION_SOURCES[id].label,
  })),
];

export const MissionList: React.FC = () => {
  const { missions, reaches, accessPoints, user, weather, setActiveMissionToSubmit } = useApp();
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  const now = new Date();
  const pointsOf = (mission: RequestMission) => missionPoints(mission, reaches, now, weather);
  const topBounty = Math.max(0, ...missions.map(pointsOf));

  const rankedMissions = useMemo(
    () =>
      rankMissions(
        sourceFilter === 'all' ? missions : missions.filter((m) => m.source === sourceFilter),
        reaches,
        user.crewId
      ),
    [missions, sourceFilter, reaches, user.crewId]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="1-Minute Missions"
        description="Naiad does not wait for random checks. Every one-minute mission is requested by an active staleness model, storm runoff alert, research lab gap, or community trace hunt."
        icon={<Timer className="h-5 w-5" />}
      >
        <dl className="card flex divide-x divide-slate-800">
          <div className="px-4 py-2">
            <dt className="text-3xs font-medium text-slate-400">Open Missions</dt>
            <dd className="text-base font-bold tabular-nums text-slate-50">{missions.length}</dd>
          </div>
          <div className="px-4 py-2">
            <dt className="text-3xs font-medium text-slate-400">Top Bounty</dt>
            <dd className="text-base font-bold tabular-nums text-emerald-400">+{topBounty} pts</dd>
          </div>
        </dl>
      </PageHeader>

      <Chips label="Filter by source" options={SOURCE_FILTERS} value={sourceFilter} onChange={setSourceFilter} />

      {rankedMissions.length > 0 ? (
        <ul className="space-y-3">
          {rankedMissions.map((m) => {
            const reach = reaches.find((r) => r._id === m.reachId);
            const accessPoint = accessPoints.find((ap) => ap.reachId === m.reachId);
            const source = MISSION_SOURCES[m.source];
            const isCrewAdopted = isCrewReach(reach, user.crewId);

            return (
              <li
                key={m._id}
                className="card flex flex-col gap-4 p-4 transition-colors hover:border-slate-700 sm:p-5 md:flex-row md:items-center"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={source.tone}>
                      <source.icon className="h-3 w-3" aria-hidden="true" />
                      {source.label}
                    </Badge>
                    {isCrewAdopted && <Badge tone="success">Your Crew's Reach</Badge>}
                    <span className="text-2xs text-slate-400">
                      <span className="font-mono">{m.reachId}</span> · {reach?.name || 'Urban Reach'}
                    </span>
                  </div>

                  <h2 className="text-sm font-semibold text-slate-50 sm:text-base">"{m.reason}"</h2>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      {accessPoint?.name || 'Public Footpath Access Point'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-slate-300">{simulatedDistanceKm(m.reachId)} km away</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Asking: <strong className="uppercase text-slate-200">{m.groups.join(', ')} Micro-Check</strong>
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-800 pt-3 md:flex-col md:items-end md:border-t-0 md:pt-0">
                  <div className="md:text-right">
                    <div className="text-2xs text-slate-400">Need-Based Payout</div>
                    <div className="flex items-center gap-1 text-lg font-bold tabular-nums text-emerald-400 md:justify-end">
                      <Sparkles className="h-4 w-4" aria-hidden="true" />+{pointsOf(m)} pts
                    </div>
                  </div>
                  <Button rightIcon={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => setActiveMissionToSubmit(m)}>
                    Check In
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="success"
          title="No Open Missions Here"
          description="Nothing asks for a check under this filter right now. Switch filters above, or simulate a heavy rain storm from the weather controls."
        />
      )}
    </div>
  );
};
