/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The Express application: every /api route and the middleware around them.
 * server.ts adds the frontend (Vite in development, static files in production) and listens;
 * the HTTP tests mount this same app on an in-memory database.
 */

import express from 'express';
import child_process from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { env } from './config/env.ts';
import { CITIES } from './data/cities.ts';
import { getCityReaches } from './data/networks.ts';
import { getDb } from './db/index.ts';
import { createAuthRouter } from './routes/auth.routes.ts';
import { asyncRoute, cacheBypassRequested, errorHandler, rateLimit, requireAuth } from './routes/middleware.ts';
import { createMissionsRouter } from './routes/missions.routes.ts';
import { AuthService } from './services/auth.ts';
import { BillingService, StripeEventSchema } from './services/billing.ts';
import { CacheService, globalCache } from './services/cache.service.ts';
import { GdprService } from './services/gdpr.service.ts';
import { getHealthReport } from './services/health.ts';
import { MissionsService } from './services/missions.service.ts';
import { can, ForbiddenError, HttpError, NotFoundError } from './services/permissions.ts';
import { JobQueue } from './services/queue.ts';
import { createPresignedUploadUrl, getPresignedDownloadUrl } from './services/storage.ts';
import { logger, runWithLogContext } from './utils/logger.ts';

const ROOT_DIR = path.resolve(import.meta.dirname, '..');
const APP_ORIGIN = new URL(env.APP_URL).origin;
const isProd = env.NODE_ENV === 'production';

const UploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
  reachId: z.string().min(1).max(64).optional(),
});

const DEFAULT_REACH_LIMIT = 50;

/** Query of the reach list. Express hands over strings, or arrays and objects for `a[]=`/`a[b]=`. */
const ReachesQuery = z.object({
  city: z.enum(CITIES.map((city) => city.id)).default('coimbra'),
  limit: z.coerce.number().int().min(1).max(100).default(DEFAULT_REACH_LIMIT),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Request body is not valid JSON.');
  }
}

export interface AppOptions {
  db?: DatabaseSync;
  /** True once the process has been asked to stop: new requests are turned away. */
  isShuttingDown?: () => boolean;
}

export function createApp({ db = getDb(), isShuttingDown = () => false }: AppOptions = {}): express.Express {
  const authService = new AuthService(db);
  const billingService = new BillingService(db);
  const gdprService = new GdprService(db);
  const jobQueue = new JobQueue(db);

  const app = express();
  app.set('trust proxy', 1);

  // ----------------------------------------------------
  // 0. Request ID, Async Context & Structured Logger Middleware
  // ----------------------------------------------------
  app.use((req, res, next) => {
    const requestId = req.get('x-request-id') || `req_${crypto.randomUUID()}`;
    const request = { method: req.method, path: req.originalUrl };

    res.setHeader('X-Request-Id', requestId);
    const startTime = Date.now();

    // requireAuth adds the user and organization once the caller is known.
    runWithLogContext({ requestId }, () => {
      logger.info(`HTTP request started: ${req.method} ${req.originalUrl}`, request);

      res.on('finish', () => {
        const durationMs = Date.now() - startTime;
        logger.info(
          `HTTP request finished: ${req.method} ${req.originalUrl} - ${res.statusCode} (${durationMs}ms)`,
          { ...request, statusCode: res.statusCode, durationMs }
        );
      });

      next();
    });
  });

  // ----------------------------------------------------
  // 1. Production HTTPS Redirect & Security Headers
  // ----------------------------------------------------
  app.use((req, res, next) => {
    // Graceful draining check
    if (isShuttingDown() && req.path !== '/api/health') {
      res.setHeader('Connection', 'close');
      return next(new HttpError(503, 'SERVER_SHUTTING_DOWN', 'Server is undergoing zero-downtime deployment restart.'));
    }

    // Force HTTPS in production behind reverse proxies (Cloud Run / Cloudflare). The target is
    // built from APP_URL, never from the request's Host header, so it cannot be pointed elsewhere.
    if (isProd && req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `${APP_ORIGIN}${req.url}`);
    }

    // Standard OWASP & Security Headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');

    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https:; object-src 'none'; frame-ancestors 'self';"
      );
    }

    next();
  });

  // ----------------------------------------------------
  // 2. Stripe Billing Webhook (Idempotent event processing)
  // ----------------------------------------------------
  // Stripe signs the exact bytes it sent, so this route reads the raw body and has to be
  // registered before express.json(). The signature is its authentication: it takes no user token.
  app.post('/api/v1/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!billingService.verifySignature(rawBody, req.get('stripe-signature') ?? '')) {
      throw new HttpError(400, 'INVALID_SIGNATURE', 'Webhook signature verification failed.');
    }

    res.status(200).json(billingService.handleWebhookEvent(StripeEventSchema.parse(parseJson(rawBody))));
  });

  app.use(express.json());

  // ----------------------------------------------------
  // 3. Health-check endpoints: /api/health/live (Liveness) & /api/health (Readiness)
  // ----------------------------------------------------
  // Fast Liveness probe: confirms process is up and running for load balancers
  app.get('/api/health/live', (_req, res) => {
    res.status(200).json({
      status: 'alive',
      service: 'naiad-api',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // Comprehensive Readiness probe: checks database, cache, and background queue with timeouts
  app.get(
    '/api/health',
    asyncRoute(async (_req, res) => {
      const report = await getHealthReport(isShuttingDown(), () => db);
      res.status(report.status === 'unhealthy' ? 503 : 200).json(report);
    })
  );

  // ----------------------------------------------------
  // Repository Zip Download Endpoint
  // ----------------------------------------------------
  app.get('/api/download-repo', (_req, res, next) => {
    const zipPath = path.resolve(ROOT_DIR, 'naiad-repo.zip');
    if (!fs.existsSync(zipPath)) {
      try {
        child_process.execSync('python3 scripts/create-zip.py', { cwd: ROOT_DIR });
      } catch (err) {
        logger.error('Failed to generate repo zip on-demand', err);
      }
    }

    res.download(zipPath, 'naiad-repo.zip', (err) => {
      if (err) {
        logger.error('Failed to download repository zip', err);
        if (!res.headersSent) {
          next(new HttpError(500, 'INTERNAL_ERROR', 'Zip file download failed'));
        }
      }
    });
  });

  // ----------------------------------------------------
  // 4. Public REST API Routes (/api/v1/*): reference data and sign-in
  // ----------------------------------------------------
  app.get(
    '/api/v1/cities',
    asyncRoute(async (req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=600');
      const { data, hit } = await globalCache.getOrSet(
        'public:cities:v1',
        () => ({ data: CITIES }),
        3600,
        cacheBypassRequested(req)
      );
      res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
      res.json(data);
    })
  );

  app.use('/api/v1/auth', createAuthRouter(authService));

  // ----------------------------------------------------
  // 5. Authenticated REST API Routes: everything below needs a bearer token
  // ----------------------------------------------------
  app.use('/api/v1', requireAuth(authService));

  // Mission creation and storage tickets: a shared budget per signed-in user.
  const perUserLimit = rateLimit({ windowMs: 60_000, max: 60, key: (req) => req.auth.userId });

  app.get(
    '/api/v1/reaches',
    asyncRoute(async (req, res) => {
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate, proxy-revalidate');
      const { city, limit, offset } = ReachesQuery.parse(req.query);
      const orgId = req.auth.organizationId;

      const page = () => {
        const reaches = getCityReaches(city);
        return {
          organization_id: orgId,
          city,
          pagination: { limit, offset, total: reaches.length },
          data: reaches.slice(offset, offset + limit),
        };
      };

      // Only the default page is cached, so cache entries do not multiply with what a client sends.
      if (limit !== DEFAULT_REACH_LIMIT || offset !== 0) {
        res.setHeader('X-Cache', 'MISS');
        return res.json(page());
      }

      const cacheKey = CacheService.formatTenantKey(orgId, 'reaches', `city:${city}`);
      const { data, hit } = await globalCache.getOrSet(cacheKey, page, 900, cacheBypassRequested(req));

      res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
      res.setHeader('X-Cache-Key', cacheKey);
      res.json(data);
    })
  );

  // Storage pre-signed upload URL endpoint (the tenant and uploader are the signed-in user's)
  app.post('/api/v1/storage/upload-url', perUserLimit, (req, res) => {
    res.status(200).json(
      createPresignedUploadUrl(
        { ...UploadUrlSchema.parse(req.body), organizationId: req.auth.organizationId, userId: req.auth.userId },
        db
      )
    );
  });

  // Storage pre-signed download URL endpoint (with tenant authorization)
  app.get('/api/v1/storage/download-url/:fileId', perUserLimit, (req, res) => {
    res.status(200).json(getPresignedDownloadUrl(req.params.fileId, req.auth.organizationId, db));
  });

  // Missions REST API Router (Zod validated, cursor paginated, RBAC can())
  app.post('/api/v1/request-missions', perUserLimit);
  app.use('/api/v1/request-missions', createMissionsRouter(new MissionsService(db)));

  // Background Job Queue Inspection (Dead Letter Queue endpoint)
  app.get('/api/v1/jobs/failed', (req, res) => {
    if (!can(req.auth, 'jobs:read')) {
      throw new ForbiddenError('Only coordinators and admins can inspect failed jobs.');
    }

    // Jobs are not tenant-scoped and a payload can hold another organization's data,
    // so only each job's bookkeeping is returned.
    const failedJobs = jobQueue.getFailedJobs(50).map(({ payload_json: _payload, ...job }) => job);
    res.status(200).json({ data: failedJobs, count: failedJobs.length });
  });

  // ----------------------------------------------------
  // GDPR Article 17 (Erasure) & Article 20 (Portability)
  // ----------------------------------------------------
  // Export personal data
  app.get('/api/v1/account/export', (req, res) => {
    res.status(200).json(gdprService.exportUserData(req.auth, req.auth.userId));
  });

  // Erase account & anonymize observations
  app.delete('/api/v1/account', (req, res) => {
    res.status(200).json(gdprService.deleteAccount(req.auth, req.auth.userId));
  });

  // ----------------------------------------------------
  // Staging / Dev Sentry Verification Test Route
  // ----------------------------------------------------
  if (!isProd) {
    app.get('/api/v1/test/sentry-error', () => {
      logger.warn('Triggering intentional test exception on /api/v1/test/sentry-error for Sentry verification');
      throw new Error('SENTRY_TEST_VERIFICATION: Simulated staging exception for Sentry validation');
    });
  }

  // An API path nothing above handles is a JSON 404, never the frontend's HTML.
  app.use('/api', (_req, _res, next) => next(new NotFoundError('API route not found.')));

  // ----------------------------------------------------
  // Centralized Error Handling Middleware (Sentry + Friendly Message)
  // ----------------------------------------------------
  app.use(errorHandler);

  return app;
}
