# Codebase Cleanup

Final consolidation pass before submission. Audit first, then targeted changes,
behavior identical throughout (all suites re-run after each batch). The most
important output of this pass is the last section: the abstractions we
deliberately did **not** introduce.

## Baseline

- Production build: initial **128.4 kB** transfer · garden-detail 34.7 kB ·
  garden-map 12.0 kB · dashboard 7.6 kB (all lazy, gz)
- Tests: 146 unit (21 files) · 32 mocked e2e · 6 integration e2e — all green,
  `--retries=0`
- Lint/typecheck: clean (0 errors)

## Dead Code

- [x] Swept every shared component and exported domain function for references
      (`capacity-status`, `skeleton-garden-card`, `value-presets`, `capacity-bar`,
      `humidity-gauge`, `empty-state`, `stat-card`, `plant-thumb`,
      `garden-mini-preview`, `plant-artwork-defs`, `garden-map-skeleton`; all ten
      `garden-insights` functions; catalog/recommendation/layout/camera/resolver
      exports) — **everything is referenced**. The one dead find:
- [x] Removed `PlotView.showArea` + `withArea` + `.plot-area-tspan` styles —
      vestiges of an earlier label design (area moved to the zoom-LOD text).
- [x] `occupancy-visualizer.ts` (pre-map 1-D strip) was already deleted when
      the Garden Map superseded it.

## Temporary Artifacts

- [x] Repo-wide search for `_to_delete|bak|old|tmp|copy|temp|scratch`: nothing
      in the frontend. (`bruno/**/folder.bru` files belong to the provided
      backend's API client collection — untouched.)

## Dependencies

- [x] **Root** `package.json` is the provided backend's manifest; our only
      additions are `@axe-core/playwright` and `@playwright/test` (both used by
      the e2e project). `axios`/`eslint-plugin-prettier` oddities predate us and
      stay untouched (backend is not ours to clean).
- [x] **apps/web**: every dependency is used — Angular core/CDK/Material,
      `@ngrx/signals`, `rxjs` (Material APIs + `toSignal` interop), two
      `@fontsource-variable` fonts, `tslib`. `@angular/animations` is required by
      `provideAnimationsAsync()` (Material dialog/select). devDeps: build chain +
      vitest/jsdom. **Nothing to remove.**

## TypeScript Duplication / Domain Single Source

- [x] Verified single sources of truth, consumed everywhere (no template-level
      re-derivations found):
  - capacity math: `shared/utils/garden-insights.ts` (used/free/occupancy/
    overcrowd/remaining/status/attention) — HUD, forms, dashboard, map, chips
    all call these
  - humidity comparison: `humidityDelta` / `averageHumidity` (14 call sites,
    zero re-implementations)
  - recommendations: `plant-recommendation.ts` (pure scoring)
  - map layout: `garden-map-layout.ts` (squarified treemap + planner ops)
  - camera math: `map-camera.ts`
  - plant visuals: **one** resolver (`plant-visual-resolver.ts`) feeding map,
    thumbs, dialog preview and dashboard minis

## Signals / Stores

- [x] All 7 `effect()`s audited; each is imperative synchronization (skeleton
      timing, rAF count-up, plant-index fan-out loads ×3, layout-repository load,
      body scroll lock) — none copies a signal into another signal.
- [x] `.subscribe()` appears only for `MatDialogRef.afterClosed()` (completes
      itself; no leak surface).
- [x] A shared `withRequestStatus()` SignalStore feature was **evaluated and
      rejected** — see the final section.

## Components

- [x] **Created `StatusBadge`** (`shared/ui/status-badge`): one status-chip
      implementation (`tone: success|neutral|warning|critical`, text + color,
      never color alone). `CapacityStatusChip` became a thin domain wrapper
      (domain status → tone via `CAPACITY_STATUS_TONE`), and the dashboard's
      hand-rolled `.health-status` chip CSS was deleted in favor of the badge.
      Three chip stylings → one.
- [x] Input APIs reviewed: no boolean explosions (largest shared API is
      StatCard: value/label/suffix/context/progress/progressWarn — all used).

## SCSS / Design Tokens

- [x] One token source: `styles/_tokens.scss` (light + dark as a pure remap).
- [x] Magic colors swept (`#|rgb(|hsl(` outside tokens/artwork). Fixed: the
      free-soil text color was a repeated `color-mix(...#5c5142)` in two places →
      new `--map-free-text` token (both themes). Remaining hex, each documented
      in place: `#fbbf24` (hero-chip amber on the dark gradient), `#000` inside a
      `mask-image` (alpha mask, not a color), humidity-gauge gradient stops and
      capacity-bar gradient deep-ends (data-viz gradient endpoints), SVG artwork
      palettes (out of token scope by design, see ASSET-CREDITS.md).
- [x] `::ng-deep` eliminated (was 3 occurrences, all one feature): the
      fullscreen planner stretch now lives in GardenMap's own styles behind a
      `:host(.fullscreen)` class bound to its `isFullscreen` input; the parent
      only sizes the child element.
- [x] `!important` audit: remains only in the reduced-motion global override
      (the canonical pattern), its capacity-bar counterpart, and one Material
      dialog-radius override — all intentional.

## Skeleton System

- [x] Verified **one** engine: `@keyframes shimmer-sweep` defined once in
      `_motion.scss`; consumed by the `Skeleton` primitive and the two utilities
      (`.mutation-ghost`, `.btn-ghost`) via shared tokens
      (`--skeleton-base/highlight`). Feature skeletons (dashboard, detail, map,
      garden-card) compose the primitive and define layout only.
      `skeleton-pulse` is the reduced-motion fallback, also defined once.

## Motion System

- [x] 10 `@keyframes` total, each unique in purpose (shimmer, reduced-motion
      pulse, fade-in, fade-up-in, dialog-pop, bar-grow, ghost-breathe, hero-enter,
      ring-pulse, leaf-sway). Durations/easing via `--dur-*`/`--ease-*` tokens.
      No duplicates to merge.

## Dialogs / Empty / Error States

- [x] One `ConfirmService` for destructive confirmations; one `EmptyState`
      component used for empty **and** load-error+retry states (8 call sites);
      dialog chrome comes from Material + shared token overrides.

## Assets

- [x] Zero binary UI assets (all artwork is inline SVG symbols — see
      ASSET-CREDITS.md). Docs screenshots pruned: removed 4 captures showing the
      pre-treemap layout (`09-garden-map(-dark)`, `11-planner-detail`,
      `14-planner-inspector`) — superseded by 07/13/16 and misleading about the
      current engine. Added `docs/screenshots/README.md` gallery index so every
      remaining capture is referenced and labeled.

## Tests

- [x] e2e DTO fixtures already centralized (`support/helpers.ts`:
      `gardenDto`/`plantDto`/`signIn`/`awaitDialogSettled`/`createGarden`/
      `addPlant`) and used across all 7 spec files — no divergent mock schemas.
- [x] Unit fixtures are small per-file builders (`garden()`, `plant()`);
      shared across the layout/insight/store specs where they matter. A global
      fixture framework was rejected (see below).

## Hygiene sweeps (final)

- [x] `TODO|FIXME|HACK|XXX`: **0** in src
- [x] `console.*`: only inside the `Logger` abstraction + the bootstrap
      `catch` — intentional observability
- [x] `any` / `@ts-ignore` / `eslint-disable`: **0** in app src (a handful of
      documented non-null assertions remain in _specs_, where the assertion is
      the test)
- [x] spinners / `@keyframes spin` / `rotate(360`: **0** (also CI-enforced by
      `check:no-spinners`)
- [x] `track $index`: only for static ghost/veg lists without identity —
      entities all track stable ids

## Completed Cleanup

| Change                                                               | Kind          |
| -------------------------------------------------------------------- | ------------- |
| `StatusBadge` + `CapacityStatusChip` wrapper + dashboard chip dedupe | consolidation |
| `--map-free-text` token replacing repeated color-mix hex             | tokens        |
| `::ng-deep` → `:host(.fullscreen)` in GardenMap                      | architecture  |
| `showArea`/`withArea`/`.plot-area-tspan` removal                     | dead code     |
| 4 superseded screenshots removed + gallery README                    | assets/docs   |

## Follow-up sweep — backend-contract audit

- **Removed** `PlantsApi.getById()` — dead since the plants list response carries the same rows; the endpoint is now documented in place as intentionally not surfaced, so the gap reads as a decision rather than an oversight.
- **Added** `shared/utils/plantation-date.ts` (two pure functions, 7 specs) instead of scattering `toISOString()` calls — a single serialization seam for the one field where the client and server disagreed about what "a day" means.
- **Dynamic imports** for `ProfileDialog` / `MatDialog` / `ConfirmService` in the eager shell: statically importing them cost +180 kB on the initial bundle. Caught by the budget, not by review.
- No new abstractions: the profile dialog reuses the existing form/dialog patterns, and the request-generation guard is six lines inside the store that needs it rather than a shared utility (one call site — see the rule below).

## Abstractions deliberately NOT created

- **`card-surface` mixin / global card class** (≈12 true card surfaces repeat
  `surface-1 + border + radius + shadow-1`): every one of those values is
  already a token, so "change the card look in one place" is already true at
  the token layer. The repetition is 4 lines of declarative token wiring per
  card, spread across SCSS _and_ inline TS styles — a mixin would need an
  `includePaths` build change, touch ~12 files, and still not cover inline
  styles. Fails the "is the API simpler than the duplication?" test.
- **`withRequestStatus()` SignalStore feature**: the three stores have
  meaningfully different lifecycles (SWR list cache with idempotent appends;
  detail store with per-entity mutation ghosts + `lastCreatedPlantId`;
  fan-out plants index with per-garden keys). A shared feature would either
  flatten those semantics or grow config until state stops being
  domain-readable.
- **Generic `AppCard` / mega-dialog framework**: semantic components
  (StatCard, attention card, health card) stay local and legible.
- **Route-constants helper**: `/gardens` appears a handful of times in
  templates; a typed route layer would be ceremony.
- **Breakpoint mixin system**: 13 media queries across 8 files use 6 values —
  but they are container-specific collapse points (map-shell 900, overview
  960, KPI 1024, hero 720…), not one inconsistent grid. Tokenizing them
  would rename, not simplify.
- **Area/percent formatting pipes**: `DecimalPipe` with explicit digits-info
  covers every case today; no float artifacts render anywhere.
- **Test mega-fixture framework**: per-suite builders are 6 lines each and
  self-documenting.

## Final metrics

- Files removed: 4 screenshots + dead code block; created: 2
  (`status-badge.ts`, screenshots README) + this document
- Dependencies removed: 0 (none unused — verified, not assumed)
- Shimmer implementations: 1 → 1 (verified single)
- Duplicate status-chip stylings: 3 → 1
- `::ng-deep`: 3 → 0 · magic free-soil color: 2 → 0 (token)
- Bundle: initial 128.4 kB → unchanged; map chunk 12.00 → 11.98 kB gz
