/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Resilient In-Process Background Job Queue
 * Features:
 * - Idempotency (safe to run twice using deterministic job IDs)
 * - Retries up to a per-job attempt limit
 * - Detailed error logging with debug context
 * - Failed job / Dead Letter Queue inspection
 * - Asynchronous execution outside the HTTP request path
 *
 * The `background_jobs` table is defined in src/db/schema.sql.
 * The four default handlers only write a log line, and nothing in the application enqueues a job yet.
 */

import type { DatabaseSync } from 'node:sqlite';
import { getDb } from '../db/index.ts';
import { logger } from '../utils/logger.ts';
import { captureServerError } from './sentry.server.ts';

export type JobName =
  | 'send_email'
  | 'generate_export'
  | 'sync_weather_api'
  | 'dispatch_webhook';

export interface BackgroundJobRecord {
  id: string;
  name: JobName;
  payload_json: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  last_attempted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type JobHandler<T = any> = (payload: T) => Promise<void> | void;

export class JobQueue {
  private handlers = new Map<JobName, JobHandler>();
  private db: DatabaseSync;

  constructor(db: DatabaseSync = getDb()) {
    this.db = db;
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers() {
    // 1. Sending emails / notifications out of request path
    this.registerHandler('send_email', async (payload: { to: string; subject: string; body: string }) => {
      logger.info(`[JobQueue:send_email] Sending notification to <${payload.to}>: "${payload.subject}"`);
      // Simulated SMTP dispatch
    });

    // 2. Generating exports out of request path
    this.registerHandler('generate_export', async (payload: { exportType: string; filterOrg: string }) => {
      logger.info(`[JobQueue:generate_export] Generating ${payload.exportType} report for ${payload.filterOrg}...`);
    });

    // 3. Syncing third-party weather API out of request path
    this.registerHandler('sync_weather_api', async (payload: { cityId: string; lat: number; lon: number }) => {
      logger.info(`[JobQueue:sync_weather_api] Polling Open-Meteo for city '${payload.cityId}'...`);
    });

    // 4. Dispatching webhooks
    this.registerHandler('dispatch_webhook', async (payload: { targetUrl: string; event: string }) => {
      logger.info(`[JobQueue:dispatch_webhook] Dispatching ${payload.event} to ${payload.targetUrl}`);
    });
  }

  public registerHandler(name: JobName, handler: JobHandler) {
    this.handlers.set(name, handler);
  }

  /**
   * Enqueue job idempotently. Safe to call twice with identical jobId.
   */
  public enqueue(jobId: string, name: JobName, payload: unknown, maxAttempts = 3): void {
    const payloadStr = JSON.stringify(payload);
    this.db
      .prepare(`
        INSERT INTO background_jobs (id, name, payload_json, status, max_attempts)
        VALUES (?, ?, ?, 'pending', ?)
        ON CONFLICT(id) DO NOTHING
      `)
      .run(jobId, name, payloadStr, maxAttempts);

    // Trigger processing asynchronously in background (out of HTTP cycle)
    // ponytail: a pass only runs when something is enqueued, so a job waiting for a retry sits
    // until the next enqueue. Add a timer that calls processNextJobs() once jobs have real work to do.
    setImmediate(() => {
      this.processNextJobs().catch((err) => logger.error('[JobQueue] Processing pass failed', err));
    });
  }

  /**
   * Process up to 5 pending or retryable jobs, oldest first.
   */
  public async processNextJobs(): Promise<number> {
    const pendingJobs = this.db
      .prepare(`
        SELECT * FROM background_jobs
        WHERE status IN ('pending', 'processing') AND attempts < max_attempts
        ORDER BY created_at ASC
        LIMIT 5
      `)
      .all() as unknown as BackgroundJobRecord[];

    for (const job of pendingJobs) {
      const handler = this.handlers.get(job.name);
      if (!handler) {
        this.markFailed(job.id, `No registered handler for job '${job.name}'`, job.attempts + 1);
        continue;
      }

      const attempt = job.attempts + 1;
      this.db
        .prepare(`
          UPDATE background_jobs 
          SET status = 'processing', attempts = ?, last_attempted_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `)
        .run(attempt, job.id);

      try {
        const parsedPayload = JSON.parse(job.payload_json);
        await handler(parsedPayload);

        // Mark completed
        this.db
          .prepare("UPDATE background_jobs SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(job.id);
      } catch (err) {
        const errorMsg = (err instanceof Error && err.message) || String(err);
        logger.error(`[JobQueue] Job ${job.id} (${job.name}) attempt ${attempt} failed: ${errorMsg}`, err);
        captureServerError(err, { jobId: job.id, jobName: job.name, attempt });

        if (attempt >= job.max_attempts) {
          this.markFailed(job.id, `Max retries exceeded: ${errorMsg}`, attempt);
        } else {
          // Back to pending so the next pass retries it
          this.db
            .prepare(`
              UPDATE background_jobs 
              SET status = 'pending', last_error = ?, updated_at = CURRENT_TIMESTAMP 
              WHERE id = ?
            `)
            .run(`Attempt ${attempt} error: ${errorMsg}`, job.id);
        }
      }
    }

    return pendingJobs.length;
  }

  private markFailed(id: string, error: string, attempts: number) {
    this.db
      .prepare(`
        UPDATE background_jobs 
        SET status = 'failed', last_error = ?, attempts = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `)
      .run(error, attempts, id);
  }

  /**
   * Retrieve list of failed jobs for coordinator/operator DLQ inspection.
   */
  public getFailedJobs(limit = 50): BackgroundJobRecord[] {
    return this.db
      .prepare(`
        SELECT * FROM background_jobs
        WHERE status = 'failed'
        ORDER BY updated_at DESC
        LIMIT ?
      `)
      .all(limit) as unknown as BackgroundJobRecord[];
  }
}
