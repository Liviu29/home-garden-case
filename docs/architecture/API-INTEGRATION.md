# API Integration

How the frontend talks to the provided backend, and the audit of that backend it is built
against. The audit was produced from the backend's own source (every file under
`apps/api/src`), its generated OpenAPI document (`/docs/json`), the Bruno collection, and
**live requests against the running server** — nothing here is inferred from the frontend.

## 1. Layering

Components never know endpoint URLs; features never call `HttpClient`.

```
Angular feature (component reads signals only)
  ↓
SignalStore (GardensStore / GardenDetailStore / PlantsIndexStore)
  ↓
QueryCache (SWR reads, de-duplication)                  ← core/resilience
  ↓
Typed API service (GardensApi / PlantsApi / UsersApi)    ← core/api
  ↓  DTO → domain mapping (pure functions, mappers.ts)
HttpClient (fetch)
  ↓  interceptors: [base URL] → [retry with backoff + jitter]
Fastify backend (:3000, proxied at /api in development)
```

DTO types are hand-written mirrors of the backend zod schemas rather than generated (rationale
and the switch-to-a-generator seam: [ADR-006](../adr/ADR-006-monorepo-and-tooling.md)). Domain
models are what stores and components see; DTO shapes never leave `core/api`. Every call resolves
to a typed result or a typed `ApiError` ([ARCHITECTURE §4.3](./ARCHITECTURE.md#43-error-taxonomy)).

## 2. The backend at a glance

| Aspect     | Finding                                                               |
| ---------- | --------------------------------------------------------------------- |
| Framework  | Fastify 5 + `@fastify/autoload`, DI via `@fastify/awilix`             |
| Validation | zod v4 through `fastify-type-provider-zod` (request **and** response) |
| Database   | SQLite (`better-sqlite3`) via Kysely, file `db.sqlite`, 2 migrations  |
| OpenAPI    | Generated: `/docs` (Swagger UI) and `/docs/json` (OpenAPI 3.0.3)      |
| Bruno      | 16 requests — exactly the 16 API routes; no hidden endpoints          |
| Layering   | route → service (business rules) → repository (Kysely) → SQLite       |

**Artificial latency (`plugins/slow-api.ts`)** — an `onSend` hook, enabled unconditionally on every
non-`/docs` route: a uniform **200–2000 ms** delay on every response, reads and writes alike. The
handler has already run; the delay is pure response latency.

**Failure injection (`plugins/random-errors.ts`)** — an `onRequest` hook, enabled unconditionally:
every non-`/docs` request has a **10% chance of a 500**. Because it runs **before any handler**, a
randomly failed write never reached the database — which is exactly why retrying writes is safe
_on this backend_ ([ADR-004](../adr/ADR-004-resilience-layer.md)); a production API would need
idempotency keys ([ADR-005](../adr/ADR-005-authentication.md)).

**Error body shapes (`plugins/error-handler.ts`), verified live:**

| Trigger                       | Status | Body                                                                                  |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------- |
| zod request/param validation  | 400    | `{error:"Response Validation Error", details:{issues:[{message,instancePath,…}], …}}` |
| `ValidationError` (service)   | 400    | `{error:"Validation error", details:["…"]}`                                           |
| `NotFoundError` (service)     | 404    | `{error:"Not found error", details:["…"]}`                                            |
| `ConflictError` (service)     | 409    | `{error:"Conflict error", details:["…"]}`                                             |
| anything else / random errors | 500    | `{error:"Internal server error", details:["…"]}`                                      |

There is no `message` field on the service shapes and no error code or correlation id anywhere:
the readable text lives in `details[0]`, zod field errors in `details.issues[]`. The frontend
normalizes all of them in one place (`extractServerMessage`).

## 3. Endpoint inventory

**U** = user-facing · **S** = supporting (the data is already available elsewhere).

| Domain  | Method | Endpoint                      | Success        | Errors             | Class | Frontend                          |
| ------- | ------ | ----------------------------- | -------------- | ------------------ | ----- | --------------------------------- |
| Users   | GET    | `/users`                      | 200 `User[]`   | 500                | U     | Welcome — profile list            |
| Users   | GET    | `/users/{userId}`             | 200 `User`     | 400, 404, 500      | U     | Session revalidation on boot      |
| Users   | GET    | `/users/email/{emailAddress}` | 200 `User`     | 400, 404, 500      | U     | Duplicate-email (409) recovery    |
| Users   | POST   | `/users`                      | 201 `User`     | 400, 409, 500      | U     | Welcome — create profile          |
| Users   | PUT    | `/users/{userId}`             | 200 `User`     | 400, 404, 409, 500 | U     | Profile menu — edit profile       |
| Users   | DELETE | `/users/{userId}`             | 204            | 400, 404, 500      | U     | Profile menu — delete profile     |
| Gardens | GET    | `/gardens`                    | 200 `Garden[]` | 500                | U     | Gardens, Dashboard                |
| Gardens | GET    | `/gardens/{gardenId}`         | 200 `Garden`   | 400, 404, 500      | U     | Garden Detail (+ hover prefetch)  |
| Gardens | POST   | `/gardens`                    | 201 `Garden`   | 400, 500           | U     | Garden dialog                     |
| Gardens | PUT    | `/gardens/{gardenId}`         | 200 `Garden`   | 400, 404, 500      | U     | Garden dialog (edit)              |
| Gardens | DELETE | `/gardens/{gardenId}`         | 204            | 400, 404, 500      | U     | Garden card menu                  |
| Plants  | GET    | `/plants/garden/{gardenId}`   | 200 `Plant[]`  | **400**, 404, 500  | U     | Garden Detail, Dashboard, Gardens |
| Plants  | GET    | `/plants/{plantId}`           | 200 `Plant`    | 400, 404, 500      | S     | **Not surfaced** — see below      |
| Plants  | POST   | `/plants`                     | 201 `Plant`    | 400, 404, 500      | U     | Add-plant dialog                  |
| Plants  | PUT    | `/plants/{plantId}`           | 200 `Plant`    | 400, 404, 500      | U     | Edit-plant dialog                 |
| Plants  | DELETE | `/plants/{plantId}`           | 204            | 400, 404, 500      | U     | Plant row / inspector             |

All **15** user-facing endpoints are used. `GET /plants/{plantId}` is deliberately not: every field
it returns is already in `GET /plants/garden/{gardenId}`, which the detail screen loads anyway, and
on a 200–2000 ms API an extra round trip per plant would only add latency.

## 4. Domain model — verified against the migrations

Three tables: `user`, `garden`, `plant`. **There is no relationship between `user` and `garden`**
(no `userId` column, no user filter on any endpoint): gardens and plants are global. The frontend
therefore presents a profile honestly as a local session identity, never as data ownership.

- **`user`** — `firstName`, `lastName` (nullable), `age` (nullable, positive integer),
  `emailAddress` (required, lower-cased and trimmed; uniqueness enforced in the service, not by a DB
  constraint).
- **`garden`** — `gardenName` (min 1, trimmed), `totalSurfaceArea` (≥ 0), `locationDescription`
  (nullable), `targetHumidityLevel` (0–100, default 50 — the one field added to the API,
  [ADR-003](../adr/ADR-003-backend-extension.md)), `latitude`/`longitude` (nullable, and **required
  together**: `{latitude: 10}` alone → 400).
- **`plant`** — `plantName`, `species` (min 1), `plantType` (exactly `vegetable | fruit | flower`,
  also a SQL `CHECK`), `plantationDate` (ISO datetime), `surfaceAreaRequired` (≥ 0),
  `idealHumidityLevel` (0–100), `gardenId` (FK, **ON DELETE CASCADE**).

Every writable field — 6 on gardens, 7 on plants, 4 on users — is reachable from a form. Nothing
UI-only is ever sent: derived values (occupancy, humidity delta), planner positions, camera and
layer state, and catalog presets and scores never leave the browser; a picked preset only pre-fills
the five real plant fields.

## 5. Business rules — verified with live requests

- **Capacity (the case's core rule)** is enforced only in `PlantService`. `POST /plants` rejects
  `Σ existing + new > garden.totalSurfaceArea` with a 400 whose message names both numbers.
  `PUT /plants/{id}` recomputes with the edited plant **excluded**, so growing a plant to exactly the
  garden total succeeds. The frontend mirrors both in `wouldOvercrowd` / `remainingCapacity`
  (`shared/utils/garden-insights.ts`) for instant feedback, and renders the server verdict inline
  when it arrives.
- **`PUT /gardens/{id}` has no capacity check** — a 20 m² garden holding 20 m² of plants accepted
  `totalSurfaceArea: 5`. The garden dialog warns before shrinking below the used area; the planner
  and header clamp their presentation while still showing the true numbers.
- **Humidity** values are 0–100 inclusive, decimals allowed (101 → 400).
- **Cascade:** deleting a garden deletes its plants (verified with a follow-up `GET` → 404), so the
  confirmation copy says so.
- **Duplicate email:** `POST /users` or `PUT /users/{id}` onto an existing address → 409. The
  welcome screen turns it into "continue as that profile" (`GET /users/email/{email}`).

## 6. Backend limitations, and how the frontend adapts

1. **`GET /plants/garden/{missingId}` answers 400, not 404.** The garden request is the authority
   for existence; the detail screen's not-found state is driven by the garden 404, and the plants 400
   is not shown as a second, contradictory error.
2. **`updatedAt` is never updated** by the repositories, so it is not displayed or used for caching.
3. **Email uniqueness is service-enforced**, so two concurrent creates can race; submits are
   single-flight and the 409 path is handled.
4. **No pagination, filtering or sorting** on any endpoint — the gardens toolbar searches and sorts
   client-side by necessity.
5. **The dashboard needs `1 + N` requests** (no plant data on `Garden`, no `?include=`). One shared
   `PlantsIndexStore` fetches each garden's plants once — cached, de-duplicated, never per screen.
   The production fix is server-side ([PERFORMANCE-AND-CACHING.md](./PERFORMANCE-AND-CACHING.md#production-backend-improvements)).

## 7. Contract issues found and fixed

1. **`plantationDate` lost a day east of UTC.** The date picker yields local midnight and
   `toISOString()` rolled it back (10 Sep picked in `Europe/Brussels` was stored as 9 Sep). A pure
   date-only serializer (`plantation-date.ts`) now preserves the picked calendar day, with UTC-stable
   display; unit-tested from UTC−10 to UTC+14.
2. **A slow response could overwrite a newer garden.** Navigating `/gardens/1 → /gardens/2` while
   garden 1 was in flight let it land as garden 2. `GardenDetailStore.load()` now takes a monotonic
   token and discards stale responses (deterministic e2e).
3. **A transient 500 was reported as "Garden not found".** 404 now means the not-found state;
   5xx/network means an error state with Retry.

## 8. UX state per operation

Every operation renders a designed state for everything the backend can actually produce (there is
no authentication, so there is no 401/403 column). **All implemented** except where marked.

| Operation                    | Pending UI                                 | 4xx verdict                                        | 404                    | 5xx / network                | Race guard           |
| ---------------------------- | ------------------------------------------ | -------------------------------------------------- | ---------------------- | ---------------------------- | -------------------- |
| `GET /users`                 | profile-card skeletons                     | —                                                  | —                      | error state + Try again      | —                    |
| `GET /users/{id}` (boot)     | silent                                     | —                                                  | sign out → Welcome     | **session kept**             | —                    |
| `POST /users`                | submit-button ghost                        | inline field errors; **409 → continue as profile** | —                      | inline message               | single-flight        |
| `PUT` / `DELETE /users/{id}` | button ghost; profile chip ghost on delete | inline (email, age); 409 inline                    | reconciles (signs out) | inline / toast, profile kept | single-flight        |
| `GET /gardens`               | garden-card skeletons                      | —                                                  | —                      | error state + Try again      | SWR keeps stale data |
| `GET /gardens/{id}`          | full-page skeleton                         | invalid id → not-found, no request                 | **not-found page**     | **retry page**               | **load token**       |
| `POST /gardens`              | creation ghost card                        | inline (name, area, lat + lng pair)                | —                      | inline + toast               | idempotent append    |
| `PUT /gardens/{id}`          | card / header ghost                        | inline; ⚠️ server allows shrinking — client warns  | inline message         | inline + toast               | single-flight        |
| `DELETE /gardens/{id}`       | ghost-confirmed card                       | —                                                  | reconciles             | restored + Try again toast   | single-flight        |
| `GET /plants/garden/{id}`    | table + planner skeleton                   | 400 for a missing garden — the garden 404 decides  | via the garden         | localized error + Try again  | **load token**       |
| `POST /plants`               | ghost row + ghost bed                      | **capacity 400 inline, verbatim**                  | garden gone → message  | inline + toast               | idempotent append    |
| `PUT /plants/{id}`           | row + bed ghost                            | capacity (self excluded, mirrors the server)       | inline message         | inline + toast               | single-flight        |
| `DELETE /plants/{id}`        | ghost-confirmed row + bed                  | —                                                  | reconciles             | restored + Try again toast   | single-flight        |

- **Timeouts** — no client timeout is imposed: the API's own delay is by design, and aborting a
  legitimately slow request would turn a working page into an error. The skeleton stays until the
  response lands; the retry interceptor covers real failures.
- **Cancellation** — the stores await promises, so the guarantee is enforced where it matters: a
  stale response is discarded by its request token rather than applied.
- **Coverage** — the read, mutation and resilience rows are asserted in the Playwright suites
  (`welcome`, `async-states`, `mutation-ghosts`, `contract-resilience`, `garden-map`); the profile
  edit/delete dialogs are covered by component tests.
