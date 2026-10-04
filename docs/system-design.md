# Naiad — System Design Document
**The stream asks. A neighbour answers.**
Demand-Pull Citizen Science for Urban Streams (OneAquaHealth IEEE Global Hackathon 2026, Track 5: Community & Gamification)

---

## 1. Problem Statement & Motivation
Citizen stream monitoring today is overwhelmingly **supply-push**: volunteers visit arbitrary spots when convenient, submit lengthy forms, and receive zero feedback. This produces three systemic failures:
1. **Volunteer drop-off**: a site gets its first visit far more easily than its second. The hackathon's Track 5 names the problem: low repeat engagement. (The 83% figure on the Evidence page is an illustrative example, not a measurement.)
2. **Uneven spatial distribution**: Easy bridge crossings get repeated redundant visits, while ecologically vulnerable outer reaches receive zero observations, preventing meaningful time-series analysis.
3. **Inability for downstream health stakeholders to query the community**: Hospitals, veterinary clinics, municipal water boards, and research labs can read data, but cannot request ground-truth observations when water crises emerge.

Naiad converts stream monitoring to **demand-pull**:
- A **Demand Engine** calculates which 250m reach most needs checking right now based on half-life staleness decay, heavy rain shocks, research lab anomalies, or active contamination incidents.
- Micro-missions ask **only what could have changed** in under 60 seconds with browser-based EXIF stripping and geofencing.
- The volunteer receives a **receipt** detailing points earned (need-based), restored freshness, and reach streak.
- Contaminant alerts launch a **Bayesian Trace Hunt** warning downstream schools/dog parks while bisecting upstream candidate reaches.
- External healthcare systems query the stream community via standard **HL7 FHIR R4 ServiceRequests** and receive structured **Observations**.

---

## 2. User Roles
| Role | Capabilities & Responsibilities |
|---|---|
| **Citizen Volunteer** | Anonymous-first signup (nickname only). Claims nearby missions, performs 60-second micro-checks with photo verification within 75m geofence, reviews receipt, tracks reach streaks, joins crews. |
| **Crew Steward** | Adopts specific reaches with fellow neighbours, students, or runners. Receives 15-minute early priority dispatch for adopted reach missions, maintains multi-week watch streaks, passes the baton when unavailable. |
| **Coordinator / Municipal Officer** | Full network coverage oversight (median data age, freshness %). Approves external FHIR ServiceRequests, validates community advisories before public broadcast, exports official stream segment handoff reports for public works. |
| **External Health Partner** | (Veterinary clinics, hospitals, environmental health agencies). Posts FHIR R4 `ServiceRequest` resources to query stream reaches during animal or human outbreak investigations; reads back validated FHIR `Observation`s. |

---

## 3. Core Workflows
1. **Demand Generation & Prioritization Flow**:
   - Time elapsed decays reach freshness ($f = 0.5^{\text{age}/\text{halfLife}}$).
   - Precipitation $\ge 20\text{mm}$ triggers rain shock ($f \times 0.3$).
   - Reaches with $f < 0.5$ or high lab risk scores generate micro-missions ranked by $\text{value} / (1 + \text{distance})$.
2. **1-Minute Micro-Check & Receipt Flow**:
   - Volunteer approaches within 75m geofence of verified public access point.
   - Form renders *only* the stale indicator group (e.g. water appearance, flow, odor).
   - Photo is captured; HTML5 canvas strips EXIF and GPS tags client-side; optional rephotography ghost overlay assists time-lapse alignment.
   - Payout calculated: $P = \text{round}(100 \times (1 - f))$. Instant celebratory receipt with streak increment.
3. **Trace Hunt Bisection Flow**:
   - Volunteer reports alert sign (sewage, foam, chemical odor).
   - Naiad opens incident (`watch`), models downstream arrival windows (vMin 0.1 m/s to vMax 1.0 m/s) to notify vulnerable playgrounds and dog parks.
   - Graph bisection selects the upstream reach maximizing expected information gain $H(p)$.
   - Once a single reach holds $\ge 80\%$ posterior probability, Naiad generates a municipal handoff report naming the segment.
4. **Systems to Streams FHIR Loop**:
   - Outside clinic posts `ServiceRequest` $\rightarrow$ Coordinator approves $\rightarrow$ FHIR `Task` created $\rightarrow$ Citizen completes mission $\rightarrow$ System generates HL7 EU compliant `Observation` linked via `basedOn`.

---

## 4. Functional Requirements
- **FR-1 (Reach Segmentation)**: Every stream broken into $\sim 250\text{m}$ reaches with topological graph connectivity (`upstream`, `downstream`, `observable`).
- **FR-2 (Decay & Rain Shock)**: Half-lives: Water (3 days), Vegetation (45 days), Structure (365 days). Rain shock ($\ge 20\text{mm}$) applies 0.3 factor; heatwaves halving water half-life.
- **FR-3 (Need-Based Points)**: Routine checks pay $100 \times (1 - f)$; trace checks flat 100; disagreement 80; corroboration bonus +20%. Zero farming possible on freshly checked reaches.
- **FR-4 (Geofence Enforced)**: 75m threshold check client-side against public access points.
- **FR-5 (Offline First)**: Submissions without signal queue locally with idempotency keys and sync on reconnect.
- **FR-6 (Advisory Gate)**: A single report remains at `watch`; two independent positive checks and coordinator review required for `advisory`.
- **FR-7 (Handoff Report)**: Names stream reach segment only; never an individual or private property.

---

## 5. Non-Functional Requirements
- **Performance**: Mission query and demand calculation executes in $<50\text{ms}$ on in-memory graph. Check form submission $<1\text{s}$.
- **Accessibility**: WCAG 2.1 AA compliant. Freshness always conveyed with explicit textual age labels ("3 days old"), never color alone.
- **Privacy & GDPR**: Anonymous-first for volunteers: no email, phone, or home location stored (coordinators sign in with an email address). Client-side EXIF removal.
- **Availability**: Offline-first service worker architecture allows map viewing and form completion without internet connection.
- **Interoperability**: Strict HL7 FHIR R4 profile compatibility (`hl7.eu.fhir.oah`).

---

## 6. Out-of-Scope Items
- Chemical or microbiological water testing (this is visual screening only).
- Declaring water "safe" or "unsafe" (Naiad only reports visible ecological signs).
- Automated AI chatbot assistants or LLM text generation (pure deterministic scientific rules).
- Private property access or trespass routing.

---

## 7. Open Questions & Ecological Assumptions
- Half-life durations (3d water, 45d vegetation, 365d structure) are assumptions to be calibrated by local limnologists.
- Open-Meteo precipitation resolution ($\sim 5\text{km}$) may miss localized micro-bursts in mountainous catchments.
- False negative miss rate (20%) and false positive rate (5%) in trace hunts require field verification across different volunteer age cohorts.

---

## 8. Implementation Status
What this prototype does today, requirement by requirement. `docs/architecture.md` §7 has the full list of what is designed but not built.

| Requirement | Status |
|---|---|
| FR-1 Reach segmentation | Implemented for three demo networks (`src/data/networks.ts`), with the graph functions in `src/engine/graph.ts`. |
| FR-2 Decay & rain shock | Implemented and tested in `src/engine/freshness.ts`. Weather is a control on screen, not a live feed. |
| FR-3 Need-based points | Routine, trace and disagreement payouts are implemented. The corroboration bonus is not. |
| FR-4 Geofence | The 75m rule is enforced in the check-in dialog against a simulated position. |
| FR-5 Offline first | Simulated: a toggle queues check-ins in memory and syncs them on "reconnect". No service worker, nothing survives a reload. |
| FR-6 Advisory gate | Implemented in the browser app (two positive checks, then coordinator review). |
| FR-7 Handoff report | Implemented in the browser app. |
| Anonymous-first signup | Implemented in the API: `POST /api/v1/auth/join` takes a nickname and returns a token. Coordinators sign in with email and password. |
| EXIF removal | Not implemented: the check-in uses sample photos and shows the step without performing it. |
| FHIR R4 loop | Simulated in the browser: resources are generated, not validated against the `hl7.eu.fhir.oah` profile. |
| Accessibility | Dialog roles, labelled controls and text freshness labels are covered by `src/components/__tests__/a11y.test.tsx`; pages reflow down to 320px. A full WCAG 2.1 AA audit has not been done. |

The check-in, crew, trace and FHIR flows run on demo data in the browser. The API (sign-in, missions, storage tickets, billing webhook, GDPR) is real and tested, and is used by the Dispatch Queue page.
