# Backup & Restore Runbook

**What holds data:** one SQLite file, at the path in `DATABASE_URL` (the examples use `/var/lib/naiad/naiad.db`). Nothing else is stateful: the cache and the rate limits are rebuilt in memory, and no photo bucket is connected yet.

**What exists today:** the commands below, run by hand or from a scheduler you set up (cron, a systemd timer, the platform's scheduled jobs). The repository does not schedule backups, and there is no continuous archiving or point-in-time recovery: you can restore to the moment a backup was taken, not to an arbitrary second. How much data a failure can cost is therefore the time since the last backup.

---

## 1. Take a Backup

Both commands are safe while the server is running: they copy a consistent snapshot, and the five-second timeout makes them wait for a write in progress instead of failing with `database is locked`. Do not copy the file with `cp` while the server is up: a copy taken in the middle of a write can be unusable.

```bash
# With the sqlite3 command-line tool
sqlite3 /var/lib/naiad/naiad.db ".timeout 5000" ".backup '/var/backups/naiad/naiad-$(date +%F).db'"

# Or with Node.js alone
node -e "
const { DatabaseSync, backup } = require('node:sqlite');
const [source, target] = process.argv.slice(1);
const db = new DatabaseSync(source, { readOnly: true });
db.exec('PRAGMA busy_timeout = 5000');
backup(db, target).then((pages) => console.log('backed up', pages, 'pages'));
" /var/lib/naiad/naiad.db "/var/backups/naiad/naiad-$(date +%F).db"
```

Keep the copies on a different disk or machine from the database, and delete old ones on a schedule that suits you. A backup holds personal data (nicknames, coordinator email addresses, password hashes), so store it with the same care as the database.

---

## 2. Check That a Backup Restores

```bash
# In the same environment the service uses (see deploy.md §4)
DATABASE_URL=file:/var/backups/naiad/naiad-2026-10-03.db npm run db:restore-test
```

The script copies the file into a `restore_test` folder next to it, runs SQLite's integrity and foreign-key checks, reads the main tables, performs a test write on the copy, and deletes the copy. It never touches the live database.

Its last step compares row counts against the demo seed (at least 2 organizations, 6 users and 2 checks). On a database that was not seeded with the demo data that step fails even when the backup is intact; the integrity and foreign-key lines above it are the ones that matter there.

Without the override it copies and checks the database that `DATABASE_URL` already points to: `data/naiad.db` in local development. Nothing runs it automatically.

---

## 3. Restore

Everything written after the backup was taken is lost.

```bash
# 1. Stop the service, so nothing is writing
# 2. Keep the damaged file for the post-incident review
mv /var/lib/naiad/naiad.db /var/lib/naiad/naiad.db.damaged
# 3. Put the backup in place
cp /var/backups/naiad/naiad-2026-10-03.db /var/lib/naiad/naiad.db
# 4. Start the service and check it
curl -s http://localhost:3000/api/health | jq '{status, database: .components.database.status}'
```

Tokens issued before the restore keep working as long as their user still exists in the restored data. A volunteer who joined after the backup was taken is no longer in the database and has to join again.
