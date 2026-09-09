# ItpHomeGarden — Frontend Architecture

> **Audience:** reviewers of this case and any engineer joining the project.
> **Scope:** the Angular web client (`apps/web`) built on top of the provided Fastify backend (`apps/api`).
> **Companion docs:** [API-ANALYSIS.md](./API-ANALYSIS.md) · [CODING-GUIDELINES.md](./CODING-GUIDELINES.md) · [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md) · [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) · [ADRs](./adr)

---

## 1. The problem, restated as constraints

The functional requirements (garden + plant CRUD, target humidity, overcrowding validation) are ordinary. What makes this case interesting is what the backend *does to us on purpose*:

| Backend behaviour (verified in `apps/api` source) | Architectural consequence |
|---|---|
| Every request is delayed **200–2000 ms** (`plugins/slow-api.ts`) | Perceived performance must be engineered: cache-first rendering, skeleton ghosts, optimistic writes. The network is never allowed to block the UI. |
| **10% of all requests fail** with a random 500 (`plugins/random-errors.ts`) | Every read is retried transparently; every write is retried or rolled back with explicit UX. A 10% failure rate means a screen making 3 calls fails ~27% of the time — resilience is not optional. |
| No pagination, no `If-None-Match`, no batching | The client owns freshness: stale-while-revalidate cache with TTL + targeted invalidation. |
| Garden has **no `targetHumidityLevel`** despite the requirement | We extend the API (allowed by the case) — see [ADR-003](./adr/ADR-003-backend-extension.md). |
| Overcrowding is validated server-side with a clear message | We mirror the rule client-side for instant feedback, and still render the server verdict as the source of truth. |
| Full `/users` CRUD but no auth | A working "choose profile" session flow + a written design for real auth — see [ADR-005](./adr/ADR-005-authentication.md). |

**North star:** the reviewer should never *feel* the slow, flaky backend while using the app — yet the code should make it obvious we know exactly how hostile it is.

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Angular 22** (standalone, zoneless) | Latest major. Zoneless change detection + signals is the framework's settled direction; no zone.js payload or magic. |
| State | **Signals + NgRx SignalStore** (`@ngrx/signals`) | One state pattern app-wide. SignalStore gives structure (entities, computed, methods, deep readonly) without classic-Store boilerplate that would be overkill here. [ADR-002](./adr/ADR-002-signalstore.md) |
| UI kit | **Angular Material 22** (M3) + custom design tokens | Accessible primitives for free (dialogs, menus, forms, a11y), themed heavily so it doesn't look like stock Material. [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md) |
| HTTP | `HttpClient` (fetch backend) + typed API layer + functional interceptors | Interceptors carry the resilience policy (retry/backoff) so features never re-implement it. |
| Forms | Typed Reactive Forms | Validation rules mirror the backend zod contracts 1:1 (single source of truth documented per field). |
| Monorepo | **Nx** (`apps/web` beside `apps/api`) | The repo is already an Nx workspace; one `npx nx dev` story for reviewers, shared lint/format/tsconfig. |
| Testing | Vitest + Angular Testing Library style component tests | Fast, modern runner; tests assert behaviour, not implementation. |

Deviation from the case's "React meta-framework" line is intentional and was cleared with the recruiting team (role is Angular Lead/Architect) — recorded in [ADR-001](./adr/ADR-001-angular-over-react.md).

## 3. High-level structure

```
apps/web/src/app/
├── core/                      # singletons — imported once at the app root
│   ├── api/                   # typed API client (models, mappers, one service per resource)
│   ├── auth/                  # session store (active profile), guard
│   ├── config/                # app config (API base URL, cache TTLs, retry policy)
│   ├── errors/                # global ErrorHandler, HTTP error mapping, toast wiring
│   ├── http/                  # interceptors: retry/backoff, base-url, request-id
│   ├── resilience/            # SWR query cache + request de-duplication
│   └── layout/                # shell: topbar, nav, page transitions
├── features/                  # lazy-loaded — one route = one chunk
│   ├── dashboard/             # overview: stats, humidity vs target, recent activity
│   ├── gardens/               # garden list (cards), create/edit dialog, delete confirm
│   ├── garden-detail/         # single garden: plants table, occupancy visualizer
│   ├── plants/                # plant create/edit form (validation showcase)
│   └── onboarding/            # profile selection ("mock login")
├── shared/                    # reusable, presentational only
│   ├── ui/                    # skeleton ghosts, empty-state, stat-card, capacity-bar,
│   │                          # humidity-gauge, confirm-dialog, toast host, page-header
│   ├── pipes/                 # relative-date, area (m²), percent
│   ├── utils/                 # pure helpers (occupancy math, humidity delta)
│   └── styles/                # design tokens, mixins, animation presets
└── app.config.ts / app.routes.ts / app.ts
```

Rules that keep this honest (enforced by ESLint boundaries + review):

- `core` = singleton infrastructure, imported once. `shared` = stateless & instantiable anywhere. A feature never imports from another feature; anything two features need moves to `shared` or `core`.
- File naming per current Angular schematics: `garden-list.ts`, not `garden-list.component.ts`.
- Every feature folder is reachable only via `loadChildren`/`loadComponent` — lazy by default.

## 4. Data flow (the interesting part)

```
   Component (signals only, zoneless)
        │  reads computed view-model signals
        ▼
   Feature SignalStore  (GardensStore, GardenDetailStore, …)
        │  calls
        ▼
   Query/Mutation layer (core/resilience)
        │  QueryCache: SWR + TTL + de-dup      Mutations: optimistic apply + rollback
        ▼
   Typed API services (core/api) — thin, DTO→domain mappers
        │
        ▼
   HttpClient → interceptors: [base-url] → [retry w/ exponential backoff + jitter] → network
```

### 4.1 Reads — stale-while-revalidate

`QueryCache` keys every GET (`gardens`, `garden:3`, `plants:garden:3`). On subscribe:

1. If a fresh cached value exists (< TTL) → emit instantly, **no request**.
2. If a stale value exists → emit instantly (UI renders real data), revalidate in the background, then emit the update.
3. If nothing exists → the store exposes `status: 'loading'` and the UI renders **skeleton ghosts** (never spinners for content areas).
4. Concurrent identical requests are de-duplicated into one in-flight promise.

This is the concrete answer to the case's performance bonus — plus a written section in the README on server-side fixes (ETags, pagination, batching) we'd propose to the backend team.

### 4.2 Writes — optimistic with rollback

Mutations apply to the store immediately (UI feels instant despite 2 s latency), the request runs with retry, and on definitive failure the store rolls back to a snapshot and raises a toast with a retry affordance. Overcrowding (`400`) is a *functional* error: no retry, no rollback-toast — the form shows the server message inline next to `surfaceAreaRequired`.

After any successful mutation the relevant cache keys are invalidated (`gardens`, `garden:{id}`, `plants:garden:{id}`).

### 4.3 Error taxonomy (one standard, app-wide)

| Class | Examples | Handling |
|---|---|---|
| **Transient technical** | random 500, network blip | Invisible: retry ×3, exponential backoff + jitter (250/750/2250 ms). Reads: user never notices. Writes: retried once, then rollback + error toast with "Try again". |
| **Functional** | overcrowding 400, validation 400 | Never retried. Rendered *in context*: inline on the field or as a form-level message. These are expected behaviour, logged at `info`. |
| **Not found** | 404 on deep link | Friendly empty-state page with a way back — not a toast. |
| **Fatal** | app can't bootstrap | Standalone error page. Global `ErrorHandler` catches anything that slips through. |

Empty result ≠ error: "no gardens yet" is a designed state with an illustration and a primary CTA.

## 5. State ownership

| Store | Scope | Holds |
|---|---|---|
| `SessionStore` | root | active user profile, hydrated from `localStorage` |
| `GardensStore` | root (shared across features) | garden entities, per-key request status, derived dashboard stats |
| `GardenDetailStore` | route-level | selected garden, its plants, occupancy computed (used m², free m², % per plant), humidity aggregates vs target |
| `ToastStore` | root | transient notifications queue |

Pattern everywhere: private writable signals inside the store, public `computed`/readonly views, methods as the only write path. Immutable updates only — zoneless + OnPush depend on it.

## 6. Performance budget

- Lazy features: initial bundle carries shell + dashboard only; `angular.json` bundle budgets fail the build when exceeded.
- Zoneless + OnPush + signals → change detection runs only where a signal changed.
- Skeletons match final layout dimensions → zero layout shift when data lands.
- `@defer` for below-the-fold dashboard blocks; `track` on every `@for`.
- View transitions API (Angular router `withViewTransitions`) for cheap, native page-transition polish.

## 7. Testing strategy

Critical business logic gets the coverage (per the case's requirement), not ceremony:

1. **Resilience layer** — retry/backoff policy (fake timers), SWR cache TTL & de-dup, optimistic rollback.
2. **Domain rules** — occupancy math, client-side overcrowding validator, humidity delta.
3. **Stores** — GardensStore/GardenDetailStore behaviour incl. error states.
4. **Component tests** — a screen renders skeleton → data → empty/error correctly; form shows the backend's overcrowding message.

## 8. What we deliberately did *not* build

Time-boxed to 2–3 days, we chose depth on resilience + UX over breadth: no i18n runtime (structure is translation-ready), no e2e suite (unit + component tests cover the critical logic), no real auth (designed in ADR-005 instead). Each cut is listed in the README with the path to add it.
