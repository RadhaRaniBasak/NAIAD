/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Users, Flame, Award, Plus, KeyRound, CheckCircle2, X } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { Badge, Button, EmptyState, IconButton, Input, Notice, PageHeader, Panel, TONE_STYLES } from './design-system/index.ts';
import { plural } from './presentation.ts';

export const CrewsView: React.FC = () => {
  const { crews, reaches, allReaches, user, createCrew, joinCrew } = useApp();

  const [newCrewName, setNewCrewName] = useState<string>('');
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [batonMessage, setBatonMessage] = useState<string | null>(null);

  const userCrew = crews.find((c) => c._id === user.crewId);
  const otherMembers = userCrew ? userCrew.memberIds.filter((id) => id !== user._id).length : 0;

  const handleCreateCrew = (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    if (!newCrewName.trim()) {
      setCreateError('Give the crew a name.');
      return;
    }
    createCrew(newCrewName.trim());
    setNewCrewName('');
    setCreateError(null);
    setJoinSuccess('Crew created. Adopt a reach for it from the Freshness Map.');
  };

  const handleJoinCrew = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) {
      setJoinError('Enter a join code.');
      return;
    }
    if (joinCrew(code)) {
      setJoinSuccess(`Successfully joined crew with code ${code}!`);
      setJoinError(null);
      setJoinCodeInput('');
    } else {
      setJoinError('Invalid crew join code. Check with your crew leader.');
      setJoinSuccess(null);
    }
  };

  // The baton message stays until it is dismissed: a timer would cut a repeated press short.
  const handlePassBaton = () => {
    setBatonMessage(
      `Baton passed to "${userCrew?.name}". Nothing is sent in this demo: in the full app your crew mates would be asked to cover this week's check.`
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crews & Streaks"
        description={
          <>
            In Naiad, streaks belong to the <strong>stream reach</strong>, not the person. A crew adopts a stretch, and
            missions on it come first in its members' list, so the reach's watch streak stays alive.
          </>
        }
        icon={<Users className="h-5 w-5" />}
        tone="success"
      >
        {userCrew && (
          <div className="card flex max-w-full items-center gap-2.5 px-3.5 py-2">
            <span className="text-xl" aria-hidden="true">
              {userCrew.avatarIcon || '🌱'}
            </span>
            <div className="min-w-0">
              <div className="text-3xs font-medium text-slate-400">Your Active Crew</div>
              <div className="text-xs font-bold text-slate-50 [overflow-wrap:anywhere]">{userCrew.name}</div>
            </div>
          </div>
        )}
      </PageHeader>

      {batonMessage && (
        <Notice tone="warning" role="status">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 [overflow-wrap:anywhere]">{batonMessage}</span>
            <IconButton label="Dismiss message" plain onClick={() => setBatonMessage(null)} className="-my-2 -mr-2">
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </Notice>
      )}

      {joinSuccess && (
        <Notice tone="success" role="status" icon={<CheckCircle2 className="h-4 w-4" />}>
          {joinSuccess}
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          {userCrew ? (
            <section className="card space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`tile text-xl ${TONE_STYLES.success}`} aria-hidden="true">
                    {userCrew.avatarIcon || '🌱'}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-50 [overflow-wrap:anywhere]">{userCrew.name}</h2>
                    <span className="text-xs text-slate-400">
                      Join Code: <strong className="font-mono text-cyan-400">{userCrew.joinCode}</strong>
                    </span>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handlePassBaton}
                  title="Can't make this week's check? Pass to fellow crew member"
                >
                  Pass the Baton ✋
                </Button>
              </div>

              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <Flame className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                  Adopted Reaches & Streaks
                </h3>
                {userCrew.reachIds.length > 0 ? (
                  <ul className="space-y-2">
                    {userCrew.reachIds.map((rId) => {
                      const reach = allReaches.find((r) => r._id === rId);
                      return (
                        <li key={rId} className="well flex items-center justify-between gap-3 p-3 text-xs">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-50 [overflow-wrap:anywhere]">{reach?.name || rId}</div>
                            <div className="text-2xs text-slate-400">Its missions come first in your crew's list</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="flex items-center justify-end gap-1 text-sm font-bold tabular-nums text-amber-400">
                              <Flame className="h-4 w-4" aria-hidden="true" />
                              {plural(reach?.streakWeeks ?? 0, 'week')}
                            </div>
                            <span className="text-3xs text-slate-400">Watched consecutively</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400">
                    No reach adopted yet. Open a reach on the Freshness Map and choose Adopt.
                  </p>
                )}
              </div>

              <div className="border-t border-slate-800 pt-4">
                <h3 className="mb-2 text-xs font-semibold text-slate-200">
                  Active Crew Members ({userCrew.memberIds.length}):
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="primary">★ {user.nickname} (You)</Badge>
                  {otherMembers > 0 && (
                    <Badge>
                      + {otherMembers} other {otherMembers === 1 ? 'member' : 'members'}
                    </Badge>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              tone="success"
              title="You haven't joined a crew yet"
              description="Crews adopt specific stretches of streams to preserve multi-week watch streaks and receive early-access missions."
            />
          )}

          <Panel
            title="City Reach Streak Board"
            description="Streak stays with the stream"
            icon={<Award className="h-4 w-4" />}
          >
            <ol className="space-y-1.5">
              {reaches
                .slice()
                .sort((a, b) => b.streakWeeks - a.streakWeeks)
                .map((r, rank) => (
                  <li key={r._id} className="well flex items-center justify-between gap-3 p-2.5 text-xs">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="w-6 shrink-0 font-mono font-bold text-slate-400">#{rank + 1}</span>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-200">{r.name}</div>
                        <div className="text-3xs text-slate-400">Reach {r._id}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 font-bold tabular-nums text-amber-400">
                      <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{r.streakWeeks} wks</span>
                    </div>
                  </li>
                ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-4 lg:col-span-5">
          <Panel
            title="Join an Existing Crew"
            description="Got a join code from a neighbourhood group, school class, or environmental club?"
            icon={<KeyRound className="h-4 w-4" />}
          >
            <form onSubmit={handleJoinCrew} className="space-y-3">
              <Input
                label="Join code"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value)}
                placeholder="e.g. CHOUPAL42 or COSELHAS26"
                error={joinError ?? undefined}
                className="font-mono uppercase tracking-wider placeholder:normal-case placeholder:tracking-normal"
              />
              <Button type="submit" variant="secondary" className="w-full">
                Join Crew
              </Button>
            </form>
          </Panel>

          <Panel
            title="Create a New Crew"
            description="Start a new steward crew for your school, scout troop, running group, or family."
            icon={<Plus className="h-4 w-4" />}
          >
            <form onSubmit={handleCreateCrew} className="space-y-3">
              <Input
                label="Crew name"
                value={newCrewName}
                onChange={(e) => setNewCrewName(e.target.value)}
                maxLength={40}
                error={createError ?? undefined}
                placeholder="Crew name (e.g. Choupal EcoGuardians)"
              />
              <Button type="submit" variant="success" className="w-full" leftIcon={<Plus className="h-3.5 w-3.5" />}>
                Create Crew & Generate Join Code
              </Button>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
};
