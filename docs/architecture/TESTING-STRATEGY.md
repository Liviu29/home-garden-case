# Testing Strategy

Coverage follows risk, not percentages. The case asks for _useful_ coverage of critical business logic — that is where the specs are.

## Pyramid, as applied here

| Layer          | Runner                                             | What is asserted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure domain    | Vitest                                             | capacity math: used/free area, utilization, `wouldOvercrowd` (incl. exact-fit boundary and edit-excludes-self semantics), `remainingCapacity`, humidity aggregates, attention thresholds; Garden Map layout (determinism, order-independence, area-proportionality, shrink-to-fit, containment) and camera math (clamped zoom/pan, anchor-fixed zoom) — ADR-007; the chart option builders (portfolio map, humidity profile) — ADR-008                                                                                                                                                                                                                                                                                              |
| API            | Vitest + Fastify `inject()` (`apps/api`)           | the real app — every route, plugin, zod schema and migration — on an in-memory SQLite database with the injected latency and errors off: CRUD for users, gardens and plants, validation 400s, 404s, the 409 on a duplicate email, the garden→plants cascade, `GET /plants` across gardens, the capacity rule in both directions (a plant may not overfill a garden; a garden may not shrink below its plants; an exact fit is allowed), and garden ownership (`visibleTo`, unknown owners refused, the owner kept on edit, gardens released when their profile is deleted)                                                                                                                                                          |
| Infrastructure | Vitest                                             | QueryCache SWR semantics (fresh/stale/miss, de-dup, invalidation, write-through, failure doesn't poison) with fake timers; retry interceptor (retries transient 500s, exhausts budget, never retries 4xx, re-sends a POST only with its idempotency key and never without one); the API's idempotency plugin (same key → same response, no second row; a key is scoped to its URL; a refused POST is not remembered); ApiError mapping for every backend payload shape                                                                                                                                                                                                                                                              |
| Stores         | Vitest + TestBed                                   | behaviour, not implementation: skeleton→data, cached instant render (no second request), error state, ghost-confirmed delete with a Try again affordance, functional verdicts returned to forms, cache coherence after mutations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Components     | Vitest + TestBed                                   | what a user notices: a screen renders skeleton/data/empty/error correctly; the plant form blocks over-capacity input and renders the server verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| UI kit         | Storybook + axe (`tools/check-storybook-a11y.mjs`) | every shared UI component in its states (a gauge at 0, on target and at 100; a full and an over-full capacity bar; each toast tone), each story scanned by axe for WCAG 2.2 AA in isolation — a violation fails the run. The a11y add-on shows the same checks while a story is open                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| E2E            | Playwright (`apps/web-e2e`)                        | **integration** (real API, hostility on, its own database): flows 1–6 — happy path (incl. the new plant appearing on the Garden Map), oversized block, edit-without-double-count, delete lifecycles, validation, malformed deep link. **mocked** (`page.route`): deterministic empty/error/slow/pending states, skeleton-after-error, Garden Map flows (populated + inspector, empty CTA, ghost→map swap, zoom/fit/reset), axe scans in both themes with the map hydrated, keyboard (dialogs + map plots), planner interactions (drag, undo, layers, fullscreen), mutation-ghost lifecycles, request-count ownership, chart interaction (a bubble opens its garden, a column selects its plant) and a 375–1920 px responsive matrix |

## Conventions

- `.spec.ts` co-located with the unit it tests; specs read as behaviour docs (`it('rejects a plant that exceeds capacity')`).
- Fake timers for anything time-based (backoff, TTL, skeleton delays) — no real waits, no flakiness.
- Store tests stub the API layer (`GardensApi`) — never `HttpClient` — so they break on behaviour changes, not refactors.
- The integration project runs against the _real_ backend (slow + flaky included): the retry layer is part of what's under test; assertions use generous timeouts and unique entity names per run.
- **The e2e suite brings its own stack.** `playwright.config.ts` starts a built API on `:3310` with a fresh SQLite file per run (`DB_PATH`, in the OS temp folder) and a dev server on `:4310` whose proxy points at it. An e2e run never writes into the database you develop against, and never sees what an earlier run left behind.
- **A mocked test mocks everything it calls.** Mocked specs import `test` from `support/fixtures.ts`, whose automatic fixture answers any API request the test did not route with a 501 and fails the test at the end, listing those requests. Without it, a forgotten route quietly read whatever the dev database held.
- **Locators:** roles and accessible names first; `data-testid` only for structural containers that have no role of their own (garden, health and attention cards). CSS classes are styling, not a test contract.
- **Cross-engine:** a `webkit` project runs a smoke subset of the mocked suite on Safari's engine. It is on in CI (reported, not yet a merge gate) and opt-in locally with `E2E_WEBKIT=1` after `npx playwright install webkit`.
- **Dialog-fill sync policy**: every spec that types into a Material dialog first awaits `awaitDialogSettled` (dialog visible + first field focused). The CDK moves initial focus _after_ the open animation; filling earlier lets that focus steal land text in the wrong field. Integration `retries: 1` stays as a safety net for true pathological 500-streaks, not as a crutch: clean runs are the expectation.
- Boy-scout rule: touching under-tested code means leaving it better tested.

## What is deliberately not tested

Presentational components with no branching (StatCard, PageHeader), Material internals, and pixel styling — snapshot tests of markup would pin refactors without catching behaviour bugs.

Run: `npm run test` (API + web) · `npm run test:e2e` (the config boots its own api + web) · `npm run build-storybook && npm run storybook:a11y` (the UI kit); one project alone: `npx playwright test -c apps/web-e2e/playwright.config.ts --project=mocked`. CI (`.github/workflows/ci.yml`) runs all of it on every push and pull request. The split rationale: integration keeps real-contract confidence, mocked guarantees the states randomness can't (a persistent 500, an exact 2.5 s delay, an empty list).

## Coverage gate

`npm run test:coverage` enforces **95%** on statements, branches, functions and
lines (`coverageThresholds` in `apps/web/angular.json`). The run fails below
the line.

Two configuration decisions make that number mean something:

- **`coverageInclude` names every application file**, so a file with no spec at
  all counts as 0% rather than being absent from the report.
- **`coverageExclude` is deliberately short** — `*.spec.ts` and `*.stories.ts`, the two type-only
  DTO modules (no runtime statements to execute), and `app.config.ts` /
  `app.routes.ts` (declarative provider and route arrays, exercised by the app
  booting in every e2e run). Nothing was excluded to flatter the number.

Templates are counted too. That matters more than it sounds: an Angular
template compiles each `@if`/`@for` block and **each event listener** into its
own function, so template function coverage only moves when a test actually
renders that state and fires that control. The gate therefore requires
component specs to drive the real DOM — clicking the menu item rather than
calling the method behind it — which is the stronger test either way.

Two things are covered by the Playwright suites instead, and are documented
here rather than worked around:

- `Logger.warn`'s production early-return depends on `isDevMode()`, a
  process-wide flag. Mocking it needs Vitest isolation on and code-splitting
  off — a 6× slower suite for one line.
- The `@defer`ed Garden Map renders through `DeferBlockState.Complete` in unit
  tests because jsdom never fires an intersection.
