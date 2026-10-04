/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Missions Domain Service
 * Enforces business logic, cursor-based pagination, soft deletes, and multi-tenant scoping.
 */

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getDb } from '../db/index.ts';
import { type AuthContext, can, ForbiddenError, NotFoundError } from './permissions.ts';
import { logger } from '../utils/logger.ts';
import type { Group, RequestSource } from '../types/index.ts';

export interface CursorPaginationQuery {
  limit?: number;
  cursor?: string; // Base64 encoded { createdAt: string, id: string }
  source?: string;
  reachId?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    limit: number;
  };
}

export interface CreateMissionInput {
  reachId: string;
  source: RequestSource;
  reason: string;
  requesterName?: string;
  targetGroup: Group;
  priorityValue?: number;
  bountyCents?: number;
  pointsAward?: number;
  expiresInHours?: number;
}

export interface UpdateMissionInput {
  reason?: string;
  priorityValue?: number;
  bountyCents?: number;
  pointsAward?: number;
  status?: 'open' | 'claimed' | 'fulfilled' | 'expired' | 'cancelled';
}

export interface MissionEntity {
  id: string;
  organizationId: string;
  reachId: string;
  source: string;
  reason: string;
  requesterName: string;
  targetGroup: string;
  priorityValue: number;
  bountyCents: number;
  pointsAward: number;
  status: string;
  claimedByUserId: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

const MISSION_COLUMNS = `
  id, organization_id as organizationId, reach_id as reachId,
  source, reason, requester_name as requesterName, target_group as targetGroup,
  priority_value as priorityValue, bounty_cents as bountyCents, points_award as pointsAward,
  status, claimed_by_user_id as claimedByUserId, expires_at as expiresAt,
  created_at as createdAt, updated_at as updatedAt
`;

export class MissionsService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync = getDb()) {
    this.db = db;
  }

  /**
   * List missions with cursor pagination, scoped to tenant organization.
   */
  listMissions(auth: AuthContext, query: CursorPaginationQuery): PaginatedResult<MissionEntity> {
    if (!can(auth, 'missions:list')) {
      throw new ForbiddenError('Unauthorized to list missions.');
    }

    const limit = Math.min(Math.max(query.limit || 20, 1), 100);
    let cursorObj: { createdAt: string; id: string } | null = null;

    if (query.cursor) {
      try {
        const decoded = Buffer.from(query.cursor, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.createdAt === 'string' &&
          typeof parsed.id === 'string'
        ) {
          cursorObj = parsed;
        }
      } catch (err) {
        logger.warn('Malformed pagination cursor ignored; falling back to first page', {
          cursor: query.cursor,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    let sql = `
      SELECT ${MISSION_COLUMNS}
      FROM request_missions
      WHERE organization_id = ? AND deleted_at IS NULL
    `;
    const params: (string | number)[] = [auth.organizationId];

    if (query.source) {
      sql += ' AND source = ?';
      params.push(query.source);
    }

    if (query.reachId) {
      sql += ' AND reach_id = ?';
      params.push(query.reachId);
    }

    if (cursorObj) {
      sql += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
      params.push(cursorObj.createdAt, cursorObj.createdAt, cursorObj.id);
    }

    sql += ' ORDER BY created_at DESC, id DESC LIMIT ?';
    params.push(limit + 1); // Fetch 1 extra to determine hasMore

    const rows = this.db.prepare(sql).all(...params) as unknown as MissionEntity[];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({ createdAt: last.createdAt, id: last.id }),
        'utf8'
      ).toString('base64');
    }

    return {
      data: items,
      pagination: {
        hasMore,
        nextCursor,
        limit,
      },
    };
  }

  /**
   * Get mission by ID with strict tenant isolation.
   */
  getMission(auth: AuthContext, missionId: string): MissionEntity {
    const row = this.db
      .prepare(`
        SELECT ${MISSION_COLUMNS}
        FROM request_missions
        WHERE id = ? AND deleted_at IS NULL
      `)
      .get(missionId) as unknown as MissionEntity | undefined;

    if (!row || row.organizationId !== auth.organizationId) {
      // 404 to avoid leaking existence across tenants
      throw new NotFoundError(`Mission '${missionId}' not found.`);
    }

    return row;
  }

  /**
   * Create mission (Coordinator/Admin only).
   */
  createMission(auth: AuthContext, input: CreateMissionInput): MissionEntity {
    if (!can(auth, 'missions:create', { organizationId: auth.organizationId })) {
      throw new ForbiddenError(`User with role '${auth.role}' cannot create missions.`);
    }

    // Verify reach exists in same organization
    const reach = this.db
      .prepare('SELECT id FROM reaches WHERE id = ? AND organization_id = ? AND deleted_at IS NULL')
      .get(input.reachId, auth.organizationId);

    if (!reach) {
      throw new NotFoundError(`Reach '${input.reachId}' not found within your organization.`);
    }

    const missionId = `mis_${crypto.randomUUID().substring(0, 8)}`;
    const now = new Date();
    const hours = input.expiresInHours || 72;
    const expiresAt = new Date(now.getTime() + hours * 3600000).toISOString();
    const priorityValue = input.priorityValue ?? 0.5;
    const bountyCents = input.bountyCents ?? 0;
    const pointsAward = input.pointsAward ?? 50;
    const requesterName = input.requesterName || 'Naiad Demand Coordinator';

    this.db
      .prepare(`
        INSERT INTO request_missions (
          id, organization_id, reach_id, source, reason, requester_name,
          target_group, priority_value, bounty_cents, points_award, status, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
      `)
      .run(
        missionId,
        auth.organizationId,
        input.reachId,
        input.source,
        input.reason,
        requesterName,
        input.targetGroup,
        priorityValue,
        bountyCents,
        pointsAward,
        expiresAt
      );

    return this.getMission(auth, missionId);
  }

  /**
   * Update mission (Coordinator/Admin only).
   */
  updateMission(auth: AuthContext, missionId: string, input: UpdateMissionInput): MissionEntity {
    const existing = this.getMission(auth, missionId);

    if (!can(auth, 'missions:update', { organizationId: existing.organizationId })) {
      throw new ForbiddenError(`User with role '${auth.role}' cannot update missions.`);
    }

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (input.reason !== undefined) {
      updates.push('reason = ?');
      params.push(input.reason);
    }
    if (input.priorityValue !== undefined) {
      updates.push('priority_value = ?');
      params.push(input.priorityValue);
    }
    if (input.bountyCents !== undefined) {
      updates.push('bounty_cents = ?');
      params.push(input.bountyCents);
    }
    if (input.pointsAward !== undefined) {
      updates.push('points_award = ?');
      params.push(input.pointsAward);
    }
    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
    }

    if (updates.length > 0) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      params.push(missionId, auth.organizationId);

      this.db
        .prepare(`
          UPDATE request_missions
          SET ${updates.join(', ')}
          WHERE id = ? AND organization_id = ? AND deleted_at IS NULL
        `)
        .run(...params);
    }

    return this.getMission(auth, missionId);
  }

  /**
   * Soft delete mission (Coordinator/Admin only).
   */
  deleteMission(auth: AuthContext, missionId: string): void {
    const existing = this.getMission(auth, missionId);

    if (!can(auth, 'missions:delete', { organizationId: existing.organizationId })) {
      throw new ForbiddenError(`User with role '${auth.role}' cannot delete missions.`);
    }

    this.db
      .prepare(`
        UPDATE request_missions
        SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND organization_id = ? AND deleted_at IS NULL
      `)
      .run(missionId, auth.organizationId);
  }
}
