# ADR 0004: Standard HAPI FHIR R4 Bridge Integration

## Context
Track 7 and European One Health standards mandate interoperability via the OneAquaHealth implementation guide (`hl7.eu.fhir.oah`, FHIR 4.0.1). Outside institutions (such as veterinary hospitals and environmental agencies) need to post `ServiceRequest` resources to query urban streams and retrieve conforming `Observation` resources.

## Decision
Naiad uses an official HAPI FHIR JPA server (available via Docker Compose) for FHIR persistence and conformance checking. Naiad's API includes a FHIR bridge module that translates approved `ServiceRequest` resources into citizen missions and writes back corroborated observations matching the `observation-indicators-oah` profile.

## Alternatives Considered
- **Hand-Rolled Custom Database Schema for FHIR**: Rejected. Implementing hundreds of HL7 FHIR R4 syntax checks, search parameters, and canonical profile validations by hand is brittle and error-prone.
- **Proprietary Commercial Health Cloud APIs**: Rejected due to high monthly SaaS subscription fees and data residency complexities.

## Consequences
- **Positive:** Direct compliance with EU digital health frameworks; outside hospital systems can query the endpoint using standard FHIR client libraries (`fhirclient`, HAPI).
- **Negative:** Running the Java-based HAPI server requires $\ge 2\,\text{GB}$ of RAM, so local or dedicated VM execution is needed for the live FHIR server.

## Implementation Status
**Not implemented.** The repository has no HAPI FHIR server, no Docker Compose file and no FHIR bridge module in the API, and `FHIR_SERVER_URL` is not read by any code. The FHIR loop on the Systems to Streams page is simulated in the browser: `ServiceRequest`, `Task` and `Observation` resources are generated as JSON and are not validated against the `hl7.eu.fhir.oah` profile. The database has a `fhir_service_requests` table that nothing writes to yet.
