# Naiad Incident Response Process & Post-Incident Review Guide

**Purpose:** Standard operating procedure for declaring, coordinating, communicating, and learning from production incidents.

This is a process for people. Channel names, roles and handles below are placeholders for whatever your team uses: nothing in the repository pages anyone or posts to a channel (see `docs/monitoring.md` for what is and is not automated).

---

## 1. Incident Severity Matrix

| Severity | Criteria | Response Target | Comms Cadence | Examples |
| :--- | :--- | :--- | :--- | :--- |
| **SEV-1 (Critical)** | Core workflow completely down for multiple organizations; data loss or corruption; security breach. | Immediate (< 10m) | Every 30 mins | The server will not start, the database file is corrupt or lost, data visible across organizations, a leaked signing secret. |
| **SEV-2 (Major)** | Core workflow degraded for some users. | < 30m | Every 60 mins | Mission creation failing with 500s, sign-in failing for one organization, responses taking seconds. |
| **SEV-3 (Minor)** | Non-critical feature broken; workaround available; minimal user impact. | Next business day | On resolution | Cosmetic UI glitch, a wrong label, a broken link. |

---

## 2. How to Declare an Incident

1. **Step 1: Open the Incident Channel**
   - Post in your incident channel (for example `#eng-incidents`):
     ```text
     🚨 DECLARING INCIDENT: SEV-1 - Database file unreadable on production
     Incident Commander (IC): @alice
     Technical Lead: @bob
     Communications Lead: @carol
     Bridge Link: <video call link>
     ```
2. **Step 2: Assign Incident Roles**
   - **Incident Commander (IC):** Drives the triage cadence, makes rollback and restore decisions, prevents distraction.
   - **Technical Lead (TL):** Coordinates diagnostics, rollbacks, or hotfixes, using the runbooks in this folder.
   - **Communications Lead (CL):** Writes the updates to affected organizations.
   - On a team of one or two, one person holds several roles. Name them anyway, so it is clear who decides.
3. **Step 3: Tell the People Affected**
   - The public status page (`/status`) shows the live readiness report and updates itself. It cannot carry a message, and it is served by the same process, so it is unreachable when the server is down.
   - Send updates directly (email or the channel you share with each organization's coordinator), using the templates below.

---

## 3. Customer Communication Guidelines & Templates

### Rule: Be Honest, Avoid Technical Jargon, Give Next Update Time
Never speculate on cause to customers. Keep messages concise and action-oriented.

#### Template A: Initial Declaration (Sent within 15 minutes of SEV-1)
> **Headline:** Investigating Reports of Stream Sampling & Mission Access Issues  
> **Body:** We are currently investigating an issue impacting the Naiad watershed platform. Some volunteers and coordinators may experience errors loading stream reach indicators or dispatching missions. We are actively diagnosing the root cause. We will provide an update within 30 minutes.

#### Template B: Update (Identified Root Cause)
> **Headline:** Issue Identified — Working on Mitigation  
> **Body:** We have identified the cause of the recent platform degradation. A fix is currently being deployed. We will provide our next update within 30 minutes or as soon as service is restored.

Only add "your data is safe" once you have confirmed that no restore from backup is needed.

#### Template C: Resolution
> **Headline:** All Systems Fully Operational  
> **Body:** The issue impacting the Naiad platform has been fully resolved. All API endpoints, map views, and mission dispatch systems are responding normally. We apologize for the disruption and will publish a full post-incident review within 48 hours.

---

## 4. Post-Incident Review (PIR) Template

*A blameless post-incident review must be completed within 48 hours for any SEV-1 or SEV-2 incident.*

```markdown
# Post-Incident Review: [Incident Title]

**Date:** YYYY-MM-DD  
**Severity:** [SEV-1 / SEV-2]  
**Incident Commander:** @name  
**Duration:** HH:MM (Downtime: XX mins)  
**Impact:** Number of organizations affected, percentage of requests failed, data lost (if a backup was restored).

---

### 1. Executive Summary
A 2-3 sentence overview of what happened, why it happened, and how it was resolved.

### 2. Timeline (All times in UTC)
- **12:00 UTC** - A coordinator reports that new missions fail with an error.
- **12:05 UTC** - Incident Commander declares SEV-2.
- **12:12 UTC** - Affected organizations told by email.
- **12:20 UTC** - Root cause identified: a maintenance script holds a write lock on the database file.
- **12:28 UTC** - Script stopped; writes succeed again.
- **12:35 UTC** - Logs show no further 5xx responses.
- **12:40 UTC** - Incident closed; resolution message sent.

### 3. Root Cause Analysis (The 5 Whys)
1. Why did mission creation fail? Writes to the database were refused.
2. Why were they refused? Another process held the write lock.
3. Why did it hold the lock? A maintenance script opened a transaction and waited for input.
4. Why was it run against production? There was no copy of the data to try it on.
5. Why was there no copy? Restoring a backup to a scratch file was not part of the routine.

### 4. What Went Well
- The error log named the cause (`database is locked`).
- The runbook steps found the process holding the file.
- No data was lost.

### 5. What Went Poorly
- Nobody was alerted: a user reported the failure.
- The first customer update was delayed by 18 minutes.

### 6. Corrective Action Items
| Action Item | Type (Prevent / Detect / Mitigate) | Owner | Target Date |
| :--- | :--- | :--- | :--- |
| Try maintenance scripts on a restored backup first | Prevent | @bob | YYYY-MM-DD |
| Alert on 5xx responses in the request log | Detect | @alice | YYYY-MM-DD |
| Add a probe that performs a write | Detect | @carol | YYYY-MM-DD |
```
