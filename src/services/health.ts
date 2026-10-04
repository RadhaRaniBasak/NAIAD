/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Readiness Health Report
 * Probes the database, cache, and background job queue (each with a timeout) and
 * aggregates them into the payload served by GET /api/health.
 */

import type { DatabaseSync } from 'node:sqlite';
import { env } from '../config/env.ts';
import { getDb } from '../db/index.ts';
import { globalCache } from './cache.service.ts';

export type HealthStatus = 'ok' | 'degraded' | 'unhealthy';

interface ComponentHealth {
  status: HealthStatus;
  latencyMs: number;
  error?: string;
}

export interface HealthReport {
  status: HealthStatus;
  service: string;
  environment: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  components: {
    database: ComponentHealth;
    cache: ComponentHealth;
    queue: ComponentHealth & { pendingJobs: number; deadLetterJobs: number };
  };
  memory: { rssMb: number; heapUsedMb: number };
}

const DATABASE_TIMEOUT_MS = 1500;
const CACHE_TIMEOUT_MS = 1000;
// The queue counts as degraded beyond these backlog sizes.
const MAX_PENDING_JOBS = 500;
const MAX_DEAD_LETTER_JOBS = 10;

type ProbeResult<T> = { latencyMs: number } & ({ value: T; error?: undefined } | { value?: undefined; error: string });

/** Runs one check, timing it and turning a throw or a timeout into an error message. */
async function probe<T>(label: string, timeoutMs: number, check: () => T | Promise<T>): Promise<ProbeResult<T>> {
  const start = performance.now();
  const latencyMs = () => Math.round((performance.now() - start) * 100) / 100;
  let timer: NodeJS.Timeout | undefined;

  try {
    const value = await Promise.race([
      Promise.resolve().then(check),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} probe timed out (>${timeoutMs}ms)`)), timeoutMs);
      }),
    ]);
    return { value, latencyMs: latencyMs() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), latencyMs: latencyMs() };
  } finally {
    clearTimeout(timer);
  }
}

export async function getHealthReport(
  shuttingDown = false,
  openDb: () => DatabaseSync = getDb
): Promise<HealthReport> {
  const database = await probe('Database', DATABASE_TIMEOUT_MS, () => {
    if (!openDb().prepare('SELECT 1 as alive;').get()) {
      throw new Error('Database returned empty probe result');
    }
  });

  const cache = await probe('Cache', CACHE_TIMEOUT_MS, async () => {
    await globalCache.set('health:probe', { alive: true }, 5);
    const retrieved = await globalCache.get<{ alive: boolean }>('health:probe');
    if (!retrieved?.alive) throw new Error('Cache read-after-write failed');
  });

  const queue = await probe('Queue', DATABASE_TIMEOUT_MS, () => {
    const count = openDb().prepare('SELECT COUNT(*) as count FROM background_jobs WHERE status = ?');
    return {
      pendingJobs: Number((count.get('pending') as { count: number }).count),
      deadLetterJobs: Number((count.get('failed') as { count: number }).count),
    };
  });

  const { pendingJobs = 0, deadLetterJobs = 0 } = queue.value ?? {};
  const queueStatus: HealthStatus = queue.error
    ? 'unhealthy'
    : pendingJobs > MAX_PENDING_JOBS || deadLetterJobs > MAX_DEAD_LETTER_JOBS
    ? 'degraded'
    : 'ok';

  // Only a dead database (or a shutdown in progress) takes the instance out of rotation;
  // cache and queue trouble is reported as degraded.
  const status: HealthStatus =
    shuttingDown || database.error ? 'unhealthy' : cache.error || queueStatus !== 'ok' ? 'degraded' : 'ok';

  const memoryUsage = process.memoryUsage();
  const withError = (error?: string) => (error ? { error } : {});

  return {
    status,
    service: 'naiad-api',
    environment: env.NODE_ENV,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    components: {
      database: {
        status: database.error ? 'unhealthy' : 'ok',
        latencyMs: database.latencyMs,
        ...withError(database.error),
      },
      cache: {
        status: cache.error ? 'unhealthy' : 'ok',
        latencyMs: cache.latencyMs,
        ...withError(cache.error),
      },
      queue: {
        status: queueStatus,
        pendingJobs,
        deadLetterJobs,
        latencyMs: queue.latencyMs,
        ...withError(queue.error),
      },
    },
    memory: {
      rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
      heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    },
  };
}
