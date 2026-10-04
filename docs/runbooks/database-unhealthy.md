# Runbook: Database Unhealthy (`DatabaseConnectivityFailure`)

**Severity:** P1 (Critical)  
**Alert Definition:** `GET /api/health` answers 503 with `components.database.status` other than `"ok"`, for 1 minute.

The alert rule is part of the monitoring plan in `docs/monitoring.md`; nothing in the repository sends it. This runbook is what to do when the probe, a user or the logs show database trouble.

---

## 1. What the Probe Does and Does Not See

The database is one SQLite file opened by the server process (`DATABASE_URL`, for example `/var/lib/naiad/naiad.db`). There is no database server to connect to.

- The **database probe** runs `SELECT 1` on the open connection with a 1.5 second timeout. It fails when the connection is broken, and reports the reason in `components.database.error`.
- The **queue probe** counts rows in `background_jobs`, so it reads the file. When it fails, `components.queue.status` is `"unhealthy"` and the overall status is `"degraded"` (still HTTP 200).
- **Neither probe writes.** A full disk, a read-only volume or a lock held by another process leave the probes green while every request that writes ends in a 500 `INTERNAL_ERROR`. The cause is in the logs.
- **If the file cannot be opened at start**, the process exits with `Fatal error starting Naiad server` and there is no health endpoint to ask.

---

## 2. Check User Impact

```bash
# On the host
curl -s http://localhost:3000/api/health | jq '{status, components}'

# Failed requests and their causes (the server logs JSON lines on stdout/stderr)
<your log command> | grep '"level":"ERROR"' | tail -20
```

Reads usually keep working (they need no write, and lists are cached in the process for a few minutes) while writes fail: volunteers joining, new missions, account erasure.

---

## 3. Likely Causes

| Log message contains | Cause | Fix |
| :--- | :--- | :--- |
| `database or disk is full` | The volume is full | Free space (`df -h`), for example by moving old backups off that disk |
| `attempt to write a readonly database` | The volume was remounted read-only, or the service user lost write permission on the file or its directory | Fix the mount or the ownership, then restart |
| `database is locked` | Another process holds a write lock for more than 3 seconds: a second copy of the server, or an open `sqlite3` session with an unfinished transaction | Stop the second process (`lsof /var/lib/naiad/naiad.db` lists who has the file open) |
| `database disk image is malformed` | The file is corrupt | Restore from backup (§4, step 4) |
| `no such column` | A hand-made schema change that this version needs was skipped | Apply it; see `deploy.md` §7 |
| No error, but every sign-in answers `INVALID_CREDENTIALS` and joining answers 404 `No organization runs Naiad in ...` | The server started on a new, empty file: `DATABASE_URL` points somewhere else, or the disk did not survive a restart | Fix the path or the volume; if the old file is gone, restore the latest backup |

---

## 4. Mitigation

1. **Read the error.** `curl -s http://localhost:3000/api/health | jq .components` and the latest `ERROR` log lines.
2. **Check the disk and the file.**
   ```bash
   df -h /var/lib/naiad
   ls -l /var/lib/naiad/
   lsof /var/lib/naiad/naiad.db
   ```
3. **Restart the service** once the cause is removed. The process reopens the file and re-applies the schema on start.
4. **If the file is corrupt**, confirm it and restore:
   ```bash
   sqlite3 /var/lib/naiad/naiad.db "PRAGMA integrity_check;"   # anything other than "ok" is corruption
   ```
   Then follow `backups.md` §3. Data written since the last backup is lost.

---

## 5. Escalation

- Unresolved after **5 minutes**: declare a **SEV-1** using `incident.md`.
- A restore from backup is always a SEV-1, because it loses data: record which backup was used and what time span was lost.
