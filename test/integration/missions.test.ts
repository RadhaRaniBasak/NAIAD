/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Integration Test Suite for MissionsService & API boundary
 * Testing:
 * - createMission, getMission, listMissions, updateMission, deleteMission
 * Matrix:
 * - Happy Path
 * - Invalid Input
 * - Boundary Values
 * - Permission Denied (403)
 * - Cross-Tenant Access (404)
 */

import { assert, caught } from '../assert.ts';
import { getDb } from '../../src/db/index.ts';
import { MissionsService } from '../../src/services/missions.service.ts';
import { type AuthContext, ForbiddenError, NotFoundError } from '../../src/services/permissions.ts';

console.log('--- STARTING MISSIONS DOMAIN SERVICE AUDIT & INTEGRATION TESTS ---');

// Setup isolated real database
const db = getDb(':memory:');

// Seed 2 organizations and 2 reaches
db.exec(`
  INSERT INTO organizations (id, name, slug, primary_city_id, subscription_plan)
  VALUES
    ('org-mondego', 'Mondego River Watch', 'mondego', 'coimbra', 'standard'),
    ('org-garonne', 'Garonne River Watch', 'garonne', 'toulouse', 'enterprise');

  INSERT INTO reaches (id, organization_id, name, city_id, length_meters, topo_index, geometry_json)
  VALUES
    ('mon:r01', 'org-mondego', 'Mondego Upper Reach', 'coimbra', 300, 0, '{}'),
    ('mon:r02', 'org-mondego', 'Mondego Middle Reach', 'coimbra', 280, 1, '{}'),
    ('gar:r01', 'org-garonne', 'Garonne Touch Reach', 'toulouse', 250, 0, '{}');
`);

const service = new MissionsService(db);

const mondegoCoordinator: AuthContext = {
  userId: 'usr-mon-coord',
  organizationId: 'org-mondego',
  role: 'coordinator',
  subscriptionPlan: 'standard',
};

const mondegoCitizen: AuthContext = {
  userId: 'usr-mon-cit',
  organizationId: 'org-mondego',
  role: 'citizen',
  subscriptionPlan: 'standard',
};

const garonneCoordinator: AuthContext = {
  userId: 'usr-gar-coord',
  organizationId: 'org-garonne',
  role: 'coordinator',
  subscriptionPlan: 'enterprise',
};

// ============================================================================
// 1. FUNCTION: createMission
// ============================================================================
console.log('\n--- 1. Testing createMission ---');

// 1.1 Happy path
const mission1 = service.createMission(mondegoCoordinator, {
  reachId: 'mon:r01',
  source: 'weather',
  reason: 'Inspect storm turbidity after 24mm rainfall event',
  targetGroup: 'water',
  priorityValue: 0.8,
  bountyCents: 500,
  pointsAward: 80,
  expiresInHours: 48,
});
assert(mission1.id.startsWith('mis_'), 'Happy path: mission created with ID prefix');
assert(mission1.organizationId === 'org-mondego', 'Happy path: mission scoped to tenant');

// 1.2 Boundary values (priority min 0.0, max 1.0, bounty 0)
const minBoundaryMission = service.createMission(mondegoCoordinator, {
  reachId: 'mon:r01',
  source: 'staleness',
  reason: 'Routine staleness check with 0 bounty and minimum priority',
  targetGroup: 'vegetation',
  priorityValue: 0.0,
  bountyCents: 0,
});
assert(minBoundaryMission.priorityValue === 0.0, 'Boundary: priorityValue clamped/accepted at 0.0');
assert(minBoundaryMission.bountyCents === 0, 'Boundary: bountyCents accepted at 0');

const maxBoundaryMission = service.createMission(mondegoCoordinator, {
  reachId: 'mon:r01',
  source: 'trace',
  reason: 'Severe chemical plume urgent trace investigation',
  targetGroup: 'water',
  priorityValue: 1.0,
  bountyCents: 2000,
});
assert(maxBoundaryMission.priorityValue === 1.0, 'Boundary: priorityValue accepted at 1.0');

// 1.3 Permission denied (Citizen role cannot create mission)
assert(
  caught(() =>
    service.createMission(mondegoCitizen, {
      reachId: 'mon:r01',
      source: 'staleness',
      reason: 'Citizen manual creation attempt',
      targetGroup: 'water',
    })
  ) instanceof ForbiddenError,
  'Permission denied: citizen role rejected with ForbiddenError (403)'
);

// 1.4 Cross-tenant reach creation (Mondego coordinator trying to target Garonne reach gar:r01)
assert(
  caught(() =>
    service.createMission(mondegoCoordinator, {
      reachId: 'gar:r01',
      source: 'weather',
      reason: 'Illegal cross-tenant mission creation',
      targetGroup: 'water',
    })
  ) instanceof NotFoundError,
  'Cross-tenant access: creating mission on another org reach returns NotFoundError (404)'
);

// ============================================================================
// 2. FUNCTION: getMission
// ============================================================================
console.log('\n--- 2. Testing getMission ---');

// 2.1 Happy path
const retrieved = service.getMission(mondegoCoordinator, mission1.id);
assert(retrieved.id === mission1.id, 'Happy path: retrieved mission by ID');

// 2.2 Invalid input (Non-existent ID)
assert(
  caught(() => service.getMission(mondegoCoordinator, 'mis_non_existent')) instanceof NotFoundError,
  'Invalid input: non-existent ID throws NotFoundError'
);

// 2.3 Cross-tenant isolation (Garonne coordinator attempting to read Mondego mission)
assert(
  caught(() => service.getMission(garonneCoordinator, mission1.id)) instanceof NotFoundError,
  'Cross-tenant access: foreign tenant reading mission gets NotFoundError (404)'
);

// ============================================================================
// 3. FUNCTION: updateMission
// ============================================================================
console.log('\n--- 3. Testing updateMission ---');

// 3.1 Happy path
const updated = service.updateMission(mondegoCoordinator, mission1.id, {
  reason: 'Updated reason after sensor confirmation',
  priorityValue: 0.9,
  bountyCents: 600,
});
assert(updated.reason === 'Updated reason after sensor confirmation', 'Happy path: updated reason');
assert(updated.priorityValue === 0.9, 'Happy path: updated priorityValue');

// 3.2 Permission denied (Citizen updating mission)
assert(
  caught(() => service.updateMission(mondegoCitizen, mission1.id, { reason: 'Unauthorized edit' })) instanceof ForbiddenError,
  'Permission denied: citizen updating mission rejected with ForbiddenError (403)'
);

// 3.3 Cross-tenant update (Garonne coordinator updating Mondego mission)
assert(
  caught(() => service.updateMission(garonneCoordinator, mission1.id, { reason: 'Cross tenant edit' })) instanceof NotFoundError,
  'Cross-tenant access: foreign tenant cannot update mission (404)'
);

// ============================================================================
// 4. FUNCTION: deleteMission
// ============================================================================
console.log('\n--- 4. Testing deleteMission ---');

// 4.1 Permission denied (Citizen deleting mission)
assert(
  caught(() => service.deleteMission(mondegoCitizen, mission1.id)) instanceof ForbiddenError,
  'Permission denied: citizen deleting mission rejected with ForbiddenError (403)'
);

// 4.2 Cross-tenant delete (Garonne coordinator deleting Mondego mission)
assert(
  caught(() => service.deleteMission(garonneCoordinator, mission1.id)) instanceof NotFoundError,
  'Cross-tenant access: foreign tenant cannot delete mission (404)'
);

// 4.3 Happy path: soft delete
service.deleteMission(mondegoCoordinator, mission1.id);
assert(
  caught(() => service.getMission(mondegoCoordinator, mission1.id)) instanceof NotFoundError,
  'Happy path: deleted mission is hidden from queries'
);

// ============================================================================
// 5. FUNCTION: listMissions & CURSOR BUG REPRODUCTION
// ============================================================================
console.log('\n--- 5. Testing listMissions ---');

// 5.1 Happy path listing
const listResult = service.listMissions(mondegoCoordinator, { limit: 10 });
assert(listResult.data.length >= 2, 'Happy path: listed active missions');

// 5.2 Malformed cursor handling (BUG REPRODUCTION TEST)
console.log('Testing malformed cursor payload...');
const malformedCursor = Buffer.from(JSON.stringify({ invalidStructure: true })).toString('base64');

// Expected behavior: malformed cursor without valid createdAt and id should be safely ignored
// Bug behavior: causes TypeError: Provided value cannot be bound to SQLite parameter 1
const resilientResult = service.listMissions(mondegoCoordinator, { cursor: malformedCursor });
assert(Array.isArray(resilientResult.data), 'Resilient cursor: malformed cursor safely ignored without throwing 500');

console.log('\n✅ ALL INTEGRATION & AUDIT TESTS PASSED SUCCESSFULLY!\n');
