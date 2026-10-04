/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Security & GDPR Verification Suite
 * Tests:
 * 1. AES-256-GCM Field-Level Encryption & Decryption
 * 2. Log Redaction of Passwords, Tokens, API Keys, and Emails
 * 3. GDPR Article 20: Data Portability JSON Export
 * 4. GDPR Article 17: Right to Erasure & Scientific Observation Anonymization
 */

import { assert, caught } from '../../../test/assert.ts';
import { getDb } from '../../db/index.ts';
import { encryptField, decryptField } from '../../utils/crypto.ts';
import { redactSensitiveData } from '../../utils/logger.ts';
import { GdprService } from '../gdpr.service.ts';
import { type AuthContext, ForbiddenError } from '../permissions.ts';

console.log('--- STARTING SECURITY ENCRYPTION, REDACTION & GDPR TESTS ---');

// ============================================================================
// 1. AES-256-GCM Field-Level Encryption
// ============================================================================
console.log('\n--- 1. Testing Field Encryption at Rest ---');

const sensitiveEmail = 'volunteer-lead@example.org';
const encryptedEmail = encryptField(sensitiveEmail);

assert(encryptedEmail.startsWith('enc:v1:'), 'Encryption produces versioned ciphertext prefix enc:v1:');
assert(!encryptedEmail.includes(sensitiveEmail), 'Ciphertext does not leak plaintext email');

const decryptedEmail = decryptField(encryptedEmail);
assert(decryptedEmail === sensitiveEmail, 'Decryption reproduces exact original plaintext string');

// Idempotent encryption check
const doubleEncrypted = encryptField(encryptedEmail);
assert(doubleEncrypted === encryptedEmail, 'encryptField is idempotent on already-encrypted strings');

// Blank/null handling
assert(encryptField('') === '', 'Empty string returns empty string');
assert(decryptField('') === '', 'Empty string decrypts to empty string');

// Tamper resistance (authenticated encryption auth tag check)
// Flip the last hex digit (a fixed replacement could equal the original).
const tampered = encryptedEmail.slice(0, -1) + (encryptedEmail.endsWith('0') ? '1' : '0');
assert(caught(() => decryptField(tampered)) !== undefined, 'Tampered ciphertext or auth tag fails decryption');

// ============================================================================
// 2. Structured Log Redaction
// ============================================================================
console.log('\n--- 2. Testing Log Redaction ---');

const sensitiveLogPayload = {
  user: {
    name: 'Maria Santos',
    email: 'maria.santos@coimbra-watch.example',
    password: 'SuperSecretPassword123!',
    // Made-up values, written in two halves so that no secret scanner reads them as real keys
    api_token: 'sk_' + 'live_99887766554433221100aa',
    authHeader: 'Bearer ' + 'ghp_' + 'abcdef1234567890abcdef1234567890',
  },
  safeData: {
    turbidityNtu: 4.2,
    reachId: 'coi:r01',
  },
};

const redacted = redactSensitiveData(sensitiveLogPayload);

assert(redacted.user.password === '[REDACTED]', 'Password field masked with [REDACTED]');
assert(redacted.user.api_token === '[REDACTED]', 'API token field masked with [REDACTED]');
assert(redacted.user.authHeader === '[REDACTED]', 'Auth header field masked with [REDACTED]');
assert(redacted.safeData.turbidityNtu === 4.2, 'Safe non-sensitive data left unmasked');
assert(redacted.safeData.reachId === 'coi:r01', 'Domain IDs left unmasked');

// Direct string redaction test
const stringLog = 'User logged in with email volunteer@naiad.example.org and token ' + 'sk_' + 'live_12345678901234567890';
const redactedString = redactSensitiveData(stringLog);
assert(redactedString.includes('[EMAIL_REDACTED]'), 'String emails replaced with [EMAIL_REDACTED]');
assert(redactedString.includes('[SECRET_REDACTED]'), 'String secrets replaced with [SECRET_REDACTED]');

// ============================================================================
// 3. GDPR Data Portability & Erasure
// ============================================================================
console.log('\n--- 3. Testing GDPR Services ---');

const db = getDb(':memory:');

// Seed organization, reach, access point, user and ground-truth checks
db.exec(`
  INSERT INTO organizations (id, name, slug, primary_city_id)
  VALUES ('org-coimbra-01', 'Mondego River Watch', 'mondego-watch', 'coimbra');

  INSERT INTO reaches (id, organization_id, name, city_id, length_meters, topo_index, geometry_json)
  VALUES ('coi:r01', 'org-coimbra-01', 'Upper Coselhas Reach', 'coimbra', 300, 0, '{}');

  INSERT INTO access_points (id, organization_id, reach_id, name, kind, latitude, longitude)
  VALUES ('ap-01', 'org-coimbra-01', 'coi:r01', 'Coselhas Bridge', 'bridge', 40.21, -8.42);

  INSERT INTO users (id, organization_id, nickname, email, role)
  VALUES ('usr-test-1', 'org-coimbra-01', 'Coimbra Stream Scout', '${encryptedEmail}', 'citizen');

  INSERT INTO user_credentials (user_id, password_hash) VALUES ('usr-test-1', 'scrypt$placeholder');

  INSERT INTO checks (
    id, organization_id, idempotency_key, reach_id, access_point_id, user_id,
    groups_checked, answers_json, derived_signs, latitude, longitude, accuracy_meters,
    points_awarded, freshness_before, freshness_after
  ) VALUES (
    'chk-01', 'org-coimbra-01', 'idem-test-101', 'coi:r01', 'ap-01', 'usr-test-1',
    'water', '{"clarity":"clear"}', 'none', 40.21, -8.42, 5.0,
    50, 20, 100
  );
`);

const gdpr = new GdprService(db);

const userAuth: AuthContext = {
  userId: 'usr-test-1',
  organizationId: 'org-coimbra-01',
  role: 'citizen',
  subscriptionPlan: 'standard',
};

const otherUserAuth: AuthContext = {
  userId: 'usr-test-2',
  organizationId: 'org-coimbra-01',
  role: 'citizen',
  subscriptionPlan: 'standard',
};

// 3.1 GDPR Portability Export
const exportData = gdpr.exportUserData(userAuth, 'usr-test-1');
assert(exportData.exportMetadata.userId === 'usr-test-1', 'Export metadata contains correct user ID');
assert(exportData.profile.nickname === 'Coimbra Stream Scout', 'Profile contains nickname');
assert(exportData.profile.email === sensitiveEmail, 'Profile decrypted email for export');
assert(exportData.activity.checksSubmitted.length === 1, 'Export bundles all checks submitted');

// Unauthorized user export check
assert(
  caught(() => gdpr.exportUserData(otherUserAuth, 'usr-test-1')) instanceof ForbiddenError,
  'ForbiddenError: Other volunteer cannot export target user data'
);

// 3.2 GDPR Right to Erasure / Anonymization
const deletionResult = gdpr.deleteAccount(userAuth, 'usr-test-1');
assert(deletionResult.success === true, 'Account erasure reported success');
assert(deletionResult.anonymizedChecksCount === 1, 'One check record anonymized');

// Verify check record user_id is changed to anonymous science user
const anonymizedCheck = db.prepare('SELECT user_id, groups_checked FROM checks WHERE id = ?').get('chk-01') as Record<string, unknown>;
assert(anonymizedCheck.user_id === 'usr_anonymized_science', 'Check user_id reassigned to usr_anonymized_science');
assert(anonymizedCheck.groups_checked === 'water', 'Scientific ground truth data preserved for river health');

// Verify user record is scrubbed
const scrubbedUser = db.prepare('SELECT nickname, email, deleted_at, is_active FROM users WHERE id = ?').get('usr-test-1') as Record<string, unknown>;
assert(String(scrubbedUser.nickname).startsWith('Deleted User'), 'User nickname scrubbed to Deleted User');
assert(scrubbedUser.email === null, 'User email scrubbed to NULL');
assert(scrubbedUser.is_active === 0, 'User marked inactive');
assert(scrubbedUser.deleted_at !== null, 'User marked with deleted_at timestamp');
assert(
  db.prepare('SELECT 1 FROM user_credentials WHERE user_id = ?').get('usr-test-1') === undefined,
  'Stored password removed with the account'
);

// A second erasure in the same organization (ids that start alike must not collide on the scrubbed nickname)
db.exec(`
  INSERT INTO users (id, organization_id, nickname, role)
  VALUES ('usr-test-2', 'org-coimbra-01', 'Mondego Heron', 'citizen');
`);
assert(gdpr.deleteAccount(otherUserAuth, 'usr-test-2').success === true, 'A second account of the same organization can be erased too');

// An erasure that fails part-way changes nothing
db.exec(`
  INSERT INTO users (id, organization_id, nickname, role) VALUES ('usr-test-3', 'org-coimbra-01', 'Coselhas Kingfisher', 'citizen');
  INSERT INTO users (id, organization_id, nickname, role) VALUES ('usr-squatter', 'org-coimbra-01', 'Deleted User #usr-test-3', 'citizen');
  UPDATE checks SET user_id = 'usr-test-3' WHERE id = 'chk-01';
`);
const failedErasure = caught(() => gdpr.deleteAccount({ ...userAuth, userId: 'usr-test-3' }, 'usr-test-3'));
const untouched = db.prepare('SELECT user_id FROM checks WHERE id = ?').get('chk-01') as Record<string, unknown>;
assert(
  failedErasure !== undefined && untouched.user_id === 'usr-test-3',
  'An erasure that fails is rolled back completely'
);

console.log('\n✅ ALL SECURITY ENCRYPTION, REDACTION & GDPR TESTS PASSED!\n');
