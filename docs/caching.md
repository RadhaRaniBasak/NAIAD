# Naiad Caching Strategy & Architecture

**Goal:** Fast API responses, zero cross-tenant cache leakage, minimal origin load, deterministic cache invalidation.

The server cache is `CacheService` (`src/services/cache.service.ts`): an in-process `Map` with per-entry expiry, swept once a minute, holding at most 5,000 entries (when full, the oldest entry is dropped). It lives in one Node.js process, so it is empty after a restart and is not shared between instances. Its interface (get, set, delete, pattern invalidation, cache-aside helper) is the one a Redis client would be wrapped in when a second instance is added; that move has not been made.

---

## 1. Core Caching Principles & Invariants

1. **Strict Tenant Key Scoping:** Every cache key caching organization-specific data must start with `org:{organization_id}:`. Keys without an organization prefix are strictly prohibited for tenant data. `CacheService.formatTenantKey` builds them and refuses an empty organization.
2. **Zero Authenticated Caching on Shared CDNs:** Authenticated responses use `Cache-Control: private, no-cache, no-store, must-revalidate` so shared proxies and CDNs never store or serve another user's data. Sign-in responses use `no-store`.
3. **Content-Hashed Immutability:** Static build assets (JS, CSS) are content-hashed by Vite and cached for 1 year (`max-age=31536000, immutable`).
4. **HTML Never Cached Long-Term:** The root `index.html` always revalidates (`max-age=0, must-revalidate`) so newly deployed JS hashes are picked up on reload.
5. **Debug Bypass Capability:** A request with the header `X-Cache-Bypass: true` or `Cache-Control: no-cache` skips the server cache lookup and forces a fresh query.
6. **Keys Never Come Straight From the Request:** Query parameters are validated before they reach a key, an absent filter can never look like a filter value, and only default first pages are cached. Otherwise a caller could fill the cache with endless variations, or store a filtered result where the unfiltered one is expected.

---

## 2. Caching Matrix

| Candidate | Cache Location | TTL | Cache Key Pattern | Invalidation |
| :--- | :--- | :--- | :--- | :--- |
| **Static Build Assets** (`/assets/*.js`, `/assets/*.css`) | Browser & CDN edge | 1 year | URL path with content hash (e.g. `/assets/index-D7b39a.js`) | **Immutable:** a new build produces a new hash. |
| **HTML Entrypoint** (`/`, `index.html`) | Browser & CDN edge | 0s (revalidate) | URL path | `Cache-Control: public, max-age=0, must-revalidate`. |
| **Public Metadata API** (`GET /api/v1/cities`) | Browser, CDN edge and server cache | 1 hour (browser and server), 24 hours (CDN) | `public:cities:v1` | Changes only with a deployment; bump the version in the key when the city list changes. `stale-while-revalidate=600`. |
| **Reaches API** (`GET /api/v1/reaches`) | Server cache | 15 minutes | `org:{orgId}:reaches:city:{cityId}` | Cleared for the organization on every mission write. Only the default page is cached; a request with its own `limit` or `offset` is answered directly. |
| **Missions list** (`GET /api/v1/request-missions`) | Server cache | 5 minutes | `org:{orgId}:missions:first:s:{source}:r:{reachId}` (an absent filter is empty) | Cleared for the organization when a mission is created, updated or deleted. Only the first page at the default size is cached; a request with `limit` or `cursor` is answered directly. |
| **Single mission** (`GET /api/v1/request-missions/:id`) | Server cache | 5 minutes | `org:{orgId}:missions:id:{id}` | Same as the list. |

Not cached, because the code does not compute them on the server yet: topological orders, trace posteriors and weather forecasts (see `architecture.md` §7).

---

## 3. HTTP Cache-Control Header Examples

### Example 1: Static Content-Hashed Asset (`/assets/index-C8a91b.js`)
```http
HTTP/1.1 200 OK
Content-Type: application/javascript; charset=UTF-8
Cache-Control: public, max-age=31536000, immutable
```

### Example 2: Single-Page Application Entrypoint (`/index.html`)
```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=UTF-8
Cache-Control: public, max-age=0, must-revalidate
```

### Example 3: Public Metadata API (`GET /api/v1/cities`)
```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=600
X-Cache: HIT
```

### Example 4: Authenticated Tenant Data (`GET /api/v1/reaches`)
```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Cache-Control: private, no-cache, no-store, must-revalidate, proxy-revalidate
X-Cache: HIT
X-Cache-Key: org:org-coimbra-01:reaches:city:coimbra
```

---

## 4. Cache-Aside Pattern Implementation

`globalCache.getOrSet(key, fetcher, ttlSeconds, bypass)` implements it:
1. If the request asked to bypass the cache (`cacheBypassRequested(req)`), skip the lookup and run the fetcher.
2. Build the tenant-scoped key: `CacheService.formatTenantKey(auth.organizationId, namespace, identifier)`.
3. Look the key up:
   - **Cache HIT:** return the stored value; the route sets `X-Cache: HIT`.
   - **Cache MISS:** run the fetcher (database query or calculation), store the result with its TTL, and the route sets `X-Cache: MISS`.
4. On a mutation (`POST`, `PATCH`, `DELETE`), purge the organization's keys with `globalCache.invalidatePattern('org:' + orgId + ':missions:*')`. Only `*` is a wildcard in a pattern.
