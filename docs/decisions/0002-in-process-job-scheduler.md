# ADR 0002: In-Process Job Scheduler

## Context
The Naiad demand engine requires periodic execution:
1. Recomputing reach freshness decay and evaluating rain shock triggers every 15 minutes.
2. Synchronizing Open-Meteo weather forecasts and precipitation archives hourly.
3. Expiring unclaimed missions after 72 hours.
At our initial scale across 5 research cities ($\approx 2,500$ reaches), a demand pass takes $<50\,\text{ms}$ of CPU time.

## Decision
Run scheduled tasks in-process within the main Node.js process using a lightweight timer scheduler (`node-cron` or setInterval with an execution mutex).

## Alternatives Considered
- **Redis + BullMQ / Celery**: Rejected. Running an external Redis broker adds infrastructure costs, memory footprint, and another service to monitor and maintain.
- **Serverless Cloud Cron (AWS EventBridge / Cloud Tasks)**: Rejected for the prototype to preserve local self-containment and avoid cloud provider vendor lock-in.

## Consequences
- **Positive:** Zero external infrastructure dependencies; runs identically in local development, Docker Compose, and production containers.
- **Negative:** If the Node.js process is stopped, scheduled jobs do not run. Mitigated by running an immediate catch-up demand pass upon server bootstrap.

## Implementation Status
**Partly implemented.** The in-process job queue exists (`src/services/queue.ts`: idempotent enqueue, retries up to a per-job limit, a dead letter state), stored in the `background_jobs` table. The scheduler does not:
- There is no timer. A processing pass runs only when a job is enqueued, nothing in the application enqueues one yet, and the four handlers only write a log line.
- None of the three periodic tasks in the context above runs on the server. Freshness decay and rain shocks are computed in the browser on demo data, weather is an on-screen control, and missions are not expired by a job.
- The catch-up demand pass on server start does not exist either.
