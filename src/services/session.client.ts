/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Browser-side session for /api/v1 (see src/services/auth.ts for the server side).
 * The session from /api/v1/auth/join or /login is kept for the next visit and its token
 * is sent as `Authorization: Bearer <token>`.
 */

import type { Session } from './auth.ts';

const STORAGE_KEY = 'naiad.session';

let current: Session | null | undefined; // undefined until first read

export function getSession(): Session | null {
  if (current === undefined) {
    try {
      current = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    } catch {
      current = null; // storage unavailable or unreadable: start signed out
    }
  }
  return current && Date.parse(current.expiresAt) > Date.now() ? current : null;
}

export function setSession(session: Session | null): void {
  current = session;
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private browsing): the session still lasts until the page closes.
  }
}

/** fetch() that sends the session token. A 401 means the session is no longer valid, so it is dropped. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const session = getSession();
  const response = await fetch(path, {
    ...init,
    headers: { ...init.headers, ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
  });
  if (response.status === 401) setSession(null);
  return response;
}

/** Joins as a volunteer or signs in, stores the session and returns it. Rejects with the server's message. */
export async function signIn(
  request: { cityId: string; nickname: string } | { email: string; password: string }
): Promise<Session> {
  const response = await fetch(`/api/v1/auth/${'nickname' in request ? 'join' : 'login'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error?.details?.[0]?.issue ?? json.error?.message ?? `Sign-in failed (HTTP ${response.status})`);
  }

  setSession(json.data);
  return json.data;
}
