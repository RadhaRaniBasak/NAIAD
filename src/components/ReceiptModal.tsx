/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Award, Sparkles, Flame, TrendingUp, WifiOff } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import type { Check } from '../types/index.ts';
import { Badge, Button, Modal, Notice, TONE_STYLES } from './design-system/index.ts';
import { plural } from './presentation.ts';

interface ReceiptModalProps {
  check: Check;
  onClose: () => void;
}

/** Why the check was asked for, by the kind of mission in its request id ("mis:<kind>:..."). */
const DEMAND_ORIGINS: Record<string, string> = {
  weather: 'Storm demand (weather engine)',
  labgap: 'Research lab gap',
  stale: 'Staleness half-life',
  veg: 'Staleness half-life',
  trace: 'Trace hunt',
  fhir: 'External FHIR request',
  adhoc: 'Ad-hoc patrol from the map',
};

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ check, onClose }) => {
  const { reaches, crews, user, offlineQueue, setSelectedReachId, setActiveTab } = useApp();

  const reach = reaches.find((r) => r._id === check.reachId);
  const userCrew = crews.find((c) => c._id === check.crewId);
  const isQueuedOffline = offlineQueue.some((queued) => queued._id === check._id);
  const before = check.freshnessBefore ?? 0;
  const after = check.freshnessAfter ?? 100;
  const origin = check.requestId?.split(':')[1] ?? '';
  const isAdhoc = origin === 'adhoc';

  return (
    <Modal
      onClose={onClose}
      title="Ground-Truth Recorded"
      description={
        isAdhoc
          ? 'Your observation was added to this reach. Nobody had asked for it, so it earns what the reach needed.'
          : 'Your observation answered an open request for this reach.'
      }
      eyebrow={<Badge tone="success">Demand-Pull Check Receipt</Badge>}
      icon={<Award className="h-5 w-5" />}
      tone="success"
    >
      <div className="space-y-4 text-xs">
        {isQueuedOffline && (
          <Notice tone="warning" icon={<WifiOff className="h-4 w-4" />}>
            Offline mode is on: this check waits in the queue and counts once it is synced. The points shown are
            what it would earn now; they are settled against the reach as it is then.
          </Notice>
        )}

        {/* Points */}
        <div className="well flex flex-wrap items-start justify-between gap-x-6 gap-y-3 p-4">
          <div>
            <span className="text-2xs font-medium text-slate-400">Points Credited:</span>
            <div className="mt-0.5 flex items-center gap-1.5 text-2xl font-bold tabular-nums text-emerald-400">
              <Sparkles className="h-5 w-5" aria-hidden="true" />+{check.points} pts
            </div>
            <span className="text-3xs text-slate-400">
              {origin === 'trace'
                ? 'A trace-hunt check pays a flat 100.'
                : 'Formula: Need based = 100 × (1 - freshness)'}
            </span>
          </div>

          <div className="sm:text-right">
            <span className="text-2xs font-medium text-slate-400">Your Total Balance:</span>
            <div className="mt-0.5 text-2xl font-bold tabular-nums text-slate-50">{user.points} pts</div>
          </div>
        </div>

        {/* Freshness before and after */}
        <div className="well space-y-2 p-4">
          <div className="flex items-center justify-between gap-2 font-semibold">
            <span className="flex items-center gap-1.5 text-slate-200">
              <TrendingUp className="h-4 w-4 text-slate-400" aria-hidden="true" />
              Reach Freshness Restored
            </span>
            <span className="font-bold tabular-nums text-emerald-400">
              {before}% ➔ {after}%
            </span>
          </div>

          {/* What was left before the check (grey) and what the check restored (green) */}
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
            <div className="h-full bg-slate-500" style={{ width: `${before}%` }} />
            <div className="h-full flex-1 bg-emerald-500" />
          </div>

          <p className="text-2xs text-slate-400">
            Freshness of the {check.groups.join(', ')} group is back at {after}%: its half-life counter starts again.
          </p>
        </div>

        {/* The reach's watch streak */}
        {reach && (
          <div className="well flex items-start gap-3 p-3.5">
            <span className={`tile ${TONE_STYLES.warning}`} aria-hidden="true">
              <Flame className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <div className="font-bold text-slate-100">
                Reach Watch Streak: {plural(reach.streakWeeks, 'week')} running!
              </div>
              <div className="text-3xs text-slate-400">
                Streak belongs to {reach.name || reach._id}. One water check a week keeps it alive: a second check
                in the same week does not add to it.
              </div>
              {userCrew && (
                <div className="text-3xs font-semibold text-slate-200 [overflow-wrap:anywhere]">Crew: {userCrew.name}</div>
              )}
            </div>
          </div>
        )}

        {/* Who asked, who answered, and what was reported */}
        <dl className="space-y-2 border-t border-slate-800 pt-4 text-2xs">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Demand Origin:</dt>
            <dd className="text-right font-semibold text-slate-100">
              {DEMAND_ORIGINS[origin] ?? 'Mission'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Checked By:</dt>
            <dd className="text-right font-mono text-slate-200">
              {check.userNickname} (Anonymous ID #{check.userId.substring(0, 8)})
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400">Idempotency Key:</dt>
            <dd className="max-w-[180px] truncate font-mono text-3xs text-slate-400">{check.idempotencyKey}</dd>
          </div>
        </dl>

        <div className="well p-3">
          <span className="mb-2 block text-3xs font-semibold uppercase tracking-wider text-slate-400">
            Reported Ground-Truth:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(check.answers).map(([question, answer]) => (
              <span key={question} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-0.5 text-3xs text-slate-300">
                <strong className="capitalize">{question.replace(/_/g, ' ')}:</strong> {answer.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            variant="secondary"
            onClick={() => {
              setSelectedReachId(check.reachId);
              setActiveTab('map');
              onClose();
            }}
          >
            View on Freshness Map
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
};
