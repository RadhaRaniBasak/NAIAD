# Runbook: Core Workflow Latency Degradation (`CoreWorkflowLatencyDegradation`)

**Severity:** P2 (High)  
**Alert Definition:** p95 latency on `/api/v1/reaches` or `/api/v1/request-missions` exceeds 500ms for 5 consecutive minutes.

The alert rule is part of the monitoring plan in `docs/monitoring.md`. The server exposes no latency metric: the figure has to be computed from `data.durationMs` on the `HTTP request finished` log lines.

---

## 1. What It Means

The Dispatch Queue page loads slowly, or API clients wait. The map, the missions page and the trace hunts run in the browser on demo data and do not call these endpoints, so they are not affected.

One fact explains most slowdowns: the server is a single process and its database calls are synchronous. While one request waits on the database, every other request waits behind it.

---

## 2. Check User Impact

```bash
B=http://localhost:3000
TOKEN=$(curl -s -X POST $B/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"<coordinator email>","password":"<password>"}' | jq -r .data.token)

# Time one request, and see whether the server cache answered it (X-Cache: HIT or MISS)
curl -s -o /dev/null -D - -w 'total: %{time_total}s\n' -H "Authorization: Bearer $TOKEN" \
  $B/api/v1/request-missions | grep -iE 'x-cache|total'

# The same request straight from the database
curl -s -o /dev/null -w 'uncached: %{time_total}s\n' -H "Authorization: Bearer $TOKEN" \
  -H 'X-Cache-Bypass: true' $B/api/v1/request-missions

# The slowest recent requests
<your log command> | grep 'HTTP request finished' | jq -r '[.data.durationMs, .data.method, .data.path] | @tsv' | sort -rn | head
```

---

## 3. Likely Causes

1. **Waiting for a database lock.** A write waits up to 3 seconds for a lock held by another process (a second copy of the server, an open `sqlite3` session) and the whole server waits with it. Look for slow writes in the request log, or `database is locked` once a wait runs out, and see `database-unhealthy.md`.
2. **The mission list is sorting a large table.** The list query finds an organization's rows through an index and then sorts them by creation time. Measured on a development machine, an uncached page takes about 3 ms with 5,000 missions in one organization, 26 ms with 50,000 and 100 ms with 200,000.
3. **A cold or busy cache.** The cache is empty after every restart, and each mission write clears that organization's cached mission and reach lists. Constant writes mean constant misses.
4. **The host is short of CPU or memory.** `curl -s $B/api/health | jq .memory` shows the process's memory use.

---

## 4. Mitigation

1. **Remove the lock holder** if the logs show lock waits (`lsof <database file>`).
2. **Check the query plan** on the host:
   ```sql
   EXPLAIN QUERY PLAN
   SELECT id FROM request_missions
   WHERE organization_id = 'org-coimbra-01' AND deleted_at IS NULL
   ORDER BY created_at DESC, id DESC LIMIT 21;
   ```
   Today's answer is `SEARCH request_missions USING INDEX idx_missions_org_reach (organization_id=?)` followed by `USE TEMP B-TREE FOR ORDER BY`. If the sort is what hurts, add an index that matches the order, in `src/db/schema.sql` so new databases get it too:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_missions_org_created
     ON request_missions(organization_id, created_at DESC, id DESC);
   ```
   A plan that says `SCAN request_missions` means no index is used at all.
3. **Restart only as a last resort.** It clears the cache, so the first requests afterwards are slower, not faster.

---

## 5. Escalation

- Latency above **2 seconds for more than 15 minutes**: declare a **SEV-2** using `incident.md`.
