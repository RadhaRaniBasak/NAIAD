# Naiad Test Strategy

**Target Quality Standard:** Deterministic engine, multi-tenant boundary security, no mocked auth or database.

---

## 1. The Three-Level Testing Pyramid

```text
                     ▲
                    / \
                   /   \
                  / E2E \       Level 3: Playwright Browser Tests
                 /-------\      (App Boot, Check-In, Trace Drill, Crews, Sign-In, Theme, Keyboard, Demo Controls, Progress)
                /         \
               /  API Int. \    Level 2: HTTP & Service Integration Tests
              /-------------\   (Real SQLite, Foreign Keys, Auth, RBAC, Multi-Tenant Isolation)
             /               \
            /    Unit Tests   \ Level 1: Domain Logic & Scientific Engine
           /-------------------\ (Decay Math, TopoSort, Bayesian Tracing, Services)
```

Levels 1 and 2 are fifteen standalone scripts run by the Node test runner (`npm test`). Each script prints a `PASS` line per assertion and exits non-zero on the first failure. There is no test framework; `test/assert.ts` holds the two shared helpers (`assert`, and `caught`, which returns what a call throws).

---

## 2. Level 1: Unit Tests (`src/engine`, `src/services`, `src/components`, `src/context`)

- **Engine rule:** no I/O, no network, no wall-clock access. The clock is passed in, and the simulation takes a seeded random generator, so every result is reproducible.
- **Suites:**
  - `src/engine/__tests__/run-tests.ts`: Golden scientific values (water 3-day half-life, rain shock multiplier, topological sort, Bayesian trace bisection).
  - `src/engine/__tests__/simulation.test.ts`: The trace-hunt Monte Carlo behind the Evidence page: network generator, both search strategies, known answers on a chain, tallies and quantiles.
  - `src/services/__tests__/auth.test.ts`: Token forgery, tampering, expiry and algorithm confusion; password hashing; volunteer join and coordinator sign-in; identity resolved from the database; the seed script's production rules.
  - `src/services/__tests__/storage.test.ts`: Storage tickets: file type and size rules, reach ownership, cross-tenant downloads reported as not found.
  - `src/services/__tests__/api-service.test.ts`: Missions through the service, tenant isolation and roles, job queue idempotency and dead letter state, webhook signatures and replay, plan feature helper (`hasFeature`).
  - `src/services/__tests__/security-gdpr.test.ts`: Field encryption helper, log redaction, data export and account erasure (including rollback of a failed erasure).
  - `src/services/__tests__/cache.test.ts`: Cache-aside hits, invalidation, tenant key isolation, bypass, the entry limit.
  - `src/services/__tests__/health.test.ts`: The readiness report behind `GET /api/health` (ok, degraded queue, unhealthy database, shutdown).
  - `src/services/__tests__/logging-tracking.test.ts`: JSON log lines, request context, redaction, Sentry scrubbing.
  - `src/components/__tests__/a11y.test.tsx`: Renders the real components, pages and shell to markup and checks label pairing, error announcements, dialog semantics, loading states, table markup, one `<h1>` per page, a name on every button and a label on every field, the shell's landmarks and skip link, keyboard-reachable map reaches and text freshness labels. It is a set of markup checks, not a full WCAG 2.1 AA audit.
  - `src/components/__tests__/contrast.test.ts`: Reads the colour tokens of both themes from `src/index.css` and checks the role pairs it lists against WCAG AA: text on surfaces, text on tints, text on solid fills (4.5:1), field outlines, the focus ring and accent marks (3:1). It checks the tokens, not each screen's use of them.
  - `src/context/__tests__/rules.test.ts`: The rules behind the demo state (pure functions exported by `AppContext.tsx`): a storm discounts only the checks made before it; what a check earns and changes (a repeat check earns nothing, the streak counts ISO weeks, a late sync never moves a newer check back); incidents take evidence from trace missions and corroborating reports, become an advisory at two positive checks and are never confirmed automatically; a handoff needs a confirmed advisory and an isolated source; which missions are open; unique crew join codes; the derived cities' own place names.
  - `src/components/__tests__/presentation.test.ts`: The display rules shared by the pages: freshness states and their thresholds, age labels, the network summary, what a mission pays (the same rule that credits the check), ranking with and without a crew, which incidents count as active.

---

## 3. Level 2: Integration Tests (Real Database)

- `test/integration/http.test.ts` starts the real Express app (`createApp` from `src/api.ts`) on a free local port and calls it over HTTP: every protected route answers 401 without a token, forged identity headers are ignored, join and sign-in, roles, tenant isolation, validated query parameters, a cache that a caller cannot corrupt, storage validation, the signed webhook on raw bytes (wrong, replayed and stale signatures), JSON 404s, export and erasure, rate limits, and a draining server.
- `test/integration/missions.test.ts` exercises `MissionsService` against the schema: happy path, invalid input, boundary values, permission denied (403), cross-tenant access (404), cursor pagination.
- **Database Policy:** **NEVER MOCKED.** Every suite that needs a database opens its own in-memory SQLite database (`getDb(':memory:')`) with the full `schema.sql` applied and foreign keys on. No test touches `data/naiad.db`.

---

## 4. Level 3: End-to-End Browser Tests (Playwright)

Run in headless Chromium against the full application on port 3000. Unless something is already listening there, the Playwright config starts the app on its own freshly seeded database (`data/e2e.db`), so the flows never touch development data. If you point them at a server you started yourself, seed it first (`npm run db:seed`): Flow 5 signs in with the demo coordinator.

### Critical User Flows (`test/e2e/flows.spec.ts`):
1. **App Boot & City Switching:** the app opens on the Overview, and the city selector switches between Coimbra and Toulouse.
2. **Core Citizen Science Workflow:** open the top-ranked mission, complete the micro-check inside the geofence, see the receipt credit the points the mission card showed and restore the reach's freshness, and find the check on the Overview.
3. **Trace Drill & Upstream Bisection:** start a practice incident and see its candidate reaches; answer the hunt's trace mission and find the check on the hunt as "sign absent"; a second positive check makes it an advisory, which a volunteer cannot confirm and a coordinator can.
4. **Join a Crew:** enter a join code on the Crews view and become a member; a new crew gets a join code no other crew has and starts without a reach.
5. **Dispatch Sign-In:** a volunteer joins with a nickname and sees the queue; a coordinator signs in and issues a mission through the API.
6. **Theme Switch:** light is the default, the switch turns the page dark, and the choice survives a reload.
7. **Keyboard:** a dialog takes focus when it opens, keeps Tab inside it (also after focus fell back to the page body), closes on Escape and returns focus to the button that opened it; a reach on the map is selected with Enter.
8. **Demo Controls:** a simulated storm makes every reach stale and shows its banner, and a check made in the storm leaves its reach fresh and closes its mission; a check made offline is queued and changes nothing until reconnecting syncs it, after which its reach is fresh; the Coordinator Console follows the coordinator role.
9. **Progress & Points:** a first check this week extends the reach's streak; checking the same reach again at once earns nothing and adds no week; after a visit to another city the reach and the points are as they were left.

Each flow runs on Desktop Chrome and a Pixel 5 viewport. On the phone size the navigation and the demo controls are in a drawer, which the flows open through the menu button. Flow 5 is the one that goes through the API and the database; the others run on demo data in the browser.

---

## 5. What Is Real and What Is Stubbed in Tests

| Component | In tests | Rationale |
| :--- | :--- | :--- |
| **Database** | **Real** (in-memory SQLite, real schema) | Mocking SQL hides constraint bugs, foreign key errors and isolation leaks. |
| **Auth & Permissions** | **Real** (real tokens, real password hashing, `can()`) | Security boundaries must be evaluated as they run in production. |
| **Scientific Engine (`src/engine/`)** | **Real** | Deterministic by construction: no clock, seeded randomness. |
| **Stripe** | Events are built in the test and signed with the real HMAC scheme | Naiad never calls Stripe; only the webhook is exercised. |
| **Weather, FHIR server, photo bucket, email** | Not involved | No code calls them yet (`docs/architecture.md` §7), so there is nothing to stub. |

---

## 6. Test Commands & Tooling

```bash
# Levels 1 and 2: every file in src/**/__tests__ and test/integration
npm test

# Type-check (also rejects unused code)
npm run lint

# One suite on its own
npx tsx test/integration/http.test.ts

# Level 3: Playwright end-to-end tests (first time: npx playwright install chromium)
npm run test:e2e
```

CI (`.github/workflows/ci.yml`) runs the dependency audit, the secret scan, the type-check, `npm test` and a production build. It does not run the browser flows.
