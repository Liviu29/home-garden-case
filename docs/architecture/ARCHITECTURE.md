# HomeGarden — Frontend Architecture

> **Scope:** the Angular client (`apps/web`) on top of the provided Fastify backend (`apps/api`).
> **Related:** [API-INTEGRATION.md](./API-INTEGRATION.md) · [PERFORMANCE-AND-CACHING.md](./PERFORMANCE-AND-CACHING.md) · [TESTING-STRATEGY.md](./TESTING-STRATEGY.md) · [ACCESSIBILITY.md](./ACCESSIBILITY.md) · [ADRs](../adr)

---

## 1. The problem, restated as constraints

The functional requirements (garden and plant CRUD, target humidity, overcrowding validation)
are ordinary. What shapes the architecture is what the backend does on purpose:

| Backend behaviour (verified in `apps/api` source)                 | Architectural consequence                                                                                                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every response is delayed **200–2000 ms** (`plugins/slow-api.ts`) | Perceived performance is engineered: cache-first rendering, content-shaped skeletons, in-place mutation ghosts. The network never blocks the UI.   |
| **10% of requests fail** with a 500 (`plugins/random-errors.ts`)  | A three-request screen would fail ~27% of the time. Transient failures are retried transparently; what still fails gets an explicit recovery path. |
| No pagination, no caching headers, no batching                    | The client owns freshness: a stale-while-revalidate cache with TTL, de-duplication and targeted invalidation.                                      |
| Garden has **no target humidity** despite the requirement         | The API is extended once ([ADR-003](../adr/ADR-003-backend-extension.md)).                                                                         |
| Overcrowding is validated server-side                             | The rule is mirrored client-side for instant feedback; the server verdict is still rendered as the source of truth.                                |
| Full `/users` CRUD but no authentication                          | A working profile-session flow, plus a written production design ([ADR-005](../adr/ADR-005-authentication.md)).                                    |

The goal: a user never _feels_ the slow, flaky backend — and the code shows exactly how it is
handled.

## 2. Tech stack

| Concern   | Choice                                                                        | Why                                                                                                                                |
| --------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Framework | **Angular 22** — standalone, zoneless (the default; zone.js is not installed) | The framework's settled direction: signals-driven change detection, no zone.js payload.                                            |
| State     | **Signals + NgRx SignalStore**                                                | One state pattern app-wide; structure without classic-Store ceremony. [ADR-002](../adr/ADR-002-signalstore.md)                     |
| UI kit    | **Angular Material 22 (M3)** + design tokens                                  | Accessible primitives (dialogs, menus, form fields), themed to the product. [DESIGN-SYSTEM.md](../design/DESIGN-SYSTEM.md)         |
| HTTP      | `HttpClient` (fetch backend), typed API layer, functional interceptors        | The resilience policy lives in one place; features never re-implement it.                                                          |
| Forms     | Typed Reactive Forms (`NonNullableFormBuilder`)                               | Validators mirror the backend zod contracts 1:1.                                                                                   |
| Workspace | **Nx** (`apps/web` beside `apps/api`)                                         | The case repository is already an Nx workspace: one install, shared lint/format. [ADR-006](../adr/ADR-006-monorepo-and-tooling.md) |
| Testing   | Vitest + TestBed; Playwright (integration + mocked)                           | Tests assert behaviour, not implementation. [TESTING-STRATEGY.md](./TESTING-STRATEGY.md)                                           |

## 3. Structure

```
apps/web/src/
├── app/
│   ├── core/                  # singletons, used from the root
│   │   ├── api/               # DTOs, domain models, mappers, one typed service per resource
│   │   ├── auth/              # SessionStore (active profile) + route guard
│   │   ├── config/            # APP_CONFIG (API base URL, cache TTL, retry policy), ThemeStore
│   │   ├── errors/            # ApiError taxonomy, global ErrorHandler, ToastStore
│   │   ├── http/              # interceptors: base URL, retry with backoff + jitter
│   │   ├── layout/            # the shell: top bar, navigation, profile menu, page backdrop
│   │   ├── logging/           # the Logger seam
│   │   └── resilience/        # QueryCache: SWR + in-flight de-duplication
│   ├── state/                 # app-wide SignalStores, providedIn: 'root'
│   │   ├── gardens-store/         # GardensStore + the list's search/sort (garden-view.ts)
│   │   └── plants-index-store/    # PlantsIndexStore: the one writable owner of plants
│   ├── domain/                # business rules and maths — no HTTP, no stores
│   │   ├── garden-insights/       # capacity and humidity rules
│   │   ├── garden-map-layout/     # the area-true treemap layout
│   │   ├── garden-planner/        # watering zones, clashes, grouping, timeline
│   │   ├── plant-recommendation/  # ranks the catalog for one garden
│   │   ├── plantation-date/       # UTC calendar-day handling
│   │   └── catalog/               # the plant catalog and its provider seam
│   ├── features/              # one lazy route per folder; the files at its root are the page
│   │   ├── onboarding/        # profile selection and creation
│   │   ├── dashboard/         # portfolio KPIs, attention center, garden health
│   │   │   └── garden-mini-preview/
│   │   ├── gardens/           # the garden grid
│   │   │   ├── garden-form-dialog/
│   │   │   └── prefetch-garden/       # hover/focus prefetch directive
│   │   ├── garden-detail/     # header and plants table
│   │   │   ├── garden-detail-store/   # GardenDetailStore (route-scoped)
│   │   │   ├── plant-form-dialog/
│   │   │   └── garden-map/            # the planner: SVG scene and toolbar
│   │   │       ├── garden-layout-repository/  # saved bed positions (localStorage)
│   │   │       ├── garden-map-skeleton/
│   │   │       ├── map-camera/        # pan and zoom maths
│   │   │       └── map-inspector/
│   │   ├── profile/           # edit-profile dialog (loaded on demand)
│   │   └── not-found/
│   └── shared/ui/             # presentational kit, one folder per component: skeletons, empty
│                              # state, stat card, capacity bar, humidity gauge, confirm dialog,
│                              # toasts, value presets, plant artwork and its resolver,
│                              # and <app-chart>: Highcharts, loaded on demand (ADR-008)
├── environments/              # the one build-time switch: apiBaseUrl
└── styles/                    # design tokens, motion presets, the skeleton engine
```

- **One folder per unit.** The files at the root of a feature folder are its routed page. Every
  other component, directive, store or domain module lives in its own folder, named after it,
  together with its template, styles and spec.
- **Dependencies point one way:** `features` → `state` → `domain` and `core`. `domain` imports only
  the model types from `core/api`; `shared/ui` never imports a feature, `state` or an API service.
- **Features do not import each other, and `core` does not import features**, with two deliberate
  exceptions: the shell (`core/layout`) lazy-loads the profile dialog on demand, and garden detail
  reuses the garden form dialog from `gardens/` to edit the open garden. State that two features
  need lives in `state/`.
- Files follow the current schematic naming (`garden-list.ts`, no `.component` suffix); every
  feature is reached only through `loadComponent`.

## 4. Data flow

```
Component            reads computed view-model signals
   ▼
SignalStore          GardensStore · PlantsIndexStore · GardenDetailStore
   ▼
QueryCache           SWR reads, TTL, in-flight de-duplication      (core/resilience)
   ▼
Typed API services   GardensApi · PlantsApi · UsersApi, DTO → domain (core/api)
   ▼
HttpClient → [base URL] → [retry: 5xx / network, backoff + full jitter] → /api
```

### 4.1 Reads — stale-while-revalidate

Every GET is keyed (`gardens`, `gardens:3`, `plants:garden:3`, from one `cacheKeys` registry):

1. Fresh entry (< 30 s) → rendered instantly, **no request**.
2. Stale entry → rendered instantly, revalidated in the background.
3. No entry → the store reports `loading` and the screen renders its skeleton.
4. Identical in-flight requests are de-duplicated into one promise.

### 4.2 Writes — pessimistic, with ghosts

Create and update wait for the server, because the server owns the verdicts the form must
render (the capacity rule above all). While a request is in flight the affected element is a
**ghost in place** — a creation ghost where the entity will land, the edited card, row or bed
grayed out — and the rest of the screen stays live. Deletes are **ghost-confirmed**: the item
stays visible and inert until the server confirms, then leaves; on failure it resolves back with
a Try again toast. Metrics change only on confirmed state.

Successful mutations write through the cache with what the server returned, and invalidate what
it did not (a deleted garden's detail and plants) — see
[PERFORMANCE-AND-CACHING.md](./PERFORMANCE-AND-CACHING.md#cache-invalidation).

### 4.3 Error taxonomy

Every failure is classified exactly once, in `toApiError()` (`core/errors/api-error.ts`):

| Kind         | Trigger                                   | Retried?                               | Rendered as                                                                                           |
| ------------ | ----------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `technical`  | 5xx, network (status 0), anything unknown | yes — interceptor, 3× backoff + jitter | if it still fails: an error state with Try again (reads) or an error toast with Try again (mutations) |
| `functional` | 4xx verdicts (capacity, validation, 409)  | **never**                              | inline, in context — on the field or as a form message, server text verbatim                          |
| `not-found`  | 404 (a dead deep link)                    | no                                     | the designed not-found page, with a way back                                                          |

- **Validation verdicts are expected behaviour:** logged at `warn`, never toasted — the user is
  mid-task and the form is the context.
- **Empty is not an error:** "No gardens yet" is the shared `EmptyState` with a call to action.
- **Stale beats broken:** a failed background refresh keeps the cached data on screen and notes
  itself with a quiet info toast.
- Users never see stack traces, JSON or status codes. `extractServerMessage` normalizes all
  three backend error shapes (`{message}`, `{error, details[]}`, zod issue lists); technical
  failures fall back to generic copy.
- The global `ErrorHandler` is the last line of defence: nothing unhandled disappears silently.

### 4.4 Logging

All logging goes through one `Logger` (`core/logging`): console-backed today, the exact interface a
Sentry or OpenTelemetry sink would implement — call sites would not change. Expected unhappy paths
(`warn`) are silent outside dev mode; technical failures (`error`) always report. Messages carry
an operation and an id, never a payload.

## 5. State management

| Store                      | Scope                                            | Owns                                                                                        | Derives (`computed`, never stored)                                             |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GardensStore`             | root                                             | gardens, request status, `saving`, `creating`, pending updates/deletes, list query and sort | `isLoading`, `hasFailed`, `isEmpty`, `count`                                   |
| `PlantsIndexStore`         | root                                             | **the single writable owner of plant entities**, per garden; plants that failed to load     | — (consumers derive)                                                           |
| `GardenDetailStore`        | the detail route (created and destroyed with it) | one garden, its statuses, `saving`, pending create/updates/deletes, the last created plant  | `plants` (a view into `PlantsIndexStore`), used/free area, occupancy, humidity |
| `SessionStore`             | root (plain signals)                             | the active profile, restored from `localStorage`                                            | `displayName`, `initials`                                                      |
| `ToastStore`, `ThemeStore` | root (plain signals)                             | the notification queue; the colour theme                                                    | —                                                                              |

Rules:

- **Derived state is never stored.** Used/free area, occupancy and utilization are `computed()`
  from the source data through pure functions in `domain/garden-insights/garden-insights.ts`, so they cannot
  go stale — and the forms, the dashboard, the planner and the server's rule share one definition.
- **Immutable updates only** (`patchState` with new references) — zoneless rendering depends on it.
- **One state pattern.** Small, self-contained state (session, toasts, theme) uses plain signal
  classes with the same private-writable, public-readonly shape — no second store library, no
  `BehaviorSubject` state services.
- **Mutations return typed verdicts** (`{ok: true} | {ok: false, error: ApiError}`), so forms render
  functional errors inline without stores knowing about forms.

**Signals vs RxJS.** Signals hold state; RxJS handles I/O and events: HTTP, the retry/backoff
operator in the interceptor, and `rxMethod` for the plants fan-out (`distinctUntilChanged` over the
garden ids, so a component declares its source once instead of running an `effect()` that both reads
and writes). Effects are few and narrow: route id → load, the document title, and scrolling a newly
created garden card into view. Subscriptions are limited to streams that complete or live as long
as the app: dialog `afterClosed()` and the root router-events listener that resets scroll position.

**Async method pattern.** Every async store method pairs its status flag with a `finally` reset and
maps failures through `toApiError` — a frozen loading state or a swallowed error cannot occur by
construction.

**What happens when…**

- **…the user double-clicks Save?** `saving` is checked on entry; the second submit returns at once
  (asserted in e2e: one POST for three clicks). Deletes carry per-entity pending guards, so a
  repeated delete is a no-op.
- **…two identical loads race?** The QueryCache hands both callers the same in-flight promise.
- **…a slow response arrives for a garden the user already left?** Each `GardenDetailStore.load()`
  takes a monotonic token; a stale response is discarded instead of rendering garden A as garden B.
- **…the page is refreshed?** The session restores from `localStorage`; entity caches are memory-only
  by design (a 30 s TTL makes persistence pointless), so data re-flows through the skeleton path.

## 6. Rendering and performance

Zoneless + OnPush + signals: change detection runs only where a signal changed. Every route is a
lazy chunk, and the planner ships in its own `@defer (on viewport; prefetch on idle)` chunk behind a
dimension-matched ghost; the two charts load the same way, and the Highcharts library is imported only
when one scrolls into view ([ADR-008](../adr/ADR-008-charts-highcharts.md)). Skeletons reserve the final layout, bars and gauges animate `transform`
only, fonts are self-hosted, and `angular.json` budgets fail the build on regression. Measurements
and the cache design: [PERFORMANCE-AND-CACHING.md](./PERFORMANCE-AND-CACHING.md).

## 7. The Garden Planner

The planner (`features/garden-detail/garden-map/`) is a pipeline: store state → a pure,
deterministic layout (`domain/garden-map-layout/garden-map-layout.ts`, a squarified treemap where each bed's area
is its real m²) → saved positions applied on top (`GardenLayoutRepository`, versioned
`localStorage`) → a view model → SVG rendered by Angular. The renderer owns only UI state (camera,
selection, layers); business state stays in the stores. Rationale and trade-offs:
[ADR-007](../adr/ADR-007-garden-visualization-engine.md); interaction design:
[INTERACTIVE-GARDEN-UX.md](../design/INTERACTIVE-GARDEN-UX.md).

## 8. Abstractions deliberately not created

- **A `withRequestStatus()` SignalStore feature** — the three stores have different lifecycles (an
  SWR list with idempotent appends; a detail store with per-entity mutation ghosts; a per-garden
  fan-out index). A shared feature would flatten those semantics or grow configuration until the
  state stops being domain-readable.
- **A card mixin or global card class** — every card value is already a token, so "change the card
  look in one place" is true at the token layer; a mixin would add a build path for four lines of
  declarative wiring.
- **A generic card or dialog framework, a route-constants helper, a breakpoint mixin system** —
  semantic components stay local and legible; the few media queries are container-specific
  collapse points, not one inconsistent grid.
- **Formatting pipes** — `DecimalPipe` with explicit digits covers every case, including summed
  areas that would otherwise show float noise.

## 9. Conventions

- **Files:** no `.component`/`.service` suffixes — `garden-list.ts`, `.html`, `.scss` and
  `.spec.ts` sit together in one folder. Domain models have plain names (`Garden`, `Plant`);
  API types are suffixed `Dto` (`core/api/dtos.ts`) and converted by pure mappers
  (`core/api/mappers.ts`). Booleans read as predicates (`isLoading`, `canAddPlant`); limits and
  timings live in `APP_CONFIG`, never as magic numbers.
- **Components:** `inject()` at field level; signal `input()` / `output()` / `model()`; built-in
  control flow with `track` on every `@for`; non-trivial template logic moves into `computed()`.
  Components never call HTTP; `shared/ui` components are presentational (inputs in, outputs
  out; no feature, `state` or API-service imports).
- **State:** immutable `patchState` updates with new references — zoneless rendering depends on
  them.
- **HTTP:** features call the typed API services only; retry lives in the one interceptor and
  caching in `core/resilience`; every call resolves to data or a typed `ApiError`.
- **Forms:** typed forms from `NonNullableFormBuilder`; validation limits mirror the backend's zod
  schemas exactly; submit is single-flight, with an in-button ghost bar instead of a spinner.
- **Errors and feedback:** functional errors render inline, technical errors as a toast with Try
  again, deep-link misses as the not-found page, empty results as the shared `empty-state`;
  destructive actions confirm through the shared dialog.
- **Logging:** a context tag and a sentence — never a payload (§4.4).
- **Styling:** components consume design tokens only; type in `rem`; no `::ng-deep`; every
  animation honours `prefers-reduced-motion` ([DESIGN-SYSTEM.md](../design/DESIGN-SYSTEM.md)).
- **Tests:** co-located `.spec.ts` files that assert what a user notices, with fake timers for
  anything time-based ([TESTING-STRATEGY.md](./TESTING-STRATEGY.md)).
