/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  MapPin,
  Flame,
  ArrowRight,
  Sparkles,
  Compass,
  AlertTriangle,
  HeartHandshake,
  Map as MapIcon,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { DAY_MS, freshnessOf, patrolPoints } from '../engine/freshness.ts';
import { PARAMS } from '../engine/params.ts';
import type { Group, Pillar } from '../types/index.ts';
import { Badge, Button, Meter, Notice, PageHeader, Panel, Segmented, TONE_STYLES, type Tone } from './design-system/index.ts';
import { FRESHNESS_STATES, ageLabel, freshnessState } from './presentation.ts';

const HALF_LIFE = PARAMS.halfLifeDays;

/** The three indicator groups: choice in the page header, and row in the freshness breakdown. */
const GROUPS: { id: Group; toggleLabel: string; label: string; tone: Tone }[] = [
  { id: 'water', toggleLabel: `Water · ${HALF_LIFE.water}d`, label: 'Water (Aspect/Odor/Flow)', tone: 'primary' },
  { id: 'vegetation', toggleLabel: `Vegetation · ${HALF_LIFE.vegetation}d`, label: 'Vegetation (Canopy/Invasives)', tone: 'success' },
  { id: 'structure', toggleLabel: `Structure · ${HALF_LIFE.structure}d`, label: 'Structure (Channel/Bed/Barriers)', tone: 'info' },
];

const GROUP_OPTIONS = GROUPS.map((group) => ({ id: group.id, label: group.toggleLabel }));

/** Where each reach sits on the stream schematic, keyed by the reach number in its ID ("coi:r03" -> "r03"). */
const REACH_POSITIONS: Record<string, { x: number; y: number }> = {
  r01: { x: 70, y: 45 },
  r02: { x: 140, y: 75 },
  r03: { x: 215, y: 125 },
  r04: { x: 120, y: 240 },
  r05: { x: 320, y: 180 },
  r06: { x: 400, y: 195 },
  r07: { x: 480, y: 235 },
  r08: { x: 575, y: 275 },
};

/** A reach that has been watched longer than this many weeks shows its streak on the map. */
const STREAK_MARKER_WEEKS = 4;

/** An outline in the card's colour, so a label stays readable where it crosses a channel. */
const LABEL_HALO = 'stroke-slate-900 [paint-order:stroke] [stroke-linejoin:round] [stroke-width:3px]';

const PILLAR_DOTS: Record<Pillar, string> = {
  human: 'bg-amber-500',
  animal: 'bg-cyan-500',
  ecosystem: 'bg-emerald-500',
};

export const FreshnessMap: React.FC = () => {
  const {
    reaches,
    accessPoints,
    exposureSites,
    selectedReachId,
    setSelectedReachId,
    weather,
    setActiveTab,
    setActiveMissionToSubmit,
    missions,
    crews,
    adoptReach,
    user,
  } = useApp();

  const [activeGroup, setActiveGroup] = useState<Group>('water');

  const selectedReach = useMemo(() => {
    return reaches.find((r) => r._id === selectedReachId) || reaches[0];
  }, [reaches, selectedReachId]);

  // Compute freshness for all reaches under the selected group
  const reachFreshnessMap = useMemo(() => {
    const now = new Date();
    return new Map(
      reaches.map((r) => [
        r._id,
        {
          f: freshnessOf(r.lastCheckAt, activeGroup, now, weather),
          label: ageLabel(r.lastCheckAt[activeGroup], now),
        },
      ])
    );
  }, [reaches, activeGroup, weather]);

  // Filter access points and exposure sites for selected reach
  const currentAccessPoints = useMemo(() => {
    if (!selectedReach) return [];
    return accessPoints.filter((ap) => ap.reachId === selectedReach._id);
  }, [accessPoints, selectedReach]);

  const currentExposureSites = useMemo(() => {
    if (!selectedReach) return [];
    return exposureSites.filter((exp) => exp.reachId === selectedReach._id);
  }, [exposureSites, selectedReach]);

  const selectedReachMission = useMemo(() => {
    if (!selectedReach) return null;
    return missions.find((m) => m.reachId === selectedReach._id);
  }, [missions, selectedReach]);

  const reachCrew = useMemo(() => {
    if (!selectedReach?.crewId) return null;
    return crews.find((c) => c._id === selectedReach.crewId);
  }, [crews, selectedReach]);

  // Freshness of every indicator group on the selected reach (for the breakdown card)
  const selectedFreshness = useMemo(() => {
    const now = new Date();
    const of = (group: Group) => (selectedReach ? freshnessOf(selectedReach.lastCheckAt, group, now, weather) : 0);
    return { water: of('water'), vegetation: of('vegetation'), structure: of('structure') };
  }, [selectedReach, weather]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Freshness Map"
        description={`How much each ~${PARAMS.reachLengthM} m reach's last check can still be trusted. Each indicator group fades at its own pace: the number of days next to its name is its half-life.`}
        icon={<MapIcon className="h-5 w-5" />}
      >
        <Segmented label="Indicator group" options={GROUP_OPTIONS} value={activeGroup} onChange={setActiveGroup} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <Panel
          title="Stream network"
          description="Flows from the upstream reaches (top left) to the confluence (bottom right). Select a reach to inspect it."
          icon={<Compass className="h-4 w-4" />}
          action={FRESHNESS_STATES.map((state) => (
            <Badge key={state.id} tone={state.tone}>
              {state.label} · {state.range}
            </Badge>
          ))}
        >
          {/* The schematic keeps a readable size on phones and scrolls sideways inside the card. */}
          <div className="overflow-x-auto">
            <svg viewBox="0 0 650 340" className="h-auto w-full min-w-[32rem] select-none" role="group" aria-label="Stream reaches">
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Channels. Branch 1: upper forest r01 -> r02 -> r03 -> confluence r05 */}
              <g fill="none" strokeLinecap="round" className="stroke-cyan-800">
                <path d="M 60 40 Q 140 70 200 120 T 320 180" strokeWidth="10" />
                {/* Branch 2: industrial tributary r04 -> confluence r05 */}
                <path d="M 60 250 Q 180 230 320 180" strokeWidth="8" />
                {/* Main stem: r05 -> r06 -> r07 -> r08 */}
                <path d="M 320 180 Q 420 190 480 230 T 600 280" strokeWidth="14" />
              </g>

              {reaches.map((r, i) => {
                const shortId = r._id.split(':')[1] ?? r._id;
                const pos = REACH_POSITIONS[shortId] || { x: 60 + i * 65, y: 120 + (i % 2) * 50 };
                const fInfo = reachFreshnessMap.get(r._id) || { f: 0, label: 'No data' };
                const isSelected = r._id === selectedReach?._id;
                const state = freshnessState(fInfo.f);
                const hasStreakMarker = r.streakWeeks > STREAK_MARKER_WEEKS;

                // SVG transforms pivot on the viewport origin by default; `origin-center` plus
                // `transform-box: fill-box` makes the hover scale and the ring spin pivot on the node.
                return (
                  <g
                    key={r._id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`${r.name || r._id}: ${fInfo.label}, ${Math.round(fInfo.f * 100)}% fresh (${state.label})${
                      r.labGap ? ', lab gap' : ''
                    }${hasStreakMarker ? `, watched ${r.streakWeeks} weeks running` : ''}`}
                    className="cursor-pointer origin-center transition-transform [transform-box:fill-box] hover:scale-105"
                    onClick={() => setSelectedReachId(r._id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedReachId(r._id);
                      }
                    }}
                  >
                    {isSelected && (
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r="28"
                        fill="none"
                        strokeWidth="2.5"
                        strokeDasharray="4 2"
                        className="origin-center animate-spin stroke-primary [transform-box:fill-box] motion-reduce:animate-none"
                        style={{ animationDuration: '8s' }}
                      />
                    )}

                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r="20"
                      strokeWidth={isSelected ? '3' : '2'}
                      filter={isSelected ? 'url(#glow)' : undefined}
                      className={state.node}
                    />
                    <circle cx={pos.x} cy={pos.y} r="6" className={state.dot} />

                    {/* Below the node: the reach's short id and its age in words (never colour alone) */}
                    <text x={pos.x} y={pos.y + 43} textAnchor="middle" className={`fill-slate-200 text-[11px] font-semibold ${LABEL_HALO}`}>
                      {shortId}
                    </text>
                    <text x={pos.x} y={pos.y + 55} textAnchor="middle" className={`text-[10px] font-bold ${state.text} ${LABEL_HALO}`}>
                      {fInfo.label}
                    </text>

                    {r.labGap && (
                      <g transform={`translate(${pos.x + 8}, ${pos.y - 20})`}>
                        <title>Lab gap: a lab reading here has no recent citizen check</title>
                        <circle cx="6" cy="6" r="8" className="fill-danger" />
                        <text x="6" y="9.5" textAnchor="middle" className="fill-on-danger text-[10px] font-black">
                          !
                        </text>
                      </g>
                    )}

                    {hasStreakMarker && (
                      <g transform={`translate(${pos.x - 26}, ${pos.y - 22})`}>
                        <title>{`Watched ${r.streakWeeks} weeks running`}</title>
                        <rect x="0" y="0" width="22" height="13" rx="4" className="fill-warning" />
                        <text x="11" y="9.5" textAnchor="middle" className="fill-on-warning text-[9px] font-bold">
                          {r.streakWeeks}w
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <p className="mt-3 border-t border-slate-800 pt-3 text-2xs text-slate-400">
            Each reach shows its short id and its age in words ("3 days old") next to its colour. Markers:{' '}
            <strong>!</strong> lab gap, <strong>12w</strong> weeks watched in a row.
          </p>
        </Panel>

        {/* Inspector: the selected reach */}
        {selectedReach ? (
          <section className="card space-y-4 p-4 sm:p-5 xl:sticky xl:top-20" aria-label="Selected reach">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="primary" className="font-mono">
                  {selectedReach._id} · {selectedReach.lengthM} m
                </Badge>
                {selectedReach.oahSiteCodes.length > 0 && (
                  <Badge tone="info">OAH Research Site {selectedReach.oahSiteCodes[0]}</Badge>
                )}
              </div>
              <h2 className="mt-2 text-base font-bold tracking-tight text-slate-50 sm:text-lg">
                {selectedReach.name || `Reach ${selectedReach._id}`}
              </h2>
            </div>

            {/* Watch streak */}
            <div className="well flex items-start gap-3 p-3">
              <span className={`tile ${TONE_STYLES.warning}`} aria-hidden="true">
                <Flame className="h-4 w-4" />
              </span>
              <div className="min-w-0 space-y-1">
                <div className="text-xs font-bold text-slate-100">Watched {selectedReach.streakWeeks} weeks running</div>
                <div className="text-3xs text-slate-400">
                  The streak belongs to the reach. Needs 1 water check per ISO week.
                </div>
                {reachCrew ? (
                  <div className="text-3xs font-semibold text-slate-200 [overflow-wrap:anywhere]">
                    Adopted by {reachCrew.name}
                  </div>
                ) : (
                  user.crewId && (
                    <Button variant="success" size="sm" onClick={() => adoptReach(user.crewId!, selectedReach._id)}>
                      Adopt
                    </Button>
                  )
                )}
              </div>
            </div>

            {/* Freshness of each group, and what a check pays */}
            <div className="well space-y-3 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-200">Freshness Breakdown</h3>
                <Badge tone={freshnessState(selectedFreshness[activeGroup]).tone}>
                  {reachFreshnessMap.get(selectedReach._id)?.label ?? 'Unknown'} (
                  {Math.round(selectedFreshness[activeGroup] * 100)}%)
                </Badge>
              </div>

              <div className="space-y-2.5">
                {GROUPS.map((group) => {
                  const pct = Math.round(selectedFreshness[group.id] * 100);
                  return (
                    <div key={group.id}>
                      <div className="mb-1 flex justify-between gap-2 text-2xs">
                        <span className="font-medium text-slate-300">{group.label}</span>
                        <span className="tabular-nums text-slate-400">{pct}%</span>
                      </div>
                      <Meter value={pct} tone={group.tone} />
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-slate-800 pt-3 text-xs">
                <span className="text-slate-400">Patrol check bounty:</span>
                <span className="flex items-center gap-1 font-extrabold text-emerald-400">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />+{patrolPoints(selectedFreshness.water)} points
                </span>
              </div>
            </div>

            {selectedReach.labGap && (
              <Notice tone="danger" icon={<AlertTriangle className="h-4 w-4" />}>
                <strong className="block">Research Lab Gap Detected</strong>
                <p className="mt-0.5 text-2xs">
                  The OneAquaHealth research node recorded high microbiological risk without an upstream citizen
                  patrol within 30 days. Priority 0.92.
                </p>
              </Notice>
            )}

            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                Public Access Points (No trespass)
              </h3>
              <div className="space-y-1.5">
                {currentAccessPoints.length > 0 ? (
                  currentAccessPoints.map((ap) => (
                    <div key={ap._id} className="well flex items-center justify-between gap-2 p-2.5 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-200">{ap.name}</div>
                        <div className="text-3xs capitalize text-slate-400">Type: {ap.kind} · Public Right of Way</div>
                      </div>
                      <Badge>{`${PARAMS.geofenceM}m geofence`}</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-xs italic text-slate-400">Culverted or inaccessible reach (non-observable).</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <HeartHandshake className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                Downstream Exposure Sites (One Health)
              </h3>
              <div className="space-y-1.5">
                {currentExposureSites.length > 0 ? (
                  currentExposureSites.map((exp) => (
                    <div key={exp._id} className="well flex items-center justify-between gap-2 p-2.5 text-xs">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${PILLAR_DOTS[exp.pillar]}`} aria-hidden="true" />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-200">{exp.name}</div>
                          <div className="text-3xs capitalize text-slate-400">
                            Pillar: {exp.pillar} ({exp.kind.replace(/_/g, ' ')})
                          </div>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-3xs text-slate-400">{exp.distanceM}m away</span>
                    </div>
                  ))
                ) : (
                  <p className="text-2xs text-slate-400">No immediate schools or dog parks within 100m.</p>
                )}
              </div>
            </div>

            {selectedReachMission ? (
              <Button
                className="w-full"
                leftIcon={<Flame className="h-4 w-4" />}
                rightIcon={<ArrowRight className="h-4 w-4" />}
                onClick={() => {
                  setActiveMissionToSubmit(selectedReachMission);
                  setActiveTab('missions');
                }}
              >
                Start One-Minute Mission
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="w-full"
                rightIcon={<ArrowRight className="h-4 w-4" />}
                onClick={() => {
                  setActiveMissionToSubmit({
                    _id: `mis:adhoc:${selectedReach._id}`,
                    source: 'staleness',
                    reachId: selectedReach._id,
                    groups: ['water'],
                    reason: 'Ad-hoc patrol micro-check on this reach',
                    requester: { kind: 'naiad', name: 'Volunteer Patrol' },
                    value: 0.5,
                    opensAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + DAY_MS).toISOString(),
                    status: 'open',
                  });
                  setActiveTab('missions');
                }}
              >
                Perform Micro-Check Here
              </Button>
            )}
          </section>
        ) : (
          <p className="card p-6 text-center text-xs text-slate-400">This city has no reaches to show.</p>
        )}
      </div>
    </div>
  );
};
