# Naiad Hosting: Today's Build and the Scale-Out Plan

**Target Environment:** European Pilot Basins (Mondego, Coimbra, PT & Touch/Garonne, Toulouse, FR)  
**Primary Region:** `europe-west1` (Belgium) / `europe-southwest1` (Madrid)  
**Team Constraints:** 1–3 Engineers, Zero Dedicated Ops, Launch Budget: ~$50–$100/month  

---

## 1. What Runs Today

Naiad is one Node.js 22 process (`npm start`) that serves the API and the built frontend on a single port, with its data in one SQLite file. That shapes where it can be hosted:

- **One instance.** The cache, the rate limits and the job queue live in the process, and SQLite is a local file. Do not run two copies against the same data.
- **A persistent disk.** Point `DATABASE_URL` at a file on a volume that survives restarts (for example `file:/data/naiad.db`). On a platform with an ephemeral filesystem and no volume, every restart starts from an empty database.
- **Three secrets and an HTTPS URL.** Production refuses to start without `AUTH_TOKEN_SECRET`, `STORAGE_SIGNING_SECRET`, `STRIPE_WEBHOOK_SECRET` and an `https://` `APP_URL`.
- **TLS in front.** The process speaks HTTP and expects a reverse proxy or platform router that terminates TLS and sets `X-Forwarded-Proto`.

Anything that offers a small always-on container or VM with a mounted disk fits: a single VM, Fly.io with a volume, Render with a disk, Railway with a volume. `docs/runbooks/deploy.md` has the steps, and its §8 covers a throwaway demo on a free host that has no disk. There is no Dockerfile in the repository yet.

---

## 2. Scale-Out Plan (Not Implemented)

Everything from here on is a sizing and cost plan for growing beyond one instance. **None of it exists in the code**, and the prices are planning estimates that have not been re-checked against current provider pricing. Before it applies, the code needs:

| Plan component | What the code needs first |
| :--- | :--- |
| Cloud Run with several instances | A shared database, cache and rate-limit store instead of the in-process ones |
| Cloud SQL for PostgreSQL | A PostgreSQL client and migrations: the data layer is written against `node:sqlite` |
| Cloud Storage for photos | An upload path: the API signs upload and download tickets, but no bucket receives files |
| Cloud Scheduler driving jobs | A scheduled entry point and real job handlers: today jobs run when enqueued and the handlers only log |
| Transactional email | A mail client: the `send_email` handler writes a log line |

### 2.1 Component Specifications: Launch vs. 10x Scale

#### Component 1: Frontend & Static Delivery
- **Launch Provider & Plan:** Cloudflare Pages (Free Tier) or Cloud Run static serving via Vite middlewares.
  - *Monthly Cost at Launch:* **$0.00**
  - *Capabilities:* Global edge Anycast CDN, automatic SSL certificates, HTTP/3, Brotli compression.
- **10x Scale (50,000 MAU):** Cloudflare Pro ($20/month) for advanced WAF rule-sets and edge cache reserve.
  - *Monthly Cost at 10x:* **$20.00**
  - *Changes at 10x:* Enable stale-while-revalidate for GeoJSON stream network layers.

#### Component 2: Backend Application Server (API Monolith)
- **Launch Provider & Plan:** Google Cloud Run (Fully Managed, CPU allocated during requests, `min-instances: 0`, `max-instances: 3`, 1 vCPU, 1GB RAM).
  - *Monthly Cost at Launch:* **$12.00** (mostly within free tier: 2M requests/month free).
  - *Capabilities:* Zero ops, zero idle billing, automated zero-downtime blue/green rollouts, native health check probes.
- **10x Scale (50,000 MAU):** Cloud Run with `min-instances: 1` to eliminate cold starts during rain storm surge hours, auto-scaling up to 10 instances.
  - *Monthly Cost at 10x:* **$75.00**
  - *Changes at 10x:* Move session state and rate limits to shared Redis.

#### Component 3: Relational Database (Relational Core)
- **Launch Provider & Plan:** Google Cloud SQL for PostgreSQL (db-f1-micro, 1 vCPU, 0.6 GB RAM, 10 GB SSD, automated daily backups with 7-day point-in-time recovery WAL).
  - *Monthly Cost at Launch:* **$18.50**
  - *Capabilities:* Automated daily snapshots, SSL client enforcement, PostGIS support for reach coordinates.
- **10x Scale (50,000 MAU):** Cloud SQL db-custom-2-7680 (2 vCPU, 7.5 GB RAM, 50 GB SSD, High Availability multi-zone failover + PgBouncer connection pooler).
  - *Monthly Cost at 10x:* **$145.00**
  - *Changes at 10x:* Deploy PgBouncer sidecar container to handle 1,000+ simultaneous volunteer photo submissions.

#### Component 4: Object Storage (Volunteer Photo Evidence)
- **Launch Provider & Plan:** Google Cloud Storage Standard (`europe-west1`), 20 GB stored, lifecycle policy archiving photos > 180 days to Nearline.
  - *Monthly Cost at Launch:* **$2.50**
  - *Capabilities:* Pre-signed PUT/GET URLs with HMAC SHA-256 tokens, client-side EXIF stripped prior to transmission.
- **10x Scale (50,000 MAU):** 500 GB active storage + 2 TB archived in Nearline storage.
  - *Monthly Cost at 10x:* **$32.00**
  - *Changes at 10x:* CDN signed URL fronting for high-traffic public river evidence galleries.

#### Component 5: Background Jobs & Scheduler
- **Launch Provider & Plan:** The in-process job queue (`JobQueue` in `src/services/queue.ts`), driven by Cloud Scheduler pings to a tick endpoint that would have to be added.
  - *Monthly Cost at Launch:* **$1.00** (Cloud Scheduler: 3 free jobs, $0.10/job thereafter).
  - *Capabilities:* Retries up to a per-job limit, Dead Letter Queue (DLQ), idempotent enqueue, zero additional infrastructure.
- **10x Scale (50,000 MAU):** Upstash Managed Redis + BullMQ worker service running as a dedicated Cloud Run background worker.
  - *Monthly Cost at 10x:* **$26.00**
  - *Changes at 10x:* Decouple CPU-intensive Bayesian bisection calculations into background worker threads.

#### Component 6: Transactional Email & Agency FHIR Alerts
- **Launch Provider & Plan:** Resend.com / SendGrid Developer Tier (3,000 emails/month free).
  - *Monthly Cost at Launch:* **$0.00**
  - *Capabilities:* DKIM, SPF, DMARC alignment, rapid API delivery.
- **10x Scale (50,000 MAU):** Resend Pro Tier (50,000 emails/month for crew streak digests and health agency warnings).
  - *Monthly Cost at 10x:* **$20.00**
  - *Changes at 10x:* Implement webhook suppression lists and dedicated sending IP.

---

### 2.2 Total Monthly Cost Summary Across Scale Tiers

| Component | Launch (5k MAU) | 10x Scale (50k MAU) | 100x Scale (500k MAU) | Primary Cost Driver |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend CDN** | $0.00 | $20.00 | $200.00 | Cloudflare Business tier WAF, DDoS & Edge Cache Tags |
| **Backend API (Cloud Run)** | $12.00 | $75.00 | $420.00 | 10-15 sustained instances, storm concurrency spikes |
| **Database (Cloud SQL Postgres)** | $18.50 | $145.00 | $570.00 | HA multi-zone, read replica, 8 vCPU/32GB RAM, PostGIS |
| **Object Storage (GCS Photos)** | $2.50 | $32.00 | $380.00 | 5 TB active standard + 25 TB Nearline/Coldline archive |
| **Background Queue & Redis** | $1.00 | $26.00 | $250.00 | Managed Redis cluster + Cloud Run background worker fleet |
| **Transactional Email / Alerts** | $0.00 | $20.00 | $150.00 | 500k monthly emails (Resend Scale / SendGrid Pro) |
| **Network Egress & DNS** | $4.00 | $15.00 | $120.00 | Cross-region origin fetch & API response egress |
| **Observability (Sentry / Logs)** | $0.00 | $0.00 | $80.00 | Sentry Team/Business tier (event volume & traces) |
| **TOTAL** | **$38.00 / month** | **$333.00 / month** | **$2,170.00 / month** | **Cost per active user drops from $0.0076 to $0.0043** |

---

### 2.3 Most Expensive Components & Reduction Strategies

#### A. At 10x Scale (50,000 MAU — $333/month)
- **Most Expensive Component:** **Cloud SQL PostgreSQL at $145.00/month (43.5% of total budget)**.
- **Root Cause:** Provisioning High Availability (HA) multi-zone failover and dedicated memory (7.5 GB RAM) to handle peak connection concurrency from bursty Cloud Run container scaling.
- **Actionable Cost-Reduction Tactics:**
  1. **Deploy PgBouncer in Transaction Pooling Mode:** By sharing 20-30 physical database connections among 1,000+ client requests, database instance size can be downgraded to `db-custom-1-3840` (1 vCPU, 3.75 GB RAM), saving **~$65.00/month (45% reduction on DB cost)**.
  2. **Cache-Aside on River Reaches (`CacheService`):** Ensure `GET /api/v1/reaches` achieves a 95%+ cache hit ratio. Diverting 95% of reads away from Postgres removes query pressure and eliminates the need for early database tier upgrades.
  3. **Tune Snapshot Retention:** Configure automated backup WAL retention to 3 days instead of 7 days in development/staging environments, saving storage IOPS.

---

#### B. At 100x Scale (500,000 MAU — $2,170/month)
- **Most Expensive Component:** **Cloud SQL with Dedicated Read Replica & HA at $570.00/month (26.3% of total budget)**, followed by **Backend Compute (Cloud Run) at $420.00/month (19.4%)** and **Object Storage (GCS) at $380.00/month (17.5%)**.
- **Root Cause:** Database read-write contention across millions of cumulative stream checks, continuous container CPU during storm sampling surges, and petabyte-scale high-resolution photo evidence storage.
- **Actionable Cost-Reduction Tactics:**
  1. **Edge CDN Caching for Geographic Reach Vectors:** Serve stream reach indicators and topology trees directly from Cloudflare edge caches (`Cache-Control: public, s-maxage=86400, stale-while-revalidate=600`). This reduces database read volume by > 80%, allowing the read replica to be downscaled from 8 vCPU to 2 vCPU, saving **~$220.00/month**.
  2. **Client-Side Image WebP Compression & Canvas Resizing:** Assume volunteers upload 4-8 MB original camera JPEGs. Compressing images client-side prior to signed GCS upload (WebP, 80% quality, max 1600px dimension) shrinks average asset size to ~350 KB (a 92% reduction). This lowers GCS storage and bandwidth costs from $380/mo to **~$120.00/mo (saving ~$260.00/month)**.
  3. **Optimize Cloud Run Concurrency & CPU Throttling:** Increase container concurrency from default 20 to 80 requests per instance, and enable `cpu-throttling = true` so instances are billed purely during active request processing. This cuts active compute requirements in half, saving **~$200.00/month**.
  4. **Aggressive Object Lifecycle Rules:** Automatically transition photos older than 60 days to Google Cloud Storage Coldline / Archive ($0.004/GB/mo vs. $0.020/GB/mo for Standard), slashing historical storage bills by 80%.
- **Net Optimized Spend at 100x:** Applying these four levers reduces total 100x infrastructure spend from **$2,170.00/mo to ~$1,470.00/mo** (a 32% overall operational savings).

---

### 2.4 Architectural Modifications Required at 10x and 100x Scale

1. **Connection Pooling:** Introduce PgBouncer in front of PostgreSQL to prevent server connection limits from bottlenecking Cloud Run auto-scaling instances.
2. **Distributed Queue:** Migrate the in-process queue to managed Redis BullMQ when worker tasks exceed memory limits or require multi-container distributed leasing.
3. **Read Replicas & CQRS:** Route read-heavy map GeoJSON queries (`GET /api/v1/reaches`) to a read-replica database instance.
4. **Edge GeoJSON Caching:** Offload static reach geometries and river basin topological orders to Cloudflare edge nodes with Cache-Tags.
