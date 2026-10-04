/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Missions Dispatch & Management Screen
 * Built using the Naiad Design System and backed by /api/v1/request-missions:
 * - Needs a session: volunteers join with a nickname, coordinators sign in (SignInPanel)
 * - 4 Data States: Loading (Skeletons), Empty, Error (with retry), and Success
 * - Interactive Create Mission Form with client-side Zod-matching validation
 * - Inline field errors, disabled submit while pending, and success toast
 * - Responsive at 375px mobile width and desktop
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Badge,
  Button,
  Chips,
  Input,
  Select,
  Modal,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonCard,
  useToast,
} from './design-system/index.ts';
import { Plus, Search, RefreshCw, Clock, Sparkles, Radio } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import type { Session } from '../services/auth.ts';
import type { MissionEntity } from '../services/missions.service.ts';
import { apiFetch, getSession, setSession } from '../services/session.client.ts';
import type { RequestSource } from '../types/index.ts';
import { MISSION_SOURCES } from './presentation.ts';
import { SignInPanel } from './SignInPanel.tsx';

const MISSIONS_API = '/api/v1/request-missions';

const SOURCE_FILTERS: { id: RequestSource | 'all'; label: string }[] = [
  { id: 'all', label: 'All Sources' },
  ...(['weather', 'staleness', 'lab-gap', 'trace', 'external'] as const).map((id) => ({
    id,
    label: MISSION_SOURCES[id].label,
  })),
];

export const MissionsDispatchScreen: React.FC = () => {
  const { showToast } = useToast();
  const { user } = useApp();

  // Who is signed in to the API. The coordinator view needs a coordinator's session;
  // for the volunteer view any session will do.
  const [session, setSessionState] = useState<Session | null>(getSession);
  const isStaff = session?.user.role === 'coordinator' || session?.user.role === 'admin';
  const wantsStaff = user.role === 'coordinator';
  const signInMode = session && (isStaff || !wantsStaff) ? null : wantsStaff ? 'coordinator' : 'volunteer';

  const signOut = () => {
    // A volunteer has no password: the token in this browser is the account.
    if (
      session &&
      !isStaff &&
      !window.confirm(
        'Sign out? Your volunteer account lives only in this browser. After signing out you cannot get back into it, and the nickname stays taken.'
      )
    ) {
      return;
    }
    setSession(null);
    setSessionState(null);
  };

  // State management for 4 data-driven states
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [missions, setMissions] = useState<MissionEntity[]>([]);
  const [sourceFilter, setSourceFilter] = useState<RequestSource | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal & Form State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form Fields
  const [formReachId, setFormReachId] = useState<string>('coi:r01');
  const [formSource, setFormSource] = useState<string>('weather');
  const [formReason, setFormReason] = useState<string>('');
  const [formTargetGroup, setFormTargetGroup] = useState<string>('water');
  const [formPriority, setFormPriority] = useState<string>('0.75');
  const [formBountyCents, setFormBountyCents] = useState<string>('300');

  // Inline validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const fetchMissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(MISSIONS_API);

      if (res.status === 401) {
        setSessionState(null); // the session ended: back to sign-in
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load missions (HTTP ${res.status})`);
      }

      const json = await res.json();
      setMissions(json.data || []);
    } catch (err) {
      setError((err as Error)?.message || 'Network error while loading missions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!signInMode) fetchMissions();
  }, [signInMode, session?.user.id, fetchMissions]);

  // Client-side form validation matching server Zod rules
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formReachId.trim()) {
      errors.reachId = 'Target reach ID is required.';
    }

    if (!formReason.trim()) {
      errors.reason = 'Inspection reason is required.';
    } else if (formReason.trim().length < 5) {
      errors.reason = 'Reason must be at least 5 characters long.';
    } else if (formReason.trim().length > 200) {
      errors.reason = 'Reason cannot exceed 200 characters.';
    }

    const priorityNum = parseFloat(formPriority);
    if (isNaN(priorityNum) || priorityNum < 0 || priorityNum > 1) {
      errors.priority = 'Priority must be a number between 0.0 and 1.0.';
    }

    const bountyNum = parseInt(formBountyCents, 10);
    if (isNaN(bountyNum) || bountyNum < 0) {
      errors.bounty = 'Bounty must be an integer (in cents).';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateMission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const res = await apiFetch(MISSIONS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reachId: formReachId,
          source: formSource,
          reason: formReason,
          targetGroup: formTargetGroup,
          priorityValue: parseFloat(formPriority),
          bountyCents: parseInt(formBountyCents, 10),
          pointsAward: Math.round(parseFloat(formPriority) * 100),
        }),
      });

      const json = await res.json();
      if (res.status === 401) {
        setSessionState(null);
        setIsCreateModalOpen(false);
      }
      if (!res.ok) {
        throw new Error(json.error?.message || 'Server rejected mission creation.');
      }

      showToast('success', 'Mission Created', `Successfully issued mission ${json.data.id}`);
      setIsCreateModalOpen(false);
      // Reset form
      setFormReason('');
      setFieldErrors({});
      fetchMissions();
    } catch (err) {
      showToast('error', 'Creation Failed', (err as Error)?.message || 'Could not create mission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered missions
  const filteredMissions = missions.filter((m) => {
    const matchesSource = sourceFilter === 'all' || m.source === sourceFilter;
    const matchesSearch =
      searchQuery === '' ||
      m.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.reachId.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSource && matchesSearch;
  });
  const isFiltered = searchQuery !== '' || sourceFilter !== 'all';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispatch Queue"
        description="The mission queue kept on the server: micro-checks requested for decaying reaches, storm runoff and research lab anomalies. This page talks to the API; the other pages run on demo data in the browser."
        icon={<Radio className="h-5 w-5" />}
      >
        {!signInMode && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchMissions}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh
            </Button>
            {isStaff && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCreateModalOpen(true)}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Issue Mission
              </Button>
            )}
          </>
        )}
      </PageHeader>

      {session && (
        <p className="text-xs text-slate-400">
          Signed in as <strong className="text-slate-200">{session.user.nickname}</strong> (
          {session.user.role.replace('_', ' ')}) ·{' '}
          <button
            type="button"
            onClick={signOut}
            className="cursor-pointer font-medium underline underline-offset-2 transition-colors hover:text-slate-50"
          >
            Sign out
          </button>
          {signInMode === 'coordinator' && (
            <span className="mt-1 block text-amber-400">
              Signing in as a coordinator replaces this volunteer account in this browser.
            </span>
          )}
          {!signInMode && !isStaff && (
            <span className="mt-1 block">Issuing a mission takes a coordinator account: switch the role to Coordinator.</span>
          )}
        </p>
      )}

      {signInMode && <SignInPanel key={signInMode} mode={signInMode} onSignedIn={setSessionState} />}

      {!signInMode && (
        <>
          <div className="card flex flex-col gap-3 p-3.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full lg:w-72">
              <Input
                aria-label="Search missions"
                placeholder="Search by reach or reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
            <Chips label="Filter by source" options={SOURCE_FILTERS} value={sourceFilter} onChange={setSourceFilter} />
          </div>

          {/* 1. LOADING STATE */}
          {loading && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          )}

          {/* 2. ERROR STATE */}
          {!loading && error && (
            <ErrorState title="Could Not Retrieve Missions" message={error} onRetry={fetchMissions} />
          )}

          {/* 3. EMPTY STATE */}
          {!loading && !error && filteredMissions.length === 0 && (
            <EmptyState
              icon={<Sparkles className="h-5 w-5" />}
              title="No Missions Found"
              description={
                isFiltered
                  ? 'No missions match your active filters. Try adjusting the search query or source filter.'
                  : 'The server holds no open missions for your organization. A coordinator can issue one.'
              }
              actionLabel={isStaff ? 'Issue New Mission' : undefined}
              onAction={() => setIsCreateModalOpen(true)}
            />
          )}

          {/* 4. SUCCESS STATE (Grid of Missions) */}
          {!loading && !error && filteredMissions.length > 0 && (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredMissions.map((m) => {
                const source = MISSION_SOURCES[m.source as RequestSource];
                return (
                  <li key={m.id} className="card flex flex-col justify-between gap-3 p-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge tone="primary" className="font-mono">
                          {m.reachId}
                        </Badge>
                        <Badge tone={source?.tone}>{source?.label ?? m.source}</Badge>
                      </div>

                      <p className="line-clamp-2 text-xs font-medium leading-relaxed text-slate-200">{m.reason}</p>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-slate-400">
                        <span>
                          Group: <strong className="text-slate-200">{m.targetGroup}</strong>
                        </span>
                        <span>
                          Priority: <strong className="text-slate-200">{Math.round(m.priorityValue * 100)}%</strong>
                        </span>
                        {m.bountyCents > 0 && (
                          <span>
                            Bounty: <strong className="text-slate-200">${(m.bountyCents / 100).toFixed(2)}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-slate-800 pt-3">
                      <span className="flex items-center gap-1 font-mono text-3xs text-slate-400">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        Expires: {new Date(m.expiresAt).toLocaleDateString()}
                      </span>
                      <Badge tone="success">+{m.pointsAward} pts</Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {isCreateModalOpen && (
        <Modal
          onClose={() => setIsCreateModalOpen(false)}
          title="Issue Stream Micro-Mission"
          description="Demand-pull targeted dispatch: specify stream reach and reason for inspection."
          icon={<Plus className="h-5 w-5" />}
        >
          <form onSubmit={handleCreateMission} className="space-y-4 text-xs">
            <Input
              label="Target Reach Identifier"
              value={formReachId}
              onChange={(e) => setFormReachId(e.target.value)}
              error={fieldErrors.reachId}
              helperText="e.g. coi:r01, coi:r02, or tou:r01"
              required
            />

            <Select
              label="Demand Trigger Source"
              value={formSource}
              onChange={(e) => setFormSource(e.target.value)}
              options={[
                { value: 'weather', label: 'Weather Shock (Rain > 20mm)' },
                { value: 'staleness', label: 'Staleness Half-life Decay' },
                { value: 'lab-gap', label: 'Research Lab Gap Anomaly' },
                { value: 'trace', label: 'Bayesian Contamination Trace' },
                { value: 'external', label: 'External FHIR ServiceRequest' },
              ]}
            />

            <Select
              label="Target Indicator Group"
              value={formTargetGroup}
              onChange={(e) => setFormTargetGroup(e.target.value)}
              options={[
                { value: 'water', label: 'Water (3-day half-life: clarity, foam, odor)' },
                { value: 'vegetation', label: 'Vegetation (45-day half-life: riparian canopy)' },
                { value: 'structure', label: 'Structure (365-day half-life: outfalls, barriers)' },
              ]}
            />

            <Input
              label="Inspection Objective / Reason"
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
              error={fieldErrors.reason}
              placeholder="e.g. Verify turbidity and sewage signs after heavy rainfall"
              required
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Priority (0.0 to 1.0)"
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value)}
                error={fieldErrors.priority}
              />

              <Input
                label="Bounty Vouchers (in Cents)"
                type="number"
                step="50"
                min="0"
                value={formBountyCents}
                onChange={(e) => setFormBountyCents(e.target.value)}
                error={fieldErrors.bounty}
                helperText="300 = $3.00 voucher"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreateModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isSubmitting}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                Publish Mission
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
