/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Naiad Multi-Tenant Database Client using Node.js 22 built-in SQLite engine.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.ts';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');
const SCHEMA_PATH = path.resolve(import.meta.dirname, 'schema.sql');

/** Where DATABASE_URL (`file:<path>`, relative to the repository root or absolute) puts the database. */
export const DB_PATH = path.resolve(ROOT_DIR, env.DATABASE_URL.slice('file:'.length));

function open(target: string): DatabaseSync {
  const db = new DatabaseSync(target);
  // busy_timeout: wait briefly for another process's lock (a backup, an operator's sqlite3
  // session) instead of failing the write at once.
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  // Apply the schema. Every statement is `IF NOT EXISTS`, so this is safe on every start;
  // it adds new tables and indexes but never alters an existing table.
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}

let dbInstance: DatabaseSync | null = null;

/**
 * Returns the shared application database, opening and migrating it on first use.
 * Passing a path (or ':memory:') opens a separate, fully migrated database instead.
 */
export function getDb(customPath?: string): DatabaseSync {
  if (customPath) return open(customPath);
  if (!dbInstance) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    dbInstance = open(env.NODE_ENV === 'test' ? ':memory:' : DB_PATH);
  }
  return dbInstance;
}
