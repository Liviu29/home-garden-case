# Backend API Audit

**Method**: the backend is the source of truth. This audit was produced by reading
every file under `apps/api/src`, the generated OpenAPI document (`/docs/json`),
the complete Bruno collection, and by **exercising every endpoint against the
running server** with real requests (`npx nx dev api`). Nothing here is inferred
from the frontend.

## Backend at a glance

| Aspect     | Finding                                                                |
| ---------- | ---------------------------------------------------------------------- |
| Framework  | Fastify 5 + `@fastify/autoload`, DI via `@fastify/awilix`              |
| Validation | zod v4 through `fastify-type-provider-zod` (request **and** response)  |
| Database   | SQLite (`better-sqlite3`) via Kysely, file `db.sqlite`, 2 migrations   |
| OpenAPI    | Real, generated: `/docs` (Swagger UI) and `/docs/json` (OpenAPI 3.0.3) |
| Bruno      | 16 requests — exactly matches the 16 routes. No hidden endpoints.      |
| Layering   | route → service (business rules) → repository (Kysely) → SQLite        |

### Artificial latency (`plugins/slow-api.ts`)

`onSend` hook, **enabled unconditionally** (`const enabled = true`), on every
non-`/docs` route: `Math.random() * (2000 - 200 + 1) + 200` →
**uniform 200–2000 ms delay on every response**, reads and writes alike.
Because it is an `onSend` hook the handler has already run — the delay is pure
response latency.

### Failure simulation (`plugins/random-errors.ts`)

`onRequest` hook, **enabled unconditionally**, `errorRate = 10`, `statusCode = 500`:
every non-`/docs` request has a **10 % chance of a 500 `Random error thrown`**.

Architecturally decisive: the hook runs **`onRequest`, before any handler**.
A randomly-failed write therefore _never reached the database_, which is why
retrying writes is safe **on this backend** (documented in ADR-004; a production
API would need idempotency keys — the seam is described in ADR-005).

### Error body shapes (`plugins/error-handler.ts`) — verified live

| Trigger                       | Status | Body                                                                                                                   |
| ----------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| zod request/param validation  | 400    | `{error:"Response Validation Error", message?, statusCode?, details:{issues:[{message,instancePath,…}], method, url}}` |
| `ValidationError` (service)   | 400    | `{error:"Validation error", details:["…"]}`                                                                            |
| `NotFoundError` (service)     | 404    | `{error:"Not found error", details:["…"]}`                                                                             |
| `ConflictError` (service)     | 409    | `{error:"Conflict error", details:["…"]}`                                                                              |
| anything else / random-errors | 500    | `{error:"Internal server error", details:["…"]}`                                                                       |

There is **no** `message` field on the service-thrown shapes and **no** error code
or correlation id anywhere — the human-readable text lives in `details[0]`, and
zod field errors live in `details.issues[].instancePath` + `.message`.

## Complete API inventory

Classification: **U** = user-facing (must support) · **S** = supporting
(data already available elsewhere) · **N/S** = intentionally not surfaced.

| Domain  | Method | Endpoint                      | Request               | Success        | Errors              | Class | FE used?   | FE screen                        |
| ------- | ------ | ----------------------------- | --------------------- | -------------- | ------------------- | ----- | ---------- | -------------------------------- |
| Users   | GET    | `/users`                      | –                     | 200 `User[]`   | 500                 | U     | ✅         | Welcome (profile list)           |
| Users   | GET    | `/users/{userId}`             | path int>0            | 200 `User`     | 400,404,500         | U     | ✅ **new** | Session revalidation on boot     |
| Users   | GET    | `/users/email/{emailAddress}` | path email            | 200 `User`     | 400,404,500         | U     | ✅ **new** | Duplicate-email (409) recovery   |
| Users   | POST   | `/users`                      | `CreateUser`          | 201 `User`     | 400,**409**,500     | U     | ✅         | Welcome → create profile         |
| Users   | PUT    | `/users/{userId}`             | `UpdateUser` (full)   | 200 `User`     | 400,404,**409**,500 | U     | ✅ **new** | Profile menu → Edit profile      |
| Users   | DELETE | `/users/{userId}`             | path int>0            | 204            | 400,404,500         | U     | ✅ **new** | Profile menu → Delete profile    |
| Gardens | GET    | `/gardens`                    | –                     | 200 `Garden[]` | 500                 | U     | ✅         | Gardens, Dashboard               |
| Gardens | GET    | `/gardens/{gardenId}`         | path int>0            | 200 `Garden`   | 400,404,500         | U     | ✅         | Garden Detail (+ hover prefetch) |
| Gardens | POST   | `/gardens`                    | `CreateGarden`        | 201 `Garden`   | 400,500             | U     | ✅         | Garden dialog                    |
| Gardens | PUT    | `/gardens/{gardenId}`         | `UpdateGarden` (full) | 200 `Garden`   | 400,404,500         | U     | ✅         | Garden dialog (edit)             |
| Gardens | DELETE | `/gardens/{gardenId}`         | path int>0            | 204            | 400,404,500         | U     | ✅         | Gardens card menu                |
| Plants  | GET    | `/plants/garden/{gardenId}`   | path int>0            | 200 `Plant[]`  | **400**,404,500     | U     | ✅         | Garden Detail, Dashboard         |
| Plants  | GET    | `/plants/{plantId}`           | path int>0            | 200 `Plant`    | 400,404,500         | S     | ❌         | **N/S — see rationale**          |
| Plants  | POST   | `/plants`                     | `CreatePlant`         | 201 `Plant`    | 400,404,500         | U     | ✅         | Add Plant dialog                 |
| Plants  | PUT    | `/plants/{plantId}`           | `UpdatePlant`         | 200 `Plant`    | 400,404,500         | U     | ✅         | Edit Plant dialog                |
| Plants  | DELETE | `/plants/{plantId}`           | path int>0            | 204            | 400,404,500         | U     | ✅         | Plant row / inspector            |

**`GET /plants/{plantId}` — intentionally not surfaced.** Every field it returns
is already present in `GET /plants/garden/{gardenId}`, which the detail screen
must load anyway. On a 200–2000 ms API an extra round-trip per plant would make
the UI slower with zero added information. The unused typed wrapper was removed
rather than left as dead code.

### Coverage score

- Meaningful user-facing endpoints: **15**
- Fully supported by the frontend: **15** (100 %)
- Partially supported: 0
- Missing: 0
- Intentionally not surfaced (documented): **1** (`GET /plants/{plantId}`)

## Domain model — verified against migrations

There are exactly three tables: `user`, `garden`, `plant`.

```
user            garden ──1:N──> plant
(standalone)    gardenId FK, ON DELETE CASCADE
```

**There is no relationship between `user` and `garden`.** No `userId` column
exists on `garden`, and no endpoint filters gardens by user. Gardens and plants
are **global**, shared by every profile. The frontend therefore presents profiles
honestly as a _local session identity_ (ADR-005), never as data ownership, and
never claims "your gardens" are private to a profile.

### Field-by-field

**`user`** — `userId` (gen, PK) · `firstName` text null · `lastName` text null ·
`age` int null (**must be a positive integer if present**) · `emailAddress` text
NOT NULL (lower-cased + trimmed by zod; uniqueness enforced in the _service_, not
by a DB constraint) · `createdAt`/`updatedAt` (server, `CURRENT_TIMESTAMP`).

**`garden`** — `gardenId` (gen, PK) · `gardenName` text NOT NULL (min 1, trimmed) ·
`totalSurfaceArea` real NOT NULL (**non-negative**) · `locationDescription` text
null · `targetHumidityLevel` real NOT NULL **default 50** (0–100) · `latitude`
real null (−90..90) · `longitude` real null (−180..180) · timestamps (server).
Cross-field rule: **latitude and longitude must be supplied together** (zod
`.refine`) — verified: `{latitude:10}` alone → 400.

**`plant`** — `plantId` (gen, PK) · `plantName` text NOT NULL (min 1) · `species`
text NOT NULL (min 1) · `plantType` **enum, exactly `vegetable | fruit | flower`**
(also a SQL `CHECK` constraint) · `plantationDate` text NOT NULL (ISO datetime) ·
`surfaceAreaRequired` real NOT NULL (non-negative) · `idealHumidityLevel` real
NOT NULL (0–100) · `gardenId` FK NOT NULL **ON DELETE CASCADE** · timestamps.

### Field coverage

| Backend field                                                                                           | Writable         | Frontend            | Status                                    |
| ------------------------------------------------------------------------------------------------------- | ---------------- | ------------------- | ----------------------------------------- |
| garden: gardenName, totalSurfaceArea, targetHumidityLevel, locationDescription, latitude, longitude     | ✅ all 6         | Garden dialog       | **all 6 used**                            |
| plant: plantName, species, plantType, plantationDate, surfaceAreaRequired, idealHumidityLevel, gardenId | ✅ all 7         | Plant dialog        | **all 7 used**                            |
| user: emailAddress, firstName, lastName, age                                                            | ✅ all 4         | Profile create/edit | **all 4 used** (`age` added in this pass) |
| `*Id`, `createdAt`, `updatedAt`                                                                         | server-generated | read-only           | not form fields by design                 |

**Writable-field coverage: 17/17 (100 %).**

## Business rules — verified with live requests

**Capacity (the case's core rule)** is enforced **only in `PlantService`**:

- `POST /plants` — `Σ existing + new > garden.totalSurfaceArea` → **400**
  `Cannot add plant: total surface area required (25m²) would exceed garden's
total surface area (20m²)`. _Verified._
- `PUT /plants/{id}` — recomputes with the edited plant **excluded**
  (`filter(p => p.plantId !== plantId)`), so growing a plant to exactly the
  garden total succeeds. _Verified: 15 m² plant in a 20 m² garden → PUT 20 m² → 200._
  The frontend mirrors this exclusion in `remainingCapacity(garden, plants, selfId)`.
- `PUT /gardens/{id}` — **no capacity check at all**. _Verified: a 20 m² garden
  holding 20 m² of plants accepted `totalSurfaceArea: 5` → 200._ The backend can
  therefore hold over-capacity gardens; the frontend warns before shrinking and
  clamps presentation while still showing the true numbers (see §Over-capacity).

**Humidity**: `targetHumidityLevel` and `idealHumidityLevel` are `0..100`
inclusive, non-integer allowed. _Verified: 101 → 400 `…must be between 0 and 100`._

**Cascade**: `DELETE /gardens/{id}` **does delete the garden's plants**.
_Verified: garden 164 held plant 93; after the delete `GET /plants/93` → 404._
(The `ON DELETE CASCADE` is genuinely enforced — this was tested rather than
assumed, because `PRAGMA foreign_keys` is not set explicitly anywhere.)
The confirmation copy — _"… and all of its plants will be permanently deleted"_ —
is therefore accurate.

**Duplicate email**: `POST /users` with an existing address → **409**
`User with email x already exists`; `PUT /users/{id}` moving onto another user's
address → 409. _Both verified._

## Backend observations / limitations

Reported neutrally — the backend is a given, the frontend adapts to it.

1. **`GET /plants/garden/{missingId}` returns 400, not 404.** The service throws
   `ValidationError` where the garden lookup fails, while `GET /gardens/{missingId}`
   correctly returns 404. _Impact_: a deleted garden yields a 404 on one request
   and a 400 on the other. _Frontend mitigation_: the garden request is the
   authority for existence; the detail screen's not-found state is driven by the
   garden 404 and the plants 400 is not shown as a second, contradictory error.
   _Production recommendation_: return 404 for a missing parent resource.
2. **`updatedAt` is never updated.** Repositories `.set(data)` without touching
   `updatedAt`. _Verified: after a successful PUT the value equalled `createdAt`._
   _Impact_: the field cannot be used for "last modified" UI or for cache
   validation. _Frontend_: not displayed. _Recommendation_: set it in the
   repository (or a DB trigger).
3. **No `user ↔ garden` relationship** (see Domain model). _Impact_: profiles
   cannot own data. _Frontend_: profiles are presented as a session identity only.
4. **Email uniqueness is service-enforced, not a DB constraint.** Two concurrent
   `POST /users` with the same address can both pass the check and insert.
   _Frontend_: submits are single-flight, and the 409 path is handled.
5. **No pagination, filtering, sorting or query parameters anywhere.** All
   collection endpoints return everything. _Frontend_: search/sort are client-side
   by necessity, not by preference.
6. **Dashboard N+1 is unavoidable from the contract.** `Garden` carries no plant
   array and there is no `?include=` or summary endpoint, so per-garden plant
   totals require `1 + N` requests. _Frontend mitigation_: one shared
   `PlantsIndexStore` (each garden fetched once, de-duplicated and cached, never
   re-fetched per screen). _Production recommendation_: a `GET /gardens?include=plants`
   or a dashboard-summary/BFF endpoint — quantified in PERFORMANCE-AND-CACHING.md.
7. **Random 500s are injected `onRequest`.** Not a defect (deliberate), but worth
   recording: because it precedes the handler, a failed write never touched the
   database, which is what makes bounded write-retry safe here specifically.

## Frontend-side data classification

Explicit, so nothing UI-only is ever sent to the API:

| Kind                     | Examples                                                                                          | Sent to backend?                               |
| ------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Backend data             | every field in the tables above                                                                   | ✅ exactly, nothing more                       |
| Derived                  | used/free area, occupancy %, capacity status, humidity delta, attention                           | ❌ computed in `garden-insights.ts`            |
| UI-only                  | planner x/y positions (versioned localStorage), camera, layer toggles, selection                  | ❌ never leaves the browser                    |
| Catalog / presentational | 27 plant presets, recommendation scores + reasons, resolved artwork symbol, palette, cluster seed | ❌ presets only _prefill_ the real form fields |

The Add Plant dialog maps a chosen preset onto exactly five contract fields
(`plantName`, `species`, `plantType`, `surfaceAreaRequired`, `idealHumidityLevel`).
Scores, reasons, images and categories are never serialised.

## Contract issues found and fixed in this pass

1. **`plantationDate` lost a day in any timezone east of UTC.** The Material
   datepicker yields local midnight; `.toISOString()` then rolls back.
   _Verified in the reviewer's timezone_: picking **10 Sep 2026** in
   `Europe/Brussels` produced `2026-09-09T22:00:00.000Z` — stored as **9 Sep**.
   Fixed with a pure date-only serializer (`plantation-date.ts`) that preserves
   the picked calendar day, plus UTC-stable display. Unit-tested across
   UTC−10 / UTC / UTC+2 / UTC+14.
2. **A slow response could overwrite a newer garden.** `GardenDetailStore.load()`
   had no request-generation guard, so navigating `/gardens/1 → /gardens/2` while
   garden 1 was still in flight (very likely at 200–2000 ms) let garden 1's
   response land in the store _as garden 2_. Fixed with a monotonic request token;
   stale responses are now discarded. Deterministic e2e added.
3. **Transient 500s were reported as "Garden not found".** `gardenMissing` was
   `gardenStatus === 'error'`, so a random 500 (10 % of requests!) told the user
   their garden did not exist. Now 404 → not-found state, 5xx/network → error
   state with **Retry**.

## Missed backend capability now implemented

| Capability               | Endpoint                          | Where it surfaced                                    |
| ------------------------ | --------------------------------- | ---------------------------------------------------- |
| Edit profile             | `PUT /users/{userId}`             | Profile menu → Edit profile (dialog)                 |
| Delete profile           | `DELETE /users/{userId}`          | Profile menu → Delete profile (confirm + sign-out)   |
| Duplicate-email recovery | `GET /users/email/{emailAddress}` | Welcome: a 409 offers "continue as that profile"     |
| Stale-session detection  | `GET /users/{userId}`             | Boot: a 404 signs out; 5xx/network keeps the session |
| `age` profile field      | `POST`/`PUT /users`               | Profile form (optional, positive integer)            |
