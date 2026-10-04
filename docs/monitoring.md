# Naiad Production Monitoring & Alerting Strategy

**Goal:** Rapid detection of customer-impacting degradation, actionable alerting with zero alert fatigue, and transparent system observability.

**Status:** this is the monitoring plan for a production deployment. What the code provides for it today:
- `GET /api/health/live` and `GET /api/health` (database, cache and queue probes with latency; 503 when the database is down or the server is draining).
- One JSON log line per request start and finish, with method, path, status code, duration, request id and, once the caller is signed in, user and organization. Sensitive values are redacted.
- Sentry error reporting when `SENTRY_DSN` is set, scrubbed of PII and tagged with request and organization.
- The public status page (`/status`), which shows the live readiness report.

Not provided: a metrics endpoint, probes, dashboards, alert rules or paging. The metric names below are what a log-based or Prometheus-style pipeline would have to compute from those log lines.

---

## 1. Monitoring Philosophy & Rules of Engagement

1. **Only Alert on Human Action:** If an alert fires, a human engineer or operator must need to take immediate action. Self-healing transient spikes or informational metric fluctuations belong in dashboards, not pager alerts.
2. **Symptom-Based Over Cause-Based:** Prioritize end-user symptoms (e.g., users receiving 500s, p95 latency > 300ms) over low-level machinery (e.g., CPU 75%).
3. **Every Alert Links to a Runbook:** No alert may fire into PagerDuty / Slack without an explicit hyperlink to a corresponding step-by-step resolution runbook in `/docs/runbooks/`.

---

## 2. Synthetic Uptime & Blackbox Probes

Synthetic probes poll every **30 seconds** from multiple geographic regions (US-East, EU-Central, AP-Southeast). Two limits in the code shape them: sign-in is limited to 20 attempts per 15 minutes per address, so the sign-in probe runs every 5 minutes, and the authenticated probes reuse the token it returns (valid 12 hours) instead of signing in each time.

| Endpoint | Probe Type | Expected Response | Failure Threshold | Impact if Down |
| :--- | :--- | :--- | :--- | :--- |
| **Homepage & PWA App** (`GET /`) | HTTP GET | `200 OK`, HTML containing `<div id="root">` | 2 consecutive failures across 2 regions | Public cannot access landing page or boot web application. |
| **Sign-In** (`POST /api/v1/auth/login`) | HTTP POST with a dedicated monitoring account, every 5 minutes | `200 OK`, JSON with a token | 2 consecutive failures | Coordinators unable to sign in. |
| **Full Readiness Health** (`GET /api/health`) | HTTP GET | `200 OK`, `status: "ok"` | 2 consecutive failures | Core system dependency (DB, cache, or queue worker) is impaired. |
| **Core Workflow: Reaches** (`GET /api/v1/reaches`) | HTTP GET with the monitoring account's bearer token | `200 OK`, reaches array | 2 consecutive failures | Reach data unavailable to API clients. |
| **Core Workflow: Missions** (`GET /api/v1/request-missions`) | HTTP GET with the monitoring account's bearer token | `200 OK`, missions array | 2 consecutive failures | Coordinators and volunteers cannot load the mission queue. |

---

## 3. Key Technical Metrics

### A. HTTP Error Rate
- **Metric:** `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100`
- **Target:** `< 0.1%` (99.9% availability target).
- **Collection:** derived from the `HTTP request finished` log lines (`statusCode`, `durationMs`).

### B. p95 Latency Per Endpoint
- **Metric:** `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, path))`
- **Targets:**
  - `GET /api/v1/reaches`: `< 100ms` (served from the in-process cache)
  - `GET /api/v1/request-missions`: `< 150ms` (cursor paginated)
  - `POST /api/v1/request-missions`: `< 250ms`
  - `GET /api/health`: `< 50ms`

### C. Database Connectivity & Pool Health
- **Metrics:**
  - `db_ping_latency_ms`: SQLite execution time for `SELECT 1;` probe (Target `< 5ms`).
  - `db_slow_queries_count`: Queries executing in `> 100ms`.
  - `db_deadlocks_total`: Lock contention frequency.

### D. Background Job Queue Depth & Failure Rate
- **Metrics:**
  - `job_queue_pending_depth`: Number of jobs waiting in `background_jobs` with `status = 'pending'`.
  - `job_queue_dlq_count`: Number of jobs moved to `failed` state (Dead Letter Queue).
  - `job_queue_retry_ratio`: `sum(attempts > 1) / sum(total_jobs)`.

---

## 4. Key Business Metrics

Business telemetry to compute hourly for an operations dashboard (no job computes it yet):

| Metric | Source / Query | Healthy Threshold | Business Significance |
| :--- | :--- | :--- | :--- |
| **New Volunteer Signups** | `COUNT(*) FROM users WHERE created_at >= NOW() - 1d` | > 10 / day | Community volunteer growth and watershed adoption. |
| **Weekly Active Watershed Orgs (WAO)** | `COUNT(DISTINCT organization_id) FROM checks WHERE created_at >= NOW() - 7d` | > 95% of onboarded orgs | Platform retention and regulatory sampling adherence. |
| **Successful Subscription Invoices** | Stripe `invoice.paid` webhook events | > 98% billing capture | Recurring revenue and plan contract renewals. |
| **Failed Subscription Invoices** | Stripe `invoice.payment_failed` webhook events | < 2% of renewal volume | Involuntary churn risk; requires billing ops outreach. |

---

## 5. Actionable Alert Rules Matrix

| Alert Name | Condition & Threshold | Duration | Severity | Notification Channel & Responder | Runbook Link |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DatabaseConnectivityFailure** | `/api/health` reports `components.database.status != "ok"` OR DB probe fails | 1 minute | **P1 (Critical)** | PagerDuty On-Call SRE + `#eng-urgent` Slack | [Runbook: Database Unhealthy](./runbooks/database-unhealthy.md) |
| **HighApi5xxErrorRate** | HTTP 5xx responses exceed 2% of total traffic | 3 minutes | **P1 (Critical)** | PagerDuty On-Call SRE + `#eng-urgent` Slack | [Runbook: High 5xx Error Rate](./runbooks/high-5xx-error-rate.md) |
| **CoreWorkflowLatencyDegradation** | p95 latency on `/api/v1/reaches` or `/api/v1/request-missions` > 500ms | 5 minutes | **P2 (High)** | `#eng-oncall` Slack + Email to Backend Lead | [Runbook: p95 Latency Spike](./runbooks/p95-latency-spike.md) |
| **JobQueueBacklogOrDeadLetterSurge** | Pending queue depth > 500 OR > 10 jobs fail in DLQ | 10 minutes | **P2 (High)** | `#eng-oncall` Slack | [Runbook: Queue Backlog / DLQ Surge](./runbooks/job-queue-backlog-or-dlq-surge.md) |
| **SubscriptionPaymentFailureSurge** | > 3 payment failures in a 24-hour rolling window | Immediate | **P3 (Medium)** | `#billing-ops` Slack + Finance Digest | [Runbook: Payment Failure Surge](./runbooks/payment-failure-surge.md) |
