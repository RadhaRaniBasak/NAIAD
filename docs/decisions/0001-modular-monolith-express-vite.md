# ADR 0001: Modular Monolith with Express and Vite

## Context
Naiad is built by a solo/small team for the OneAquaHealth Hackathon and subsequent field pilot. The application requires an installable citizen Progressive Web App (PWA), a coordinator console, REST API endpoints for mission dispatch and check intake, and shared execution of scientific algorithms (stream freshness decay, Bayesian trace bisection). Splitting the project into independent microservices or separate frontend/backend repositories creates high deployment friction, synchronization bugs, and distributed ops overhead.

## Decision
We choose a **modular monolith** with Express 4 and Vite running in a single Node.js runtime (`server.ts`). In development, Express mounts `vite.middlewares`. The pure TypeScript engine resides in `src/engine/` and is directly imported by both client components and server route handlers.

## Alternatives Considered
- **Microservices (Go / Python + React)**: Rejected due to network boundary latency, IPC serialization overhead, duplicated type definitions, and complex container orchestration for a small team.
- **Next.js Full-Stack App Router**: Rejected due to server action complexity, aggressive edge caching behaviors, hydration issues with Leaflet/MapLibre, and vendor lock-in.

## Consequences
- **Positive:** Single repository, single `npm install`, zero-latency code sharing of domain engine logic, atomic git commits across frontend and backend.
- **Negative:** Horizontal scaling scales both API and static asset handling together; however, traffic volume ($<1.5$ peak RPS) is orders of magnitude below single-node capacity.

## Implementation Status
**Implemented.** One Node.js process (`server.ts` with the API in `src/api.ts`) serves the API and the frontend; in development it mounts the Vite middleware. Two details differ from the text above:
- The frontend is a single-page app. It is not yet an installable PWA: there is no web app manifest and no service worker.
- The engine runs in the browser app and in the tests. No API route calls it yet, because the product flows that need it (demand, check-ins, trace hunts) still run on demo data in the browser (`docs/architecture.md` §1 and §7).
