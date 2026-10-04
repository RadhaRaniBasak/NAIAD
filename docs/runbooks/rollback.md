# Rollback Runbook

**Applies to:** the single-process deployment described in `deploy.md`.  
**Audience:** whoever deployed the release.

There are no revisions to shift traffic between and no deployment pipeline to re-run: a rollback is the previous code, built and restarted on the same host.

---

## 1. When to Roll Back

Within the first minutes after a release, roll back if any of these holds:
- The smoke checks in `deploy.md` §6 fail.
- `GET /api/health` answers 503, or the process exits at start.
- Requests that worked before now end in 5xx (`"statusCode":5` in the `HTTP request finished` log lines).
- The frontend does not load, or sign-in on the Dispatch Queue page fails.

---

## 2. Roll Back the Code

```bash
git checkout <previous release tag or commit>
npm ci
npm run build
# restart the service, then run the smoke checks in deploy.md §6
```

Keeping the previous release in its own directory (with its own `node_modules` and `dist`) makes this a restart instead of a rebuild.

---

## 3. The Database After a Rollback

The schema is applied on every start and only ever adds what is missing (`CREATE ... IF NOT EXISTS`). Nothing removes a table or an index when older code starts, so:

- **The release only added tables or indexes:** older code ignores them. No database step is needed.
- **The release changed an existing table by hand** (`ALTER TABLE`, see `deploy.md` §7): older code may not work with the new shape. Reverse the change by hand, or restore the backup taken before the release.
- **The release wrote bad data:** restore the backup taken before the release (`backups.md` §3). Everything written since that backup is lost, so weigh that against repairing the rows by hand.

---

## 4. Afterwards

- [ ] `curl -s https://<host>/api/health | jq .status` returns `"ok"`
- [ ] The smoke checks in `deploy.md` §6 pass
- [ ] If Sentry is configured, no new errors are arriving
- [ ] Write down what failed and why before the next release attempt (`incident.md` §4 has a template)
