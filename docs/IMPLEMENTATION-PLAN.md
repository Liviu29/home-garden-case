# Implementation Plan — 0 → 100%

The build order for the case, sized for 2–3 days. Each phase ends in a green build and a set of logical commits; the app is demoable from Phase 3 onward. Track progress by checking boxes in this file.

## Phase 0 — Foundations (≈ 5%)
- [ ] Docs suite committed (`docs/*`, ADRs) — *decisions before code*.
- [ ] `@nx/angular` added; `apps/web` generated: standalone, **zoneless**, SCSS, esbuild, strict TS, Vitest.
- [ ] Proxy config → `http://localhost:3000`; `npx nx dev web` + `npx nx dev api` both green.
- [ ] Prettier/ESLint aligned with workspace; bundle budgets set in project config.

**Commits:** `docs: add architecture, guidelines, design system and ADRs` · `feat(web): scaffold zoneless Angular 22 app in nx workspace`

## Phase 1 — Backend extension (≈ 10%)
- [ ] `targetHumidityLevel` (real, not null, default 50) in migration001, `database/types.ts`, garden zod schemas (0–100).
- [ ] Verified via `/docs` swagger + bruno call.

**Commit:** `feat(api): add targetHumidityLevel to gardens (0-100, required by case)`

## Phase 2 — Design system & core (≈ 30%)
- [ ] Tokens, gradients, motion presets, Material M3 theme + overrides, Inter/Sora self-hosted.
- [ ] `core/config` (retry policy, TTLs), `core/http` interceptors (base-url, retry+backoff+jitter).
- [ ] `core/resilience` QueryCache: SWR, TTL, de-dup, invalidation — **with specs**.
- [ ] `core/api`: DTO types mirroring zod contracts, mappers, `GardensApi`/`PlantsApi`/`UsersApi`.
- [ ] `core/errors`: ApiError taxonomy, global ErrorHandler, ToastStore + toast host.
- [ ] `shared/ui`: skeleton primitives + shimmer, empty-state, page-header, confirm-dialog, stat-card, capacity-bar, humidity-gauge.
- [ ] Shell layout: topbar, nav, route transitions.

**Commits:** `feat(web): design tokens, material theme and motion presets` · `feat(web): resilient http core — swr cache, retry with backoff, error taxonomy` · `feat(web): shared ui kit — skeletons, empty states, gauges, capacity bars` · `test(web): query cache and retry policy specs`

## Phase 3 — Gardens feature (≈ 55%)
- [ ] `GardensStore` (SignalStore): entities, statuses, optimistic create/update/delete + rollback.
- [ ] Garden list: card grid, skeleton-first render, stagger animation, empty state, error state.
- [ ] Create/edit dialog: typed form, lat/lng together validation, humidity slider; delete confirm.
- [ ] Toasts on success; inline functional errors.

**Commits:** `feat(web): gardens store with optimistic mutations` · `feat(web): gardens overview — cards, skeletons, create/edit/delete flows`

## Phase 4 — Garden detail & plants (≈ 75%)
- [ ] `GardenDetailStore`: garden + plants, occupancy computeds, humidity aggregates.
- [ ] Detail screen: header + humidity gauge, occupancy visualizer, plants table (staggered, tracked).
- [ ] Plant create/edit dialog: live remaining-capacity meter, client-side overcrowding validator mirroring server rule, server 400 rendered inline; delete confirm.
- [ ] Specs: occupancy math, overcrowding validator, store behaviour.

**Commits:** `feat(web): garden detail — occupancy visualizer and humidity gauge` · `feat(web): plant management with live capacity validation` · `test(web): occupancy and overcrowding rules`

## Phase 5 — Dashboard & session (≈ 90%)
- [ ] Onboarding profile-selection screen (`/users` list + create), `SessionStore` + guard, avatar menu.
- [ ] Dashboard: hero gradient panel, count-up stats, humidity-vs-target chips, attention list, `@defer` below fold.

**Commits:** `feat(web): profile session flow (mock auth) with route guard` · `feat(web): dashboard with humidity insights and animated stats`

## Phase 6 — Hardening & handoff (100%)
- [ ] Full pass: keyboard walk-through, reduced-motion, empty/error/skeleton on every screen, bundle budget.
- [ ] Component tests for critical screens; `nx run-many -t lint test build` green.
- [ ] Root `README.md` rewritten: how to run, architectural choices, resilience story, performance & auth bonus write-ups, what was cut and why.
- [ ] Push to personal GitHub repo; invite `@ITPJochenV`, `@Sieem`, `@GertjanReynaertITP`.

**Commits:** `test(web): component behaviour specs` · `docs: full case write-up in README` · polish commits as needed

## Bonus write-ups (in README, no code needed)
- **Performance (theoretical):** server ETags/304, pagination + `?fields=`, batch endpoint `GET /gardens?include=plants`, HTTP cache headers, and client prefetch-on-hover — beyond the shipped SWR layer.
- **Auth (theoretical):** [ADR-005](./adr/ADR-005-authentication.md) — httpOnly-cookie session vs JWT, refresh rotation, route guards, API ownership column, idempotency keys for safe write retries.
