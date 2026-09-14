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

| Concern   | Choice                                                                        | Why                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework | **Angular 22** — standalone, zoneless (the default; zone.js is not installed) | The framework's settled direction: signals-driven change detection, no zone.js payload.                                                                     |
| State     | **Signals + NgRx SignalStore**                                                | One state pattern app-wide; structure without classic-Store ceremony. [ADR-002](../adr/ADR-002-signalstore.md)                                              |
| UI kit    | **Angular Material 22 (M3)** + design tokens                                  | Accessible primitives (dialogs, menus, form fields), themed to the product. [DESIGN-SYSTEM.md](../design/DESIGN-SYSTEM.md)                                  |
| HTTP      | `HttpClient` (fetch backend), typed API layer, functional interceptors        | The resilience policy lives in one place; features never re-implement it.                                                                                   |
| Forms     | **Signal Forms** (`@angular/forms/signals`) for the garden and plant dialogs  | The model is a signal, the rules a schema that mirrors the backend zod contracts 1:1, the capacity rule included. [ADR-011](../adr/ADR-011-signal-forms.md) |
| Workspace | **Nx** (`apps/web` beside `apps/api`)                                         | The case repository is already an Nx workspace: one install, shared lint/format. [ADR-006](../adr/ADR-006-monorepo-and-tooling.md)                          |
| Testing   | Vitest + TestBed; Playwright (integration + mocked)                           | Tests assert behaviour, not implementation. [TESTING-STRATEGY.md](./TESTING-STRATEGY.md)                                                                    |

## 3. Structure

```
apps/web/src/
├── app/
│   ├── core/                  # singletons, used from the root
│   │   ├── api/               # DTOs (types inferred from the API's zod schemas), models, mappers,
│   │   │                      # one typed service per resource
│   │   ├── auth/              # SessionStore (active profile) + route guard
│   │   ├── catalog/           # PlantCatalogFacade: the provider seam over the domain's catalog
│   │   ├── config/            # APP_CONFIG (API base URL, cache TTL, retry policy), ThemeStore
│   │   ├── errors/            # ApiError taxonomy, global ErrorHandler, ToastStore
│   │   ├── http/              # interceptors: base URL, retry with backoff + jitter
│   │   ├── i18n/              # the EN/NL switch: each language is its own build (ADR-010)
│   │   ├── layout/            # the shell: top bar, navigation, profile menu, page backdrop
│   │   ├── logging/           # the Logger seam and its optional sink (sendBeacon)
│   │   ├── telemetry/         # Core Web Vitals, measured with PerformanceObserver
│   │   ├── weather/           # WeatherProvider seam; Open-Meteo is the shipped implementation
│   │   └── resilience/        # QueryCache: SWR + in-flight de-duplication
│   ├── state/                 # app-wide SignalStores, providedIn: 'root'
│   │   ├── gardens-store/         # GardensStore + the list's search/sort (garden-view.ts)
│   │   ├── garden-layout/         # saved bed positions per garden (localStorage)
│   │   └── plants-index-store/    # PlantsIndexStore: the one writable owner of plants
│   ├── domain/                # business rules and maths — no HTTP, no stores
│   │   ├── garden-insights/       # capacity and humidity rules
│   │   ├── garden-map-layout/     # the area-true treemap layout
│   │   ├── garden-planner/        # watering zones, clashes, grouping, timeline
│   │   ├── watering-plan/         # what needs water today, from zone and planting date
│   │   ├── plant-recommendation/  # ranks the catalog for one garden
│   │   ├── plantation-date/       # UTC calendar-day handling
│   │   └── catalog/               # the plant catalog (content: the one domain module with text)
│   ├── features/              # one lazy route per folder; the files at its root are the page
│   │   ├── onboarding/        # profile selection and creation
│   │   ├── dashboard/         # portfolio KPIs, attention center, garden health, water today
│   │   │   ├── garden-mini-preview/
│   │   │   └── watering-panel/
│   │   ├── gardens/           # the garden grid
│   │   │   ├── garden-form-dialog/
│   │   │   └── prefetch-garden/       # hover/focus prefetch directive
│   │   ├── garden-detail/     # header and plants table
│   │   │   ├── garden-detail-store/   # GardenDetailStore (route-scoped)
│   │   │   ├── plant-form-dialog/
│   │   │   └── garden-map/            # the planner: SVG scene and toolbar
│   │   │       ├── garden-map-skeleton/
│   │   │       ├── map-camera/        # pan and zoom maths, keyboard, screen ↔ map units
│   │   │       ├── map-gestures/      # the pointer machine: tap, pan, pinch, bed drag
│   │   │       ├── map-timeline/      # the strip, and the replay's state and playback
│   │   │       ├── map-plan-list/     # the plan as text, and its row builder
│   │   │       └── map-inspector/     # (+ map-hud, map-toolbar, map-layers-panel)
│   │   ├── profile/           # edit-profile dialog (loaded on demand)
│   │   └── not-found/
│   └── shared/ui/             # presentational kit, one folder per component: skeletons, empty
│                              # state, stat card, capacity bar and status, watering-zone labels,
│                              # humidity gauge, confirm dialog,
│                              # toasts, value presets, plant artwork and its resolver,
│                              # <app-chart>: Highcharts, loaded on demand (ADR-008), and the
│                              # PNG export of any on-screen SVG (drawn in the browser);
│                              # each component's *.stories.ts sits next to it (Storybook)
├── environments/              # the one build-time switch: apiBaseUrl
├── locale/                    # messages.json (English, extracted) and messages.nl.json (ADR-010)
└── styles/                    # design tokens, motion presets, the skeleton engine
```

`apps/web/.storybook/` configures Storybook for the shared UI kit: the app's global styles, the
light and dark themes as a toolbar switch, and the a11y add-on.

- **One folder per unit.** The files at the root of a feature folder are its routed page. Every
  other component, directive, store or domain module lives in its own folder, named after it,
  together with its template, styles and spec.
- **Dependencies point one way:** `features` → `state` → `domain` and `core`. `domain` imports only
  the model types from `core/api` — no Angular, no RxJS, no text (`$localize`): it returns keys
  and numbers, and the UI turns them into words (`shared/ui/capacity-status`,
  `shared/ui/watering-zone`, the plant form's recommendation reasons). The one exception is the
  plant catalog, which is content rather than a rule. `shared/ui` is presentational: it may use
  domain functions, the models, the Logger and the toast queue, never a feature, a store or an
  API service. `state` knows no screens. `core` is the foundation and imports nothing above it,
  except that the shell (`core/layout`) composes `shared/ui`.
- **Features do not import each other, and `core` does not import features**, with two deliberate
  exceptions: the shell lazy-loads the profile dialog on demand, and garden detail reuses the
  garden form dialog from `gardens/` to edit the open garden. State that two features need lives
  in `state/`.
- **The lint enforces it** (`apps/web/eslint.config.mjs`): each layer lists the imports it may not
  have, and a violation fails `npm run lint` with the rule's reason. The same config runs
  angular-eslint (signal inputs and outputs, `inject()`, OnPush, `host:` metadata, template
  control flow and accessibility) and typescript-eslint's type-aware rules (no floating promise,
  exhaustive switches, type-only imports — which are erased and so are not dependencies).
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
a Try again toast. Metrics change only on confirmed state. The confirmation toast offers Undo.
The API has no restore, so Undo creates the item again under a new id: a plant with its bed
position, a garden with its owner, its plants and its planner layout.

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

All logging goes through one `Logger` (`core/logging`): the console, plus one optional `LogSink`
(`LOG_SINK`). Expected unhappy paths (`warn`) are silent outside dev mode and never leave the
browser; technical failures (`error`) always report, and reach the sink as their context tag and
sentence — the cause stays in the console. Messages carry an operation and an id, never a payload.

`core/telemetry/web-vitals.ts` measures LCP, FCP, CLS, INP and TTFB with the browser's own
`PerformanceObserver` (no library), rates them against the web.dev thresholds, and reports them
once through `Logger.metric()` when the page is first hidden. With `telemetryEndpoint` set in the
environment, the sink is a `BeaconSink`: entries are batched and sent with `navigator.sendBeacon`
when the page is hidden. It is unset by default, so nothing leaves the browser. A Sentry or
OpenTelemetry adapter is the same `LogSink` interface, provided in place of the beacon.

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
  functional errors inline without stores knowing about forms. The verdict and the one policy for
  a failed write (`failMutation`: a technical failure is toasted, a functional one goes back to the
  form) live in `state/mutation-result.ts`, shared by every store.
- **A store's private collaborators are `withProps`**, not state: the detail store's
  `PlantsIndexStore` handle and its load token sit beside the state, readable by every feature
  after them, never patched, never a signal.
- **What is derived from a key is `withLinkedState`**, not reset by hand: `lastCreatedPlantId` and
  `restored` are linked to `gardenId`, so a new garden clears them by construction — a `load()`
  cannot forget to.
- **A store that follows a signal exposes a `signalMethod`**: `GardenDetailStore.loadFor(gardenId)`
  takes the route input itself, once, in the component's constructor. The component has no
  effect that reads a signal and calls a method; the per-garden UI state beside it (layout,
  undo history) is `linkedSignal` on the same input.
- **A dialog reaches its screen's store through DI**, not through `MAT_DIALOG_DATA`: the screen
  opens it with its own `injector`, so the route-scoped `GardenDetailStore` is provided, and
  the dialog's data carries data only.

**Signals vs RxJS.** Signals hold state; RxJS handles I/O and events: HTTP, the retry/backoff
operator in the interceptor, and `rxMethod` for the plants loading (`distinctUntilChanged` over the
garden ids, so a component declares its source once instead of running an `effect()` that both reads
and writes). Effects are few and narrow: the document title, and scrolling a newly created garden
card into view. Subscriptions are limited to streams that complete or live as long as the app:
dialog `afterClosed()` and the root router-events listener that resets scroll position. What a
store must do when it is destroyed (flush the list preferences, cancel a stale load) is a
`withHooks` `onDestroy`, not a component's job.

**Async method pattern.** Every async store method pairs its status flag with a `finally` reset and
maps failures through `toApiError` — a frozen loading state or a swallowed error cannot occur by
construction.

**What happens when…**

- **…the user double-clicks Save?** The dialog ignores the click while `saving`, and the store is
  single-flight underneath: a second create, or a second update of the same entity, joins the
  request in flight and gets its verdict, so nothing can send two. Deletes carry per-entity
  pending guards, so a repeated delete is a no-op.
- **…a write's answer is lost on the wire?** Every `POST` carries an `Idempotency-Key`; the retry
  re-sends it with the same key and the API answers from memory instead of writing twice
  ([ADR-004](../adr/ADR-004-resilience-layer.md) addendum). A `POST` without a key is never
  retried.
- **…two identical loads race?** The QueryCache hands both callers the same in-flight promise.
- **…another profile signs in while the list is loading?** The list key is per profile, the sign-in
  clears the cache (pending fetches included), and `GardensStore.load()` re-checks the owner when
  its answer arrives: the previous profile's gardens are never shown, not even for a frame.
- **…a plant write finishes after the user opened another garden?** Every plant mutation reads and
  writes the plants of the garden it targets, by id — never "the plants on screen" — and marks the
  route's status only when the route's garden is the one written. The new plant lands in its own
  garden; the garden on screen keeps loading its own.
- **…a slow response arrives for a garden the user already left?** Each `GardenDetailStore.load()`
  takes a monotonic token; a stale response is discarded instead of rendering garden A as garden B.
- **…the page is refreshed?** The session restores from `localStorage`; entity caches are memory-only
  by design (a 30 s TTL makes persistence pointless), so data re-flows through the skeleton path.

## 6. Rendering and performance

Zoneless + OnPush + signals: change detection runs only where a signal changed. Every route is a
lazy chunk, and the planner ships in its own `@defer (on viewport; prefetch on idle)` chunk behind a
dimension-matched ghost; the two charts load the same way, and the Highcharts library is imported only
when one scrolls into view ([ADR-008](../adr/ADR-008-charts-highcharts.md)). Skeletons reserve the final layout, bars and gauges animate `transform`
only, fonts are self-hosted with the two latin faces preloaded from `index.html`, and the app
shell imports no Material: its one Material control, the account menu, is a `@defer (on idle)`
block behind a placeholder that is the same chip. `angular.json` budgets — the initial bundle and
each named chunk — fail the build on regression, and CI diffs every chunk against a committed
baseline (`npm run bundle:check`). Measurements and the cache design:
[PERFORMANCE-AND-CACHING.md](./PERFORMANCE-AND-CACHING.md).

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
- **A generic card or dialog framework, a route-constants helper** — semantic components stay
  local and legible.
- **Formatting pipes** — `DecimalPipe` with explicit digits covers every case, including summed
  areas that would otherwise show float noise.

Two entries left this list. A card mixin and a breakpoint system were declined while "the few
media queries are container-specific collapse points"; a survey found 21 queries at ten different
widths and the same five-line card recipe in seven places — an inconsistent grid after all. Both
now live in `styles/abstracts/` ([DESIGN-SYSTEM.md §9](../design/DESIGN-SYSTEM.md)).

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
- **Styles:** tokens only, never a literal colour, size or z-index; media queries through the
  breakpoint map, zone colours and card surfaces through their mixins (`styles/abstracts/`);
  the foundations sit in cascade layers under every component; the shared kit is named in BEM,
  feature components keep short scoped names ([DESIGN-SYSTEM.md §9](../design/DESIGN-SYSTEM.md)).
- **State:** immutable `patchState` updates with new references — zoneless rendering depends on
  them.
- **HTTP:** features call the typed API services only; retry lives in the one interceptor and
  caching in `core/resilience`; every call resolves to data or a typed `ApiError`.
- **Forms:** Signal Forms — a `signal` model, a `schema` of rules that mirror the backend's zod
  schemas exactly (the capacity rule is a validator on the area field), `[formField]` on the
  Material controls, and `submit()` running the store's single-flight write; an in-button ghost bar
  instead of a spinner. The welcome and profile screens still use reactive forms
  ([ADR-011](../adr/ADR-011-signal-forms.md)).
- **Errors and feedback:** functional errors render inline, technical errors as a toast with Try
  again, deep-link misses as the not-found page, empty results as the shared `empty-state`;
  destructive actions confirm through the shared dialog.
- **Logging:** a context tag and a sentence — never a payload (§4.4).
- **Styling:** components consume design tokens only; type in `rem`; no `::ng-deep`; every
  animation honours `prefers-reduced-motion` ([DESIGN-SYSTEM.md](../design/DESIGN-SYSTEM.md)).
- **Tests:** co-located `.spec.ts` files that assert what a user notices, with fake timers for
  anything time-based ([TESTING-STRATEGY.md](./TESTING-STRATEGY.md)).
