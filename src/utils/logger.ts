/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Centralized Structured Redacting Logger
 * Features:
 * - JSON output across all log levels (debug, info, warn, error)
 * - Automatic Request Context via AsyncLocalStorage (request_id, user_id, organization_id)
 * - Automatic redaction of sensitive credentials (password, token, secret, auth) and PII (email, phone, ssn, card, ip)
 * - Silent debug logging in production
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from '../config/env.ts';

export interface LogContext {
  requestId?: string;
  userId?: string;
  organizationId?: string;
}

export const logContextStore = new AsyncLocalStorage<LogContext>();

export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  return logContextStore.run(context, fn);
}

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /auth(?:orization)?/i,
  /cookie/i,
  /api[_-]?key/i,
  /bearer/i,
  /creditCard/i,
  /cardNumber/i,
  /cvv/i,
  /ssn/i,
  /taxId/i,
  /phone(?:Number)?/i,
  /email/i,
  /dateOfBirth|dob/i,
  /address|postalCode/i,
  /gps|latitude|longitude/i,
  /ipAddress|^ip$/i,
];

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,7}\b/g;
const TOKEN_PATTERN = /\b(?:sk_live|rk_live|whsec|ghp|bearer|token_test_)\w{8,}\b/gi;
const IP_PATTERN = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;

/**
 * Recursively redacts sensitive keys and values from an arbitrary data structure.
 */
export function redactSensitiveData(data: any, depth = 0): any {
  if (depth > 6) return '[MAX_DEPTH_REACHED]';
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    return data
      .replace(EMAIL_PATTERN, '[EMAIL_REDACTED]')
      .replace(TOKEN_PATTERN, '[SECRET_REDACTED]')
      .replace(IP_PATTERN, '[IP_REDACTED]');
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof data === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEY_PATTERNS.some((pat) => pat.test(key))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = redactSensitiveData(value, depth + 1);
      }
    }
    return sanitized;
  }

  return String(data);
}

function formatLogLine(level: string, message: string, meta?: any): string {
  const context = logContextStore.getStore() || {};
  const sanitizedMeta = meta ? redactSensitiveData(meta) : undefined;

  const entry: Record<string, any> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    request_id: context.requestId || sanitizedMeta?.requestId || undefined,
    user_id: context.userId || sanitizedMeta?.userId || undefined,
    organization_id: context.organizationId || sanitizedMeta?.organizationId || undefined,
  };

  if (sanitizedMeta) {
    entry.data = sanitizedMeta;
  }

  return JSON.stringify(entry);
}

export const logger = {
  info(message: string, meta?: any) {
    console.log(formatLogLine('INFO', message, meta));
  },

  warn(message: string, meta?: any) {
    console.warn(formatLogLine('WARN', message, meta));
  },

  error(message: string, error?: any) {
    const errorDetails = error instanceof Error
      ? { message: error.message, name: error.name, stack: error.stack }
      : error;
    console.error(formatLogLine('ERROR', message, errorDetails));
  },

  debug(message: string, meta?: any) {
    // debug level is completely OFF in production
    if (env.NODE_ENV === 'production') {
      return;
    }
    console.debug(formatLogLine('DEBUG', message, meta));
  },
};
