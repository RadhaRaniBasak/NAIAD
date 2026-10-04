/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Authentication Test Suite
 * 1. Signed tokens: forgery, tampering, expiry, algorithm confusion
 * 2. Password hashing
 * 3. Volunteer join, coordinator sign-in, and identity resolved from the database
 * 4. The seed script's production rules
 */

import crypto from 'node:crypto';
import { assert, caught } from '../../../test/assert.ts';
import { getDb } from '../../db/index.ts';
import { seedDatabase } from '../../db/seed.ts';
import { AuthService, hashPassword, issueToken, verifyPassword, verifyToken } from '../auth.ts';
import { HttpError } from '../permissions.ts';

console.log('--- RUNNING AUTHENTICATION TESTS ---');

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** The HttpError a rejected promise carries, or undefined if it resolved or failed some other way. */
async function rejection(promise: Promise<unknown>): Promise<HttpError | undefined> {
  try {
    await promise;
  } catch (err) {
    return err instanceof HttpError ? err : undefined;
  }
  return undefined;
}

// ============================================================================
// 1. Tokens
// ============================================================================
const now = 1_800_000_000_000;
const token = issueToken('usr-1', 3600, now);
const [header, payload, signature] = token.split('.');

assert(verifyToken(token, now) === 'usr-1', 'A freshly issued token verifies to its user');
assert(verifyToken(token, now + 3599_000) === 'usr-1', 'The token is valid until it expires');
assert(verifyToken(token, now + 3600_000) === null, 'An expired token is rejected');

const otherPayload = base64url({ sub: 'usr-admin', iat: 1, exp: 9_999_999_999 });
assert(verifyToken(`${header}.${otherPayload}.${signature}`, now) === null, 'A token whose payload was swapped is rejected');
// Change one character to a different one (a fixed replacement could equal the original).
const alteredSignature = (signature.startsWith('A') ? 'B' : 'A') + signature.slice(1);
assert(verifyToken(`${header}.${payload}.${alteredSignature}`, now) === null, 'A token with an altered signature is rejected');

const forged = crypto.createHmac('sha256', 'a-secret-the-server-does-not-use').update(`${header}.${otherPayload}`).digest('base64url');
assert(verifyToken(`${header}.${otherPayload}.${forged}`, now) === null, 'A token signed with another secret is rejected');

const noneHeader = base64url({ alg: 'none', typ: 'JWT' });
assert(
  verifyToken(`${noneHeader}.${otherPayload}.`, now) === null && verifyToken(`${noneHeader}.${otherPayload}.${signature}`, now) === null,
  'An unsigned "alg: none" token is rejected'
);
assert(
  ['', 'abc', 'a.b', `${token}.extra`].every((bad) => verifyToken(bad, now) === null),
  'Malformed tokens are rejected without throwing'
);

// ============================================================================
// 2. Passwords
// ============================================================================
const hash = hashPassword('correct horse battery staple');
assert(hash.startsWith('scrypt$16384$8$5$'), 'Password hashes record their scrypt cost');
assert(hash !== hashPassword('correct horse battery staple'), 'The same password hashes differently each time (random salt)');
assert(await verifyPassword('correct horse battery staple', hash), 'The right password verifies');
assert(!(await verifyPassword('correct horse battery stapler', hash)), 'A wrong password does not verify');
assert(
  !(await verifyPassword('anything', 'not-a-hash')) && !(await verifyPassword('anything', 'scrypt$0$0$0$AAAA$AAAA')),
  'An unusable stored hash never verifies'
);

// ============================================================================
// 3. Sessions
// ============================================================================
const db = getDb(':memory:');
db.exec(`
  INSERT INTO organizations (id, name, slug, primary_city_id, subscription_plan)
  VALUES ('org-coimbra', 'Coimbra Water', 'coi', 'coimbra', 'standard');

  INSERT INTO users (id, organization_id, nickname, email, role)
  VALUES ('usr-coord', 'org-coimbra', 'Dr_Manuel_Silva', 'manuel.silva@coimbra.example', 'coordinator');
`);
const auth = new AuthService(db);
auth.setPassword('usr-coord', 'river-keeper-42');

// 3.1 Volunteers join with a nickname (ADR 002)
const volunteer = auth.joinAsVolunteer('coimbra', 'River_Otter');
assert(
  volunteer.user.role === 'citizen' && volunteer.user.organizationId === 'org-coimbra' && volunteer.user.nickname === 'River_Otter',
  'A volunteer joins the organization of their city as a citizen'
);
const volunteerContext = auth.authenticate(volunteer.token);
assert(
  volunteerContext?.userId === volunteer.user.id &&
    volunteerContext.organizationId === 'org-coimbra' &&
    volunteerContext.role === 'citizen' &&
    volunteerContext.subscriptionPlan === 'standard',
  "The volunteer's token resolves to their user, organization, role and plan"
);

const duplicate = caught(() => auth.joinAsVolunteer('coimbra', 'river_otter'));
assert(duplicate instanceof HttpError && duplicate.statusCode === 409, 'A nickname already in use (in any letter case) is refused with 409');
const nowhere = caught(() => auth.joinAsVolunteer('atlantis', 'Mermaid'));
assert(nowhere instanceof HttpError && nowhere.statusCode === 404, 'Joining a city no organization serves is a 404');

// 3.2 Coordinators sign in with email and password
const coordinator = await auth.login('Manuel.Silva@coimbra.example', 'river-keeper-42');
assert(coordinator.user.id === 'usr-coord' && coordinator.user.role === 'coordinator', 'A coordinator signs in with email (any letter case) and password');
assert(auth.authenticate(coordinator.token)?.role === 'coordinator', "The coordinator's token resolves to the coordinator role");

const wrongPassword = await rejection(auth.login('manuel.silva@coimbra.example', 'river-keeper-43'));
const unknownEmail = await rejection(auth.login('nobody@coimbra.example', 'river-keeper-42'));
assert(
  wrongPassword?.statusCode === 401 && wrongPassword.code === 'INVALID_CREDENTIALS',
  'A wrong password is refused with 401 INVALID_CREDENTIALS'
);
assert(
  unknownEmail?.statusCode === 401 && unknownEmail.message === wrongPassword?.message,
  'An unknown email gets the same answer as a wrong password'
);

db.prepare("UPDATE users SET email = 'otter@example.org' WHERE id = ?").run(volunteer.user.id);
assert(
  (await rejection(auth.login('otter@example.org', '')))?.statusCode === 401,
  'An account without a password cannot sign in with one'
);

// 3.3 Identity comes from the database, not from the token
db.prepare("UPDATE users SET role = 'crew_leader' WHERE id = ?").run(volunteer.user.id);
db.prepare("UPDATE organizations SET subscription_plan = 'enterprise' WHERE id = 'org-coimbra'").run();
const promoted = auth.authenticate(volunteer.token);
assert(
  promoted?.role === 'crew_leader' && promoted.subscriptionPlan === 'enterprise',
  'A role or plan change applies to tokens that were already issued'
);

assert(auth.authenticate(issueToken('usr-ghost', 3600)) === null, 'A valid token for a user that does not exist is rejected');
assert(auth.authenticate('not-a-token') === null, 'A string that is not a token is rejected');

db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(volunteer.user.id);
assert(auth.authenticate(volunteer.token) === null, "A deactivated user's token stops working at once");

db.prepare("UPDATE organizations SET is_active = 0 WHERE id = 'org-coimbra'").run();
assert(auth.authenticate(coordinator.token) === null, 'Tokens of a deactivated organization stop working');
assert(
  (await rejection(auth.login('manuel.silva@coimbra.example', 'river-keeper-42')))?.statusCode === 401,
  'Nobody can sign in to a deactivated organization'
);

// ============================================================================
// 4. Seeding a production database
// ============================================================================
// The seed sets the coordinators' password and starts by emptying the tenant tables.
// (Last in this file: it changes NODE_ENV for the rest of the process.)
process.env.NODE_ENV = 'production';
const production = getDb(':memory:');
assert(
  String(caught(() => seedDatabase(production))).includes('SEED_COORDINATOR_PASSWORD'),
  'A production seed refuses the public demo password'
);

process.env.SEED_COORDINATOR_PASSWORD = 'river-keeper-42';
seedDatabase(production);
assert(
  (await new AuthService(production).login('manuel.silva@coimbra.example', 'river-keeper-42')).user.role === 'coordinator',
  'A production seed gives the coordinators the password that was chosen'
);
assert(
  String(caught(() => seedDatabase(production))).includes('already has data'),
  'A production seed refuses a database that already has data'
);

console.log('\n✅ ALL AUTHENTICATION TESTS PASSED!\n');
