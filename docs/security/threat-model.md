# Naiad Threat Model & Security Review

**Scope:** the code in this repository: the API (`src/api.ts`), its services, and the browser app's sign-in.  
**Not in scope:** the product flows that run on demo data in the browser (check-ins, crews, trace hunts, FHIR), because nothing they do reaches the server. `docs/architecture.md` §7 lists them.  
**Reference:** OWASP Top 10 (2021), GDPR (Regulation (EU) 2016/679).

This is a self-review by the people who wrote the code. It has not been checked by an outside tester.

---

## 1. Assets

| Asset | What is actually stored | Impact if compromised |
| :--- | :--- | :--- |
| **Missions and observations** | Missions per organization; the `checks` table (seeded rows only, the API has no check-in route yet) | False or deleted missions misdirect volunteers |
| **Accounts** | Volunteers: a nickname. Coordinators: nickname, email address, scrypt password hash | Impersonation of a coordinator; exposure of email addresses |
| **Sign-in tokens** | Not stored on the server. In the browser: `localStorage` | Whoever holds a token acts as that user until it expires |
| **Organization plan** | `subscription_plan`, `is_active` | Changed plan (not enforced anywhere yet); a deactivated organization is locked out |
| **Secrets** | `AUTH_TOKEN_SECRET`, `STORAGE_SIGNING_SECRET`, `STRIPE_WEBHOOK_SECRET`, in the process environment | Forged tokens for any user; forged storage URLs; forged billing events |

Not stored: volunteer email addresses, phone numbers, home locations, photos, card or Stripe customer data.

---

## 2. How Identity Works

- **One mechanism.** Every route under `/api/v1` except sign-in, the city list and the Stripe webhook requires `Authorization: Bearer <token>`. There are no cookies, so there is no cross-site request forgery surface, and no request header other than the token is used for identity.
- **Tokens** are signed with HMAC-SHA256 (`src/services/auth.ts`). Only the exact header the server issues is accepted, which rules out `alg: none` and algorithm swaps; signatures are compared in constant time. A token carries only the user id.
- **Organization, role and plan are read from the database on every request.** A role change, or deactivating a user or an organization, applies to tokens that were already issued.
- **Volunteers** join with a nickname (`POST /api/v1/auth/join`) and get a 90-day token. They have no password: the token is the account.
- **Coordinators and admins** sign in with email and password (`POST /api/v1/auth/login`) and get a 12-hour token. Passwords are hashed with scrypt (N=16384, r=8, p=5, random 16-byte salt). A wrong password and an unknown email get the same answer in about the same time.
- **Tenant isolation.** Services filter by the caller's `organizationId`; another organization's mission, file or user is reported as 404.

One consequence of anonymous-first sign-up is worth stating plainly: **anyone can join any organization as a volunteer.** Tenant isolation keeps organizations apart from each other. It does not keep an organization's mission list from the public.

---

## 3. Entry Points

| Endpoint | Who can call it | Threats | Mitigations in the code | Open |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/health/live`, `GET /api/health` | Anyone | Information leakage | No tenant data | Memory figures, version, uptime and the text of probe errors are public |
| `GET /api/download-repo` | Anyone | Leaking local files | Serves a zip of the source tree; local `.env` files, `data/` and any database file are left out | Anything else an operator leaves in the checkout is included |
| `GET /api/v1/cities` | Anyone | — | Static reference data | — |
| `POST /api/v1/auth/join` | Anyone | Account flooding, nickname abuse | 100 per hour per address; nickname 3–32 characters from a restricted set, unique per organization (unaccented letters compared without case) | Look-alike nicknames (different letters that look the same) are possible |
| `POST /api/v1/auth/login` | Anyone | Password guessing, account enumeration | 20 attempts per 15 minutes per address; one answer for wrong password and unknown email | No lockout per account, so guessing from many addresses is only slowed; no second factor |
| `POST /api/v1/webhooks/stripe` | Stripe | Forged or replayed billing events | Signature required and verified over the raw bytes; five-minute window; each event applied once; body limited to 100 KB and validated | — |
| `GET /api/v1/reaches` | Any signed-in user | Malformed parameters | Serves the built-in demo networks, which are not tenant data; `city`, `limit` and `offset` are validated | — |
| `GET /api/v1/request-missions`, `/:id` | Any signed-in user of the organization | Reading another organization's missions; corrupting or flooding the cache through query parameters | Scoped to the caller's organization; 404 across tenants; parameterized SQL; query validated; cache keys cannot collide and only default first pages are cached | See the note on joining above |
| `POST`, `PATCH`, `DELETE /api/v1/request-missions` | Coordinator, admin | Privilege escalation, injection | `can()` role check; Zod validation; parameterized SQL; creation limited to 60 per minute per user | — |
| `POST /api/v1/storage/upload-url` | Any signed-in user | Tickets for another organization; row flooding | Organization and uploader come from the token; the reach must belong to the caller's organization; type and size validated; 60 per minute per user | The type is only what the caller declares (Finding 4). Each ticket inserts a `file_assets` row that nothing cleans up |
| `GET /api/v1/storage/download-url/:fileId` | Any signed-in user of the organization | Reading another organization's files | 404 across tenants; 60 per minute per user | — |
| `GET /api/v1/jobs/failed` | Coordinator, admin | Leaking job data | Role check; payloads are not returned | Jobs are not scoped to an organization: a coordinator sees every organization's failed job names and error text |
| `GET /api/v1/account/export`, `DELETE /api/v1/account` | Any signed-in user, for their own account | Exporting or erasing someone else | The target is always the caller; erasure runs in one transaction | — |

Across all routes: unexpected errors leave as a generic `INTERNAL_ERROR` (the detail goes to the log), request bodies are limited to 100 KB, and production responses carry HSTS, a Content-Security-Policy with `script-src 'self'`, `X-Content-Type-Options: nosniff` and `X-Frame-Options: SAMEORIGIN`.

---

## 4. Findings of the First Review

| # | Finding | Status |
| :--- | :--- | :--- |
| 1 | **Unauthenticated dead letter queue** (`GET /api/v1/jobs/failed`) | **Fixed.** Needs a coordinator or admin token; payloads are removed from the response. |
| 2 | **Tenant taken from an `x-organization-id` header** | **Fixed.** No route reads identity from a header other than the bearer token. Covered by `test/integration/http.test.ts`. |
| 3 | **Host header injection in the HTTPS redirect** | **Fixed.** The redirect target is built from `APP_URL`. |
| 4 | **File type trusted from the caller's claim** | **Open.** No bucket is connected, so nothing can be uploaded yet. When one is, the bucket must enforce the declared `Content-Type`, serve files as attachments, and the bytes must be checked. |
| 5 | **Internal errors exposed to clients** | **Fixed** for API responses. The public health report still shows probe error text (§3). |

Also closed since that review: the webhook signature was optional and is now mandatory; the storage and webhook routes had no input validation; nothing was rate limited; secrets had published default values and now have none (production refuses to start without them); sign-in did not exist.

---

## 5. Open Items

Ordered by how much they matter before real users arrive.

1. **Only production mode is fit to be reached from outside.** Every other `NODE_ENV` value, `staging` included, runs the Vite development server, which serves the project's source files to anyone who can reach the port (database files and `.env` files are denied), generates its secrets at start, and sends no HSTS or Content-Security-Policy header.
2. **Tokens cannot be revoked one at a time.** They are stateless. Deactivating the user (`is_active = 0`) or rotating `AUTH_TOKEN_SECRET` (which signs everyone out) are the only ways to end one early. See the `ponytail:` note in `src/services/auth.ts`.
3. **A volunteer's token is the whole account.** It sits in `localStorage` for 90 days, where any script running on the page could read it; the Content-Security-Policy is the defence. Losing it (signing out, clearing site data, signing in as a coordinator in the same browser) loses the account, and there is no recovery.
4. **Rate limits and the cache live in one process** and count per client address as seen through exactly one reverse proxy (`trust proxy` is 1). Exposed without a proxy, a client can forge `X-Forwarded-For` and sidestep the per-address limits. Read endpoints have no rate limit, so a signed-in client can still keep the server busy with requests. What it cannot do is grow the server's memory: only default first pages are cached, and the cache holds at most 5,000 entries.
5. **No password rules and no reset.** Passwords are set by an operator with the command in `docs/runbooks/deploy.md`; nothing enforces their strength. The development seed uses the public password `naiad-demo`, which a production seed refuses.
6. **No audit trail for coordinator actions.** The request log carries the user id of every request, but the database does not record who created or changed a mission; only account erasures are recorded (`gdpr_audit_logs`).
7. **Field encryption is not applied.** `src/utils/crypto.ts` implements AES-256-GCM and is tested, but nothing encrypts a column with it: coordinator email addresses are stored as plain text (sign-in looks accounts up by email).

---

## 6. Privacy & GDPR

| Measure | Status |
| :--- | :--- |
| **Anonymous-first accounts** | Implemented. Volunteers give a nickname only. |
| **Right to portability (Art. 20)** | Implemented: `GET /api/v1/account/export` returns the caller's profile and activity as JSON. |
| **Right to erasure (Art. 17)** | Implemented: `DELETE /api/v1/account` scrubs the nickname and email, removes the password, deactivates the account, reassigns the user's checks to an anonymous placeholder so the observations survive, and records the erasure. All in one transaction. |
| **Log redaction** | Implemented and tested: sensitive keys (password, token, secret, email, coordinates and others) and email, token and IP patterns are removed from log lines. Sentry events have the user's email, IP address and username removed before they are sent. |
| **EXIF and GPS removal from photos** | **Not implemented.** The check-in dialog shows the step on sample photos; no photo is captured or uploaded (ADR 0003). |
| **Encryption of sensitive fields at rest** | **Not applied** (§5, item 7). Protect the database file and its backups at the disk level. |
| **Retention** | **None.** Nothing deletes old data on a schedule. |
