/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared HTTP plumbing for /api/v1 routes, conforming to /docs/api-conventions.md:
 * - Authentication: the caller's identity on `req.auth`
 * - Rate limiting
 * - Cache bypass detection
 * - Async route wrapper
 * - The single error envelope
 */

import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import type { AuthService } from '../services/auth.ts';
import { type AuthContext, HttpError } from '../services/permissions.ts';
import { captureServerError } from '../services/sentry.server.ts';
import { logContextStore, logger } from '../utils/logger.ts';

declare global {
  namespace Express {
    interface Request {
      auth: AuthContext;
    }
  }
}

/**
 * Requires `Authorization: Bearer <token>` and puts the caller's identity on `req.auth`.
 * Who the caller is, and their organization, role and plan, come from the token and the
 * database: nothing the client sends is trusted for it.
 */
export function requireAuth(authService: AuthService): RequestHandler {
  return (req, _res, next) => {
    const token = /^Bearer (\S+)$/.exec(req.get('authorization') ?? '')?.[1];
    const auth = token ? authService.authenticate(token) : null;
    if (!auth) {
      return next(new HttpError(401, 'UNAUTHENTICATED', 'Sign in to use this endpoint.'));
    }

    req.auth = auth;
    // Tag the rest of this request's log lines with who made it.
    Object.assign(logContextStore.getStore() ?? {}, { userId: auth.userId, organizationId: auth.organizationId });
    next();
  };
}

/**
 * Allows `max` requests per `windowMs` for each key (the client address unless `key` says otherwise).
 */
// ponytail: counters live in this process. Move them to a shared store before running more than one instance.
export function rateLimit(options: {
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
}): RequestHandler {
  const { windowMs, max, key = (req) => req.ip ?? 'unknown' } = options;
  const windows = new Map<string, { count: number; resetAt: number }>();
  let nextSweepAt = 0;

  return (req, res, next) => {
    const now = Date.now();
    // Once per window, forget the windows that have finished, so the map only ever holds
    // recent callers and the clean-up cost does not grow with every request.
    if (now >= nextSweepAt) {
      for (const [id, window] of windows) {
        if (window.resetAt <= now) windows.delete(id);
      }
      nextSweepAt = now + windowMs;
    }

    const id = key(req);
    let window = windows.get(id);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs };
      windows.set(id, window);
    }

    window.count += 1;
    if (window.count > max) {
      res.setHeader('Retry-After', Math.ceil((window.resetAt - now) / 1000));
      return next(new HttpError(429, 'RATE_LIMITED', 'Too many requests. Try again later.'));
    }
    next();
  };
}

/** True when the caller asked to skip the server cache (`X-Cache-Bypass: true` or `Cache-Control: no-cache`). */
export function cacheBypassRequested(req: Request): boolean {
  return req.get('x-cache-bypass') === 'true' || req.get('cache-control') === 'no-cache';
}

/** Forwards a rejected async handler to the error middleware (Express 4 only does this for sync throws). */
export function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

/**
 * Centralized error handling: every failure leaves as
 * `{ error: { code, message, details?, requestId } }`.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(res.getHeader('X-Request-Id') ?? 'unknown');

  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request payload validation failed.',
        details: err.issues.map((i) => ({ field: i.path.join('.'), issue: i.message })),
        requestId,
      },
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details, requestId },
    });
  }

  // Anything else is unexpected: record it, and never leak internals on a 5xx.
  const statusCode: number = err.statusCode || 500;
  logger.error(`Unhandled request error: ${err.message}`, err);
  captureServerError(err, { path: req.url, method: req.method, requestId });

  res.status(statusCode).json({
    error: {
      code: statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : statusCode < 500 ? 'VALIDATION_FAILED' : 'INTERNAL_ERROR',
      message:
        statusCode >= 500
          ? 'An unexpected error occurred. Please contact support or try again later.'
          : err.message,
      requestId,
    },
  });
};
