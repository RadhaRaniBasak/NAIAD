# Runbook: High API 5xx Error Rate (`HighApi5xxErrorRate`)

**Severity:** P1 (Critical)  
**Alert Definition:** HTTP 5xx responses exceed 2.0% of requests for 3 consecutive minutes.

The alert rule is part of the monitoring plan in `docs/monitoring.md`; nothing in the repository computes it. The rate has to be derived from the request log lines described below.

---

## 1. What It Means

Requests are failing inside the server. Every unexpected error leaves as HTTP 500 with the code `INTERNAL_ERROR` and a `requestId`; the real message stays in the log.

The application calls no external service while handling a request, so a third-party outage cannot be the cause. That leaves the code, the database file and the host.

---

## 2. Check User Impact

The server writes one JSON line per request to stdout when it finishes (`"message":"HTTP request finished: ..."`, with `data.statusCode` and `data.durationMs`) and one `ERROR` line per unexpected failure, with the stack trace.

```bash
# How many requests failed, and on which routes
<your log command> | grep '"statusCode":5' | jq -r '.data.method + " " + .data.path' | sort | uniq -c | sort -rn

# The errors behind them
<your log command> | grep '"level":"ERROR"' | tail -20 | jq '{timestamp, message, request_id, organization_id}'
```

- One route or all of them? One organization (`organization_id`) or all?
- A user who reports a failure can quote the `requestId` from the error: it is the `request_id` in the log and the `X-Request-Id` response header.
- If `SENTRY_DSN` is set, the same errors are in Sentry, tagged with `request_id` and `organization_id`.

**Expected 503s:** during a restart the server answers `SERVER_SHUTTING_DOWN` for up to 10 seconds. A short burst at deploy time is not an incident.

---

## 3. Likely Causes

1. **A bad release:** the errors began right after a deployment.
2. **Database trouble:** the messages mention SQLite (`database is locked`, `database or disk is full`, `no such column`). Use `database-unhealthy.md`.
3. **A bug reached by particular input:** one route, one organization, the same stack trace each time.
4. **The host:** out of memory or out of disk. `GET /api/health` reports the process memory under `memory`.

---

## 4. Mitigation

1. **Look at readiness:** `curl -s http://localhost:3000/api/health | jq .`
2. **After a release, roll back** (`rollback.md`) rather than debugging in production.
3. **Database messages:** follow `database-unhealthy.md`.
4. **A single failing route:** reproduce it with the logged method and path, fix forward, and release through `deploy.md` §7. Meanwhile the rest of the application keeps working: one failing request does not take the process down.
5. **Confirm:** the `"statusCode":5` lines stop appearing.

---

## 5. Escalation

- Still above **5% for more than 5 minutes**: declare a **SEV-1** using `incident.md`.
- The public status page (`/status`) shows the live readiness report on its own; it has no place to post a message, so tell affected organizations directly.
