# Naiad API Conventions Specification

**Version:** 1.0  
**Base URL:** `/api/v1`  
**Data Format:** JSON in and JSON out (`Content-Type: application/json`)

---

## 1. URL and Naming Style
- **Resource Names:** Plural nouns in kebab-case (e.g., `/api/v1/request-missions`, `/api/v1/reaches`).
- **Standard CRUD Actions:**
  - `GET /api/v1/resources` — List resources (tenant-scoped).
  - `POST /api/v1/resources` — Create a new resource.
  - `GET /api/v1/resources/:id` — Retrieve a single resource by ID.
  - `PATCH /api/v1/resources/:id` — Partial update of a resource.
  - `DELETE /api/v1/resources/:id` — Soft-delete a resource (`deleted_at` timestamp).
- **Actions that are not CRUD:** a noun or verb appended (e.g. `POST /api/v1/storage/upload-url`, `POST /api/v1/auth/join`).

### The endpoints that exist

| Method and path | Who | Purpose |
|---|---|---|
| `GET /api/health/live` | Public | Liveness: the process is up. |
| `GET /api/health` | Public | Readiness: database, cache and queue probes. 503 when unhealthy. |
| `GET /api/v1/cities` | Public | The cities the app ships with. |
| `POST /api/v1/auth/join` | Public | A volunteer picks a nickname and receives a token. |
| `POST /api/v1/auth/login` | Public | Coordinators and admins sign in with email and password. |
| `POST /api/v1/webhooks/stripe` | Stripe (signed) | Billing events. |
| `GET /api/v1/reaches` | Signed in | Reaches of a city (demo networks). |
| `GET /api/v1/request-missions` | Signed in | The organization's missions, cursor-paginated. |
| `GET /api/v1/request-missions/:id` | Signed in | One mission. |
| `POST /api/v1/request-missions` | Coordinator, admin | Create a mission. |
| `PATCH /api/v1/request-missions/:id` | Coordinator, admin | Update a mission. |
| `DELETE /api/v1/request-missions/:id` | Coordinator, admin | Soft-delete a mission. |
| `POST /api/v1/storage/upload-url` | Signed in | A signed upload ticket for a photo. |
| `GET /api/v1/storage/download-url/:fileId` | Signed in | A signed download URL for a file of the caller's organization. |
| `GET /api/v1/jobs/failed` | Coordinator, admin | Failed background jobs, without payloads. |
| `GET /api/v1/account/export` | Signed in | The caller's own data (GDPR Art. 20). |
| `DELETE /api/v1/account` | Signed in | Erase the caller's own account (GDPR Art. 17). |

Check-ins, crews, incidents and FHIR requests have no API routes yet; those flows run in the browser on demo data (`docs/architecture.md` §7).

---

## 2. Standardized Error Response Format
All errors return HTTP status $\ge 400$ with a uniform JSON envelope, produced only by `errorHandler` in `src/routes/middleware.ts`. Handlers throw; they never build an error response themselves.

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request payload validation failed.",
    "details": [
      {
        "field": "targetGroup",
        "issue": "Invalid option: expected one of \"water\"|\"vegetation\"|\"structure\""
      },
      {
        "field": "priorityValue",
        "issue": "Too big: expected number to be <=1"
      }
    ],
    "requestId": "req_7c1f0c2e-5d0b-4a55-9d7e-2f2f6f0f3a10"
  }
}
```

`requestId` is also the `X-Request-Id` response header and the `request_id` of the matching log lines.

### Error Codes:
| Error Code | HTTP Status | Description |
|---|---|---|
| `VALIDATION_FAILED` | 400 | The body or the query string failed its Zod schema, or the body is not valid JSON. |
| `INVALID_SIGNATURE` | 400 | A webhook whose signature is missing, wrong or outside the five-minute window. |
| `UNAUTHENTICATED` | 401 | No bearer token, or one that is malformed, expired or belongs to a deactivated account. |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password at sign-in. |
| `FORBIDDEN` | 403 | The caller's role may not do this (`can()`). |
| `NOT_FOUND` | 404 | The resource does not exist, is soft-deleted, or belongs to another organization. Also any unknown `/api` path. |
| `CONFLICT` | 409 | The nickname is already taken. |
| `PAYLOAD_TOO_LARGE` | 413 | A request body over 100 KB, or a declared file size over 10 MB. |
| `RATE_LIMITED` | 429 | Too many requests. `Retry-After` says how many seconds to wait. |
| `INTERNAL_ERROR` | 500 | An unexpected error. The message is generic; the detail is in the server log. |
| `SERVER_SHUTTING_DOWN` | 503 | The server is restarting and no longer takes requests. |

---

## 3. Boundary Input Validation via Zod
Route handlers validate request bodies with Zod before calling a service. A failed parse is thrown and becomes a `VALIDATION_FAILED` response with one `details` entry per issue.
```typescript
import { z } from 'zod';

const CreateMissionSchema = z.object({
  reachId: z.string().min(1, 'Target reachId is required'),
  source: z.enum(['staleness', 'weather', 'disagreement', 'lab-gap', 'trace', 'external']),
  reason: z.string().min(5, 'Reason must be at least 5 characters').max(200),
  targetGroup: z.enum(['water', 'vegetation', 'structure']),
  priorityValue: z.number().min(0.0).max(1.0).optional(),
  bountyCents: z.number().int().nonnegative().optional(),
  pointsAward: z.number().int().min(0).max(200).optional(),
  expiresInHours: z.number().int().min(1).max(336).optional(),
});
```
Query parameters of the list endpoints are validated the same way. A value of the wrong shape (for example `limit=abc`, `source=unknown`, or an array where one value is expected) is a `VALIDATION_FAILED` response, not a silent fallback.

---

## 4. Cursor-Based Pagination Format
The mission list uses base64-encoded cursor tokens containing `{ createdAt, id }`, so pages stay stable while rows are added:

### Request:
```http
GET /api/v1/request-missions?limit=20&cursor=eyJjcmVhdGVkQXQi...
```
Optional filters: `source` (one of the mission sources) and `reachId`. `limit` is 1 to 100 and defaults to 20.

### Response Envelope:
```json
{
  "data": [
    { "id": "mis_1a2b3c4d", "reason": "...", "createdAt": "2026-10-02 12:00:00" }
  ],
  "pagination": {
    "hasMore": true,
    "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTEwLTAyIDEyOjAwOjAwIiwiaWQiOiJtaXNfMWEyYjNjNGQifQ==",
    "limit": 20
  }
}
```

`GET /api/v1/reaches` is the exception: it serves a small fixed network and uses `city` (one of the ids from `GET /api/v1/cities`, default `coimbra`), `limit` (1 to 100, default 50) and `offset`, returning `pagination: { limit, offset, total }`.

---

## 5. Auth and Organization Context

Every route under `/api/v1`, except sign-in, the city list and the Stripe webhook, requires:

```http
Authorization: Bearer <token>
```

A token comes from `POST /api/v1/auth/join` (body `{ "cityId", "nickname" }`, valid 90 days) or `POST /api/v1/auth/login` (body `{ "email", "password" }`, valid 12 hours). Both answer with:

```json
{
  "data": {
    "token": "<token>",
    "expiresAt": "2026-10-03T14:00:00.000Z",
    "user": { "id": "usr-coi-1", "nickname": "Dr_Manuel_Silva", "role": "coordinator", "organizationId": "org-coimbra-01" }
  }
}
```

The `requireAuth` middleware verifies the token and puts the caller's identity on `req.auth`:
```typescript
export interface AuthContext {
  userId: string;
  organizationId: string;
  role: 'citizen' | 'crew_leader' | 'coordinator' | 'admin';
  subscriptionPlan: 'pilot' | 'standard' | 'enterprise';
}
```
The token carries only the user id. Organization, role and plan are read from the database on every request, and nothing else the client sends is used for identity: there are no identity headers, in any environment. Every database query in a service **must filter by `auth.organizationId`**.

---

## 6. HTTP Status Code Conventions
- `200 OK`: Successful GET, PATCH, or action returning data.
- `201 Created`: Successful POST creating a resource. Mission creation also returns a `Location` header.
- `204 No Content`: Successful mission DELETE.
- `400 Bad Request`: Invalid JSON, Zod validation failure, or a refused webhook signature.
- `401 Unauthorized`: Authentication missing or invalid.
- `403 Forbidden`: Authenticated, but the role may not perform this action.
- `404 Not Found`: Resource does not exist or belongs to another tenant.
- `409 Conflict`: Unique constraint or state conflict.
- `413 Payload Too Large`: Request body or declared file size over the limit.
- `429 Too Many Requests`: Rate limit reached.
- `500 Internal Server Error`: Server-side unhandled exception.
- `503 Service Unavailable`: Shutting down, or `GET /api/health` reporting unhealthy.

Subscription plans are stored but not enforced by any route yet, so no endpoint answers `402 Payment Required`.
