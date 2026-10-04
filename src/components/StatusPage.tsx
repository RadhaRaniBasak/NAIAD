/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Naiad Public System Status Page
 * Shows the live readiness report from GET /api/health: component status (database, cache,
 * job queue, API), probe latency, process uptime and memory. It polls every 15 seconds.
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, AlertTriangle, RefreshCw, XCircle, Loader2 } from 'lucide-react';
import type { HealthReport, HealthStatus } from '../services/health.ts';
import { BrandMark } from './AppShell.tsx';
import { Badge, Button, TONE_STYLES, type Tone } from './design-system/index.ts';

const POLL_MS = 15_000;

const STATUS_BADGES: Record<HealthStatus, { label: string; tone: Tone }> = {
  ok: { label: 'Operational', tone: 'success' },
  degraded: { label: 'Degraded Performance', tone: 'warning' },
  unhealthy: { label: 'Service Outage', tone: 'danger' },
};

/** Status of one component; before the first report arrives it reads "Checking". */
const StatusBadge: React.FC<{ status?: HealthStatus }> = ({ status }) =>
  status ? <Badge tone={STATUS_BADGES[status].tone}>{STATUS_BADGES[status].label}</Badge> : <Badge>Checking…</Badge>;

/** The headline for the whole system, from the report (or the lack of one). */
function overall(health: HealthReport | null, unreachable: boolean) {
  if (unreachable) {
    return {
      tone: 'danger' as Tone,
      icon: <XCircle className="h-6 w-6" />,
      title: 'Status Unavailable',
      text: 'The health endpoint did not answer. The server may be down or restarting.',
    };
  }
  if (!health) {
    return {
      tone: 'neutral' as Tone,
      icon: <Loader2 className="h-6 w-6 animate-spin" />,
      title: 'Checking Systems…',
      text: 'Waiting for the first health report.',
    };
  }
  if (health.status === 'ok') {
    return {
      tone: 'success' as Tone,
      icon: <CheckCircle2 className="h-6 w-6" />,
      title: 'All Systems Operational',
      text: 'The API, database, cache and job queue are all responding normally.',
    };
  }
  return {
    tone: STATUS_BADGES[health.status].tone,
    icon: <AlertTriangle className="h-6 w-6" />,
    title: health.status === 'degraded' ? 'Degraded System Performance' : 'Service Outage',
    text: 'One or more components are failing their probe or answering slowly. See the list below.',
  };
}

export const StatusPage: React.FC<{ onBackToApp?: () => void }> = ({ onBackToApp }) => {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [unreachable, setUnreachable] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      // A server that is shutting down answers with an error envelope instead of a report.
      if (!data?.components) throw new Error('No health report in the response');
      setHealth(data);
      setUnreachable(false);
    } catch (err) {
      console.error('Failed to query system health:', err);
      setHealth(null);
      setUnreachable(true);
    } finally {
      setLastRefreshed(new Date());
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  const headline = overall(health, unreachable);
  const components = [
    {
      name: 'Primary Relational Database',
      detail: `SQLite · Probe latency: ${health?.components.database.latencyMs ?? '…'}ms`,
      status: health?.components.database.status,
    },
    {
      name: 'In-Memory Cache',
      detail: `Tenant-scoped reaches & mission cache · Probe latency: ${health?.components.cache.latencyMs ?? '…'}ms`,
      status: health?.components.cache.status,
    },
    {
      name: 'Background Asynchronous Job Queue',
      detail: `Pending depth: ${health?.components.queue.pendingJobs ?? '…'} · Dead Letter Queue (DLQ): ${health?.components.queue.deadLetterJobs ?? '…'}`,
      status: health?.components.queue.status,
    },
    {
      name: 'Public & Authenticated REST API',
      detail: `/api/v1/reaches · /api/v1/request-missions · Version ${health?.version ?? '…'}`,
      status: health?.status,
    },
  ];
  const telemetry = [
    { label: 'Process Uptime', value: health ? `${Math.round(health.uptimeSeconds / 60)} mins` : '…' },
    { label: 'Heap Memory Used', value: health ? `${health.memory.heapUsedMb} MB` : '…' },
    { label: 'Resident Memory', value: health ? `${health.memory.rssMb} MB` : '…' },
    { label: 'Environment', value: health?.environment ?? '…' },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-50 sm:text-lg">Naiad Platform Status</h1>
              <p className="text-2xs text-slate-400">Live probes from the health endpoint, every 15 seconds</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onBackToApp && (
              <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={onBackToApp}>
                Return to Naiad App
              </Button>
            )}
            <Button
              size="sm"
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
              isLoading={loading}
              onClick={() => {
                setLoading(true);
                fetchHealth();
              }}
            >
              {loading ? 'Refreshing...' : 'Refresh Now'}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div role="status" className={`flex items-center gap-4 rounded-2xl border p-5 ${TONE_STYLES[headline.tone]}`}>
          <span className="shrink-0" aria-hidden="true">
            {headline.icon}
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">{headline.title}</h2>
            <p className="mt-0.5 text-xs sm:text-sm">{headline.text}</p>
          </div>
        </div>

        <section className="card">
          <h2 className="border-b border-slate-800 px-4 py-3.5 text-sm font-semibold text-slate-50 sm:px-5">
            Component Probes
          </h2>
          <ul className="divide-y divide-slate-800">
            {components.map((component) => (
              <li key={component.name} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-50">{component.name}</div>
                  <div className="break-words text-xs text-slate-400">{component.detail}</div>
                </div>
                <StatusBadge status={component.status} />
              </li>
            ))}
          </ul>
        </section>

        <dl className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {telemetry.map((item) => (
            <div key={item.label} className="card p-4 text-center">
              <dt className="text-2xs font-medium text-slate-400">{item.label}</dt>
              <dd className="mt-1 break-words text-base font-bold text-slate-50 sm:text-lg">{item.value}</dd>
            </div>
          ))}
        </dl>
      </main>

      <footer className="border-t border-slate-800 px-6 py-4 text-center text-2xs text-slate-400">
        Checked automatically every 15 seconds · Last checked: {lastRefreshed.toLocaleTimeString()}
      </footer>
    </div>
  );
};
