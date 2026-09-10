# API Integration

How the frontend talks to the backend, plus the audit of the provided Fastify API that every layer is built against.

> **Companion documents.** A later pass re-derived the contract from the backend's own source and probed it with live requests: the complete endpoint/field inventory, verified business rules and backend limitations live in [../backend/BACKEND-API-AUDIT.md](../backend/BACKEND-API-AUDIT.md), and the per-endpoint UX obligations (loading, empty, validation, business failure, 404, 5xx, network, retry, duplicate submit, race) in [../backend/API-UX-STATE-MATRIX.md](../backend/API-UX-STATE-MATRIX.md). Where this document and the audit disagree, **the audit is authoritative** — it was verified against a running server.

## 0. Layering

Components never know endpoint URLs; features never call `HttpClient`. Every request flows through the same stack:

```
Browser
  ↓
Angular feature (component reads signals only)
  ↓
SignalStore (GardensStore / GardenDetailStore / PlantsIndexStore)
  ↓
QueryCache (SWR reads, de-dup)          ← core/resilience
  ↓
Typed API service (GardensApi / PlantsApi / UsersApi)   ← core/api
  ↓  DTO → domain mapping (pure functions, mappers.ts)
HttpClient (fetch)
  ↓  interceptors: [base-url] → [retry w/ backoff + jitter]
Home Garden backend (Fastify, :3000, proxied at /api)
```

DTO types are hand-written mirrors of the backend zod schemas rather than generated (rationale and the flip-to-generator seam: [ADR-006](../adr/ADR-006-monorepo-and-tooling.md)). Domain models (`Garden`, `Plant`) are what stores and components see; DTO shape never leaks past `core/api`.

---

# Backend Audit — `apps/api`

Findings from reading the Fastify backend source before writing a line of frontend code. This document is the contract the frontend is built against.

## 1. Surface

Base URL: `http://localhost:3000` · OpenAPI docs at `/docs` · Bruno collection in `/bruno`.

| Resource | Endpoints                                                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Gardens  | `GET /gardens` · `GET /gardens/:gardenId` · `POST /gardens` · `PUT /gardens/:gardenId` · `DELETE /gardens/:gardenId`                    |
| Plants   | `GET /plants/:plantId` · `GET /plants/garden/:gardenId` · `POST /plants` · `PUT /plants/:plantId` · `DELETE /plants/:plantId`           |
| Users    | `GET /users` · `GET /users/:userId` · `GET /users/email/:emailAddress` · `POST /users` · `PUT /users/:userId` · `DELETE /users/:userId` |

## 2. Contracts (from the zod schemas — the real source of truth)

### Garden (`garden.schema.ts`)

| Field                                | Type           | Rules                                                                                           |
| ------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------- |
| `gardenName`                         | string         | required, min 1, trimmed                                                                        |
| `totalSurfaceArea`                   | number         | required, ≥ 0                                                                                   |
| `locationDescription`                | string \| null | optional                                                                                        |
| `latitude` / `longitude`             | number \| null | optional, −90..90 / −180..180, **must be provided together or not at all** (cross-field refine) |
| `targetHumidityLevel`                | number         | **added by us** (0–100) — see gap #1 below                                                      |
| `gardenId`, `createdAt`, `updatedAt` | —              | response only                                                                                   |

### Plant (`plant.schema.ts`)

| Field                 | Type         | Rules                              |
| --------------------- | ------------ | ---------------------------------- |
| `plantName`           | string       | required, min 1, trimmed           |
| `species`             | string       | required, min 1                    |
| `plantType`           | enum         | `vegetable` \| `fruit` \| `flower` |
| `plantationDate`      | ISO datetime | required                           |
| `surfaceAreaRequired` | number       | ≥ 0                                |
| `idealHumidityLevel`  | number       | 0–100                              |
| `gardenId`            | number       | required (optional on update)      |

### User (`user.schema.ts`)

`emailAddress` (required, lowercased), `firstName`/`lastName`/`age` optional-nullable.

### Business rule (server-side, `plant.service.ts`)

On plant create/update: `Σ surfaceAreaRequired (other plants in target garden) + new value > garden.totalSurfaceArea` → `400 ValidationError` with a human message including both numbers. Update excludes the plant itself; moving a plant re-checks against the _target_ garden.

## 3. Hostile-by-design behaviour

| Plugin             | Behaviour                                                                        | Frontend counter-measure                                                                             |
| ------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `slow-api.ts`      | +200–2000 ms on **every** response (`onSend`)                                    | SWR cache (instant render from cache), skeleton ghosts sized to final layout, optimistic writes      |
| `random-errors.ts` | 10% of requests → `500 "Random error thrown"` (`onRequest`, before handler runs) | retry ×3 with exponential backoff + jitter on idempotent reads; single retry + rollback UX on writes |

Note: random errors fire in `onRequest`, i.e. **before any state changes** — so a 500 on POST/PUT/DELETE is safe to retry, the mutation never executed. (A real backend wouldn't give this guarantee; the README's auth/perf section covers idempotency keys as the production answer.)

## 4. Gaps between requirements and API

1. **`targetHumidityLevel` missing on Garden.** Requirement: "Each garden should have a configurable target humidity level (range: 0-100)". The schema/migration/types have no such field. The case explicitly allows API changes → we add the column (`real`, not null, default 50), extend the zod schemas, and it flows into the OpenAPI docs automatically. [ADR-003](../adr/ADR-003-backend-extension.md)
2. **No pagination / caching headers** — client-side SWR cache compensates; server-side proposals documented in README (performance bonus).
3. **No auth** — mock profile-session flow + real design in [ADR-005](../adr/ADR-005-authentication.md).
4. **Gardens are global**, not per-user ("overview of all gardens linked to the user account") — without auth there is no ownership column. The profile-session flow presents gardens under the active profile; the ownership column is part of the auth design.
5. **`updatePlantSchema` quirk** — it's an intersection where `gardenId` appears required _and_ optional; effectively required in practice. We always send the full plant payload on update (PUT semantics) to sidestep the ambiguity.
6. **No capacity check on garden update** — `updateGarden` accepts a `totalSurfaceArea` below the plants' combined usage; the client warns live in the edit form (REM-002) and the server-side fix is proposal #7 in PERFORMANCE-AND-CACHING.md's production list (a capacity check mirroring the plant rule).
7. **Error shape** — errors return `{ message, error, statusCode }` (`error-handler.ts`); validation errors carry the zod message. The frontend maps this to its error taxonomy in one place (`core/errors`).
