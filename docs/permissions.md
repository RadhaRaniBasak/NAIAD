# Naiad Authorization & Permissions Matrix

This document describes the Role-Based Access Control (RBAC) model implemented by `can(auth, action, resource)` in `src/services/permissions.ts`.

---

## 1. Roles

1. **`admin`**: Everything a coordinator can do, plus billing.
2. **`coordinator`**: Municipal stream manager. Creates and manages missions. Signs in with email and password.
3. **`crew_leader`**: Neighbourhood steward. Same API rights as a citizen today, plus adopting reaches once that route exists.
4. **`citizen`**: Community volunteer. Joins with a nickname (`POST /api/v1/auth/join`) and can read the organization's missions.

The role comes from the `users` table on every request, never from the token or the client. Changing it there takes effect on the user's next request.

---

## 2. Permission Matrix

**Enforced by an API route today:**

| Action | Allowed Roles | Where it is checked |
|---|---|---|
| `missions:list`, `missions:read` | Any signed-in user | `MissionsService`, always limited to the caller's organization |
| `missions:create` | `coordinator`, `admin` | `MissionsService.createMission` |
| `missions:update` | `coordinator`, `admin` | `MissionsService.updateMission` |
| `missions:delete` | `coordinator`, `admin` | `MissionsService.deleteMission` (soft delete) |
| `jobs:read` | `coordinator`, `admin` | `GET /api/v1/jobs/failed` |
| `users:manage` | `coordinator`, `admin` | `GdprService`: acting on another user's data. No route exposes this yet; the account routes only ever act on the caller. |

**Defined in `can()` for routes that do not exist yet:**

| Action | Allowed Roles |
|---|---|
| `missions:claim` | `citizen`, `crew_leader` |
| `reaches:adopt` | `crew_leader`, `coordinator`, `admin` |
| `incidents:manage` | `coordinator`, `admin` |
| `fhir:approve` | `coordinator`, `admin` |
| `billing:manage` | `admin` |

Storage tickets and the account export and erasure need a signed-in user of any role; they are bound to the caller's own organization and user id instead of a `can()` action.

Rules from the product design that no code enforces yet: a limit on simultaneously claimed missions, the two-check requirement before an advisory, the 80% posterior threshold before a handoff, and the FHIR requester allowlist. The advisory and handoff rules exist in the browser demo (`src/context/AppContext.tsx`), not in the API.

---

## 3. The `can()` Authorization Helper

A service method checks the role before it writes:
```typescript
if (!can(auth, 'missions:create', { organizationId: auth.organizationId })) {
  throw new ForbiddenError(`User with role '${auth.role}' cannot create missions.`);
}
```
Passing a resource makes `can()` refuse anything outside the caller's organization. Services additionally load records scoped to the organization and answer 404 for another tenant's record, so its existence is not revealed:
```typescript
if (!row || row.organizationId !== auth.organizationId) {
  throw new NotFoundError(`Mission '${missionId}' not found.`);
}
```
