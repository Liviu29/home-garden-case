# Implementation Plan — single source of truth

Status legend: ✅ done · 🔶 partially done · ⬜ not started. Updated continuously; if this file disagrees with the code, fix one in the same change.

> Doc-structure judgment call: `FRONTEND-ARCHITECTURE.md` and `UX-PRINCIPLES.md` were deliberately **not** created — their content would duplicate [ARCHITECTURE.md](architecture/ARCHITECTURE.md) and [DESIGN-SYSTEM.md](design/DESIGN-SYSTEM.md) §1. Merged per the no-duplication rule.

## PHASE 0 — Repository & requirements audit ✅

**Objective:** understand everything before writing code.

- [x] Case PDF requirements extracted (CRUD, target humidity, overcrowding, bonuses)
- [x] Backend source audited: routes, zod contracts, services, `slow-api` (200–2000 ms), `random-errors` (10% → 500 in `onRequest`), sqlite/kysely migrations
- [x] Gaps identified → [architecture/API-INTEGRATION.md](architecture/API-INTEGRATION.md) §4 (no garden humidity field, no pagination/auth, update-schema quirk, global gardens)
- [x] CSC guidelines reviewed; architectural principles extracted, CSC business rules excluded
      **Acceptance:** every layer of the frontend can cite the backend behaviour it answers. ✔

## PHASE 1 — Architecture & ADRs ✅

- [x] [ARCHITECTURE.md](architecture/ARCHITECTURE.md) (constraint-driven design), [CODING-GUIDELINES.md](CODING-GUIDELINES.md)
- [x] ADR-001 Angular (approved deviation) · ADR-002 SignalStore · ADR-003 backend extension · ADR-004 resilience · ADR-005 auth · ADR-006 monorepo/tooling
- [x] Restructured into `docs/architecture/` + `docs/design/` with STATE-MANAGEMENT, ERROR-HANDLING, PERFORMANCE-AND-CACHING, TESTING-STRATEGY, ACCESSIBILITY, AUTHENTICATION-DESIGN, LOADING-EXPERIENCE

## PHASE 2 — Workspace integration ✅

- [x] Angular CLI 22 app at `apps/web` (standalone, **zoneless**, SCSS, Vitest); npm-workspaces integration → Nx infers `dev/build/test` targets
- [x] strict TS + `strictTemplates`; dev proxy `/api → :3000`; bundle budgets
- [x] Decision: plain Angular CLI inside the workspace (the `@nx/angular` plugin rejects this repo's TS project-references setup) — documented in ADR-006
- [x] Backend extension: `targetHumidityLevel` via `migration002` + zod (ADR-003)

## PHASE 3 — Design system foundation ✅

- [x] Token system (`styles/_tokens.scss`): warm-gray ramp, gradient signatures, semantic states, spacing/radius/shadow/motion/typography — all CSS custom properties
- [x] Material M3 theme mapped onto tokens; self-hosted Inter/Sora variable fonts
- [x] Motion presets + `prefers-reduced-motion` collapse ([design/DESIGN-SYSTEM.md](design/DESIGN-SYSTEM.md))

## PHASE 4 — API integration layer ✅

- [x] DTOs mirroring zod contracts, pure mappers, typed api services (gardens/plants/users)
- [x] Interceptors: base-url + retry (backoff + full jitter, 5xx/network only)
- [x] Trade-off documented: hand-written types over openapi-generator for a 15-endpoint contract; mapper seam ready to flip (ADR-006)

## PHASE 5 — Shell & navigation ✅

- [x] Shell (blurred topbar, gradient-underline nav, profile menu), lazy routes, view transitions, component input binding, friendly 404
- [x] Profile session flow: onboarding on `/users`, SessionStore + `canMatch` guard

## PHASE 6 — Garden overview ✅

- [x] Dashboard: greeting hero, count-up stats (gardens/plants/total m²), needs-attention list, humidity-vs-target grid under `@defer (on viewport)`
- [x] Gardens grid: skeleton-first, staggered cards, occupancy bars, humidity chips, empty/error states with retry

## PHASE 7 — Garden CRUD ✅

- [x] Create/edit dialog (typed reactive form, contract-mirroring validation incl. lat/lng together-or-neither), delete with confirm + optimistic rollback, success/error toasts

## PHASE 8 — Garden detail ✅

- [x] Header metrics (used/free/plants), animated capacity bar, humidity gauge with target marker + drift chip
- [x] Occupancy visualizer: proportional per-plant blocks + dashed available block

## PHASE 9 — Plant management ✅

- [x] Plants table (staggered, per-plant humidity delta), create/edit dialog with all contract fields, delete confirm + optimistic rollback

## PHASE 10 — Capacity / domain validation ✅

- [x] Pure domain module `shared/utils/garden-insights.ts`: used/free area, utilization, `wouldOvercrowd` (exact-fit boundary, edit excludes self), `remainingCapacity`, humidity aggregates, attention thresholds
- [x] Live remaining-capacity meter in the plant form; server verdict rendered inline verbatim
- [x] Semantic capacity status (UI-only thresholds, documented): Healthy < 70% · Approaching 70–89% · Almost full 90–99% · Full ≥ 100%
- [x] Rounding strategy: raw floats in domain math (mirrors server), display rounded to 0.1 m² at the formatting edge only

## PHASE 11 — Slow-API UX / skeletons / caching ✅

- [x] SWR QueryCache (fresh/stale/miss, de-dup, prefix invalidation, write-through)
- [x] Skeleton system: primitives + composites, 150 ms appear delay / 300 ms min display, shared shimmer, zero layout shift ([design/LOADING-EXPERIENCE.md](design/LOADING-EXPERIENCE.md))
- [x] Optimistic deletes with snapshot rollback + retry toast

## PHASE 12 — Error architecture ✅

- [x] ApiError taxonomy (technical/functional/not-found), message normalization for all backend shapes, global ErrorHandler, persistent error toasts with retry ([architecture/ERROR-HANDLING.md](architecture/ERROR-HANDLING.md))

## PHASE 13 — Responsive design ✅

- [x] Fluid grids (`auto-fill/minmax`), responsive shell (name collapses on mobile), stacking detail header, form rows collapse at 540 px, dialogs sized in `min()` units
- [x] Audited at 360 px and 834 px with automated horizontal-overflow measurement: fixed a too-wide topbar (compact variant ≤ 480 px), a non-wrapping title row, and a Chrome table-scroller leak (`contain: paint` on the table wrap). All screens: 0 px overflow

## PHASE 14 — Accessibility ✅

- [x] Semantics, labels, focus rings, `role="status"` loading, `role="alert"` validation, not-color-alone states, reduced motion, rem type ([architecture/ACCESSIBILITY.md](architecture/ACCESSIBILITY.md))
- [x] Skip-to-content link (visible on keyboard focus, targets `#main-content`)
- [x] Automated axe pass (@axe-core/playwright, mocked e2e project, both themes; serious/critical = fail) — surfaced and fixed 4 sub-AA accent tokens

## PHASE 15 — Testing ✅

- [x] Unit/behaviour specs: domain math, QueryCache, retry policy, error mapping, GardensStore behaviour
- [x] Component specs: garden list states, plant form capacity behaviour
- [x] Playwright e2e (`apps/web-e2e`), two projects: integration flows 1–6 + malformed-deep-link regression against the live slow/flaky api; mocked project for deterministic error/slow/empty/pending states, axe scans (both themes), keyboard + mobile smoke
- [x] Regression specs for two real races found during e2e: stale-list-overwrites-create (QueryCache write-versions) and the warm-cache effect loop (untracked + identical-write guard)
- [x] GardenDetailStore spec (parallel load, derived insights, verdicts, optimistic rollback) · dashboard component spec (empty/stats/attention states)

## PHASE 16 — Performance optimization ✅

- [x] Zoneless, OnPush everywhere, lazy chunks, `@defer`, stable `track`, transform-only animation, budgets enforced (~126 kB transfer) ([architecture/PERFORMANCE-AND-CACHING.md](architecture/PERFORMANCE-AND-CACHING.md))

## PHASE 17 — Documentation ✅

- [x] README (run, architecture, resilience story, both bonuses, trade-offs, cuts); docs tree restructured; screenshots

## PHASE 19 — Modern UI expansion ✅

**Objective:** raise visual sophistication and product depth without feature soup — every item token-driven, testable, and defensible.

- [x] **Dark mode** — full token remap under `[data-theme='dark']` (surfaces, text, soft hues, skeleton/sheen gradients, glass topbar), Material flipped via `color-scheme`, sun/moon toggle in the shell, choice persisted per user, `prefers-color-scheme` as the first-visit default. Proves the design-token architecture pays rent.
- [x] **Gardens toolbar** — debounced search (name + location) and sort (name / size / utilization), state in GardensStore, **last-used view restored** (guidelines §: restore, don't reset), distinct "no matches" empty state vs "no gardens".
- [x] **Hover/focus prefetch** — pointer intent on a garden card warms the detail + plants cache through QueryCache, making navigation feel instant on a 2s API (the client-side item promised in PERFORMANCE-AND-CACHING.md).
- [x] **Hero polish** — subtle decorative botanical SVG in the dashboard hero, opacity-tuned for both themes, `aria-hidden`.
- [x] Specs: ThemeStore behaviour, filter/sort pure functions — 63 specs total.
- [x] Re-run all gates + both-theme screenshot audit (docs/screenshots/theme-*).

**Deliberately not in scope** (documented, future): axe-core in CI, i18n runtime, virtualized lists (dataset scale doesn't justify), drag-to-resize beds.

## PHASE 18 — Final principal-level review ✅

- [x] Hostile-reviewer question list answered across docs (double-click save, races, navigation-away, refresh, cache invalidation — [architecture/STATE-MANAGEMENT.md](architecture/STATE-MANAGEMENT.md) §"What happens when")
- [x] Forensic audit conducted and written up: [PRINCIPAL-REVIEW.md](./PRINCIPAL-REVIEW.md) (score, evidence, KEEP list)
- [ ] Final end-to-end pass on the user's machine before submission (git push + reviewer invites are the submission trigger)

## PHASE 20 — Remediation ✅

Every accepted finding from [REMEDIATION-LOG.md](./REMEDIATION-LOG.md) implemented and verified:

- [x] REM-001 malformed garden-id deep link → designed not-found state (store `markMissing`, no request; unit + e2e regression)
- [x] REM-002 garden-shrink-below-used warning (pure `wouldShrinkBelowUsed`, live `role=alert` in the edit form; server-side check recorded as API proposal #7)
- [x] REM-003 documentation truth sweep (this file included; spec counts removed everywhere)
- [x] REM-004 Playwright epic: integration flows 3–6 + mocked project (Flow 7 empty, Flow 8 error+retry-recovery, Flow 9 slow-read skeleton stability, Flow 10 duplicate-submit prevention, skeleton-after-error) with html reporter + failure screenshots
- [x] REM-005 single plants ownership — `PlantsIndexStore` is the one writable owner; detail store derives via computed (reference-equality spec)
- [x] REM-006 per-route titles incl. garden-name refinement
- [x] REM-007 `.gitattributes` (LF + binaries)
- [x] REM-008 humidity gauge no-data honesty ("—", "no plants yet", truthful aria)
- [x] REM-009 per-entity delete re-entrancy guards in both stores (specs: exactly one DELETE)
- [x] REM-010 @axe-core/playwright scans, both themes — 4 accent tokens darkened/lightened to AA
- [x] REM-011 `core/logging/Logger` seam (console confined to it + bootstrap catch)
- [x] REM-012 stat-tile unit de-duplication · REM-013 `headingLevel` on EmptyState (404 owns an h1) · REM-014 `skeleton-garden-card` composite · REM-015 debounced view persistence (spec: 10 keystrokes → 1 write)
- [x] REM-016 visual regression — **deliberately skipped**, reason recorded in the remediation plan

## PHASE 21 — Interactive Garden Digital Twin ✅

The post-remediation showcase feature (epic TWIN-01…12 in [REMEDIATION-LOG.md](./REMEDIATION-LOG.md)):

- [x] Renderer evaluated (PixiJS v8/pixi-viewport vs SVG/Canvas/Konva) → SVG chosen with exit strategy ([ADR-007](adr/ADR-007-garden-visualization-engine.md))
- [x] Pure deterministic layout + clamped camera (`garden-map-layout.ts`, `map-camera.ts`) — 17 specs
- [x] `GardenMap`: SVG twin (area-honest plots, 1 m² grid, humidity halo), pan/wheel/pinch + keyboard, toolbar, glass HUD, DOM inspector, empty/full states — supersedes the 1-D occupancy visualizer
- [x] `@defer (on viewport; prefetch on idle)` → own ~7.5 kB gz chunk behind the `garden-map-skeleton` ghost composite
- [x] Smart presets (`<app-value-presets>` + product defaults) on garden + plant forms; validators stay authoritative
- [x] Tests: unit suite extended (layout, camera, GardenMap component, ValuePresets, preset-form behaviour); e2e extended (map flows, axe with map hydrated, plot keyboard + mobile map operation)
- [x] Docs: ADR-007 · DESIGN-SYSTEM §8 · ACCESSIBILITY · PERFORMANCE-AND-CACHING · LOADING-EXPERIENCE · README showcase
