# Testing Strategy

Coverage follows risk, not percentages. The case asks for _useful_ coverage of critical business logic — that is where the specs are.

## Pyramid, as applied here

| Layer          | Runner                                    | What is asserted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure domain    | Vitest                                    | capacity math: used/free area, utilization, `wouldOvercrowd` (incl. exact-fit boundary and edit-excludes-self semantics), `remainingCapacity`, humidity aggregates, attention thresholds; Garden Map layout (determinism, order-independence, area-proportionality, shrink-to-fit, containment) and camera math (clamped zoom/pan, anchor-fixed zoom) — ADR-007; the chart option builders (portfolio map, humidity profile) — ADR-008                                                                                                                                                                                                                                                                            |
| Infrastructure | Vitest                                    | QueryCache SWR semantics (fresh/stale/miss, de-dup, invalidation, write-through, failure doesn't poison) with fake timers; retry interceptor (retries transient 500s, exhausts budget, never retries 4xx); ApiError mapping for every backend payload shape                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Stores         | Vitest + TestBed                          | behaviour, not implementation: skeleton→data, cached instant render (no second request), error state, ghost-confirmed delete with a Try again affordance, functional verdicts returned to forms, cache coherence after mutations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Components     | Vitest + TestBed                          | what a user notices: a screen renders skeleton/data/empty/error correctly; the plant form blocks over-capacity input and renders the server verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| E2E            | Playwright (`apps/web-e2e`), two projects | **integration** (real API, hostility on): flows 1–6 — happy path (incl. the new plant appearing on the Garden Map), oversized block, edit-without-double-count, delete lifecycles, validation, malformed deep link. **mocked** (`page.route`): deterministic empty/error/slow/pending states, skeleton-after-error, Garden Map flows (populated + inspector, empty CTA, ghost→map swap, zoom/fit/reset), axe scans in both themes with the map hydrated, keyboard (dialogs + map plots), planner interactions (drag, undo, layers, fullscreen), mutation-ghost lifecycles, request-count ownership, chart interaction (a bubble opens its garden, a column selects its plant) and a 375–1920 px responsive matrix |

## Conventions

- `.spec.ts` co-located with the unit it tests; specs read as behaviour docs (`it('rejects a plant that exceeds capacity')`).
- Fake timers for anything time-based (backoff, TTL, skeleton delays) — no real waits, no flakiness.
- Store tests stub the API layer (`GardensApi`) — never `HttpClient` — so they break on behaviour changes, not refactors.
- E2E runs against the _real_ backend (slow + flaky included): the retry layer is part of what's under test; assertions use generous timeouts and unique entity names per run.
- **Dialog-fill sync policy**: every spec that types into a Material dialog first awaits `awaitDialogSettled` (dialog visible + first field focused). The CDK moves initial focus _after_ the open animation; filling earlier lets that focus steal land text in the wrong field. Integration `retries: 1` stays as a safety net for true pathological 500-streaks, not as a crutch: clean runs are the expectation.
- Boy-scout rule: touching under-tested code means leaving it better tested.

## What is deliberately not tested

Presentational components with no branching (StatCard, PageHeader), Material internals, and pixel styling — snapshot tests of markup would pin refactors without catching behaviour bugs.

Run: `npm run test` · `npm run test:e2e` (the config boots api + web); one project alone: `npx playwright test -c apps/web-e2e/playwright.config.ts --project=mocked`. The split rationale: integration keeps real-contract confidence, mocked guarantees the states randomness can't (a persistent 500, an exact 2.5 s delay, an empty list).

## Coverage gate

`npm run test:coverage` enforces **95%** on statements, branches, functions and
lines (`coverageThresholds` in `apps/web/angular.json`). The run fails below
the line.

Two configuration decisions make that number mean something:

- **`coverageInclude` names every application file**, so a file with no spec at
  all counts as 0% rather than being absent from the report.
- **`coverageExclude` is deliberately short** — `*.spec.ts`, the two type-only
  DTO modules (no runtime statements to execute), and `app.config.ts` /
  `app.routes.ts` (declarative provider and route arrays, exercised by the app
  booting in every e2e run). Nothing was excluded to flatter the number.

Templates are counted too. That matters more than it sounds: an Angular
template compiles each `@if`/`@for` block and **each event listener** into its
own function, so template function coverage only moves when a test actually
renders that state and fires that control. The gate therefore requires
component specs to drive the real DOM — clicking the menu item rather than
calling the method behind it — which is the stronger test either way.

Three things are covered by the Playwright suites instead, and are documented
here rather than worked around:

- `Logger.warn`'s production early-return depends on `isDevMode()`, a
  process-wide flag. Mocking it needs Vitest isolation on and code-splitting
  off — a 6× slower suite for one line.
- `GardensStore`'s persisted search/sort parsing runs during module
  evaluation; re-running it needs `vi.resetModules()`, which leaks across the
  shared module registry this suite runs in.
- The `@defer`ed Garden Map renders through `DeferBlockState.Complete` in unit
  tests because jsdom never fires an intersection.
