/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * HTTP Integration Tests: the real Express app (src/api.ts) on an in-memory, seeded database.
 * Covers what only shows up over HTTP: authentication on every route, tenant isolation,
 * boundary validation, the signed webhook, rate limits and the error envelope.
 */

import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Request, Response } from 'express';
import { createApp } from '../../src/api.ts';
import { env } from '../../src/config/env.ts';
import { getDb } from '../../src/db/index.ts';
import { seedDatabase } from '../../src/db/seed.ts';
import { rateLimit } from '../../src/routes/middleware.ts';
import { issueToken } from '../../src/services/auth.ts';
import { HttpError } from '../../src/services/permissions.ts';
import { assert } from '../assert.ts';

console.log('--- RUNNING NAIAD HTTP INTEGRATION TESTS ---');

const db = getDb(':memory:');
seedDatabase(db); // two organizations; coordinators sign in with the demo password
const server = createApp({ db }).listen(0);
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

interface Reply {
  status: number;
  headers: Headers;
  // Response bodies are checked field by field below.
  body: any;
}

async function call(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> } = {},
  origin = baseUrl
): Promise<Reply> {
  const hasBody = options.body !== undefined || options.rawBody !== undefined;
  const response = await fetch(origin + path, {
    method,
    redirect: 'manual',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON: keep the text
  }
  return { status: response.status, headers: response.headers, body };
}

const isError = (reply: Reply, status: number, code: string) =>
  reply.status === status && reply.body?.error?.code === code && String(reply.body.error.requestId).startsWith('req_');

// ============================================================================
// 1. Nothing under /api/v1 works without a valid token
// ============================================================================
assert(isError(await call('GET', '/api/v1/request-missions'), 401, 'UNAUTHENTICATED'), 'No token: 401 UNAUTHENTICATED in the standard envelope');
assert(
  isError(
    await call('GET', '/api/v1/request-missions', {
      headers: { 'x-user-id': 'usr-coi-1', 'x-organization-id': 'org-coimbra-01', 'x-user-role': 'coordinator' },
    }),
    401,
    'UNAUTHENTICATED'
  ),
  'Identity headers are not trusted: claiming to be a coordinator without a token is a 401'
);
assert(isError(await call('GET', '/api/v1/request-missions', { token: 'not.a.token' }), 401, 'UNAUTHENTICATED'), 'A made-up token is a 401');
assert(
  isError(await call('GET', '/api/v1/request-missions', { token: issueToken('usr-coi-1', -60) }), 401, 'UNAUTHENTICATED'),
  'An expired token is a 401'
);
for (const [method, path] of [
  ['GET', '/api/v1/reaches'],
  ['POST', '/api/v1/storage/upload-url'],
  ['GET', '/api/v1/storage/download-url/abc'],
  ['GET', '/api/v1/jobs/failed'],
  ['GET', '/api/v1/account/export'],
  ['DELETE', '/api/v1/account'],
]) {
  assert((await call(method, path)).status === 401, `${method} ${path} requires a token`);
}

const cities = await call('GET', '/api/v1/cities');
const health = await call('GET', '/api/health');
assert(cities.status === 200 && health.status === 200 && health.body.status === 'ok', 'Reference data and health stay public');
assert(
  health.headers.get('x-content-type-options') === 'nosniff' && String(health.headers.get('x-request-id')).startsWith('req_'),
  'Responses carry the security headers and a request id'
);

// ============================================================================
// 2. Volunteers join with a nickname; coordinators sign in with a password
// ============================================================================
const joined = await call('POST', '/api/v1/auth/join', { body: { cityId: 'coimbra', nickname: 'River_Otter' } });
assert(
  joined.status === 201 && typeof joined.body.data.token === 'string' && joined.body.data.user.role === 'citizen',
  'A volunteer joins with a nickname and gets a token (201)'
);
assert(joined.headers.get('cache-control') === 'no-store', 'Sign-in responses are never cached');
const volunteerToken: string = joined.body.data.token;

const badNickname = await call('POST', '/api/v1/auth/join', { body: { cityId: 'coimbra', nickname: '<script>' } });
assert(isError(badNickname, 400, 'VALIDATION_FAILED') && badNickname.body.error.details[0].field === 'nickname', 'An invalid nickname is a 400 naming the field');
assert(isError(await call('POST', '/api/v1/auth/join', { body: { cityId: 'coimbra', nickname: 'river_otter' } }), 409, 'CONFLICT'), 'A taken nickname is a 409');
assert(isError(await call('POST', '/api/v1/auth/join', { body: { cityId: 'atlantis', nickname: 'Mermaid' } }), 404, 'NOT_FOUND'), 'A city without an organization is a 404');

assert(
  isError(await call('POST', '/api/v1/auth/login', { body: { email: 'manuel.silva@coimbra.example', password: 'wrong' } }), 401, 'INVALID_CREDENTIALS'),
  'A wrong password is a 401 INVALID_CREDENTIALS'
);
const login = async (email: string): Promise<string> =>
  (await call('POST', '/api/v1/auth/login', { body: { email, password: 'naiad-demo' } })).body.data.token;
const coordinatorToken = await login('manuel.silva@coimbra.example');
const toulouseToken = await login('claire.dubois@toulouse.example');
assert(Boolean(coordinatorToken && toulouseToken), 'Both seeded coordinators sign in with the demo password');

// ============================================================================
// 3. Roles and tenants come from the token's user
// ============================================================================
const volunteerList = await call('GET', '/api/v1/request-missions', { token: volunteerToken });
assert(
  volunteerList.status === 200 && volunteerList.body.data.length === 1 && volunteerList.body.data[0].organizationId === 'org-coimbra-01',
  "A volunteer lists their own organization's missions"
);

const newMission = { reachId: 'coi:r01', source: 'weather', reason: 'Check runoff after the storm', targetGroup: 'water' };
assert(isError(await call('POST', '/api/v1/request-missions', { token: volunteerToken, body: newMission }), 403, 'FORBIDDEN'), 'A volunteer cannot create a mission (403)');
assert(isError(await call('GET', '/api/v1/jobs/failed', { token: volunteerToken }), 403, 'FORBIDDEN'), 'A volunteer cannot read the failed job queue (403)');

const created = await call('POST', '/api/v1/request-missions', { token: coordinatorToken, body: newMission });
assert(
  created.status === 201 && created.headers.get('location') === `/api/v1/request-missions/${created.body.data.id}`,
  'A coordinator creates a mission (201 with Location)'
);
assert(
  isError(await call('POST', '/api/v1/request-missions', { token: coordinatorToken, body: { ...newMission, reason: 'x' } }), 400, 'VALIDATION_FAILED'),
  'An invalid mission is a 400'
);
assert(
  isError(await call('GET', `/api/v1/request-missions/${created.body.data.id}`, { token: toulouseToken }), 404, 'NOT_FOUND'),
  "Another organization's coordinator cannot see the mission (404)"
);
assert(
  isError(await call('POST', '/api/v1/request-missions', { token: toulouseToken, body: newMission }), 404, 'NOT_FOUND'),
  "A coordinator cannot target another organization's reach (404)"
);

db.prepare("INSERT INTO background_jobs (id, name, payload_json, status, last_error) VALUES ('job-1', 'send_email', '{\"to\":\"someone@example.org\"}', 'failed', 'SMTP down')").run();
const failedJobs = await call('GET', '/api/v1/jobs/failed', { token: coordinatorToken });
assert(
  failedJobs.status === 200 && failedJobs.body.count === 1 && failedJobs.body.data[0].last_error === 'SMTP down' && !('payload_json' in failedJobs.body.data[0]),
  'A coordinator reads failed jobs, without their payloads'
);

// ============================================================================
// 3b. List endpoints: validated query parameters, and a cache a caller cannot corrupt
// ============================================================================
const list = (query: string, token = volunteerToken, headers?: Record<string, string>) =>
  call('GET', `/api/v1/request-missions${query}`, { token, headers });

for (const query of ['?source=all', '?source[]=weather', '?reachId[x]=1', '?limit=abc', '?limit=0', '?limit=101', '?cursor=']) {
  assert(isError(await list(query), 400, 'VALIDATION_FAILED'), `Mission list ${query} is a 400`);
}
for (const query of ['?city=constructor', '?city=__proto__', '?city[]=coimbra', '?city=atlantis', '?limit=0', '?offset=-1']) {
  assert(
    isError(await call('GET', `/api/v1/reaches${query}`, { token: volunteerToken }), 400, 'VALIDATION_FAILED'),
    `Reach list ${query} is a 400`
  );
}
const reachPage = await call('GET', '/api/v1/reaches?city=toulouse&limit=3&offset=2', { token: volunteerToken });
assert(
  reachPage.status === 200 && reachPage.body.city === 'toulouse' && reachPage.body.data.length === 3 && reachPage.body.pagination.offset === 2,
  'The reach list pages through a known city'
);

// A filter that matches nothing must not replace what the unfiltered list shows.
await list('?reachId=all');
await list('?reachId=all', volunteerToken, { 'X-Cache-Bypass': 'true' });
const unfiltered = await list('', coordinatorToken);
assert(unfiltered.body.data.length === 2, 'A filtered request cannot overwrite the cached unfiltered list');

const firstRead = await list('?source=weather');
const secondRead = await list('?source=weather');
assert(
  firstRead.headers.get('x-cache') === 'MISS' && secondRead.headers.get('x-cache') === 'HIT' && secondRead.body.data.length === 2,
  'A first page is served from the cache the second time'
);

const pageOne = await list('?limit=1');
const pageOneAgain = await list('?limit=1');
const pageTwo = await list(`?limit=1&cursor=${encodeURIComponent(pageOne.body.pagination.nextCursor)}`);
assert(
  pageOne.body.pagination.hasMore === true && pageTwo.body.data.length === 1 && pageTwo.body.data[0].id !== pageOne.body.data[0].id,
  'A cursor continues the list where the previous page ended'
);
assert(
  pageOneAgain.headers.get('x-cache') === 'MISS' && pageTwo.headers.get('x-cache') === 'MISS',
  'Pages with their own size or a cursor are not cached'
);

// ============================================================================
// 4. Storage: validated input, tenant taken from the token
// ============================================================================
const photo = { filename: 'river.webp', mimeType: 'image/webp', sizeBytes: 245_000 };
const invalidUpload = await call('POST', '/api/v1/storage/upload-url', { token: volunteerToken, body: { filename: '', sizeBytes: 'big' } });
assert(
  isError(invalidUpload, 400, 'VALIDATION_FAILED') && invalidUpload.body.error.details.length === 3,
  'A malformed upload request is a 400 listing each bad field'
);
assert(isError(await call('POST', '/api/v1/storage/upload-url', { token: volunteerToken, body: { ...photo, mimeType: 'text/html' } }), 400, 'VALIDATION_FAILED'), 'A file type that is not an image is a 400');
assert(isError(await call('POST', '/api/v1/storage/upload-url', { token: volunteerToken, body: { ...photo, sizeBytes: 99_000_000 } }), 413, 'PAYLOAD_TOO_LARGE'), 'A file over 10 MB is a 413');
assert(isError(await call('POST', '/api/v1/storage/upload-url', { token: volunteerToken, body: { ...photo, reachId: 'tou:r01' } }), 404, 'NOT_FOUND'), "A photo cannot be attached to another organization's reach (404)");

const upload = await call('POST', '/api/v1/storage/upload-url', {
  token: volunteerToken,
  body: { ...photo, reachId: 'coi:r01', organizationId: 'org-toulouse-02', userId: 'usr-tou-1' },
  headers: { 'x-organization-id': 'org-toulouse-02' },
});
assert(
  upload.status === 200 && upload.body.storagePath.startsWith('organizations/org-coimbra-01/uploads/'),
  "An upload ticket is always scoped to the caller's own organization, whatever the request claims"
);
assert((await call('GET', `/api/v1/storage/download-url/${upload.body.fileId}`, { token: coordinatorToken })).status === 200, 'The same organization can fetch a download URL');
assert(
  isError(await call('GET', `/api/v1/storage/download-url/${upload.body.fileId}?orgId=org-coimbra-01`, { token: toulouseToken }), 404, 'NOT_FOUND'),
  'Another organization gets a 404 for the file, even when it names the owner'
);

// ============================================================================
// 5. Stripe webhook: the signature is mandatory and covers the raw body
// ============================================================================
const signed = (rawBody: string, secret = env.STRIPE_WEBHOOK_SECRET, at = Math.floor(Date.now() / 1000)) => ({
  rawBody,
  headers: { 'stripe-signature': `t=${at},v1=${crypto.createHmac('sha256', secret).update(`${at}.${rawBody}`).digest('hex')}` },
});
const planOf = (orgId: string) =>
  (db.prepare('SELECT subscription_plan FROM organizations WHERE id = ?').get(orgId) as { subscription_plan: string }).subscription_plan;

// Deliberately not what JSON.stringify would produce: only the raw bytes can match the signature.
const upgrade = `{\n  "type": "customer.subscription.updated",\n  "id": "evt_http_1",\n  "data": { "object": { "client_reference_id": "org-coimbra-01", "metadata": { "plan_tier": "enterprise" } } }\n}`;

assert(isError(await call('POST', '/api/v1/webhooks/stripe', { rawBody: upgrade }), 400, 'INVALID_SIGNATURE'), 'An unsigned webhook is refused (400)');
assert(isError(await call('POST', '/api/v1/webhooks/stripe', signed(upgrade, 'whsec_not_the_real_secret')), 400, 'INVALID_SIGNATURE'), 'A webhook signed with the wrong secret is refused');
assert(
  isError(await call('POST', '/api/v1/webhooks/stripe', signed(upgrade, env.STRIPE_WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 3600)), 400, 'INVALID_SIGNATURE'),
  'A webhook signed an hour ago is refused (replay window)'
);
assert(planOf('org-coimbra-01') === 'standard', 'Refused webhooks change nothing');

const processed = await call('POST', '/api/v1/webhooks/stripe', signed(upgrade));
assert(processed.status === 200 && processed.body.status === 'processed' && planOf('org-coimbra-01') === 'enterprise', 'A signed webhook is processed against its raw body and upgrades the plan');
assert((await call('POST', '/api/v1/webhooks/stripe', signed(upgrade))).body.status === 'already_processed', 'Replaying the event is acknowledged without applying it twice');
assert(isError(await call('POST', '/api/v1/webhooks/stripe', signed('{"id":"evt_http_2"}')), 400, 'VALIDATION_FAILED'), 'A signed event with missing fields is a 400, not a crash');
assert(isError(await call('POST', '/api/v1/webhooks/stripe', signed('not json')), 400, 'VALIDATION_FAILED'), 'A signed body that is not JSON is a 400');

// ============================================================================
// 6. Errors: unknown routes and bad JSON stay inside the envelope
// ============================================================================
assert(isError(await call('GET', '/api/v1/no-such-route', { token: coordinatorToken }), 404, 'NOT_FOUND'), 'An unknown API route is a JSON 404');
assert(isError(await call('GET', '/api/no-such-route'), 404, 'NOT_FOUND'), 'An unknown /api path outside v1 is a JSON 404 too');
assert(isError(await call('POST', '/api/v1/auth/join', { rawBody: '{nope' }), 400, 'VALIDATION_FAILED'), 'Malformed JSON is a 400 in the standard envelope');

// ============================================================================
// 7. GDPR: export and erase the caller's own account
// ============================================================================
const exported = await call('GET', '/api/v1/account/export', { token: volunteerToken });
assert(exported.status === 200 && exported.body.profile.nickname === 'River_Otter', 'A volunteer exports their own data');
assert((await call('DELETE', '/api/v1/account', { token: volunteerToken })).status === 200, 'A volunteer erases their own account');
assert(isError(await call('GET', '/api/v1/request-missions', { token: volunteerToken }), 401, 'UNAUTHENTICATED'), "The erased account's token stops working");

// ============================================================================
// 8. Rate limits
// ============================================================================
const limiter = rateLimit({ windowMs: 40, max: 2 });
const hit = () => {
  let outcome: unknown;
  const retryAfter: Record<string, unknown> = {};
  limiter(
    { ip: '203.0.113.9' } as Request,
    { setHeader: (name: string, value: unknown) => (retryAfter[name] = value) } as unknown as Response,
    (err?: unknown) => (outcome = err)
  );
  return { outcome, retryAfter };
};
hit();
hit();
const third = hit();
assert(
  third.outcome instanceof HttpError && third.outcome.statusCode === 429 && third.retryAfter['Retry-After'] === 1,
  'The request over the limit is a 429 with Retry-After'
);
await new Promise((resolve) => setTimeout(resolve, 60));
assert(hit().outcome === undefined, 'The limit resets when its window ends');

let lastLogin: Reply | undefined;
for (let attempt = 0; attempt < 21; attempt++) {
  lastLogin = await call('POST', '/api/v1/auth/login', { body: { email: 'manuel.silva@coimbra.example', password: `guess-${attempt}` } });
}
assert(
  lastLogin !== undefined && isError(lastLogin, 429, 'RATE_LIMITED') && Number(lastLogin.headers.get('retry-after')) > 0,
  'Password guessing is cut off with 429 RATE_LIMITED'
);

// ============================================================================
// 9. A draining server turns requests away but still answers its readiness probe
// ============================================================================
const draining = createApp({ db, isShuttingDown: () => true }).listen(0);
const drainingUrl = `http://127.0.0.1:${(draining.address() as AddressInfo).port}`;
assert(isError(await call('GET', '/api/v1/cities', {}, drainingUrl), 503, 'SERVER_SHUTTING_DOWN'), 'A draining server answers 503 SERVER_SHUTTING_DOWN');
const drainingHealth = await call('GET', '/api/health', {}, drainingUrl);
assert(drainingHealth.status === 503 && drainingHealth.body.status === 'unhealthy', 'Its readiness probe reports unhealthy');

draining.close();
server.close();
console.log('\n✅ ALL HTTP INTEGRATION TESTS PASSED!\n');
