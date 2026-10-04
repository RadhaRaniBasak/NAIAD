/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Request Missions REST API Routes
 * Conforming to /docs/api-conventions.md:
 * - Thin route handlers
 * - Zod validation at network boundary
 * - Cursor pagination
 * - Standardized error envelope (see errorHandler in ./middleware.ts)
 */

import { Router } from 'express';
import { z } from 'zod';
import { MissionsService } from '../services/missions.service.ts';
import { globalCache, CacheService } from '../services/cache.service.ts';
import { asyncRoute, cacheBypassRequested } from './middleware.ts';

const CACHE_TTL_SECONDS = 300;

const MISSION_SOURCES = ['staleness', 'weather', 'disagreement', 'lab-gap', 'trace', 'external'] as const;

/** Query of the mission list. Express hands over strings, or arrays and objects for `a[]=`/`a[b]=`. */
const ListMissionsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(512).optional(),
  source: z.enum(MISSION_SOURCES).optional(),
  reachId: z.string().regex(/^[\w:.-]{1,64}$/, 'Not a reach id').optional(),
});

const CreateMissionSchema = z.object({
  reachId: z.string().min(1, 'Target reachId is required'),
  source: z.enum(MISSION_SOURCES),
  reason: z.string().min(5, 'Reason must be at least 5 characters').max(200),
  targetGroup: z.enum(['water', 'vegetation', 'structure']),
  priorityValue: z.number().min(0.0).max(1.0).optional(),
  bountyCents: z.number().int().nonnegative().optional(),
  pointsAward: z.number().int().min(0).max(200).optional(),
  expiresInHours: z.number().int().min(1).max(336).optional(),
});

const UpdateMissionSchema = z.object({
  reason: z.string().min(5).max(200).optional(),
  priorityValue: z.number().min(0.0).max(1.0).optional(),
  bountyCents: z.number().int().nonnegative().optional(),
  pointsAward: z.number().int().min(0).max(200).optional(),
  status: z.enum(['open', 'claimed', 'fulfilled', 'expired', 'cancelled']).optional(),
});

/** Every mission write changes what the tenant's cached mission and reach lists should show. */
async function invalidateTenantCache(organizationId: string): Promise<void> {
  await globalCache.invalidatePattern(`org:${organizationId}:missions:*`);
  await globalCache.invalidatePattern(`org:${organizationId}:reaches:*`);
}

/** Mounted behind the `requireAuth` middleware, which provides `req.auth`. */
export function createMissionsRouter(missionsService: MissionsService = new MissionsService()): Router {
  const router = Router();

  // Tenant data must never be stored by shared caches.
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    next();
  });

  // 1. GET /api/v1/request-missions (Cursor Paginated, Multi-Tenant Cached)
  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const { auth } = req;
      const query = ListMissionsQuery.parse(req.query);

      // Only the first page at the default size is cached. It is what clients ask for first, and
      // it keeps the number and the size of cache entries independent of what a client sends.
      if (query.limit !== undefined || query.cursor !== undefined) {
        res.setHeader('X-Cache', 'MISS');
        return res.status(200).json(missionsService.listMissions(auth, query));
      }

      // An absent filter is the empty string, which no filter value can be.
      const cacheKey = CacheService.formatTenantKey(
        auth.organizationId,
        'missions',
        `first:s:${query.source ?? ''}:r:${query.reachId ?? ''}`
      );

      const { data, hit } = await globalCache.getOrSet(
        cacheKey,
        () => missionsService.listMissions(auth, query),
        CACHE_TTL_SECONDS,
        cacheBypassRequested(req)
      );

      res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
      res.setHeader('X-Cache-Key', cacheKey);
      res.status(200).json(data);
    })
  );

  // 2. POST /api/v1/request-missions (Create Mission -> Invalidates Cache)
  router.post(
    '/',
    asyncRoute(async (req, res) => {
      const mission = missionsService.createMission(req.auth, CreateMissionSchema.parse(req.body));
      await invalidateTenantCache(req.auth.organizationId);

      res.status(201).location(`/api/v1/request-missions/${mission.id}`).json({ data: mission });
    })
  );

  // 3. GET /api/v1/request-missions/:id (Single Mission)
  router.get(
    '/:id',
    asyncRoute(async (req, res) => {
      const { auth } = req;
      const cacheKey = CacheService.formatTenantKey(auth.organizationId, 'missions', `id:${req.params.id}`);

      const { data, hit } = await globalCache.getOrSet(
        cacheKey,
        () => missionsService.getMission(auth, req.params.id),
        CACHE_TTL_SECONDS,
        cacheBypassRequested(req)
      );

      res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
      res.status(200).json({ data });
    })
  );

  // 4. PATCH /api/v1/request-missions/:id (Update Mission -> Invalidates Cache)
  router.patch(
    '/:id',
    asyncRoute(async (req, res) => {
      const updated = missionsService.updateMission(req.auth, req.params.id, UpdateMissionSchema.parse(req.body));
      await invalidateTenantCache(req.auth.organizationId);

      res.status(200).json({ data: updated });
    })
  );

  // 5. DELETE /api/v1/request-missions/:id (Soft Delete -> Invalidates Cache)
  router.delete(
    '/:id',
    asyncRoute(async (req, res) => {
      missionsService.deleteMission(req.auth, req.params.id);
      await invalidateTenantCache(req.auth.organizationId);

      res.status(204).send();
    })
  );

  return router;
}
