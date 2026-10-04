# Naiad: The stream asks. A neighbour answers.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Accessibility target: WCAG 2.1 AA](https://img.shields.io/badge/Accessibility_target-WCAG_2.1_AA-emerald.svg)](https://www.w3.org/WAI/WCAG21/quickref/)

> Demand-pull citizen science for urban streams, built for the **OneAquaHealth IEEE Global Hackathon 2026** (Track 5: Community & Gamification).

**The name.** In Greek myth a naiad (from the word for "to flow") is the nymph of a spring or a stream, bound to her own water. Biologists use the same word for the water-dwelling young of the mayfly, an insect read as a sign of good water quality.

Naiad flips traditional stream monitoring from **supply-push** (volunteers visit arbitrary spots once and drop off) to **demand-pull**. The design has five parts:
1. **Demand Engine:** Determines which ~250m reach most needs checking right now based on half-life staleness, storm runoff, research lab gaps, or active pollution incidents.
2. **One-Minute Missions:** Asks only the stale indicator group; strips EXIF metadata in the browser; enforces 75m access point geofences.
3. **Need-Based Payouts & Receipts:** Points equal need ($100 \times [1 - \text{freshness}]$); streaks belong to the reach; instant feedback receipts.
4. **Bayesian Trace Hunts:** When sewage or foam is detected, warns downstream schools/dog parks while bisecting upstream candidate reaches (a simulated median of about 9 to 13 checks on networks of 30 to 120 reaches).
5. **Systems to Streams (FHIR R4):** Outside hospitals and health agencies query urban streams using standard HL7 FHIR `ServiceRequest`s and receive validated `Observation`s.

---

## What Is Real and What Is Simulated
This repository is a working prototype. To read it correctly:

- **Real:** the scientific engine in `src/engine/` (freshness decay, stream graph, Bayesian trace hunts, the Monte Carlo benchmark on the Evidence page), and the HTTP API (sign-in, missions, storage tickets, billing webhook, GDPR export and erasure) on a SQLite database.
- **Simulated in the browser:** the map, check-ins, receipts, crews, trace hunts and the FHIR loop run on demo data held in the page (`src/context/AppContext.tsx`, `src/data/`). Photos are samples (so no EXIF removal actually takes place), the GPS position and the weather are controls on screen, offline mode is a toggle, and FHIR resources are generated without being validated. Nothing in these flows is sent to the server. On the Evidence page only the trace-hunt simulation is computed; its audit, coverage and pilot studies are illustrative examples, labelled as such: no audit and no pilot has been run.
- **Connected to the API:** the Dispatch Queue page (missions) and the status page (health).

See [`docs/architecture.md`](docs/architecture.md) for the full picture, including what is planned but not built.

---

## The Interface
- **Overview** is the home page: network freshness, open missions, active incidents, the stalest reaches and the missions that most need a volunteer.
- **Navigation** is a sidebar on wide screens and a drawer on phones. The demo controls (city, weather, role, offline mode) sit in the top bar, or in the drawer on phones.
- **Light and dark themes:** light by default, switched from the top bar and remembered in the browser.
- **Design System** (last item in the navigation) shows the colour roles, the type scale and every shared component.

[`docs/frontend.md`](docs/frontend.md) explains the layout, the theme tokens and the rules for adding a screen.

---

## Quickstart & Local Setup

### 1. Prerequisites
- Node.js 22.18 or newer (the server uses the built-in `node:sqlite` and runs TypeScript natively)
- npm

### 2. Installation
```bash
git clone <repo-url> naiad
cd naiad
npm install
cp .env.example .env   # optional: every variable has a development default
npm run db:seed        # demo organizations (Coimbra, Toulouse) and their coordinator accounts
```
The SQLite database (`data/naiad.db`) and its schema are created automatically on first start. The seed is what gives you something to sign in to: without it the app runs, but the Dispatch Queue has no organization to join.

### 3. Run Development Server
```bash
npm run dev
```
The application will be live at `http://localhost:3000`.

### 4. Signing In
The API needs a session; the Dispatch Queue page asks for one.
- **Volunteers** pick a nickname and are in (no email, no password). The account lives in the browser that created it: signing out gives it up.
- **Coordinators** sign in with email and password. After `npm run db:seed`: `manuel.silva@coimbra.example` or `claire.dubois@toulouse.example`, password `naiad-demo` (set `SEED_COORDINATOR_PASSWORD` before seeding to choose another).

From the command line:
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"manuel.silva@coimbra.example","password":"naiad-demo"}' | jq -r .data.token)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/request-missions
```

### 5. Health Check Endpoint
```bash
curl http://localhost:3000/api/health
```
Response (abridged):
```json
{
  "status": "ok",
  "service": "naiad-api",
  "version": "1.0.0",
  "timestamp": "2026-10-02T19:07:00.000Z",
  "components": {
    "database": { "status": "ok", "latencyMs": 0.2 },
    "cache": { "status": "ok", "latencyMs": 0.1 },
    "queue": { "status": "ok", "pendingJobs": 0, "deadLetterJobs": 0, "latencyMs": 0.1 }
  }
}
```

---

## Verification & Testing

### Run Unit & Integration Tests
Runs every suite under `src/**/__tests__/` and `test/integration/`: golden decay values, graph closures, Bayesian tracing and its Monte Carlo benchmark, authentication, services, tenant isolation, the API over HTTP, the display rules the pages share, the markup accessibility audit and the colour contrast of both themes' tokens:
```bash
npm test
```

### Run End-to-End Browser Tests
Playwright drives the app. If nothing is listening on port 3000 it starts the app itself, on a freshly seeded throwaway database (`data/e2e.db`); a server that is already running must have been seeded.
```bash
npx playwright install chromium   # first run only
npm run test:e2e
```

### Run Type Checking & Linter
```bash
npm run lint
```

### Build & Run Production Bundle
```bash
npm run build
NODE_ENV=production npm start
```
Production refuses to start without an HTTPS `APP_URL` and its three secrets (`AUTH_TOKEN_SECRET`, `STORAGE_SIGNING_SECRET`, `STRIPE_WEBHOOK_SECRET`); see `.env.example` and [`docs/runbooks/deploy.md`](docs/runbooks/deploy.md). Its §8 sets up a throwaway public demo on a free host.

---

## Documentation Links
- Architecture, and what is implemented vs planned: [`/docs/architecture.md`](/docs/architecture.md)
- System Design & Requirements: [`/docs/system-design.md`](/docs/system-design.md)
- API Conventions (authentication, errors, pagination): [`/docs/api-conventions.md`](/docs/api-conventions.md)
- Threat Model: [`/docs/security/threat-model.md`](/docs/security/threat-model.md)
- Frontend (layout, themes, components): [`/docs/frontend.md`](/docs/frontend.md)
- Testing: [`/docs/testing.md`](/docs/testing.md)
- Deployment, backup and incident runbooks: [`/docs/runbooks/`](/docs/runbooks/)
- Architecture Decision Records: [`/docs/decisions/`](/docs/decisions/)
