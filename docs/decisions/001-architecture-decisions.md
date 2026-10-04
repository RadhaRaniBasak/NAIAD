# Architecture Decision Log

## ADR 001: Pure TypeScript Engine Without I/O
- **Status:** Accepted
- **Context:** The core algorithms of Naiad (reach freshness decay, rain shock factors, Kahn topological sorting, upstream closures, and Bayesian information-gain trace bisection) need to run seamlessly across client browser PWAs, Node.js API servers, offline unit test suites, and Monte Carlo simulation runners.
- **Decision:** All mathematical and graph logic resides in `src/engine/` (and `packages/engine` in monorepo layout) as pure functions with zero I/O, no database drivers, and explicit clock dependency injection (`now: Date`).
- **Consequences:** Tests execute instantaneously with zero database fixtures; the same engine can run in web workers or serverless edge handlers.
- **Implementation:** Done. `src/engine/` performs no I/O and takes the clock as an argument. The repository is a single package: there is no `packages/engine`.

## ADR 002: Anonymous-First Volunteer Accounts
- **Status:** Accepted
- **Context:** Volunteer recruitment drops off drastically if an email confirmation or password registration is mandatory before the first check.
- **Decision:** Volunteers choose a nickname and immediately receive a cryptographic JWT token and client-side session key.
- **Consequences:** Volunteers can begin checking streams within 30 seconds of opening the PWA. Coordinators retain traditional credentials.
- **Implementation:** Done in the API (`src/services/auth.ts`). `POST /api/v1/auth/join` takes a nickname and returns a signed token (HS256) valid for 90 days: no email, no password, and no separate session key, the token is the session. Coordinators sign in with email and password (scrypt) at `POST /api/v1/auth/login` and get a 12-hour token. In the browser only the Dispatch Queue page asks for sign-in; the demo check-in flow does not.

## ADR 003: Need-Based Payouts (Inverse Freshness)
- **Status:** Accepted
- **Context:** Conventional gamification pays flat points per check, encouraging volunteers to repeatedly check the same bridge near their home, skewing scientific data.
- **Decision:** Payout is strictly defined as `round(100 * (1 - freshness))`. An immediate repeat check yields $\le 5$ points, making point farming impossible.
- **Implementation:** Done in the engine (`patrolPoints` in `src/engine/freshness.ts`) and used by the browser app's receipts.

## ADR 004: Standard HL7 FHIR R4 Interoperability
- **Status:** Accepted
- **Context:** The OneAquaHealth EU Horizon Europe consortium uses standard HL7 FHIR R4 profiles (`hl7.eu.fhir.oah`).
- **Decision:** Support bidirectional FHIR integration: outside clinical systems post `ServiceRequest`, Naiad tracks life cycle via `Task`, and outputs corroborated citizen checks as conforming `Observation` resources.
- **Implementation:** Simulated in the browser only. See the status note in `0004-hapi-fhir-docker-bridge.md`.
