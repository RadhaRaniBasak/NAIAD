# Runbook: Job Queue Backlog or Dead Letter Surge (`JobQueueBacklogOrDeadLetterSurge`)

**Severity:** P2 (High)  
**Alert Definition:** More than 500 pending jobs, or more than 10 failed jobs. These are the thresholds at which `GET /api/health` reports the queue as `"degraded"`.

**Today this cannot fire in normal operation.** The queue (`src/services/queue.ts`) is built and tested, but nothing in the application enqueues a job yet, and its four handlers (`send_email`, `generate_export`, `sync_weather_api`, `dispatch_webhook`) only write a log line. This runbook describes the queue as it is, for the day it gets real work.

---

## 1. How the Queue Works

- Jobs are rows in the `background_jobs` table of the SQLite database. `status` is one of `pending`, `processing`, `completed`, `failed`.
- Enqueueing a job with an id that already exists does nothing, so producers can retry safely.
- A processing pass runs in the server process right after a job is enqueued and handles at most five jobs, oldest first. **There is no timer:** a job waiting for a retry, or a backlog larger than five, only moves when the next job is enqueued.
- A job that throws is retried on later passes until it has used `max_attempts` (default 3). It then becomes `failed`, which is the dead letter queue: failed jobs are never picked up again on their own.
- A job left in `processing` by a crash is picked up again by the next pass, as long as it has attempts left.

---

## 2. Check Impact

```bash
# Counts, and whether the queue counts as degraded
curl -s http://localhost:3000/api/health | jq .components.queue

# The 50 most recent failed jobs, without their payloads (coordinator or admin token)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/jobs/failed | jq .
```

For the full rows, including payloads, query the database on the host:

```sql
SELECT id, name, attempts, max_attempts, last_error, updated_at
FROM background_jobs
WHERE status = 'failed'
ORDER BY updated_at DESC LIMIT 10;
```

A degraded queue does not take the server out of service: `/api/health` stays HTTP 200 with `status: "degraded"`.

---

## 3. Likely Causes

1. **A handler fails for every job of one kind:** `last_error` is the same on all of them. Fix the handler or what it depends on.
2. **One malformed job:** it fails `max_attempts` times and parks itself as `failed`. It does not block other jobs and needs no manual quarantine.
3. **A backlog that is not draining:** passes only run on enqueue and take five jobs each (§1).

---

## 4. Mitigation

**Replay failed jobs** once the cause is fixed:

```sql
UPDATE background_jobs
SET status = 'pending', attempts = 0, last_error = NULL
WHERE status = 'failed' AND name = 'send_email';
```

They run on the next processing pass, which means the next time something is enqueued.

**Discard jobs that must not run:**

```sql
DELETE FROM background_jobs WHERE id = '<job id>';
```

`status` only accepts the four values in §1; the database rejects anything else.

---

## 5. Escalation

- Declare a **SEV-2** (`incident.md`) if jobs that users depend on are more than 2 hours late.
- Before the queue carries user-facing work, give it a timer-driven pass: see the `ponytail:` note in `src/services/queue.ts`.
