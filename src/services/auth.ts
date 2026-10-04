/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Authentication (docs/decisions ADR 002: anonymous-first volunteers, credentials for coordinators)
 * - Signed bearer tokens (JWT, HS256) that carry only the user id. Organization, role and plan are
 *   read from the database on every request, so a role change or a deactivation applies at once.
 * - Volunteers join with a nickname and receive a token straight away: no email, no password.
 * - Coordinators and admins sign in with email and password (scrypt).
 */

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { env } from '../config/env.ts';
import { getDb } from '../db/index.ts';
import { type AuthContext, HttpError, NotFoundError, type UserRole } from './permissions.ts';

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** A volunteer's token is their account (there is no password to sign in again with), so it lasts. */
const VOLUNTEER_TOKEN_TTL_S = 90 * 24 * 3600;
const STAFF_TOKEN_TTL_S = 12 * 3600;

const base64url = (value: string) => Buffer.from(value, 'utf8').toString('base64url');
const TOKEN_HEADER = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

const sign = (input: string) =>
  crypto.createHmac('sha256', env.AUTH_TOKEN_SECRET).update(input).digest('base64url');

// ponytail: tokens are stateless, so one cannot be revoked before it expires other than by
// deactivating its user. Add a per-user token version column if sign-out everywhere is needed.
export function issueToken(userId: string, ttlSeconds: number, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  const payload = base64url(JSON.stringify({ sub: userId, iat: issuedAt, exp: issuedAt + ttlSeconds }));
  return `${TOKEN_HEADER}.${payload}.${sign(`${TOKEN_HEADER}.${payload}`)}`;
}

/** Returns the user id a token was issued to, or null if it is forged, malformed or expired. */
export function verifyToken(token: string, now = Date.now()): string | null {
  const parts = token.split('.');
  const [header, payload, signature] = parts;
  // Only the exact header issued above is accepted, which rules out `alg: none` and algorithm swaps.
  if (parts.length !== 3 || header !== TOKEN_HEADER) return null;

  const expected = Buffer.from(sign(`${header}.${payload}`));
  const received = Buffer.from(signature);
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;

  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const { sub, exp } = claims as { sub?: unknown; exp?: unknown };
    return typeof sub === 'string' && typeof exp === 'number' && exp * 1000 > now ? sub : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

// scrypt cost from the OWASP password storage guidance (N=2^14, r=8, p=5). It is stored with
// every hash, so it can be raised later without invalidating existing passwords.
const SCRYPT = { N: 16384, r: 8, p: 5 };
const KEY_LENGTH = 64;
const scrypt = promisify<crypto.BinaryLike, crypto.BinaryLike, number, crypto.ScryptOptions, Buffer>(crypto.scrypt);

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;

  const expected = Buffer.from(hash, 'base64url');
  try {
    const actual = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false; // unusable stored parameters
  }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface SessionUser {
  id: string;
  nickname: string;
  role: UserRole;
  organizationId: string;
}

export interface Session {
  token: string;
  expiresAt: string;
  user: SessionUser;
}

export class AuthService {
  private db: DatabaseSync;
  /** Checked when an email is unknown, so that case takes as long as a wrong password. */
  private decoyHash: string | undefined;

  constructor(db: DatabaseSync = getDb()) {
    this.db = db;
  }

  /** Resolves a bearer token to the caller's identity, or null if the token or account is not valid. */
  authenticate(token: string): AuthContext | null {
    const userId = verifyToken(token);
    if (!userId) return null;

    const row = this.db
      .prepare(`
        SELECT u.id AS userId, u.organization_id AS organizationId, u.role, o.subscription_plan AS subscriptionPlan
        FROM users u
        JOIN organizations o ON o.id = u.organization_id
        WHERE u.id = ? AND u.is_active = 1 AND u.deleted_at IS NULL
          AND o.is_active = 1 AND o.deleted_at IS NULL
      `)
      .get(userId) as unknown as AuthContext | undefined;

    return row ?? null;
  }

  /** ADR 002: a volunteer picks a nickname and can start checking streams straight away. */
  joinAsVolunteer(cityId: string, nickname: string): Session {
    const organization = this.db
      .prepare(`
        SELECT id FROM organizations
        WHERE primary_city_id = ? AND is_active = 1 AND deleted_at IS NULL
        ORDER BY created_at LIMIT 1
      `)
      .get(cityId) as { id: string } | undefined;

    if (!organization) {
      throw new NotFoundError(`No organization runs Naiad in '${cityId}' yet.`);
    }

    const taken = this.db
      .prepare('SELECT 1 FROM users WHERE organization_id = ? AND nickname = ? COLLATE NOCASE')
      .get(organization.id, nickname);
    if (taken) {
      throw new HttpError(409, 'CONFLICT', 'That nickname is already taken. Pick another one.');
    }

    const user: SessionUser = {
      id: `usr_${crypto.randomUUID()}`,
      nickname,
      role: 'citizen',
      organizationId: organization.id,
    };
    this.db
      .prepare("INSERT INTO users (id, organization_id, nickname, role) VALUES (?, ?, ?, 'citizen')")
      .run(user.id, user.organizationId, user.nickname);

    return this.session(user, VOLUNTEER_TOKEN_TTL_S);
  }

  /** Email and password sign-in for the accounts that have a password (coordinators, admins). */
  async login(email: string, password: string): Promise<Session> {
    const candidates = this.db
      .prepare(`
        SELECT u.id, u.nickname, u.role, u.organization_id AS organizationId, c.password_hash AS passwordHash
        FROM users u
        JOIN user_credentials c ON c.user_id = u.id
        JOIN organizations o ON o.id = u.organization_id
        WHERE u.email = ? COLLATE NOCASE AND u.is_active = 1 AND u.deleted_at IS NULL
          AND o.is_active = 1 AND o.deleted_at IS NULL
      `)
      .all(email) as unknown as (SessionUser & { passwordHash: string })[];

    // An address can belong to accounts in several organizations. All of them are checked, and
    // side by side, so the time taken depends as little as possible on how many there are.
    const matches = await Promise.all(candidates.map((candidate) => verifyPassword(password, candidate.passwordHash)));
    const matched = candidates[matches.indexOf(true)];
    if (matched) {
      const { passwordHash: _passwordHash, ...user } = matched;
      return this.session(user, STAFF_TOKEN_TTL_S);
    }

    if (candidates.length === 0) {
      this.decoyHash ??= hashPassword(crypto.randomUUID());
      await verifyPassword(password, this.decoyHash);
    }
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Wrong email or password.');
  }

  /** Sets or replaces a user's password. Used by the seed script; there is no HTTP route for it. */
  setPassword(userId: string, password: string): void {
    this.db
      .prepare(`
        INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = CURRENT_TIMESTAMP
      `)
      .run(userId, hashPassword(password));
  }

  private session(user: SessionUser, ttlSeconds: number): Session {
    return {
      token: issueToken(user.id, ttlSeconds),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      user,
    };
  }
}
