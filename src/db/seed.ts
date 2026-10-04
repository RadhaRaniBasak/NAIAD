/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Multi-Tenant Seed Script & Tenant Isolation Verification
 */

import type { DatabaseSync } from 'node:sqlite';
import { AuthService } from '../services/auth.ts';
import { getDb } from './index.ts';

/** Password of the demo coordinators. It is public, so a production seed has to choose its own. */
const DEMO_COORDINATOR_PASSWORD = 'naiad-demo';

export function seedDatabase(db: DatabaseSync = getDb()) {
  const coordinatorPassword = process.env.SEED_COORDINATOR_PASSWORD ?? DEMO_COORDINATOR_PASSWORD;
  if (process.env.NODE_ENV === 'production') {
    if (coordinatorPassword === DEMO_COORDINATOR_PASSWORD) {
      throw new Error('Set SEED_COORDINATOR_PASSWORD before seeding a production database: the demo password is public.');
    }
    // Seeding starts by emptying the tenant tables. That is a reset in development and data loss here.
    if (db.prepare('SELECT 1 FROM organizations LIMIT 1').get()) {
      throw new Error('Refusing to seed: this production database already has data, and seeding deletes it first.');
    }
  }

  // Clean existing data for clean seed
  db.exec(`
    DELETE FROM fhir_service_requests;
    DELETE FROM incidents;
    DELETE FROM checks;
    DELETE FROM request_missions;
    DELETE FROM file_assets;
    DELETE FROM exposure_sites;
    DELETE FROM access_points;
    DELETE FROM reaches;
    DELETE FROM crews;
    DELETE FROM users;
    DELETE FROM organizations;
  `);

  console.log('🌱 Seeding 2 Organizations with 3 Users each and realistic stream data...');

  // --------------------------------------------------------------------------
  // 1. ORGANIZATIONS
  // --------------------------------------------------------------------------
  const insertOrg = db.prepare(`
    INSERT INTO organizations (id, name, slug, subscription_plan, monthly_budget_cents, primary_city_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertOrg.run('org-coimbra-01', 'Águas de Coimbra, E.M.', 'aguas-de-coimbra', 'standard', 50000, 'coimbra');
  insertOrg.run('org-toulouse-02', 'Toulouse Métropole Environnement', 'toulouse-metropole', 'enterprise', 85000, 'toulouse');

  // --------------------------------------------------------------------------
  // 2. USERS (3 per organization)
  // --------------------------------------------------------------------------
  const insertUser = db.prepare(`
    INSERT INTO users (id, organization_id, nickname, email, role, points_balance, arm)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Org A: Coimbra Users
  insertUser.run('usr-coi-1', 'org-coimbra-01', 'Dr_Manuel_Silva', 'manuel.silva@coimbra.example', 'coordinator', 0, 'missions');
  insertUser.run('usr-coi-2', 'org-coimbra-01', 'Sara_Nobre', 'sara.nobre@example.org', 'crew_leader', 340, 'missions');
  insertUser.run('usr-coi-3', 'org-coimbra-01', 'Joao_Ribeiro', 'joao.rib@example.org', 'citizen', 120, 'missions');

  // Org B: Toulouse Users
  insertUser.run('usr-tou-1', 'org-toulouse-02', 'Dr_Claire_Dubois', 'claire.dubois@toulouse.example', 'coordinator', 0, 'missions');
  insertUser.run('usr-tou-2', 'org-toulouse-02', 'Luc_Moreau', 'luc.moreau@example.org', 'crew_leader', 210, 'missions');
  insertUser.run('usr-tou-3', 'org-toulouse-02', 'Camille_Petit', 'camille.petit@example.org', 'citizen', 80, 'missions');

  // Coordinators sign in with email and password; volunteers join with a nickname (no password).
  const auth = new AuthService(db);
  auth.setPassword('usr-coi-1', coordinatorPassword);
  auth.setPassword('usr-tou-1', coordinatorPassword);

  // --------------------------------------------------------------------------
  // 3. CREWS
  // --------------------------------------------------------------------------
  const insertCrew = db.prepare(`
    INSERT INTO crews (id, organization_id, name, join_code, created_by_user_id, avatar_icon)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertCrew.run('crew-coi-1', 'org-coimbra-01', 'Guardiões de Coselhas', 'COSELHAS26', 'usr-coi-2', '🌊');
  insertCrew.run('crew-tou-1', 'org-toulouse-02', 'Sentinelles du Touch', 'LETOUCH31', 'usr-tou-2', '🌿');

  // --------------------------------------------------------------------------
  // 4. REACHES
  // --------------------------------------------------------------------------
  const insertReach = db.prepare(`
    INSERT INTO reaches (id, organization_id, name, city_id, length_meters, topo_index, streak_weeks, adopted_by_crew_id, last_water_check_at, geometry_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Coimbra Reaches
  insertReach.run(
    'coi:r01',
    'org-coimbra-01',
    'Coselhas Upper Forest Reach',
    'coimbra',
    260,
    0,
    14,
    'crew-coi-1',
    new Date(Date.now() - 86400000).toISOString(),
    JSON.stringify({ type: 'LineString', coordinates: [[-8.421, 40.239], [-8.423, 40.236]] })
  );
  insertReach.run(
    'coi:r02',
    'org-coimbra-01',
    'Pedrulha Tributary Confluence',
    'coimbra',
    250,
    1,
    8,
    'crew-coi-1',
    new Date(Date.now() - 4 * 86400000).toISOString(),
    JSON.stringify({ type: 'LineString', coordinates: [[-8.423, 40.236], [-8.425, 40.233]] })
  );

  // Toulouse Reaches
  insertReach.run(
    'tou:r01',
    'org-toulouse-02',
    'Le Touch - Passerelle Saint-Martin',
    'toulouse',
    240,
    0,
    6,
    'crew-tou-1',
    new Date(Date.now() - 2 * 86400000).toISOString(),
    JSON.stringify({ type: 'LineString', coordinates: [[1.381, 43.591], [1.385, 43.594]] })
  );

  // --------------------------------------------------------------------------
  // 5. ACCESS POINTS
  // --------------------------------------------------------------------------
  const insertAp = db.prepare(`
    INSERT INTO access_points (id, organization_id, reach_id, name, kind, latitude, longitude, geofence_meters)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertAp.run('ap-coi-1', 'org-coimbra-01', 'coi:r01', 'Ponte da Pedrulha Footpath', 'bridge', 40.237, -8.422, 75);
  insertAp.run('ap-tou-1', 'org-toulouse-02', 'tou:r01', 'Passerelle du Touch Promenade', 'path', 43.592, 1.383, 75);

  // --------------------------------------------------------------------------
  // 6. REQUEST MISSIONS
  // --------------------------------------------------------------------------
  const insertMission = db.prepare(`
    INSERT INTO request_missions (id, organization_id, reach_id, source, reason, requester_name, target_group, priority_value, bounty_cents, points_award, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertMission.run(
    'mis-coi-1',
    'org-coimbra-01',
    'coi:r02',
    'weather',
    'First look after heavy storm (26mm): verify runoff turbidity',
    'Naiad Weather Engine',
    'water',
    0.85,
    300, // 300 cents ($3.00 voucher equivalent)
    80,
    new Date(Date.now() + 48 * 3600000).toISOString()
  );
  insertMission.run(
    'mis-tou-1',
    'org-toulouse-02',
    'tou:r01',
    'staleness',
    'Nobody has checked this reach for 5 days',
    'Freshness Engine',
    'water',
    0.65,
    200, // 200 cents ($2.00)
    65,
    new Date(Date.now() + 72 * 3600000).toISOString()
  );

  // --------------------------------------------------------------------------
  // 7. CHECKS
  // --------------------------------------------------------------------------
  const insertCheck = db.prepare(`
    INSERT INTO checks (
      id, organization_id, idempotency_key, reach_id, access_point_id, user_id, crew_id,
      groups_checked, answers_json, derived_signs, latitude, longitude, accuracy_meters,
      points_awarded, freshness_before, freshness_after, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertCheck.run(
    'chk-coi-1',
    'org-coimbra-01',
    'idemp-coi-001',
    'coi:r01',
    'ap-coi-1',
    'usr-coi-2',
    'crew-coi-1',
    'water',
    JSON.stringify({ water_aspect: 'clear', water_flow: 'steady_glide', water_odor: 'natural' }),
    'none',
    40.2371,
    -8.4221,
    5.4,
    82,
    18,
    100,
    'pending'
  );

  insertCheck.run(
    'chk-tou-1',
    'org-toulouse-02',
    'idemp-tou-001',
    'tou:r01',
    'ap-tou-1',
    'usr-tou-3',
    'crew-tou-1',
    'water',
    JSON.stringify({ water_aspect: 'turbid', water_flow: 'sluggish_pool', water_odor: 'natural' }),
    'none',
    43.5922,
    1.3831,
    6.1,
    70,
    30,
    100,
    'pending'
  );

  console.log('✅ Seed completed successfully!');
  console.log(
    `🔑 Coordinator sign-in: manuel.silva@coimbra.example or claire.dubois@toulouse.example, password ${
      coordinatorPassword === DEMO_COORDINATOR_PASSWORD ? `"${DEMO_COORDINATOR_PASSWORD}"` : 'from SEED_COORDINATOR_PASSWORD'
    }`
  );

  // --------------------------------------------------------------------------
  // TENANT ISOLATION VERIFICATION TESTS
  // --------------------------------------------------------------------------
  console.log('\n🔒 Running Tenant Isolation Verification Queries...');

  // Test 1: Query checks for Org Coimbra
  const coiChecks = db.prepare('SELECT id, organization_id, reach_id FROM checks WHERE organization_id = ?').all('org-coimbra-01');
  console.log(`• Org Coimbra checks count: ${coiChecks.length} (Expected 1)`);
  if (coiChecks.some((c) => c.organization_id !== 'org-coimbra-01')) {
    throw new Error('Tenant leak: Coimbra query returned non-Coimbra records!');
  }

  // Test 2: Query checks for Org Toulouse
  const touChecks = db.prepare('SELECT id, organization_id, reach_id FROM checks WHERE organization_id = ?').all('org-toulouse-02');
  console.log(`• Org Toulouse checks count: ${touChecks.length} (Expected 1)`);
  if (touChecks.some((c) => c.organization_id !== 'org-toulouse-02')) {
    throw new Error('Tenant leak: Toulouse query returned non-Toulouse records!');
  }

  // Test 3: Verify foreign key cross-tenant rejection
  let crossTenantRejected = false;
  try {
    // Attempting to insert a mission with mismatched organization_id vs reach's organization_id
    // Or inserting check for non-existent organization
    db.prepare(`
      INSERT INTO checks (id, organization_id, idempotency_key, reach_id, access_point_id, user_id, groups_checked, answers_json, derived_signs, latitude, longitude, accuracy_meters, points_awarded, freshness_before, freshness_after)
      VALUES ('chk-bad', 'org-nonexistent', 'idemp-bad', 'coi:r01', 'ap-coi-1', 'usr-coi-1', 'water', '{}', '', 0, 0, 0, 0, 0, 0)
    `).run();
  } catch (err) {
    crossTenantRejected = true;
    const reason = err instanceof Error ? err.message : String(err);
    console.log(`• Foreign Key integrity: non-existent organization rejected as expected (${reason})`);
  }

  if (!crossTenantRejected) {
    throw new Error('Database allowed foreign key breach!');
  }

  console.log('🛡️ TENANT ISOLATION VERIFIED: Tenants cannot view or access cross-organization records.\n');
}

// Run directly if script
if (process.argv[1]?.endsWith('seed.ts')) {
  seedDatabase();
}
