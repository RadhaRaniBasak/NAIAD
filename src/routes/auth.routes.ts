/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sign-in routes (public, rate limited). Everything else under /api/v1 needs the token they return.
 * - POST /api/v1/auth/join   A volunteer picks a nickname and gets a token (ADR 002)
 * - POST /api/v1/auth/login  Coordinators and admins sign in with email and password
 */

import { Router } from 'express';
import { z } from 'zod';
import type { AuthService } from '../services/auth.ts';
import { asyncRoute, rateLimit } from './middleware.ts';

const MINUTE_MS = 60_000;

const JoinSchema = z.object({
  cityId: z.string().min(1).max(64),
  nickname: z
    .string()
    .trim()
    .min(3, 'Nickname must be at least 3 characters')
    .max(32, 'Nickname must be at most 32 characters')
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} _.-]*$/u, 'Use letters, numbers, spaces, dots, dashes or underscores'),
});

const LoginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();

  // Tokens must never be stored by a cache.
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // New accounts per address: enough for a school class behind one router, not for a script.
  router.post('/join', rateLimit({ windowMs: 60 * MINUTE_MS, max: 100 }), (req, res) => {
    const { cityId, nickname } = JoinSchema.parse(req.body);
    res.status(201).json({ data: authService.joinAsVolunteer(cityId, nickname) });
  });

  // Password guesses per address.
  router.post(
    '/login',
    rateLimit({ windowMs: 15 * MINUTE_MS, max: 20 }),
    asyncRoute(async (req, res) => {
      const { email, password } = LoginSchema.parse(req.body);
      res.status(200).json({ data: await authService.login(email, password) });
    })
  );

  return router;
}
