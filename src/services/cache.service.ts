/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * In-Process Cache-Aside Service
 * A Map with per-entry expiry, living in this process: empty after a restart and not shared
 * between instances. The interface is the one a Redis client would be wrapped in later.
 * Features:
 * - Strict multi-tenant key scoping (org:{organization_id}:*)
 * - Pattern-based invalidation for write operations
 * - Debug cache bypass support (X-Cache-Bypass header)
 * - A fixed maximum number of entries
 */

import { logger } from '../utils/logger.ts';

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // Milliseconds timestamp
}

export class CacheService {
  private store = new Map<string, CacheEntry<unknown>>();
  private maxEntries: number;

  /**
   * `maxEntries` bounds the cache: keys are built from request parameters, so without a limit
   * a client could grow the process's memory by asking for endless variations.
   */
  constructor(maxEntries = 5000) {
    this.maxEntries = maxEntries;
    // Periodic sweep of expired keys every 60 seconds
    setInterval(() => this.sweepExpired(), 60000).unref();
  }

  /**
   * Helper to format tenant-scoped cache keys.
   * Enforces rule: Any cache of tenant data must include organization_id.
   */
  static formatTenantKey(organizationId: string, namespace: string, identifier: string): string {
    if (!organizationId) {
      throw new Error('CacheService: organizationId is required to format tenant cache key.');
    }
    return `org:${organizationId}:${namespace}:${identifier}`;
  }

  /**
   * Get item from cache. Returns null if expired or missing.
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Set item in cache with TTL in seconds (default: 300s = 5m).
   */
  async set<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    // ponytail: when full, the oldest entry goes (a Map iterates in insertion order), whether or
    // not it is still in use. Switch to least-recently-used if hit rates suffer.
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  /**
   * Invalidate a single key.
   */
  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  /**
   * Invalidate all keys matching a wildcard pattern (e.g. "org:org-coimbra-01:*").
   * Crucial for cache invalidation on writes.
   */
  async invalidatePattern(pattern: string): Promise<number> {
    // Only `*` is a wildcard; everything else (e.g. a "." in an organization ID) matches literally.
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const regexPattern = new RegExp('^' + escaped.replace(/\*/g, '.*') + '$');
    let count = 0;

    for (const key of this.store.keys()) {
      if (regexPattern.test(key)) {
        this.store.delete(key);
        count++;
      }
    }

    if (count > 0) {
      logger.debug(`Cache invalidated ${count} keys matching pattern: ${pattern}`);
    }
    return count;
  }

  /**
   * Cache-aside pattern helper.
   * Returns cached value if available and bypass is false.
   * Otherwise executes fetcher(), stores in cache, and returns fresh value.
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T> | T,
    ttlSeconds = 300,
    bypass = false
  ): Promise<{ data: T; hit: boolean }> {
    if (!bypass) {
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return { data: cached, hit: true };
      }
    }

    const fresh = await fetcher();
    await this.set<T>(key, fresh, ttlSeconds);
    return { data: fresh, hit: false };
  }

  /**
   * Flush all keys (testing utility).
   */
  clear(): void {
    this.store.clear();
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}

export const globalCache = new CacheService();
