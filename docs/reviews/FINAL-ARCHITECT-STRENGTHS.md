# Home Garden — Final Architect Review: Verified Strengths

**Reviewed:** 2026-09-10 (audited at `d02addb`, re-verified after the remediation pass) · **Method:** independent audit — source read, application run against the real backend, gates executed. Every claim below is backed by a file, a measurement or a runtime observation. Claims that could not be verified were dropped, and claims invalidated by the remediation pass were rewritten rather than left standing.

Companion documents: [FINAL-ARCHITECT-FINDINGS.md](./FINAL-ARCHITECT-FINDINGS.md) (every finding and its outcome) and [FINAL-FINDINGS-REMEDIATION.md](./FINAL-FINDINGS-REMEDIATION.md) (the RED → FIX → VERIFY record). This document and the findings document are kept consistent: nothing is praised here that is still open there.

---

## Executive Assessment

This is not a home assignment that grew features until time ran out. It is an application whose architecture is visibly derived from one constraint — a backend that adds 200–2000 ms to every response and fails 10% of requests — and the derivation is traceable in code, in tests and in written decisions.

Three things separate it from a strong-senior submission:

1. **The hard requirement got the rigour.** The resilience layer is measured (60 live calls: p50 1083 ms, p95 1877 ms), designed against those measurements, and tested at the level where each mechanism can actually fail.
2. **Domain truth has exactly one home.** The overcrowding rule exists once, in a pure function, and is consumed by nine modules including the visualiser. The planner cannot disagree with the form.
3. **Defects were found by instrumentation, not by opinion.** Regression tests in this repository were demonstrably written to fail against the old behaviour first — a discipline most submissions do not show.
4. **The review pass itself was held to the same standard.** Of twelve audit findings, nine were fixed, two were investigated and deliberately not fixed with the evidence recorded, and one was **withdrawn** because re-measurement showed the instrument had manufactured the defect it reported. A codebase whose own review corrects itself is a stronger signal than a codebase with no findings.

---

## Architecture Strengths

| Area                 | What is strong                                                                                                                                                               | Evidence                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Layering             | Components never see endpoints; features never touch `HttpClient`. Requests flow component → store → API service → interceptors.                                             | `core/api/*-api.ts` are the only `HttpClient` consumers; `grep -rn "HttpClient" features/` returns nothing                                   |
| Entity ownership     | Plant entities have exactly **one** writable owner. `GardenDetailStore` holds route key and statuses only; its `plants` is a computed view into `PlantsIndexStore.byGarden`. | `garden-detail-store.ts:45-52` (documented), `:70` computed view                                                                             |
| Store scoping        | The detail store is **component-provided**, so it dies with the route; only genuinely shared state is root-provided.                                                         | `garden-detail.ts:43` `providers: [GardenDetailStore]` vs `{ providedIn: 'root' }` on `GardensStore`/`PlantsIndexStore`                      |
| Pure domain core     | Capacity, humidity, layout, recommendation and visual resolution are pure functions with no Angular imports — the prime test targets.                                        | `shared/utils/*.ts` — zero `@angular` imports outside `inject()`-free files                                                                  |
| Deployment ignorance | `apiBaseUrl` exists once, in `environments/`, read by `APP_CONFIG`, applied by an interceptor.                                                                               | `core/config/app-config.ts:33`, `core/http/api-interceptors.ts:11-18`; production bundle contains **one** `/api` string and zero `localhost` |

**KEEP:** the single-owner entity model. It is the reason the dashboard, the gardens grid and the detail screen cannot disagree about a garden's plants, and it is the kind of decision that is expensive to retrofit.

---

## Angular 22 Strengths

Verified against installed versions: Angular **22.1.5**, CLI **22.1.7**, Material/CDK **22.1.5**, NgRx signals **22.0.0**, RxJS **7.8.2**, Nx **22.0.2**, Vitest **4.1.11**, Playwright **1.63.0**.

- **Genuinely zoneless, and honestly documented.** `zone.js` is not a dependency of the workspace at all — absent from `node_modules`, so it cannot load even accidentally; `angular.json` declares no polyfills; and `NgZone`, `detectChanges`, `markForCheck` and `ApplicationRef.tick` appear **zero times** in application code. Angular 22 is zoneless by default, so `provideZonelessChangeDetection()` is deliberately **not** called — and `app.config.ts` says so in a comment, because the honest answer to "is this really zoneless?" is the three checks above, not the presence of a provider that does not enable it. The whole unit and browser suite passes with reactivity carried by signals rather than patched globals.
- **Zero legacy decorators.** `@Input`, `@Output`, `@ViewChild`, `@HostListener`, `@HostBinding`: **0 occurrences** across `apps/web/src`. 40 signal `input()`, 8 `output()`, 1 `model()`, 1 `viewChild.required()`.
- **Modern control flow throughout** — no `*ngIf`/`*ngFor`/`ngSwitch` remain; `@if`/`@for`/`@switch`/`@defer` only.
- **Strict everything**: `strict: true`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, plus `strictTemplates` and `strictInjectionParameters`.
- **Functional interceptors and guards** (`baseUrlInterceptor`, `retryInterceptor`, `sessionGuard` as `canMatch`), route-level `loadComponent` on every feature.
- **Type safety is real, not declared**: `: any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` — **0 occurrences each** in application code. Lint runs at **0 errors and 0 warnings** across three projects, and nothing was suppressed to get there.

**Why this demonstrates seniority:** zoneless is easy to declare and hard to sustain. The absence of a single `detectChanges` escape hatch is the evidence that the reactive graph actually works.

---

## Signals Strengths

Census of application code (specs excluded): derivation dominates — `computed` outnumbers `effect` by more than an order of magnitude, with `signal`, `toSignal` and a single `linkedSignal` making up the rest, and **0 `toObservable`**. Run `grep -rn "computed(\|effect(" apps/web/src --include="*.ts" | grep -v spec` for the current counts.

The ratio is the point: derivation dominates, and there is no signal↔observable ping-pong.

**Every effect was classified. All seven are imperative or external — none propagates derived state:**

| Effect                              | Purpose                                                   | Verdict                                                                                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skeleton-group.ts:53`              | `setTimeout` orchestration for appear-delay / min-display | Imperative timer — correct                                                                                                                                                               |
| `stat-card.ts:118`                  | count-up animation, with `onCleanup`                      | Imperative animation — correct                                                                                                                                                           |
| `garden-detail.ts:105`              | route param → `store.load(id)` / `markMissing()`          | Route command — correct                                                                                                                                                                  |
| `garden-detail.ts:120`              | `Title.setTitle()` from loaded garden                     | External browser API — correct                                                                                                                                                           |
| _(removed)_                         | plant fan-out for visible gardens                         | **Was** a data fetch from state (finding F-02). The component effects are gone: `PlantsIndexStore` now owns the fan-out via `rxMethod`, and components only declare a `gardenIds` source |
| `garden-map.ts` (`afterNextRender`) | `ResizeObserver` → viewport ratio signal                  | Non-reactive browser API, disposed via `DestroyRef` — correct                                                                                                                            |

**`linkedSignal` used once, where it belongs:** `garden-map.ts` camera state is derived from the garden's world box but user-overridable by pan/zoom. Its source is deliberately the _world_, not the viewport-shaped box, so resizing a window cannot snap a zoomed-in user back to fit.

**Writable state is not leaked:** stores expose `patchState` only internally; components receive readonly signals and methods. Components also no longer _write_ into a shared store at all.

**Zero `untracked()` in production code.** `grep -rn "untracked" apps/web/src` matches only prose in comments. The two calls that used to exist were load-bearing — they existed to stop a read↔write self-dependency from looping — and they were removed by fixing the ownership rather than by relocating the workaround. This is the specific thing an Angular-literate reviewer checks for, and it is clean.

---

## SignalStore Strengths

Three stores, each with a defensible reason to exist:

| Store               | Scope     | Why it earns a store                                                                                         |
| ------------------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| `GardensStore`      | root      | Shared across dashboard and gardens grid; owns SWR reads, ghost-confirmed deletes, persisted view preference |
| `PlantsIndexStore`  | root      | The single writable owner of plant entities across three screens                                             |
| `GardenDetailStore` | component | Route-scoped statuses and mutation lifecycle for one garden                                                  |

- **Derived state is `withComputed`, never stored**: `isLoading`, `hasFailed`, `isEmpty`, `count`, `usedArea`, `freeArea`, `avgHumidity`, `humidityDrift`, `plantsEmpty`, `gardenMissing`, `gardenFailed`.
- **Impossible states are structurally prevented**: `isEmpty` is `status === 'ready' && length === 0`, so "empty" cannot be shown while loading. `gardenMissing` (404) and `gardenFailed` (5xx/network) are separate computeds off one status plus one flag — the screen cannot claim a garden was deleted because a request failed.
- **Mutation lifecycle is modelled explicitly**, not as a boolean: `saving`, `creating`, `pendingCreateArea`, `pendingUpdates[]`, `pendingDeletes[]`, `lastCreatedPlantId`. Those arrays are what let a single row ghost while the rest of the table stays interactive.
- **Re-entrancy is guarded in the store, not only in the view**: `gardens-store.ts:185` and `garden-detail-store.ts:260` refuse a second delete for an id already in flight.

---

## RxJS Strengths

RxJS is used where it is the right tool and nowhere else — `subscribe(` appears twice in application code, both `MatDialogRef.afterClosed()` (a completing observable, no leak).

- **The retry policy is a real policy**, not a decorator: exponential backoff with **full jitter**, 3 retries, 250 ms base, ×3 factor, 3 s cap, and — importantly — it retries `5xx`/network only and never a 4xx verdict (`api-interceptors.ts:60`). Blind write-retry is justified in a comment by a verified property of _this_ backend (failures are injected in `onRequest`, before any handler), with the production-grade answer named (idempotency keys, ADR-005).
- **Concurrency is solved where it actually occurs.** Rather than reaching for `switchMap` in a component, `GardenDetailStore` implements a monotonic request token (`loadToken` / `isStale`, `garden-detail-store.ts:115-201`) so a 2-second response for garden 1 cannot land as garden 2. This is the store equivalent of `switchMap` and it is unit-tested for both the success and the failure path.
- **De-duplication lives in the cache**, which stores the in-flight promise, not just the settled value — so concurrent identical GETs collapse into one request.

---

## Domain Modeling Strengths

**Capacity has exactly one implementation — now with no exceptions.** At audit time there was precisely one leak (`garden-map-layout.ts` re-derived used area); it was closed, and the agreement between the domain module and the map's _drawn_ occupancy is now asserted by test at 0 / 50 / 97.5 / 100 %, decimal areas, over-capacity and edit-excludes-self. The per-plant humidity comparison was consolidated the same way into `plantHumidityDelta`.

**The exported surface.** `shared/utils/garden-insights.ts` exports `usedSurfaceArea`, `freeSurfaceArea`, `occupancyRatio`, `wouldOvercrowd`, `remainingCapacity`, `capacityStatus`, `averageHumidity`, `humidityDelta`. Consumers, verified by grep:

```
dashboard.ts · garden-detail-store.ts · garden-map.ts · plant-form-dialog.ts
garden-form-dialog.ts · garden-list.ts · garden-view.ts
capacity-status.ts · status-badge.ts · plant-recommendation.ts
```

**The client mirrors the server exactly, including its edit semantics.** Side by side:

|        | Server (`apps/api/.../plant.service.ts`)            | Client (`garden-insights.ts`)                          |
| ------ | --------------------------------------------------- | ------------------------------------------------------ |
| Create | `totalUsed + new > garden.totalSurfaceArea` (`:61`) | `otherArea + requestedArea > totalSurfaceArea` (`:35`) |
| Update | filters `p.plantId !== plantId` first (`:105`)      | `excludePlantId` filter (`:34`)                        |

Both use `>`, so a plant that fills a garden **exactly** is allowed on both sides. That symmetry is the difference between a client that guesses and a client that mirrors.

**Numeric edge cases are handled at the source:** `occupancyRatio` guards `totalSurfaceArea <= 0`; `freeSurfaceArea` clamps at 0; `capacity-bar` clamps the ratio to `[0,1]` before it reaches a CSS transform; the treemap applies a `fitFactor` for over-capacity gardens so nothing overflows. No `NaN`, `Infinity` or negative width can reach the DOM.

---

## Backend Integration Strengths

- **The contract was derived from the backend's source, then probed live** — routes, zod schemas, services, migrations, Bruno collection and `/docs`, with the findings recorded per endpoint in `docs/backend/BACKEND-API-AUDIT.md`.
- **Coverage:** 15/15 meaningful user-facing endpoints used; 17/17 writable fields reachable from a form; the one unused endpoint (`GET /plants/{plantId}`) is documented in code as a deliberate omission.
- **Three contract defects were found and fixed with regression tests** — a timezone day-shift on `plantationDate`, the route race above, and 404/500 conflation.
- **Backend limitations are documented rather than hidden**, each with a frontend mitigation and the server-side fix: no capacity check on `PUT /gardens/{id}`, `updatedAt` never written, plants of a missing garden answer 400, no pagination or user scoping.
- **The missing user↔garden relationship is handled honestly.** The `garden` table has no `userId` column (verified in `migration001.ts`), so the profile is treated as a local session identity, and the delete-profile copy states that gardens are shared. Filtering client-side to fake ownership would have been the dishonest option.

---

## Async UX / Skeleton Strengths

- **Zero spinners**, enforced two ways: `npm run check:no-spinners` in CI, and runtime assertions in the mocked suite. Verified independently: `mat-spinner`, `MatProgressSpinner`, `@keyframes spin`, `rotate(360deg)` — **0 occurrences**.
- **One shimmer engine.** `@keyframes shimmer-sweep` is defined **once** (`styles/_motion.scss:26`); the gradient is one token (`--gradient-shimmer`); three consumers compose it. Feature skeletons define geometry only.
- **Mutation feedback is scoped, not modal.** `pendingUpdates`/`pendingDeletes`/`pendingCreateArea` drive ghosts on the affected row, card, bed or header while everything else stays interactive — observed directly: deleting a plant greys that row and its bed on the map, leaving the rest of the table usable.
- **Deletes are ghost-confirmed rather than optimistic-then-restored** for plants: the entity stays visible and inert until the server confirms, which is the honest reading of a 2-second API.
- **Skeletons are accessible**: visual placeholders are `aria-hidden` (10 on the dashboard, 5 on gardens) and the loading container carries `role="status"` with a visually-hidden "Loading…".

---

## UI/UX Strengths

- **Empty states are designed, not blank**, and each carries the correct next action: zero profiles → "Create your profile"; zero gardens → "Create a garden"; empty garden → an invitation drawn into the plan with a "Plant your garden" CTA; the Attention Center shows a positive "Everything looks healthy" card rather than vanishing.
- **The overcrowding message is specific, not generic**: entering 20 m² with 15.2 m² free turns the Garden-fit panel red, shows `Remaining −4.8 m²` and the sentence _"This plant requires 20 m², but only 15.2 m² is available in this garden"_, and disables submit — verified in the running application.
- **Edit semantics are visible in the UI**: editing a 0.3 m² plant in a garden with 15.2 m² free shows "Available 15.5 m²" — free space plus the plant's own area. The user sees the self-exclusion rule, not just its result.
- **Dark mode is a genuine token remap**, verified in the running app at 1440×900: surfaces, borders, text ramp, semantic accents and the map palette all flip; no component code branches on theme.
- **Layout holds across viewports** for `/welcome`, `/gardens` and `/gardens/:id` at 375, 768, 1024, 1440 and 1920 px (measured horizontal overflow: 0 at every width). The dashboard exception is finding F-01.

---

## Garden Planner Strengths

- **Area honesty is mathematical, not decorative.** A squarified treemap (Bruls/Huizing/van Wijk) partitions the used region so every cell's area equals the plant's real `surfaceAreaRequired`. A 98% garden looks 98% full — asserted in `garden-map.spec.ts` against the HUD.
- **Deterministic by construction**: plants sort by area desc then `plantId` asc, and squarify is a pure fold, so a 2-second revalidation cannot rearrange the garden under the user. The same garden looks identical on every visit.
- **Layout and camera are pure TypeScript with 26 specs** (17 layout + 9 camera) covering determinism, order-independence, area honesty, clamping, anchor-preserving zoom and origin-aware clamping.
- **Visual state is separated from domain state.** Dragged bed positions live in versioned `localStorage` (`homeGarden.visualLayout.v1.<id>`), are corrupt-safe on read, and are explicitly excluded from capacity math — verified at runtime: dragging a bed left the HUD at 39% before and after.
- **Renderer choice was made with data, not taste.** PixiJS was evaluated and rejected in ADR-007 with a comparison table; the SVG scene gives real focusable plant nodes, token-driven theming, jsdom-testable pure units and a ~100 kB smaller chunk. The exit strategy is real — the renderer consumes a plain view model.
- **The camera adapts to its container.** Fit means "this garden fills this panel" at any shape: measured 95% of stage width on desktop and 98% at a 1.31 ratio in fullscreen, with the viewBox ratio matching the stage ratio in both.

---

## Design System / SCSS Strengths

- **One token source** (`styles/_tokens.scss`): surfaces, text ramp, brand, semantic accents, gradients, shadows, radii, spacing, typography, motion, map palette, skeleton greys, focus ring. Dark mode redefines the same names.
- **Verified zero unused tokens** after the cleanup pass, and **zero orphan component rules** (one selector-vs-template sweep across every component SCSS returned nothing).
- **CSS escapes are disciplined**: `::ng-deep` appears **only inside comments explaining why it was avoided**; `!important` appears 6 times, 5 of them inside `prefers-reduced-motion` overrides where beating component animations is the point.
- **Reduced motion is systemic**, implemented once in `_motion.scss` rather than per component.

---

## Accessibility Strengths

- **axe-core WCAG scans run in both themes** as part of the deterministic suite, on data-loaded states with reduced motion emulated so blended colours are measured accurately.
- **Structure verified independently**: exactly one `<main>`, one `<h1>` per route, `<nav>` landmarks (breadcrumb labelled), live regions present.
- **Heading outline is clean across every page state**, extracted at runtime rather than reasoned about: `/gardens` (populated and empty), `/dashboard` (populated and empty), `/gardens/:id`, the not-found branch and the 404 page — **zero level skips**. `EmptyState` takes a typed `headingLevel` so each caller places itself correctly in the outline while the visual size stays fixed; semantic level and typography are independent by design.
- **Target sizes meet WCAG 2.2 SC 2.5.8 (AA)**: measured, not assumed — the breadcrumb link is 60 × 24 px, achieved by growing the hit area rather than the visual, with no overlapping pseudo-element targets.
- **The map is operable, not decorative**: each plot is a real focusable button with `aria-pressed`; Enter selects; the SVG carries a descriptive `aria-label` naming plant count, utilisation and target humidity; arrow keys pan and `+`/`-` zoom.
- **Catalog cards speak their reasoning**: `aria-label` is `"Basil, Excellent fit. Close humidity match (60% vs 60% target)…"` — the same justification a sighted user reads.
- **Dialogs use CDK focus management**, asserted in tests: focus is trapped, Escape closes, and focus returns to the trigger.

---

## Performance Strengths

Measured on the current tree, cold build:

|                                            | Raw       | Transfer (gz)         |
| ------------------------------------------ | --------- | --------------------- |
| **Initial total**                          | 485.81 kB | **129.58 kB**         |
| `garden-detail` (lazy)                     | 170.33 kB | 35.06 kB              |
| `garden-map` (lazy, `@defer`)              | 49.60 kB  | 12.29 kB              |
| `dashboard` / `onboarding` / `garden-list` | —         | 7.72 / 5.32 / 3.88 kB |
| styles                                     | 18.68 kB  | 3.89 kB               |

- **Budgets are a gate, not decoration**: initial error ceiling 600 kB against 485.81 kB raw. The build fails on regression.
- **Perceived performance is separated from real performance in writing** — the documentation states plainly that skeletons improve perception and that only the cache removes network time.
- **Prefetch is targeted, and the de-duplication is measured**: hovering a garden card warms its detail and plants through the same cache; a hover-then-click sequence issues **one** request, not two, and client-side navigation with a fresh cache issues **zero**. Both are asserted by an E2E guard rather than claimed.
- **`@defer` is described honestly.** Its measured benefit on this screen is the lazy chunk boundary — `garden-map` ships as its own 12.29 kB chunk, out of the detail route's bundle — not delayed rendering: on a desktop viewport the map is above the fold and the trigger fires at once. The trigger is kept because it is self-tuning (it genuinely defers where the map starts off-screen) and the dimension-matched ghost keeps hydration shift-free: measured CLS **0.025** at 1440×900 and **0.000** at 375×812.
- **No heavy visualisation dependency**: Three.js and PixiJS are not installed. Fonts are self-hosted; total media 280 kB across 9 files.

---

## Testing Strengths

| Suite                               | Result on the current tree                                 |
| ----------------------------------- | ---------------------------------------------------------- |
| Unit / component (Vitest)           | **166 passed**, 22 files                                   |
| Playwright `mocked`                 | **66 passed**, `--retries=0`, **2 consecutive clean runs** |
| Playwright `integration` (real API) | **6 passed**, `--retries=0`                                |
| Lint (api + web + web-e2e)          | 0 errors, **0 warnings**                                   |
| Typecheck                           | PASS — strict + `strictTemplates`                          |
| Production build                    | PASS — 485.81 kB raw / **129.58 kB transfer**              |

- **The two-project split is a real confidence model**, not duplication: `integration` proves the app works against the actual hostile contract; `mocked` proves the states randomness cannot guarantee — exact delays, persistent 500s, empty responses, duplicate submits.
- **Tests target where failure actually occurs**: SWR semantics with fake timers, the retry budget's exhaustion, error-taxonomy mapping for every backend error shape, the capacity mirror including edit semantics, and store behaviour asserted as behaviour rather than implementation.
- **Regression tests were proven to fail first — every single one.** Guards in this repository were verified against the pre-fix code before being kept: the dark-theme contrast guard, the create-card alignment guard, the focus-ring clipping guard, the map geometry guard, and every guard added during the remediation pass. Recorded RED evidence includes `Expected: 0  Received: 200` (document overflow at 375 px), `Expected: 0  Received: 16` (content escaping its card at 1440 px — a case the document-level assertion passes while the layout is broken), `h1→h3` heading skips on two page states, `52x20 FAIL` on the breadcrumb target, and 3 failing capacity-agreement tests against a deliberately divergent implementation. A test that has never failed is a test of unknown value.
- **The hostile-content responsive matrix is a class-of-bug guard.** 5 viewports × 3 routes, fed unbreakable garden, plant and species names at 100 % capacity and extreme humidity, asserting both zero document overflow **and** zero component-boundary escapes. The second assertion exists because the first one provably cannot catch the defect at desktop widths.
- **Request count is asserted as behaviour.** `request-ownership.spec.ts` pins the cold → 1, fresh-cache → 0, stale → 1-background-refresh contract and names the single owner of each fetch — so a future change that reintroduces a duplicate request fails a test rather than being noticed in a network tab.
- **Zero fixed waits.** `waitForTimeout` count across the suite: **0**. The only `setTimeout` calls live inside `page.route` handlers, where they simulate the backend's latency rather than make a test wait for time to pass.
- **Hygiene**: `test.only`, `describe.only`, `test.skip`, `test.fixme` — **0 occurrences**; no assertion was weakened and no budget raised to make anything pass. 277 semantic locators to 34 CSS locators, the latter confined to visual internals with no role.
- **The stroke sweep is the standout guard**: rather than asserting one fixed value, it walks the rendered SVG and fails if any stroke exceeds 10 screen px — a class-of-bug test, not an instance test.

---

## Production Readiness Strengths

- **Dev and prod are both explicit**, not inherited defaults: `optimization`, AOT, `outputHashing: all`, `namedChunks: false`, `extractLicenses`, `sourceMap: false`, and `fileReplacements` for the environment.
- **Verified in the emitted bundle**: 0 `.map` files, 0 `localhost` strings, exactly one `/api` string, no spec or fixture files, `3rdpartylicenses.txt` present.
- **Hosting requirements are stated and demonstrated**: SPA fallback and a same-origin `/api` proxy, implemented in ~90 dependency-free lines (`tools/serve-dist.mjs`) explicitly labelled a preview harness rather than a deployment target, with correct cache headers.
- **Security headers are documented as deployment concerns** instead of fabricated as config files for a host this project does not have.
- **Dependency advisories are classified rather than bulk-fixed**, with the honest split: 0 reach the shipped browser bundle; the rest are build tooling, Nx and the provided backend.
- **Zero secrets.** No keys, tokens, credentials, `Authorization` headers or `.env` file anywhere. Browser storage holds four non-sensitive, safe-parsed keys.

---

## Documentation Strengths

- **Decision records exist for the decisions that mattered**, including the ones declined with reasons: PixiJS, Three.js, an external plant API, SSR, PWA.
- **Current-state and process documentation are separated**, with `docs/process/README.md` stating explicitly that where the two disagree, the current-state document wins.
- **Performance documentation is measured, not asserted** — 60 live calls, p50/p95/mean recorded, distribution matched against the injected source.
- **No AI-instruction residue in reviewer-facing documentation** — an independent sweep for such phrasing across `README.md` and `docs/` (excluding `docs/process/`) returned nothing.

---

## Engineering Decisions I Would Keep

1. **Single-owner plant entities** — the reason three screens cannot disagree.
2. **Component-scoped detail store** — route state that dies with the route.
3. **Monotonic request tokens over `switchMap`** — concurrency solved where the state lives, and testable without a browser.
4. **Ghost-confirmed deletes for plants, optimistic nowhere the server owns a verdict** — the distinction is deliberate and documented.
5. **Pure layout and camera modules** — the reason the planner is covered by fast unit tests instead of screenshot tests.
6. **The `check:no-spinners` script** — a product rule enforced by CI rather than by review.
7. **Two Playwright projects with different jobs** — determinism and reality, kept separate.
8. **Refusing to fake garden ownership** the backend does not model.
9. **Store-owned request fan-out** — components declare a source; the data layer owns the async lifecycle. This is what let every `untracked()` be deleted rather than relocated.

---

## What Makes This More Than a Typical Home Assignment

- The backend was **audited from its own source and probed live**, and that audit **found three real frontend bugs** that were then fixed with regression tests.
- Latency was **measured** before the caching strategy was chosen.
- The visualiser is **mathematically tied to the domain**, so it cannot flatter the data.
- Decisions that were **declined** are written down with their reasoning — usually the missing half of a submission.
- Documentation **corrects itself**: the performance document states outright that skeletons do not make the API faster — and when an independent review found a document claiming a framework API the code never called, the document was corrected rather than the code bent to match it.
- The independent review **withdrew one of its own findings** after re-measurement showed the instrument had manufactured the defect, and **declined to "fix" two others** where the obvious-looking action would have made the codebase worse. Both outcomes are documented with the evidence.

---

## Strong Interview Talking Points

Each of these is defensible from code in this repository.

1. **"Why NgRx SignalStore rather than component state?"** — Because plant entities are read by three screens and written by one. Show the single-owner model and the computed view in `GardenDetailStore`.
2. **"Why is the detail store component-provided?"** — Route-scoped lifecycle: statuses and pending-mutation arrays must not survive navigation. Contrast with the two root stores and say why each is root.
3. **"How do you stop a slow response corrupting a newer screen?"** — Monotonic request token; walk through `isStale()` and the two unit tests. Explain why the e2e cannot prove it (a full `page.goto` cancels the in-flight XHR) and why the unit test is the authoritative proof.
4. **"Why is blind write-retry safe here, and when would it not be?"** — The failure is injected in `onRequest`, before any handler runs. Then explain idempotency keys as the production answer.
5. **"Why SVG and not WebGL for the planner?"** — The ADR-007 comparison: focusable nodes, token theming, jsdom-testable pure units, ~100 kB smaller. Then the exit strategy: the renderer consumes a view model.
6. **"How do you know 98% full looks 98% full?"** — Squarified treemap, area-exact cells, asserted against the HUD in an e2e test.
7. **"Why no spinners?"** — A skeleton that matches the content's geometry keeps layout shift at zero and reads as "this thing is loading" rather than "something is happening". Enforced by a script and by runtime assertions.
8. **"Where does capacity live?"** — One pure function, nine consumers, mirroring the server including `>` and self-exclusion on edit. Show the two implementations side by side.
9. **"Why two Playwright projects?"** — A 10%-random-failure backend cannot produce deterministic assertions; the mocked project owns determinism, the integration project owns reality.
10. **"What did the backend audit change?"** — The timezone day-shift is the best story: picking 10 September in `Europe/Brussels` stored 9 September, found by probing rather than by reading.
11. **"How is dark mode implemented?"** — A token remap with zero component branches — then the honest follow-up: the toast broke anyway because it used `--text-1` as a _background_, which is why inverted surfaces now have their own token pair.
12. **"What would you do differently with a real backend?"** — The ranked list in `PERFORMANCE-AND-CACHING.md`, led by an aggregate read model to remove the dashboard's `1 + N`.
13. **"What is the weakest part of this codebase?"** — Honest answer now: the volume of documentation. It is navigable and accurate, but it is a lot for a take-home, and a reviewer who dislikes that style will still dislike it. The code stands without it. (The previous answer here was the plant fan-out effects and their `untracked()` loop guard — that one is fixed: the store owns the fan-out, and there are zero `untracked()` calls left.)
14. **"You had a review finding that turned out to be wrong — what happened?"** — The best story in the review set. A duplicate-request finding was filed off a network trace taken by driving the app with `page.goto()` per route. That is a full page load: it boots a new application and destroys the in-memory cache, so it manufactures exactly the duplication it appears to detect. Re-measuring over client-side navigation showed one request per resource and zero on warm cache. The finding was withdrawn and replaced with an E2E guard that pins the real contract. Being able to say "my own measurement was wrong, here is why, here is the guard that stops the question recurring" is a better answer than never having been wrong.
15. **"Why are there two TypeScript versions?"** — Because `@angular/compiler-cli` requires `>=6.0 <6.1` and `typescript-eslint` requires `<6.0.0`; the ranges do not intersect. Aligning them would push one tool out of its supported range. Recorded in ADR-006 with the revisit trigger.
