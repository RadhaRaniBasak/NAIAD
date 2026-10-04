/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The home page: where the network stands right now and what most needs a volunteer.
 * Every figure is derived from the same state the other pages use; nothing here is stored.
 */

import React from 'react';
import {
  ArrowRight,
  Award,
  Flame,
  Gauge,
  LayoutDashboard,
  ListChecks,
  PieChart,
  Radar,
  ShieldAlert,
  Timer,
  Waves,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { CITIES } from '../data/cities.ts';
import { freshnessOf } from '../engine/freshness.ts';
import { PARAMS } from '../engine/params.ts';
import type { RequestMission, RequestSource } from '../types/index.ts';
import { Badge, Button, Meter, Notice, PageHeader, Panel, StatCard, TONE_STYLES } from './design-system/index.ts';
import {
  FRESHNESS_STATES,
  MISSION_SOURCES,
  ageLabel,
  freshnessState,
  isActiveIncident,
  missionPoints,
  networkFreshness,
  rankMissions,
} from './presentation.ts';

const TOP_MISSIONS = 4;
const TOP_STREAKS = 6;
const RECENT_CHECKS = 6;

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const Overview: React.FC = () => {
  const {
    currentCity,
    reaches,
    missions,
    incidents,
    checks,
    offlineQueue,
    crews,
    user,
    weather,
    setActiveTab,
    setSelectedReachId,
    setActiveMissionToSubmit,
  } = useApp();

  const now = new Date();
  const city = CITIES.find((c) => c.id === currentCity);
  const network = networkFreshness(reaches, now, weather);
  const averagePct = Math.round(network.average * 100);

  const reachRows = reaches
    .map((reach) => {
      const f = freshnessOf(reach.lastCheckAt, 'water', now, weather);
      return { reach, pct: Math.round(f * 100), state: freshnessState(f), age: ageLabel(reach.lastCheckAt.water, now) };
    })
    .sort((a, b) => a.pct - b.pct);

  const rankedMissions = rankMissions(missions, reaches, user.crewId);
  const pointsOf = (mission: RequestMission) => missionPoints(mission, reaches, now, weather);
  const topBounty = Math.max(0, ...missions.map(pointsOf));
  const sourceCounts = (Object.keys(MISSION_SOURCES) as RequestSource[])
    .map((source) => ({ source, total: missions.filter((m) => m.source === source).length }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);

  const activeIncidents = incidents.filter(isActiveIncident);
  const streaks = [...reaches].sort((a, b) => b.streakWeeks - a.streakWeeks).slice(0, TOP_STREAKS);
  const userCrew = crews.find((c) => c._id === user.crewId);
  const reachName = (reachId: string) => reaches.find((r) => r._id === reachId)?.name || reachId;
  // Checks are listed for the city on screen: a check made in another city belongs to its own Overview.
  const cityChecks = checks.filter((check) => reaches.some((r) => r._id === check.reachId));

  const openOnMap = (reachId: string) => {
    setSelectedReachId(reachId);
    setActiveTab('map');
  };

  // Donut segments: each state's share of the reaches, laid end to end on a circle of length 100.
  let drawn = 0;
  const segments = FRESHNESS_STATES.map((state) => {
    const share = reaches.length > 0 ? (network.counts[state.id] / reaches.length) * 100 : 0;
    const segment = { state, share, offset: drawn };
    drawn += share;
    return segment;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={city ? `${city.name}, ${city.country} · ${city.streamName}` : undefined}
        icon={<LayoutDashboard className="h-5 w-5" />}
      >
        <Button variant="secondary" size="sm" onClick={() => setActiveTab('map')}>
          Open the map
        </Button>
        <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />} onClick={() => setActiveTab('missions')}>
          Browse missions
        </Button>
      </PageHeader>

      {activeIncidents.length > 0 && (
        <Notice tone="danger" role="status" icon={<ShieldAlert className="h-4 w-4" />}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>{count(activeIncidents.length, 'active incident', 'active incidents')}:</strong>{' '}
              {activeIncidents[0].title}
            </span>
            <Button variant="danger" size="sm" onClick={() => setActiveTab('trace')}>
              Open the trace hunt
            </Button>
          </div>
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Network freshness"
          value={`${averagePct}%`}
          caption={`${network.counts.fresh} fresh · ${network.counts.aging} aging · ${network.counts.stale} stale`}
          icon={<Gauge className="h-5 w-5" />}
          tone={freshnessState(network.average).tone}
        />
        <StatCard
          label="Open missions"
          value={missions.length}
          caption={missions.length > 0 ? `Up to +${topBounty} points each` : 'No reach needs a check right now'}
          icon={<Timer className="h-5 w-5" />}
          tone="primary"
        />
        <StatCard
          label="Active incidents"
          value={activeIncidents.length}
          caption={activeIncidents.length > 0 ? 'Trace hunt in progress' : 'No open pollution reports'}
          icon={<Radar className="h-5 w-5" />}
          tone={activeIncidents.length > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Your points"
          value={user.points}
          caption={userCrew ? userCrew.name : 'Not in a crew yet'}
          icon={<Award className="h-5 w-5" />}
          tone="success"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Reach freshness"
          description={`Water indicators, stalest first. Trust in a check halves every ${
            weather.heatSpell
              ? `${PARAMS.halfLifeDays.water * PARAMS.heatSpell.halfLifeFactor} days during the heat spell`
              : `${PARAMS.halfLifeDays.water} days`
          }.`}
          icon={<Waves className="h-4 w-4" />}
        >
          <ul className="-mx-2 -my-1.5">
            {reachRows.map(({ reach, pct, state, age }) => (
              <li key={reach._id}>
                <button
                  type="button"
                  onClick={() => openOnMap(reach._id)}
                  title="Open this reach on the map"
                  className="block w-full cursor-pointer space-y-1.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-slate-850"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate text-xs font-semibold text-slate-100">{reach.name || reach._id}</span>
                    <Badge tone={state.tone}>{state.label}</Badge>
                  </span>
                  <span className="flex items-center gap-3">
                    <Meter value={pct} tone={state.tone} />
                    <span className="shrink-0 whitespace-nowrap text-2xs tabular-nums text-slate-400">
                      <strong className="text-slate-200">{pct}%</strong> · {age}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1">
          <Panel title="Freshness mix" description="Reaches in each state" icon={<PieChart className="h-4 w-4" />}>
            <div className="flex flex-col items-center gap-5">
              <div className="relative h-36 w-36 shrink-0">
                <svg
                  viewBox="0 0 120 120"
                  className="h-full w-full -rotate-90"
                  role="img"
                  aria-label={FRESHNESS_STATES.map((s) => `${network.counts[s.id]} ${s.label.toLowerCase()}`).join(', ')}
                >
                  <circle cx="60" cy="60" r="48" fill="none" strokeWidth="14" className="stroke-slate-800" />
                  {segments.map(
                    ({ state, share, offset }) =>
                      share > 0 && (
                        <circle
                          key={state.id}
                          cx="60"
                          cy="60"
                          r="48"
                          fill="none"
                          strokeWidth="14"
                          pathLength={100}
                          strokeDasharray={`${share} ${100 - share}`}
                          strokeDashoffset={-offset}
                          className={state.arc}
                        />
                      )
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold tabular-nums tracking-tight text-slate-50">{averagePct}%</span>
                  <span className="text-3xs text-slate-400">average</span>
                </div>
              </div>

              <ul className="w-full space-y-2 text-xs">
                {FRESHNESS_STATES.map((state) => (
                  <li key={state.id} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <Badge tone={state.tone}>{state.label}</Badge>
                      <span className="text-2xs text-slate-400">{state.range}</span>
                    </span>
                    <span className="font-semibold tabular-nums text-slate-200">
                      {count(network.counts[state.id], 'reach', 'reaches')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel title="Demand by source" description="Why the open missions exist" icon={<ListChecks className="h-4 w-4" />}>
            {sourceCounts.length > 0 ? (
              <ul className="space-y-3.5">
                {sourceCounts.map(({ source, total }) => {
                  const meta = MISSION_SOURCES[source];
                  return (
                    <li key={source} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex items-center gap-2 font-medium text-slate-200">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-lg border ${TONE_STYLES[meta.tone]}`}
                            aria-hidden="true"
                          >
                            <meta.icon className="h-3.5 w-3.5" />
                          </span>
                          {meta.label}
                        </span>
                        <span className="font-semibold tabular-nums text-slate-200">{total}</span>
                      </div>
                      <Meter value={(total / missions.length) * 100} tone={meta.tone} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-4 text-center text-xs text-slate-400">No demand right now.</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Most needed right now"
          description="Ranked by need and distance; your crew's reaches come first."
          icon={<Timer className="h-4 w-4" />}
          action={
            missions.length > TOP_MISSIONS && (
              <Button variant="ghost" size="sm" onClick={() => setActiveTab('missions')}>
                All {missions.length} missions
              </Button>
            )
          }
        >
          {rankedMissions.length > 0 ? (
            <ul className="space-y-2.5">
              {rankedMissions.slice(0, TOP_MISSIONS).map((mission) => {
                const source = MISSION_SOURCES[mission.source];
                return (
                  <li key={mission._id} className="well flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={source.tone}>
                          <source.icon className="h-3 w-3" aria-hidden="true" />
                          {source.label}
                        </Badge>
                        <span className="truncate text-2xs text-slate-400">{reachName(mission.reachId)}</span>
                      </div>
                      <p className="line-clamp-2 text-xs font-medium text-slate-200">{mission.reason}</p>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-3">
                      <span className="text-xs font-bold tabular-nums text-emerald-400">+{pointsOf(mission)} pts</span>
                      <Button size="sm" onClick={() => setActiveMissionToSubmit(mission)}>
                        Check In
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-6 text-center text-xs text-slate-400">
              No open missions: no reach needs a check right now. A storm or a few quiet days will raise new ones.
            </p>
          )}
        </Panel>

        <Panel
          title="Longest watch streaks"
          description="A streak belongs to the reach, not to a person."
          icon={<Flame className="h-4 w-4" />}
        >
          <ol className="space-y-2.5">
            {streaks.map((reach, index) => {
              const crew = crews.find((c) => c._id === reach.crewId);
              return (
                <li key={reach._id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="w-4 shrink-0 text-right font-mono text-2xs font-bold text-slate-400">{index + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-100">{reach.name || reach._id}</span>
                      <span className="block truncate text-2xs text-slate-400">
                        {crew ? crew.name : 'Not adopted by a crew'}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 font-bold tabular-nums text-amber-400">
                    <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                    {reach.streakWeeks} wks
                  </span>
                </li>
              );
            })}
          </ol>
        </Panel>
      </div>

      {(cityChecks.length > 0 || offlineQueue.length > 0) && (
        <Panel
          title="Your recent checks"
          description="Checks made in this browser session"
          icon={<ListChecks className="h-4 w-4" />}
          action={offlineQueue.length > 0 && <Badge tone="warning">{offlineQueue.length} queued offline</Badge>}
        >
          {cityChecks.length > 0 ? (
            <ul className="grid grid-cols-1 gap-x-8 gap-y-2.5 md:grid-cols-2">
              {cityChecks.slice(0, RECENT_CHECKS).map((check) => (
                <li key={check._id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-100">{reachName(check.reachId)}</span>
                    <span className="block text-2xs text-slate-400">
                      {new Date(check.takenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·
                      freshness {check.freshnessBefore}% to {check.freshnessAfter}%
                    </span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-emerald-400">+{check.points} pts</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-center text-xs text-slate-400">
              Checks made offline wait in the queue. They appear here once they are synced.
            </p>
          )}
        </Panel>
      )}
    </div>
  );
};
