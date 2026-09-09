# ItpHomeGarden — Full-Stack Case

A garden management UI built on the provided Fastify backend, engineered so the reviewer never *feels* the intentionally slow, flaky API — while the code makes it obvious we know exactly how hostile it is.

| Dashboard | Garden detail |
|---|---|
| ![Dashboard](docs/screenshots/05-dashboard-full.png) | ![Garden detail](docs/screenshots/07-detail-full.png) |

## Quick start

```sh
npm install

# terminal 1 — backend (http://localhost:3000, swagger at /docs)
npx nx dev api

# terminal 2 — frontend (http://localhost:4200, proxies /api → :3000)
npx nx dev web
```

Tests & quality gates:

```sh
npx nx test web        # 36 unit/behaviour specs (vitest)
npx nx lint web        # eslint + prettier
npx nx build web       # production build, bundle budgets enforced
```

> Node ≥ 22.22.3 (or 24/26) per Angular CLI requirements.

## What was built

**Stack:** Angular 22 (standalone, zoneless, signals) · NgRx SignalStore · Angular Material M3 (heavily themed) · typed Reactive Forms · Vitest. The frontend lives in this Nx workspace as `apps/web`, as the repo suggests. Angular (instead of the suggested React meta-framework) was agreed with the team up front — the role is Angular-focused; see [ADR-001](docs/adr/ADR-001-angular-over-react.md) including a concept map for React reviewers.

All functional requirements are covered: garden CRUD with an overview linked to the active profile, configurable target humidity (0–100) per garden, plant CRUD with all properties, and overcrowding validation with clear error messages — instant client-side feedback *and* the authoritative server verdict rendered inline.

**Decision docs came first** — architecture, backend audit, coding guidelines, design system, phased plan, and six ADRs were written and committed before the first line of app code:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the system design, driven by the backend's hostility
- [docs/API-ANALYSIS.md](docs/API-ANALYSIS.md) — the backend audit (contracts, quirks, gaps found)
- [docs/CODING-GUIDELINES.md](docs/CODING-GUIDELINES.md) · [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) · [docs/IMPLEMENTATION-PLAN.md](docs/IMPLEMENTATION-PLAN.md) · [docs/adr/](docs/adr)

## The interesting part: surviving this API

The backend delays every response by 200–2000 ms and fails 10% of all requests with a random 500 (`slow-api.ts`, `random-errors.ts`). A screen making three calls would visibly fail ~27% of the time. Three cooperating mechanisms in `core/` neutralize this ([ADR-004](docs/adr/ADR-004-resilience-layer.md)):

1. **Retry interceptor** — exponential backoff with full jitter (250 ms base, ×3, 3 s cap, 3 retries) on 5xx/network only, never on 4xx verdicts. Safe for writes *on this API* because the error plugin fires before any handler runs — documented, with the production-grade answer (idempotency keys) in ADR-005. Failure math after retries: <0.1% per screen.
2. **Stale-while-revalidate QueryCache** — fresh hits render instantly with zero requests; stale hits render instantly and revalidate behind the scenes; misses show skeleton ghosts. Identical in-flight requests are de-duplicated; mutations invalidate by key prefix or write through.
3. **Optimistic mutations** — deletes apply instantly with snapshot rollback + a retry toast on failure. Create/update stay pessimistic on purpose: the server owns validation verdicts the form must render.

Every screen renders one of: cached data, count-realistic skeletons (with appear-delay/min-display timing so nothing flashes or blinks), a designed empty state, or a designed error state. A blank or frozen screen is treated as a bug.

**Performance bonus (theoretical, server-side):** the client cache is the shipped answer; the proposals we'd bring to the backend team are ETag/`If-None-Match` with 304s, pagination + sparse fieldsets, an `?include=plants` batch shape for the dashboard's N+1, `Cache-Control` on stable resources, and hover-prefetch on the client. Each targets "frequently used data" directly.

**Auth bonus:** a working profile-session flow ships today (onboarding on the real `/users` API, `SessionStore` + route guard, profile menu). The real design — httpOnly-cookie sessions vs rotating JWTs, ownership scoping, CSRF, rate limits, idempotency keys — is written up in [ADR-005](docs/adr/ADR-005-authentication.md), with the shipped seams chosen so real auth plugs in with minimal rework.

**One backend change** was made (explicitly allowed): `targetHumidityLevel` added to gardens via a new `migration002` + zod schemas, because the case requires it and the API lacked it ([ADR-003](docs/adr/ADR-003-backend-extension.md)).

## UI/UX notes

Gray-first design system ("Verdant") with gradient signatures, built as CSS tokens over a themed Material M3 — skeleton ghosts with a shared shimmer timeline, staggered list entries, count-up stats, an animated humidity gauge with target marker, and a proportional bed-layout visualizer (blocks sized by m², colored by plant type, free space dashed). Everything honors `prefers-reduced-motion`, focus rings are never stripped, state is never color-alone, and type is in `rem`. Details in [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md).

## Testing

36 specs focus on the logic that earns its keep (per the case: *useful* coverage of critical business logic): the SWR cache semantics (fresh/stale/miss/de-dup/invalidation, fake timers), the retry policy (retries transient 500s, never retries verdicts, exhausts its budget), the error taxonomy mapping, the domain math mirroring the server's overcrowding rule (including edit semantics), and GardensStore behaviour (skeleton→data, cached instant render, optimistic rollback, functional verdicts returned to forms — asserted as behaviour, not implementation).

## What I'd do next (deliberately cut at 2–3 days)

E2E smoke suite (Playwright), dark mode (tokens are structured for the remap), i18n runtime (strings are centralized-ready), real auth per ADR-005, drag-to-resize beds in the visualizer, and CI wiring for `nx affected` on the web project.

## AI usage

AI tooling was used as pair-programmer for scaffolding and iteration, per the case's AI policy. Every architectural decision, guideline and trade-off is documented in `docs/` and owned; the commit history tells the story step by step.
