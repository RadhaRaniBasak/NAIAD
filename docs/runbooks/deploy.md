# Deployment Runbook

**Applies to:** the build in this repository: one Node.js process serving the API and the frontend, with its data in one SQLite file.  
**Not covered:** the Cloud Run / Cloud SQL scale-out in `docs/hosting.md` §2. That is a plan; the code does not support it yet.

There is no Dockerfile and no deployment pipeline in the repository. These steps are run by hand on the host. For a quick public demo on a free host without a disk, go to §8.

---

## 1. What You Need

- A machine or container that stays on, with **Node.js 22.18 or newer** (`node --version`).
- A directory on a **disk that survives restarts and redeploys**, for the database file.
- A **reverse proxy or platform router** in front that terminates TLS and sets `X-Forwarded-Proto` (Caddy, nginx, or the router of Fly.io, Render, Railway and similar). The process itself listens on plain HTTP on `PORT`, on all interfaces.
- **One instance only.** The cache, the rate limits and the job queue live in the process, and SQLite is a local file.

---

## 2. Configuration

Production does not read a `.env` file. Put the variables in the process environment through your service manager or platform (for example `node --env-file=/etc/naiad/naiad.env server.ts`, a systemd `EnvironmentFile=`, or the platform's secret settings).

```bash
# /etc/naiad/naiad.env  (readable by the service user only: chmod 600)
NODE_ENV=production
PORT=3000
APP_URL=https://naiad.example.org
DATABASE_URL=file:/var/lib/naiad/naiad.db
AUTH_TOKEN_SECRET=<openssl rand -base64 48>
STORAGE_SIGNING_SECRET=<openssl rand -base64 48>
STRIPE_WEBHOOK_SECRET=<the signing secret of your Stripe webhook endpoint>
```

| Variable | Rule in production |
| :--- | :--- |
| `NODE_ENV` | Must be `production`. Any other value, `staging` included, starts the Vite development server, which hands out the project's source files and is not meant to be reachable from outside. |
| `APP_URL` | Must start with `https://`. HTTP requests are redirected to this origin. |
| `DATABASE_URL` | `file:` followed by the path of the SQLite file, on the persistent disk. Anything else (for example `postgres://`) stops the start. |
| `AUTH_TOKEN_SECRET` | Required, at least 32 characters. Signs sign-in tokens. |
| `STORAGE_SIGNING_SECRET` | Required, at least 16 characters. Signs storage URLs. |
| `STRIPE_WEBHOOK_SECRET` | Required, at least 10 characters. If Stripe is not connected, set a random value: every webhook call is then refused. |
| `SENTRY_DSN` | Optional. Error reporting is off without it. |

The server refuses to start, and lists what is wrong, when a secret is missing or is one of the development values that older versions of this repository published.

**Do not rotate `AUTH_TOKEN_SECRET` casually.** A new value signs everyone out. Coordinators sign in again with their password, but volunteers have no password: their token is their account, so they lose it and have to join again under a new nickname.

---

## 3. Build

```bash
npm ci
npm run build      # writes the frontend to dist/
```

---

## 4. First Start and First Accounts

The database file and its schema are created on the first start: every start applies `src/db/schema.sql`, which only creates what is missing.

```bash
set -a; . /etc/naiad/naiad.env; set +a    # the same environment the service uses
```

**Demo organizations.** Loads Coimbra and Toulouse with one coordinator each. Run it once, on an empty database: seeding empties the tenant tables first, so in production it refuses a database that already has data, and it refuses the public demo password.

```bash
SEED_COORDINATOR_PASSWORD='<a password you choose>' node src/db/seed.ts
```

**Your own organization.** There is no admin screen for this yet. Insert the rows, then set the coordinator's password:

```bash
sqlite3 /var/lib/naiad/naiad.db "
INSERT INTO organizations (id, name, slug, subscription_plan, primary_city_id)
VALUES ('org-example-01', 'Example Basin Authority', 'example-basin', 'standard', 'coimbra');
INSERT INTO users (id, organization_id, nickname, email, role)
VALUES ('usr-example-1', 'org-example-01', 'Ana_Costa', 'ana.costa@example.org', 'coordinator');
"

NEW_PASSWORD='<a password you choose>' node --input-type=module -e "
import { AuthService } from './src/services/auth.ts';
new AuthService().setPassword('usr-example-1', process.env.NEW_PASSWORD);
"
```

`primary_city_id` has to be one of the cities the app ships with (`GET /api/v1/cities`: `coimbra`, `toulouse`, `pilot`), because volunteers join the organization of the city they pick. The same password command changes an existing password; there is no reset screen or route.

---

## 5. Run

```bash
npm start          # node server.ts
```

Run it under whatever keeps a process alive on your host (systemd, a container runtime, the platform). It should restart the process when it exits and stop it with `SIGTERM`: the server then stops taking new requests, lets requests in flight finish, and exits within 10 seconds.

---

## 6. Smoke Checks After Every Deployment

```bash
B=https://naiad.example.org

# Readiness: status "ok", environment "production", database "ok"
curl -s $B/api/health | jq '{status, environment, database: .components.database.status}'

# No token: 401 UNAUTHENTICATED
curl -s -o /dev/null -w '%{http_code}\n' $B/api/v1/request-missions

# Coordinator sign-in returns a token, and the token opens the mission list
TOKEN=$(curl -s -X POST $B/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"<coordinator email>","password":"<password>"}' | jq -r .data.token)
curl -s -H "Authorization: Bearer $TOKEN" $B/api/v1/request-missions | jq '.pagination'

# An unsigned webhook is refused: 400 INVALID_SIGNATURE
curl -s -X POST $B/api/v1/webhooks/stripe -H 'Content-Type: application/json' -d '{}' | jq -r .error.code

# Plain HTTP is redirected to HTTPS (301 from the app, or 308 from some proxies) and the security headers are present
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://naiad.example.org/api/health
curl -sI $B/ | grep -iE 'strict-transport-security|content-security-policy|x-content-type-options'
```

Then open the site, switch to the Dispatch Queue page and sign in.

---

## 7. Releasing a New Version

1. Back up the database (`backups.md`).
2. Put the new code in place, then `npm ci && npm run build`.
3. Restart the process. With a single instance this is a few seconds of downtime, not a zero-downtime rollout.
4. Run the smoke checks.

**Schema changes.** New tables and indexes in `schema.sql` appear on the next start. A change to an existing table does not: `CREATE TABLE IF NOT EXISTS` leaves an existing table as it is, and there is no migration tool. Such a change needs a hand-written `ALTER TABLE` run against the database before the new code starts.

If the release misbehaves, follow `rollback.md`.

---

## 8. A Demo on a Free Host Without a Disk

For showing the prototype, not for real data. A free web service (Render's free plan is the one these steps were written for) has no persistent disk and no shell: its files are wiped on every restart, redeploy or idle spin-down, so the database starts empty each time. The start command below therefore seeds the demo organizations whenever the database is empty.

| Setting | Value |
| :--- | :--- |
| Runtime | Node. The repository's `.node-version` file selects Node 22 |
| Build command | `npm ci && npm run build` |
| Start command | `(node src/db/seed.ts \|\| true) && node server.ts` |
| Health check path | `/api/health/live` |

| Environment variable | Value |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `APP_URL` | The service's own address, for example `https://naiad-demo.onrender.com` |
| `AUTH_TOKEN_SECRET` | A random string of 32 characters or more |
| `STORAGE_SIGNING_SECRET` | A different random string |
| `STRIPE_WEBHOOK_SECRET` | A third random string (no Stripe account is needed: every webhook call is then refused) |
| `SEED_COORDINATOR_PASSWORD` | The password the two demo coordinators sign in with. The public demo password is refused |
| `VITE_REPO_URL` | Optional: the address of the public repository. The footer then links to it |

Do not set `PORT` or `DATABASE_URL`: the host provides the port, and the default database path is inside the service's own, wiped, filesystem.

What to expect:

- The build works without development dependencies, and the start command needs no shell access.
- On a start with an empty database the log shows `Seed completed successfully`. On a host that keeps its disk, later starts log `Refusing to seed: this production database already has data` and carry on: that is the intended behaviour.
- After a wipe, volunteers who had joined are gone: their saved session is refused once and the page asks them to join again. Coordinators sign in again with the same password.
- A free service sleeps when idle, so the first visit after a pause takes about a minute.
- The map, check-ins, crews and trace hunts need none of this: they run on demo data in the browser.
