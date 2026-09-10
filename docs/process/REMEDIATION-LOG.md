# Remediation Log

> Engineering record of the remediation and feature passes that followed the internal review in
> [PRINCIPAL-REVIEW.md](./PRINCIPAL-REVIEW.md). Findings were worked P1 → P2 → P3; each entry keeps
> its evidence, implementation and acceptance criteria so a decision can be re-read later. Every box
> below is closed — this is history, not a backlog.

## Objective

Close every accepted audit finding so the repository moves from 8/10 ("YES — with reservations") to 9/10 ("YES — strongly"): fix the two runtime/domain defects, make documentation truthful, and bring Playwright up to the project's own testing bar — without disturbing the resilience core, domain purity, or token architecture.

## Baseline Verification (run before starting; all must pass)

```sh
npm ci                                   # or npm install
npx nx run-many -t lint test build -p web   # 63 specs green, build under budget
npx nx e2e web-e2e                       # 2 flows green (boots api+web)
```

Baseline facts: Angular 22.1.5 · @ngrx/signals 22 · Vitest 4 (63 specs / 13 files) · Playwright 1.63 (2 flows) · prod initial ≈ 474 kB raw / 127 kB transfer.

## Definition of Done

- [x] No P1 task open; every P2 task done or explicitly waived with a written reason in this file
- [x] `npx nx run-many -t lint test build -p web` passes; bundle budget unchanged or better
- [x] `npx nx e2e web-e2e` passes with the full flow matrix (mocked + real-API suites)
- [x] No documentation claim contradicts the code (spot-check README + IMPLEMENTATION-PLAN)
- [x] Manual smoke in both themes at 360 px and desktop: dashboard → gardens → detail → plant add/edit/delete
- [x] IMPLEMENTATION-PLAN.md gains a "PHASE 20 — Remediation ✅" section referencing completed REM ids

---

## P1 — Must Fix Before Submission

### REM-001 — Malformed garden-id deep link renders a blank page

**Severity:** P1 · **Category:** routing/UX correctness · **Effort:** S
**Why:** `/gardens/not-a-number` shows only the breadcrumb over empty content (runtime-reproduced). A reviewer typo produces the one thing this app promises never to show: an unexplained dead screen.
**Evidence:** `apps/web/src/app/features/garden-detail/garden-detail.ts` — `effect` skips `store.load(id)` when `!Number.isFinite(id)`, leaving `gardenStatus: 'idle'`; `garden-detail.html` renders nothing for `garden() === null` outside loading/error branches.
**Implementation:** treat a non-finite or `< 1` id as not-found at the edge: in the component effect, `router.navigate(['/not-found'], { skipLocationChange: true })` — or simpler and route-symmetric: patch the store with `gardenStatus: 'error'` via a new `markMissing()` method so the existing "Garden not found" state renders. Prefer the store method (no new route plumbing).
**Files:** `garden-detail.ts`, `garden-detail-store.ts` (+ spec).
**Acceptance criteria:** `/gardens/abc`, `/gardens/-1`, `/gardens/1.5` each render the designed "Garden not found" state with the back link; no blank main content; no API call issued for invalid ids.
**Tests:** unit — GardenDetailStore `markMissing()`; component or e2e — navigate to `/gardens/abc`, assert the not-found copy.
**Verification:** `npx nx test web` + new e2e assertion in REM-004 flow file.
**Dependencies:** none.

### REM-002 — Garden can be shrunk below its used area with no warning

**Severity:** P1 · **Category:** domain correctness/UX · **Effort:** S–M
**Why:** the case's core rule is capacity integrity; the _garden_ edit path bypasses it silently. Server permits (`garden.service.ts` `updateGarden` has no capacity check), so utilization can exceed 100% with no explanation to the user.
**Evidence:** `apps/web/src/app/features/gardens/garden-form-dialog.ts` — no cross-check of `totalSurfaceArea` against the garden's current used area.
**Implementation (client, non-blocking warn — server behaviour is authoritative and permits it):** when editing (not creating), fetch used area from `PlantsIndexStore.byGarden()[gardenId]` (fall back to a cache read; if unknown, skip the warning). Add a computed `shrinksBelowUsed` on the dialog comparing the live `totalSurfaceArea` control value to used area; render a `role="alert"` warning block: _"Plants currently use X m². Setting the total below X leaves this garden over capacity."_ Do **not** hard-block (documented decision: server allows it; blocking would desync client/server rules) — but require a visible acknowledgement styling identical to the plant form's overcrowd block. Extend `garden-insights.ts` with pure `wouldShrinkBelowUsed(garden, plants, newTotal)`.
**Files:** `garden-form-dialog.ts/.html/.scss`, `shared/utils/garden-insights.ts` (+ specs), `docs/architecture/API-INTEGRATION.md` (record the server-side gap as proposal #7: capacity check on garden update).
**Acceptance criteria:** editing a garden with 15 m² used and entering 10 shows the warning live; entering 15 exactly shows no warning; creating a new garden never shows it; saving remains possible.
**Tests:** unit — `wouldShrinkBelowUsed` (empty garden, exact, below, decimals); component — warning appears/disappears with control value.
**Verification:** `npx nx test web`.
**Dependencies:** none.

### REM-003 — Documentation truth drift (README + plan counts)

**Severity:** P1 · **Category:** documentation/reviewer experience · **Effort:** XS
**Why:** README's "What I'd do next" lists **E2E Playwright suite** and **dark mode** — both shipped. A reviewer reading docs-first concludes the candidate doesn't know their own repo. Spec counts (README "48", plan "56") contradict the actual 63 and will drift again.
**Evidence:** `README.md` §"What I'd do next", §"Testing"; `IMPLEMENTATION-PLAN.md` Phase 15.
**Implementation:** rewrite "What I'd do next" to the honest current list (axe-CI, i18n runtime, real auth per ADR-005, virtualized lists at scale, visual regression); replace every hard-coded spec count with count-free phrasing ("the unit/component suite — run `npx nx test web`"); add dark mode + toolbar + prefetch to the README feature narrative (one sentence each); verify every remaining README claim against code while editing.
**Acceptance criteria:** no shipped feature appears in any "next/future" list; no numeric spec count anywhere in docs; README mentions dark mode and the gardens toolbar.
**Verification:** `grep -rn "48 unit\|56 specs\|dark mode (tokens" README.md docs/` returns nothing stale.
**Dependencies:** best done **last**, after REM-004 changes what exists.

### REM-004 — EPIC: Playwright to required coverage (flows 3–10 + determinism)

**Severity:** P1 · **Category:** test architecture · **Effort:** L
**Why:** the assignment and this repo's own TESTING-STRATEGY demand flow coverage the suite doesn't have (2/10); nothing exercises deterministic failure/slow/empty states because the random backend can't guarantee them.
**Evidence:** `apps/web-e2e/src/garden-workflows.spec.ts` (flows 1–2 only), `playwright.config.ts` (no HTML reporter, no failure screenshots, single suite).
**Implementation — structure:**

```
apps/web-e2e/
  playwright.config.ts        # two projects: "integration" (real API) and "mocked" (page.route)
  src/integration/            # existing garden-workflows.spec.ts moves here + flows 3–7
  src/mocked/                 # flows 8–10 via page.route() network control
  src/support/                # signIn init-script helper, createGarden/addPlant helpers, mock payload builders
```

Config: add `reporter: [['list'], ['html', { open: 'never' }]]`, `screenshot: 'only-on-failure'`; keep `trace: 'retain-on-failure'`, workers 1 for integration (shared sqlite), parallel allowed for mocked; keep zero `waitForTimeout` policy (sync on roles/dialog lifecycle as today). Selector policy unchanged: `getByRole`/`getByLabel`; introduce `data-testid` only if a semantic locator is genuinely absent (expected: none).
**Required flows (each a checkbox):**

- [x] Flow 3 (integration) — edit plant: grow within capacity → save succeeds → metrics recalc; verify edit does **not** double-count its own area (grow to exactly full garden)
- [x] Flow 4 (integration) — delete plant with confirm → row gone → used/free recalc; cancel path leaves data intact
- [x] Flow 5 (integration) — delete garden with confirm from list → card gone; detail deep link to it now shows not-found
- [x] Flow 6 (integration) — form validation: required name/species, humidity slider bounds (0/100 reachable, keyboard-adjustable), negative surface rejected, empty submit blocked with visible errors
- [x] Flow 7 (mocked) — empty states: `[]` gardens → "No gardens yet" CTA; garden with `[]` plants → "Nothing planted yet"
- [x] Flow 8 (mocked) — API failure: route `**/api/gardens` to 500 (all attempts) → designed error state + Try again; then un-mock → retry recovers to content
- [x] Flow 9 (mocked) — slow read: delay gardens response ~2.5 s → skeleton ghosts visible (`role=status`) → content replaces them → assert no horizontal overflow before/after (layout stability)
- [x] Flow 10 (mocked) — mutation pending: delay POST ~2 s → button shows "Saving…", second click issues no second request (count via route handler), dialog stays interactive, success toast on resolve
- [x] Skeleton behaviour (mocked, per audit §34): skeleton appears on delayed read, disappears on success, does **not** persist after error (error state replaces it)
- [x] Responsive smoke: run Flow 1 happy path once at 375×812 viewport (mocked project)
- [x] Keyboard/a11y smoke: open plant dialog → focus lands inside → Tab through fields → Escape closes and returns focus to trigger
- [x] REM-001 regression: `/gardens/abc` shows not-found state
      **Acceptance criteria:** all flows green locally via `npx nx e2e web-e2e`; mocked project deterministic (10/10 repeat runs); no `waitForTimeout` anywhere; HTML report generated.
      **Verification:** `npx nx e2e web-e2e` ×3 consecutive runs.
      **Dependencies:** REM-001 (regression test), REM-002 (optional warning assertion in Flow 6).

---

## P2 — Should Fix

### REM-005 — Single ownership for plants state

**Severity:** P2 · **Category:** state architecture · **Effort:** M
**Why:** `GardenDetailStore.plants` and `PlantsIndexStore.byGarden` are two writable copies of the same entities; today's write-through convention (`setPlants`) is correct but unenforced.
**Evidence:** `garden-detail-store.ts` (`plants` in `withState`, `applyPlants` syncs both), `plants-index-store.ts`.
**Implementation (preferred):** make `PlantsIndexStore` the single owner. GardenDetailStore drops `plants` from state; adds `withProps`/`withComputed` deriving `plants = computed(() => index.byGarden()[gardenId()] ?? [])` keyed by a `gardenId` state field; mutations call `plantsIndex.setPlants` only; `plantsStatus` stays in the detail store (per-route concern). Alternative (if derivation forces awkward id plumbing): keep both, but add an invariant spec asserting every mutation path leaves `detail.plants === index.byGarden[id]` (reference equality).
**Acceptance criteria:** one writable location for plant arrays (or the invariant spec exists and passes); all existing 63 specs still green; STATE-MANAGEMENT.md table updated.
**Tests:** update garden-detail-store.spec; add sync-invariant spec.
**Verification:** `npx nx test web`.

### REM-006 — Per-route document titles

**Severity:** P2 · **Effort:** XS–S
**Why:** every page is titled "ItpHomeGarden" (runtime-verified) — poor for history, tabs, a11y.
**Implementation:** `title` on each route (`Dashboard · HomeGarden`, `Gardens · HomeGarden`, `Welcome · HomeGarden`, 404); for `/gardens/:gardenId` a `TitleStrategy` or a small effect in the detail component setting `Title` to `«name» · HomeGarden` once the garden loads (falls back to `Garden · HomeGarden`).
**Files:** `app.routes.ts`, `garden-detail.ts`, e2e title assertions in REM-004 flows.
**Acceptance:** distinct titles per route incl. garden name on detail.

### REM-007 — `.gitattributes` for cross-platform hygiene

**Severity:** P2 · **Effort:** XS
**Why:** repo already exhibited Windows mode/EOL phantom-diff issues; nothing pins EOL today.
**Implementation:** root `.gitattributes`: `* text=auto eol=lf` + binary entries (`*.png binary`, `*.ico binary`, `*.sqlite binary`); run `git add --renormalize .` and confirm the diff is empty or EOL-only.
**Acceptance:** fresh clone on Windows shows clean `git status` after checkout.

### REM-008 — Empty-garden humidity gauge honesty

**Severity:** P2 · **Effort:** S
**Why:** with zero plants the gauge shows the _target_ labeled "avg humidity" (runtime: "63% avg humidity" on an empty garden) — a designed screen asserting a measurement that doesn't exist.
**Evidence:** `garden-detail.html` — `[value]="store.avgHumidity() ?? garden.targetHumidityLevel"`.
**Implementation:** give `HumidityGauge` a nullable `value` presentation: when `null`, render an empty arc, "—" as the value, caption "no plants yet"; keep the target marker. Detail template passes `store.avgHumidity()` directly.
**Acceptance:** empty garden shows the no-data gauge; adding a plant animates to the real average; `aria-label` says "no measured humidity yet, target X percent".
**Tests:** small gauge component spec (null vs value).

### REM-009 — Optimistic-delete re-entrancy guard

**Severity:** P2 · **Effort:** S
**Why:** retrying a failed delete while a second retry is in flight snapshots an intermediate list; rollback could then resurrect/lose the wrong state.
**Evidence:** `gardens-store.ts` `remove()`, `garden-detail-store.ts` `removePlant()` — snapshot per call, no per-entity pending set.
**Implementation:** add `pendingDeletes: ReadonlySet<number>` to both stores; method entry returns early if the id is pending; clear in `finally`. Optionally reflect as a disabled state on the row/card menu item.
**Acceptance:** double-invoking `remove(garden)` issues one DELETE (spec with never-resolving first call); existing rollback specs unchanged.

### REM-010 — Automated accessibility scan

**Severity:** P2 · **Effort:** S
**Why:** manual walk-throughs are done; the audit bar asks for a repeatable check without a heavy toolchain.
**Implementation:** `npm i -D @axe-core/playwright`; in the mocked e2e project add one spec scanning dashboard, gardens, garden detail (data-loaded state, both themes for dashboard); fail on `serious`/`critical` violations; document known-and-accepted exceptions inline if any arise.
**Acceptance:** axe spec green; ACCESSIBILITY.md "known gaps" updated (axe-in-CI moves from gap to done).

### REM-011 — Minimal logging seam

**Severity:** P2 · **Effort:** XS
**Why:** 4 store catch-paths call `console.warn` directly; §34 asks for a seam, not a stack.
**Implementation:** `core/logging/logger.ts` — `Logger` with `warn/error(context: string, message: string)` wrapping console today; inject in the two stores + global handler; one paragraph in ERROR-HANDLING.md naming Sentry/OTel as the production sink behind this seam.
**Acceptance:** `grep -rn "console\." apps/web/src --include=*.ts | grep -v spec | grep -v logger` → only `main.ts` bootstrap catch.

---

## P3 — Polish

### REM-012 — Stat-tile unit duplication (XS)

Dashboard third tile renders "20 m²" above "m² of growing space". Drop the `suffix` input usage there; label carries the unit. Acceptance: value shows bare number, label unchanged.

### REM-013 — Not-found page heading level (XS)

`EmptyState` renders `h3`; the 404 page therefore has no `h1`. Add `headingLevel` input (default 3) to EmptyState, use 1 on the 404 page. Acceptance: 404 page has exactly one `h1`.

### REM-014 — Extract the duplicated garden-card ghost (S)

The garden-card ghost layout exists twice (gardens grid, dashboard variants differ slightly). Extract `shared/ui/skeleton/skeleton-garden-card.ts` composing existing primitives (shape only — no new shimmer CSS per audit §12); keep other inline ghosts inline (deliberate anti-drift choice, documented in LOADING-EXPERIENCE.md).

### REM-015 — Debounce search persistence (XS)

`setQuery` writes localStorage per keystroke. Keep filtering instant (client-side, no debounce needed); debounce only the `persistView` call (~300 ms trailing). Acceptance: typing 10 chars → 1 storage write (spec with fake timers).

### REM-016 — Optional: visual regression trio (S)

Only if time remains after all above: three Playwright screenshots in the mocked project — dashboard (fixed seed data), garden detail, gardens skeleton state — with `maxDiffPixelRatio` tolerance; document update workflow (`--update-snapshots`) in the e2e README section. Skip without guilt; record the decision here if skipped.

---

## Cross-Cutting Notes

- **Generic loading system:** audit verdict — the shared primitive/timing/aria/reduced-motion/token requirements are **already satisfied** (KEEP list); the epic reduces to REM-014's single extraction. Do not rebuild it.
- **Playwright:** REM-004 is the epic; selector policy, sync policy, and suite split defined there.
- **Accessibility:** REM-010 + REM-013 + REM-008's aria; keyboard smoke lives in REM-004.
- **Documentation:** REM-003 last, sweeping all docs touched by earlier tasks; then add PHASE 20 to IMPLEMENTATION-PLAN.md listing completed REM ids.

## EPIC — Interactive Garden Digital Twin (post-remediation showcase)

Added after the remediation closed (all boxes above checked): one showcase
feature on Garden Detail — the **Garden Map** (ADR-007). All tasks below are
complete; grouped here so the plan stays the single record of scoped work.

- [x] TWIN-01 — Inspect existing architecture; confirm no concept duplication (the map supersedes the 1-D occupancy visualizer — removed, not duplicated)
- [x] TWIN-02 — Renderer evaluation (PixiJS 8.20 + pixi-viewport 6 vs SVG vs Canvas vs Konva/Fabric) → **SVG**, full matrix + exit strategy in [ADR-007](./adr/ADR-007-garden-visualization-engine.md)
- [x] TWIN-03 — Pure view model + deterministic shelf-packing layout (`shared/utils/garden-map-layout.ts`): area-honest plots, seeded aspects, shrink-to-fit preserving ratios, free-band; 10 specs incl. determinism + order-independence
- [x] TWIN-04 — Pure clamped camera (`garden-map/map-camera.ts`): fit/zoom-at-anchor/pan/focus, 1×–6×; 7 specs
- [x] TWIN-05 — `GardenMap` component: SVG scene (soil gradient, 1 m² grid, humidity halo, typed plots, selection ring), pan/wheel/pinch gestures with lazy pointer-capture (clicks stay clicks), toolbar (−/%/+/Fit/Reset), glass HUD from shared domain math, DOM inspector with Edit/Remove, tooltip, empty + full states
- [x] TWIN-06 — Lazy loading: `@defer (on viewport; prefetch on idle)` → own ~7.5 kB gz chunk; `garden-map-skeleton` composite as placeholder and plants-loading ghost
- [x] TWIN-07 — Smart presets: reusable `<app-value-presets>` (typed, aria-pressed, Recommended badge) + product defaults (garden size 10/25/50, humidity 40/60/80, plant area 0.5/1/2) — documented as UI suggestions, validators remain authoritative
- [x] TWIN-08 — Map `--map-*` tokens, light + dark ("moonlit") remaps; component-style budget consciously raised 4→8 kB warn (the scene styling is the feature)
- [x] TWIN-09 — Unit/component specs: layout (determinism, order-independence, area-honesty incl. shrink-to-fit ratios, stability), camera (clamps, anchor zoom, focus), GardenMap component behaviour, ValuePresets, preset-form write-through
- [x] TWIN-10 — Playwright `mocked/garden-map.spec.ts` (populated/empty/skeleton/controls) + integration Flow 1 map assertion + axe scan with map hydrated + plot keyboard test
- [x] TWIN-11 — Docs: ADR-007, DESIGN-SYSTEM §8, ACCESSIBILITY (SVG-not-canvas rationale), PERFORMANCE-AND-CACHING (defer + zoneless discipline), LOADING-EXPERIENCE (ghost composite), README showcase section
- [x] TWIN-12 — Rejected with rationale (ADR-007): minimap, drag-to-place with localStorage layout, second view mode, Angular Pixi wrappers

## SUBMISSION STABILIZATION (final pass, pre-commit)

- [x] STAB-01 — Root-caused the integration "random" flakes: NOT the 10% API — Material's delayed dialog autofocus could steal focus mid-fill, landing text in the wrong field. Fixed with `awaitDialogSettled` (wait for dialog + first-field focus) in every dialog-filling spec; retries kept only as a documented safety net.
- [x] STAB-02 — Camera edge case: pinch → one finger lifted re-anchors the pan to the remaining pointer (no camera jump).
- [x] STAB-03 — Area-honesty proven, not claimed: ratio specs for 1v4, 2v8, decimals, near-full (fitFactor < 1) and exactly-full gardens; stability specs for add/delete at stable fit scale.
- [x] STAB-04 — Root `App` gained OnPush + dropped unused scaffold signal (last non-OnPush component).
- [x] STAB-05 — Stale pre-preset plant-dialog screenshot retaken; docs metrics made count-free; a pre-submission checklist added (since folded into docs/PRODUCTION-READINESS.md).
- [x] STAB-06 — Real UI race found by the zero-retry runs and fixed: a slow list revalidation that hits the server after an insert can deliver the created entity before `create()` patches state — the blind append then rendered the card twice (one DB row, two cards). Both `GardensStore.create` and `GardenDetailStore.createPlant` appends are now idempotent by id, with a store regression spec.
- [x] STAB-07 — Full Playwright suite (integration + mocked) passes with `--retries=0`; mocked additionally 3× consecutive clean. Retries stay configured only as a CI safety net.

## EPIC — Visual Experience & Skeleton-First Async (post-stabilization)

- [x] VIS-01 — Original botanical SVG artwork (8 top-down categories, ASSET-CREDITS.md) + pure `PlantVisualResolver` (keyword heuristics, plantType fallback, seeded determinism — specs)
- [x] VIS-02 — Layered garden scene: lawn gradient + procedural speckle, tilled free-soil furrows, dotted fence, raised-bed footprints with shadows, humidity halo — geometry/imagery separation (ADR-007 amendment)
- [x] VIS-03 — Deterministic vegetation clusters (density ∝ honest m², ≤9, contained — specs); name-plate labels that never exceed their bed; icon toolbar; single glass HUD; visual inspector with thumbnail + capacity-contribution bar; table thumbnails + row↔map selection (model two-way, Detail-level UI state)
- [x] VIS-04 — Neutral-gray skeleton tokens (`--skeleton-base/highlight`, both themes) feeding the one shimmer engine; `.mutation-ghost` + `.btn-ghost` utilities on the same tokens/keyframe
- [x] VIS-05 — Mutation ghosts for every verb: creation ghost card/row/bed (`creating`/`pendingCreateArea`), localized update ghosts (`pendingUpdates`), **ghost-confirmed deletes** replacing optimistic removal in both stores (specs rewritten to the new contract); dialog buttons swap "Saving…" text for ghost bars; aria-busy + named hidden status everywhere
- [x] VIS-06 — Spinner ban: zero spinners confirmed, guarded by `npm run check:no-spinners` + runtime asserts in `mocked/mutation-ghosts.spec.ts` (delayed POST/PUT/DELETE for gardens and plants, ghost → resolve each)
- [x] VIS-07 — Two real gaps found by the new tests and fixed: the creation ghost was unreachable from the empty-state branch, and the detail header never refreshed after a garden edit (update now writes through the garden cache key; the dialog close reloads from it — no extra request)

## EPIC — Interactive Garden Planner (post-visual pass)

- [x] PLAN-01 — Plant discovery: 27-preset local catalog (`plant-catalog.ts`) + explainable pure recommendation scoring (humidity 60 / fit 30 / variety 10, honest `reasons[]` — specs) ranked per garden; picker prefills, custom plants stay first-class
- [x] PLAN-02 — `PlantCatalogProvider` seam (`PlantCatalogFacade`); external API deliberately NOT wired — no API-key dependency (INTERACTIVE-GARDEN-UX.md §1)
- [x] PLAN-03 — Add Plant dialog: one-screen two-column layout, no internal scroll at 1440×900 (Playwright-asserted), Garden-fit breakdown + live artwork preview from actual form values
- [x] PLAN-04 — Drag & drop bed positioning: 5 px drag-vs-pan threshold, lazy pointer capture, clamped drops, visual-only (capacity untouched — e2e asserts HUD unchanged), amber AABB overlap warning
- [x] PLAN-05 — Versioned localStorage layout persistence (`homeGarden.visualLayout.v1.<id>`, corrupt-safe, self-pruning — specs); bounded 20-step undo/redo; Reset layout with confirm
- [x] PLAN-06 — Fullscreen planner (Escape cascade, body scroll lock), five-layer toggles menu, humidity-preference halos ("preference vs target, not a measurement"), zoom LOD labels, map search + inspector Focus
- [x] PLAN-07 — 3D/Three.js evaluated and deferred with written rationale; drag-to-place ADR rejection formally superseded (ADR-007 planner amendment)
- [x] PLAN-08 — New docs: INTERACTIVE-GARDEN-UX.md; specs: `garden-planner.spec.ts` (mocked), recommendation/layout-repository/applyPositions unit suites

## EPIC — Dashboard Control Center (post-planner)

- [x] DASH-01 — Shell content width 72rem → 80rem (all screens earn the density; planner included)
- [x] DASH-02 — Hero: derived portfolio line + healthy/attention chips + "view most urgent" secondary CTA (only when derivable), garden-grid motif, 3-step 120ms-stagger entrance (reduced-motion: none)
- [x] DASH-03 — StatCard extended (context line, quiet progress strip with aria-progressbar); 4th KPI: Utilization % + free m² (derived, computed(), never stored)
- [x] DASH-04 — Attention Center: rich clickable cards (semantic left accent amber/red/blue, capacity bar or humidity target-vs-average mini-scale), UI-only severity sort, positive "Everything looks healthy" empty state (§10 — the section never vanishes)
- [x] DASH-05 — Garden Health grid = compact portfolio: `GardenMiniPreview` (static SVG strip, reuses PlantVisualResolver artwork, √share sizing, no map-logic duplication), status chip text+color, capacity + humidity rows, card → detail
- [x] DASH-06 — Content-shaped dashboard skeleton from generic primitives (hero stats ghost inline, 4 KPI ghosts, attention/health card ghosts); SWR refresh keeps data visible; zero spinners (script + e2e enforced)
- [x] DASH-07 — e2e: dashboard.spec.ts (skeleton-not-spinner on delayed GET, attention/health navigation, healthy-state, mobile overflow); axe scans re-verified on the new layout in both themes
- [x] DASH-08 — Docs: DESIGN-SYSTEM §6 rewritten for the control center; README dashboard mention; unit spec updated to the always-present attention section contract

## EPIC — Garden Detail Refinement (area honesty + chrome)

- [x] REFINE-01 — **Critical**: squarified-treemap layout engine (pure, ~60 lines, no library) replaces shelf packing + shrink-to-fit; drawn occupancy now equals real occupancy (98% looks 98%, 50% half, 0% empty — unit-tested + e2e); ADR-007 area-honesty amendment
- [x] REFINE-02 — Free capacity is drawn, not implied: tilled strip sized by real free area with "Available · N m²" label (horizontal/vertical) or "+" sliver marker; empty-garden planting-zone hints preserved
- [x] REFINE-03 — Inspector: grouped stat tiles (Required surface / Ideal humidity / Planted / Type), larger visual, wider panel (map:inspector ≈ 72:28); idle state keeps the garden-overview stats
- [x] REFINE-04 — Top card: location line labeled with pin icon + SR text (no more unexplained raw values); toolbar gains native tooltips on every control
- [x] REFINE-05 — Plants table: species stacked under plant name, larger thumbnails, 5-column layout (Plant/Planted/Area/Humidity/Actions)
- [x] REFINE-06 — e2e recalibrated to the honest layout (drag viewport 900h; fullscreen asserts height growth; new 98%-garden HUD+strip+marker test)

## EPIC — Backend-Contract & Frontend-Coverage Audit (backend as source of truth)

Backend re-read from its own source (routes, zod schemas, services, repositories, migrations, Bruno collection, `/docs`) and probed with live requests. Full inventory: [backend/BACKEND-API-AUDIT.md](backend/BACKEND-API-AUDIT.md) · per-endpoint UX obligations: [backend/API-UX-STATE-MATRIX.md](backend/API-UX-STATE-MATRIX.md).

**Contract defects found and fixed (all three were live user-visible bugs):**

- [x] API-01 — **`plantationDate` lost a calendar day east of UTC.** The Material datepicker emits local midnight; `.toISOString()` rolled it back. Reproduced in the reviewer's own timezone: 10 Sep picked in `Europe/Brussels` was stored as `2026-09-09T22:00:00.000Z`. Fixed with a pure date-only serializer pair (`shared/utils/plantation-date.ts`) plus UTC-pinned display (`| date: … : 'UTC'`) so read-back matches what was picked. 7 timezone-independent unit specs.
- [x] API-02 — **A slow response could overwrite a newer garden.** `GardenDetailStore.load()` had no request-generation guard: navigating `/gardens/1 → /gardens/2` while garden 1 was still in flight (very likely at 200–2000 ms) let garden 1's payload land in the store _as garden 2_. Fixed with a monotonic token; stale responses (success **and** failure) are discarded. 3 store specs — the authoritative proof lives in unit tests because a full `page.goto` cancels the in-flight XHR and the race cannot reproduce in e2e.
- [x] API-03 — **Transient 500s were rendered as "Garden not found."** `gardenMissing` was `status === 'error'`, so the API's own 10% random failure told users their garden had been deleted. Now `404 → not-found` (back to gardens), `5xx / network → "Couldn't load this garden" + Try again`. Deterministic e2e for both branches (the 500 mock must fail 4 times — the retry interceptor absorbs 3).

**Capabilities the API exposed that the UI had never used — now shipped:**

- [x] API-04 — `PUT /users/{userId}` → Edit profile dialog (adopts the server's response; 409 → "Another profile already uses that email address")
- [x] API-05 — `DELETE /users/{userId}` → Delete profile with confirm + sign-out; copy is honest that gardens are shared and stay
- [x] API-06 — `GET /users/email/{emailAddress}` → a 409 on sign-up becomes "Continue as <email>" instead of a dead end
- [x] API-07 — `GET /users/{userId}` on boot → a 404 signs the stale session out; a 5xx/network never does (that would end a session 10% of the time)
- [x] API-08 — `age` is writable on both `POST` and `PUT /users` → optional, positive-integer-validated field in both profile forms
- [x] API-09 — Both profile paths are **dynamically imported** from the eager shell (`ProfileDialog`, `MatDialog`, `ConfirmService`): a static import cost +180 kB on the initial bundle and was caught by the budget check

**Coverage result:** 15/15 meaningful user-facing endpoints used · 17/17 writable fields reachable from a form · 1 endpoint (`GET /plants/{plantId}`) intentionally not surfaced, documented in `plants-api.ts` · every endpoint's success/loading/refresh/pending/empty/validation/business-failure/404/5xx/network/retry/duplicate/race behaviour recorded in the state matrix.

**Backend limitations documented, not silently worked around** (each with frontend mitigation + production fix in the audit): no capacity check on `PUT /gardens/{id}` (shrinking below occupancy returns 200 — client warns, server should refuse) · `updatedAt` never updated on write · plants of a missing garden answer **400**, not 404 · no pagination, user scoping or `?include=` on `GET /gardens` (the dashboard's `1 + N` is unavoidable client-side) · no `ETag`/`Cache-Control` · no idempotency keys.

**Measured, not assumed** — 60 live `GET /gardens`: p50 1083 ms · p95 1877 ms · mean 1101 ms (uniform 200–2000 ms confirmed) · 10/60 injected 500s. Recorded in [architecture/PERFORMANCE-AND-CACHING.md](architecture/PERFORMANCE-AND-CACHING.md).

**Gates after this epic:** lint clean (web + web-e2e) · 156 unit specs / 22 files green · 45 mocked e2e green ×3 consecutive at `--retries=0` · 6 integration e2e green against the real backend · production build under budget (129.70 kB initial transfer) · `npm run check:no-spinners` green.

## Final Verification (after all tasks)

```sh
npx nx run-many -t lint test build -p web --skip-nx-cache
npx nx e2e web-e2e        # run 3× — mocked project must be deterministic
```

Then: manual both-theme smoke (desktop + 375 px), README read-through with a 3-minute reviewer's eyes, and the commit/push/invite submission sequence.
