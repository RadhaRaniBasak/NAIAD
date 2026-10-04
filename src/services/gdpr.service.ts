/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * GDPR Compliance & Privacy Service
 * Enforces:
 * - Article 17: Right to Erasure ("Right to be Forgotten") with scientific observation anonymization
 * - Article 20: Right to Data Portability (Complete structured JSON export)
 */

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getDb } from '../db/index.ts';
import { type AuthContext, can, ForbiddenError, NotFoundError } from './permissions.ts';
import { logger } from '../utils/logger.ts';
import { decryptField } from '../utils/crypto.ts';

export interface UserDataExport {
  exportMetadata: {
    userId: string;
    organizationId: string;
    exportedAt: string;
    gdprNotice: string;
  };
  profile: {
    id: string;
    nickname: string;
    email?: string;
    role: string;
    createdAt: string;
  };
  activity: {
    missionsClaimed: Record<string, unknown>[];
    checksSubmitted: Record<string, unknown>[];
  };
}

interface UserRow {
  id: string;
  organization_id: string;
  nickname: string;
  email: string | null;
  role: string;
  created_at: string;
}

export class GdprService {
  private db: DatabaseSync;

  constructor(db: DatabaseSync = getDb()) {
    this.db = db;
  }

  /**
   * Loads the target user, provided the caller may act on them: only the user themselves
   * or an org admin, and never across the tenant boundary.
   */
  private loadAccessibleUser(auth: AuthContext, targetUserId: string, forbiddenMessage: string): UserRow {
    if (auth.userId !== targetUserId && !can(auth, 'users:manage')) {
      throw new ForbiddenError(forbiddenMessage);
    }

    const user = this.db
      .prepare('SELECT id, organization_id, nickname, email, role, created_at FROM users WHERE id = ? AND deleted_at IS NULL')
      .get(targetUserId) as UserRow | undefined;

    if (!user) {
      throw new NotFoundError(`User '${targetUserId}' not found.`);
    }

    // Tenant boundary check
    if (user.organization_id !== auth.organizationId) {
      throw new NotFoundError(`User '${targetUserId}' not found in this organization.`);
    }

    return user;
  }

  /**
   * GDPR Article 20: Export all personal data belonging to the user.
   */
  exportUserData(auth: AuthContext, targetUserId: string): UserDataExport {
    const user = this.loadAccessibleUser(auth, targetUserId, 'You can only export your own account data.');

    const missions = this.db
      .prepare('SELECT id, reach_id, reason, status, points_award, created_at FROM request_missions WHERE claimed_by_user_id = ?')
      .all(targetUserId);

    const checks = this.db
      .prepare('SELECT id, reach_id, groups_checked, points_awarded, created_at FROM checks WHERE user_id = ?')
      .all(targetUserId);

    logger.info('GDPR data export generated', { targetUserId, requester: auth.userId });

    // Decrypt email if stored in encrypted format
    const decryptedEmail = user.email ? decryptField(user.email) : undefined;

    return {
      exportMetadata: {
        userId: targetUserId,
        organizationId: user.organization_id,
        exportedAt: new Date().toISOString(),
        gdprNotice: 'This document contains all personal data retained by Naiad in compliance with GDPR Art. 20.',
      },
      profile: {
        id: user.id,
        nickname: user.nickname,
        email: decryptedEmail,
        role: user.role,
        createdAt: user.created_at,
      },
      activity: {
        missionsClaimed: missions as Record<string, unknown>[],
        checksSubmitted: checks as Record<string, unknown>[],
      },
    };
  }

  /**
   * GDPR Article 17: Right to Erasure / Anonymization.
   * Completely removes PII, anonymizes observation attribution to preserve open science data.
   */
  deleteAccount(auth: AuthContext, targetUserId: string): { success: boolean; anonymizedChecksCount: number } {
    const user = this.loadAccessibleUser(auth, targetUserId, 'You can only delete your own account.');

    // All or nothing: a failure part-way must not leave an account half erased.
    this.db.exec('BEGIN');
    try {
      const anonymizedChecksCount = this.eraseUser(auth, user);
      this.db.exec('COMMIT');
      return { success: true, anonymizedChecksCount };
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** The erasure itself. Runs inside deleteAccount's transaction; returns how many checks were anonymized. */
  private eraseUser(auth: AuthContext, user: UserRow): number {
    const targetUserId = user.id;

    // Ensure system anonymous user exists to satisfy foreign key constraints if checks table has NOT NULL.
    // Its nickname carries a '#', which a chosen nickname cannot, so nobody can take the name first.
    const anonUser = this.db.prepare('SELECT id FROM users WHERE id = ?').get('usr_anonymized_science');
    if (!anonUser) {
      this.db.prepare(`
        INSERT INTO users (id, organization_id, nickname, role, points_balance, arm, is_active)
        VALUES ('usr_anonymized_science', ?, 'Anonymized Citizen Volunteer #1', 'citizen', 0, 'plain', 1)
      `).run(user.organization_id);
    }

    // 1. Anonymize user observation records (preserves environmental science metrics while scrubbing PII)
    const result = this.db
      .prepare(`
        UPDATE checks
        SET user_id = 'usr_anonymized_science'
        WHERE user_id = ?
      `)
      .run(targetUserId);

    // 2. Unassign any pending in-flight missions
    this.db
      .prepare(`
        UPDATE request_missions
        SET claimed_by_user_id = NULL,
            status = 'open'
        WHERE claimed_by_user_id = ? AND status = 'claimed'
      `)
      .run(targetUserId);

    // 3. Scrub and soft-delete user record, and remove the password (if the account had one)
    this.db
      .prepare(`
        UPDATE users
        SET nickname = 'Deleted User #' || id, -- unique per user, and '#' cannot be in a chosen nickname
            email = NULL,
            is_active = 0,
            deleted_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(targetUserId);
    this.db.prepare('DELETE FROM user_credentials WHERE user_id = ?').run(targetUserId);

    // 4. Record GDPR erasure audit entry (gdpr_audit_logs, see src/db/schema.sql)
    const auditId = `audit_gdpr_${crypto.randomUUID()}`; // not a timestamp: two erasures can share a millisecond
    this.db
      .prepare(`
        INSERT INTO gdpr_audit_logs (id, user_id, action, performed_by, details)
        VALUES (?, ?, 'ERASURE_COMPLETED', ?, ?)
      `)
      .run(auditId, targetUserId, auth.userId, JSON.stringify({ anonymizedCount: result.changes }));

    logger.info('GDPR account erasure executed successfully', {
      targetUserId,
      performedBy: auth.userId,
      anonymizedCount: result.changes,
    });

    return Number(result.changes);
  }
}
