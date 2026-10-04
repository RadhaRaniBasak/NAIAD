-- ==============================================================================
-- Naiad Multi-Tenant Relational Schema (SQLite; applied idempotently on every start)
-- All tables enforce:
-- 1. id UUID PRIMARY KEY
-- 2. organization_id UUID FOREIGN KEY (on all tenant tables)
-- 3. created_at, updated_at, deleted_at (soft delete)
-- 4. Strict CHECK, UNIQUE, NOT NULL constraints
-- 5. Money stored as INTEGER minor units (cents/paise)
-- ==============================================================================

-- 1. ORGANIZATIONS (Tenants: Municipalities, River Basin Authorities, NGOs)
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY, -- UUID v4
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    subscription_plan TEXT NOT NULL DEFAULT 'standard' CHECK (subscription_plan IN ('pilot', 'standard', 'enterprise')),
    monthly_budget_cents INTEGER NOT NULL DEFAULT 50000 CHECK (monthly_budget_cents >= 0), -- Stored in integer cents ($500.00)
    primary_city_id TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    deleted_at TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_city ON organizations(primary_city_id) WHERE deleted_at IS NULL;

-- 2. USERS (Belong to organizations or anonymous community pools)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, -- UUID v4
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    email TEXT NULL,
    role TEXT NOT NULL DEFAULT 'citizen' CHECK (role IN ('citizen', 'crew_leader', 'coordinator', 'admin')),
    points_balance INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
    arm TEXT NOT NULL DEFAULT 'missions' CHECK (arm IN ('missions', 'plain')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    deleted_at TEXT NULL,
    UNIQUE (organization_id, nickname)
);

CREATE INDEX IF NOT EXISTS idx_users_org_role ON users(organization_id, role) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_org_points ON users(organization_id, points_balance DESC);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- 2a. USER CREDENTIALS (Password sign-in for coordinators and admins. Volunteers have no row:
--     they join with a nickname and hold a signed token, see docs/decisions ADR 002.)
CREATE TABLE IF NOT EXISTS user_credentials (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL, -- scrypt$N$r$p$salt$hash, see src/services/auth.ts
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- 3. CREWS (Volunteer teams adopting reaches)
CREATE TABLE IF NOT EXISTS crews (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    join_code TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL REFERENCES users(id),
    avatar_icon TEXT NOT NULL DEFAULT '🌱',
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    deleted_at TEXT NULL,
    UNIQUE (organization_id, join_code)
);

CREATE INDEX IF NOT EXISTS idx_crews_org_code ON crews(organization_id, join_code) WHERE deleted_at IS NULL;

-- 4. REACHES (Stream segments of ~250m)
CREATE TABLE IF NOT EXISTS reaches (
    id TEXT PRIMARY KEY, -- e.g. "coi:r01"
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    city_id TEXT NOT NULL,
    length_meters INTEGER NOT NULL CHECK (length_meters > 0 AND length_meters <= 2000),
    topo_index INTEGER NOT NULL CHECK (topo_index >= 0),
    observable INTEGER NOT NULL DEFAULT 1 CHECK (observable IN (0, 1)),
    lab_gap INTEGER NOT NULL DEFAULT 0 CHECK (lab_gap IN (0, 1)),
    streak_weeks INTEGER NOT NULL DEFAULT 0 CHECK (streak_weeks >= 0),
    adopted_by_crew_id TEXT NULL REFERENCES crews(id) ON DELETE SET NULL,
    last_water_check_at TEXT NULL,
    last_vegetation_check_at TEXT NULL,
    last_structure_check_at TEXT NULL,
    geometry_json TEXT NOT NULL, -- GeoJSON LineString
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    deleted_at TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_reaches_org_city ON reaches(organization_id, city_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reaches_org_streak ON reaches(organization_id, streak_weeks DESC);
CREATE INDEX IF NOT EXISTS idx_reaches_org_water_check ON reaches(organization_id, last_water_check_at);

-- 5. ACCESS POINTS (Public bridges, paths, fords)
CREATE TABLE IF NOT EXISTS access_points (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    reach_id TEXT NOT NULL REFERENCES reaches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('bridge', 'path', 'ford', 'manual')),
    latitude REAL NOT NULL CHECK (latitude >= -90.0 AND latitude <= 90.0),
    longitude REAL NOT NULL CHECK (longitude >= -180.0 AND longitude <= 180.0),
    geofence_meters INTEGER NOT NULL DEFAULT 75 CHECK (geofence_meters >= 10 AND geofence_meters <= 200),
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    deleted_at TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_points_org_reach ON access_points(organization_id, reach_id) WHERE deleted_at IS NULL;

-- 6. EXPOSURE SITES (One Health sites: playgrounds, schools, dog parks)
CREATE TABLE IF NOT EXISTS exposure_sites (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    reach_id TEXT NOT NULL REFERENCES reaches(id) ON DELETE CASCADE,
    pillar TEXT NOT NULL CHECK (pillar IN ('human', 'animal', 'ecosystem')),
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    distance_meters INTEGER NOT NULL CHECK (distance_meters >= 0),
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    deleted_at TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_exposure_sites_org_reach ON exposure_sites(organization_id, reach_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_exposure_sites_pillar ON exposure_sites(organization_id, pillar);

-- 7. FILE ASSETS (Private uploaded photos with pre-signed URL tracking)
CREATE TABLE IF NOT EXISTS file_assets (
    id TEXT PRIMARY KEY, -- UUID v4
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    uploaded_by_user_id TEXT NOT NULL REFERENCES users(id),
    reach_id TEXT NULL REFERENCES reaches(id) ON DELETE SET NULL,
    storage_path TEXT NOT NULL UNIQUE, -- e.g. "organizations/{org_id}/uploads/{id}/photo.webp"
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760), -- max 10MB
    width INTEGER NULL,
    height INTEGER NULL,
    exif_stripped INTEGER NOT NULL DEFAULT 1 CHECK (exif_stripped IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'pending_upload' CHECK (status IN ('pending_upload', 'available', 'deleted')),
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    deleted_at TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_file_assets_org_reach ON file_assets(organization_id, reach_id);
CREATE INDEX IF NOT EXISTS idx_file_assets_org_status ON file_assets(organization_id, status) WHERE deleted_at IS NULL;

-- 8. DEMAND REQUEST MISSIONS
CREATE TABLE IF NOT EXISTS request_missions (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    reach_id TEXT NOT NULL REFERENCES reaches(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('staleness', 'weather', 'disagreement', 'lab-gap', 'trace', 'external')),
    reason TEXT NOT NULL,
    requester_name TEXT NOT NULL,
    target_group TEXT NOT NULL CHECK (target_group IN ('water', 'vegetation', 'structure')),
    priority_value REAL NOT NULL CHECK (priority_value >= 0.0 AND priority_value <= 1.0),
    bounty_cents INTEGER NOT NULL DEFAULT 0 CHECK (bounty_cents >= 0), -- Value in integer cents
    points_award INTEGER NOT NULL CHECK (points_award >= 0 AND points_award <= 200),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'fulfilled', 'expired', 'cancelled')),
    claimed_by_user_id TEXT NULL REFERENCES users(id),
    claimed_until TEXT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    deleted_at TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_missions_org_status_expires ON request_missions(organization_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_missions_org_reach ON request_missions(organization_id, reach_id);

-- 9. CHECKS (Ground-truth observations submitted by volunteers)
CREATE TABLE IF NOT EXISTS checks (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL UNIQUE,
    reach_id TEXT NOT NULL REFERENCES reaches(id) ON DELETE CASCADE,
    access_point_id TEXT NOT NULL REFERENCES access_points(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    crew_id TEXT NULL REFERENCES crews(id) ON DELETE SET NULL,
    request_mission_id TEXT NULL REFERENCES request_missions(id) ON DELETE SET NULL,
    file_asset_id TEXT NULL REFERENCES file_assets(id) ON DELETE SET NULL,
    groups_checked TEXT NOT NULL, -- e.g. "water" or "water,vegetation"
    answers_json TEXT NOT NULL,
    confirmed_unchanged TEXT NULL,
    derived_signs TEXT NOT NULL, -- e.g. "sewage,foam"
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy_meters REAL NOT NULL CHECK (accuracy_meters >= 0.0),
    points_awarded INTEGER NOT NULL CHECK (points_awarded >= 0),
    freshness_before INTEGER NOT NULL CHECK (freshness_before >= 0 AND freshness_before <= 100),
    freshness_after INTEGER NOT NULL CHECK (freshness_after >= 0 AND freshness_after <= 100),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'corroborated', 'disputed', 'rejected')),
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    deleted_at TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_checks_org_reach_time ON checks(organization_id, reach_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checks_org_user ON checks(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_checks_idempotency ON checks(idempotency_key);

-- 10. INCIDENTS (Contamination events, trace hunts, and handoff reports)
CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    city_id TEXT NOT NULL,
    sign TEXT NOT NULL,
    origin_reach_id TEXT NOT NULL REFERENCES reaches(id),
    origin_check_id TEXT NOT NULL REFERENCES checks(id),
    status TEXT NOT NULL DEFAULT 'watch' CHECK (status IN ('watch', 'advisory', 'confirmed', 'handed-off', 'resolved', 'dismissed')),
    posterior_json TEXT NOT NULL, -- JSON map reach_id -> probability
    suspect_source_reach_id TEXT NULL REFERENCES reaches(id),
    coordinator_notes TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    deleted_at TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_incidents_org_status ON incidents(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_org_origin ON incidents(organization_id, origin_reach_id);

-- 11. FHIR SERVICE REQUESTS (External health integrations)
CREATE TABLE IF NOT EXISTS fhir_service_requests (
    id TEXT PRIMARY KEY, -- e.g. "sr-vet-clinic-01"
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    requester_name TEXT NOT NULL,
    requester_reference TEXT NOT NULL, -- "Organization/coimbra-vet-hospital"
    target_reach_id TEXT NOT NULL REFERENCES reaches(id),
    indicator_code TEXT NOT NULL, -- "water", "foam", "riparianVegetation"
    clinical_reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed', 'revoked')),
    fhir_task_id TEXT NULL,
    conforming_observation_id TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    deleted_at TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_fhir_sr_org_status ON fhir_service_requests(organization_id, status);

-- ==============================================================================
-- Operational tables (system bookkeeping, not tenant data: no soft delete)
-- ==============================================================================

-- 12. BACKGROUND JOBS (In-process queue with retries; status = 'failed' is the dead letter queue)
CREATE TABLE IF NOT EXISTS background_jobs (
    id TEXT PRIMARY KEY, -- Deterministic job ID (idempotent enqueue)
    name TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    last_error TEXT NULL,
    last_attempted_at TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_attempts ON background_jobs(status, attempts);

-- 13. PROCESSED WEBHOOK EVENTS (Billing webhook replay protection)
CREATE TABLE IF NOT EXISTS processed_webhook_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    organization_id TEXT NULL,
    processed_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- 14. GDPR AUDIT LOGS (Article 17 erasure trail)
CREATE TABLE IF NOT EXISTS gdpr_audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    performed_by TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
