# Final Principal Frontend Audit

> **STATUS: REMEDIATED.** Every accepted finding below was implemented and verified — see
> [REMEDIATION-LOG.md](./REMEDIATION-LOG.md) (all boxes checked, one waiver recorded)
> and [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) PHASE 20. Post-remediation verification: lint ✅ · unit 73/73 ✅ ·
> prod build ✅ (budget intact) · e2e 17/17 in one combined run ✅ (mocked project 3× deterministic).
> The axe scans added during remediation additionally caught and fixed 4 sub-AA accent tokens
> this audit's manual contrast review had missed. This document is preserved as the point-in-time
> audit record; the counts above are from that date. The suite has since grown further with the
> Garden Map epic and the submission-stabilization pass (see REMEDIATION-LOG.md, TWIN/STAB
> sections) — `npx nx test web` and `npx nx e2e web-e2e` are the live numbers.

> Conducted as a hostile external review of the actual repository — code first, docs second.
> Every finding carries evidence; runtime findings were reproduced against the live app
> (slow-api + random-errors enabled). Verification commands were actually run; results below.

## Executive Summary

The application is a coherent, constraint-driven Angular 22 build: the hostile backend (200–2000 ms delays, 10% random 500s) shaped a resilience core (SWR cache + retry with jitter + optimistic rollback) that is genuinely engineered, unit-tested, and documented — including two real race conditions found and fixed with regression specs. Domain logic is pure and thoroughly tested; the design-token system proved itself by shipping dark mode with zero component changes; zoneless operation is verified at runtime (no `window.Zone`).

What keeps it from _exceptional_: **one real runtime defect** (a malformed garden-id deep link renders a silently blank page), **one unguarded domain edge** (shrinking a garden below its used area passes silently — the server permits it), **documentation drift** (the README still lists shipped features as future work and undercounts the test suite), and a **Playwright suite covering only 2 of the 10 required flows**, with no deterministic network-mocked scenarios. All are fixable in one focused session; none undermines the architecture.

## Current Score

**8 / 10** — strong senior/lead work with principal-level moments (resilience layer, token architecture, race-condition forensics). Expected after remediation: **9 / 10**.

## Submission Recommendation

**Fix P1s first, then submit.** REM-001 (blank page) and REM-003 (stale README) are hours of work and disproportionately reviewer-visible. The Playwright epic (REM-004) is the largest genuine gap versus the assignment's own testing bar.

## Technology Inventory (from package-lock, not assumption)

| Dependency                           | Version                             | Verdict                    | Why it's here                                                                                              |
| ------------------------------------ | ----------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| @angular/core / cli                  | 22.1.5 / 22.1.7                     | **JUSTIFIED**              | current major; standalone + zoneless + signals                                                             |
| @angular/material + cdk              | 22.1.5                              | **JUSTIFIED**              | a11y-correct primitives (dialog, menu, select, slider, datepicker); heavily themed, not Material-demo look |
| @ngrx/signals                        | 22.0.0                              | **JUSTIFIED**              | SignalStore only — no classic Store; structure without boilerplate (ADR-002)                               |
| rxjs                                 | 7.8.2                               | **JUSTIFIED**              | confined to HTTP/retry/promise bridging; zero manual `subscribe()` in app code (verified by grep)          |
| typescript                           | 6.0.2 (web) / 5.9.3 (root, backend) | **JUSTIFIED**              | strict everywhere; the split matches Angular 22's requirement without touching the provided backend        |
| vitest                               | 4.1.11                              | **JUSTIFIED**              | Angular CLI's modern default; fake timers used for all time-based specs                                    |
| @playwright/test                     | 1.63.0                              | **JUSTIFIED**, underused   | config is sound (webServer, retries, traces); flow coverage is the gap (REM-004)                           |
| nx                                   | 22.0.2                              | **JUSTIFIED**              | shipped with the repo; web integrates via npm-workspace target inference (ADR-006)                         |
| @fontsource-variable/inter + sora    | 5.3.0                               | **JUSTIFIED**              | self-hosted fonts, `font-display: swap`, no CDN                                                            |
| eslint 9 (flat) + prettier 3         | —                                   | **JUSTIFIED**              | workspace-level; `.angular`/dist/coverage ignored                                                          |
| zod, fastify, kysely, better-sqlite3 | —                                   | **N/A (provided backend)** | untouched except the documented `migration002` (ADR-003)                                                   |

Nothing unnecessary found. Notably absent on purpose: TanStack Query (the cache is the case's exam subject), openapi-generator (15-endpoint contract; seam documented), classic NgRx, axe toolchain (now recommended small-footprint — REM-010).

## Requirement Coverage (case PDF)

All functional requirements verified working end-to-end (unit + e2e + manual): garden CRUD with account-scoped overview, configurable target humidity 0–100 (backend extended via `migration002`), plant CRUD with all contract fields, overcrowding validation with clear messaging (live client mirror + server verdict verbatim). Both bonuses answered: performance (implemented client-side + production proposals) and auth (working session flow + OIDC/PKCE/BFF design). One deviation, pre-approved and ADR'd: Angular instead of a React meta-framework.

## Architecture / Angular / Signals / SignalStore Review

**Modern-Angular checklist — all verified in code, not docs:** standalone-only (zero NgModules), zoneless (runtime-verified: `typeof window.Zone === 'undefined'`), OnPush on every component, strict TS + `strictTemplates`, `inject()` only (zero constructor injection), new control flow only (zero `*ngIf/*ngFor`), stable `track` on all entity `@for`s (`track i` appears only on static ghost literals — acceptable), `@defer (on viewport)` on the dashboard's below-fold grid, functional interceptors, `input()`/`computed()` signal APIs, lazy `loadComponent` per route, `withComponentInputBinding` + `withViewTransitions`.

**Signals discipline:** no derived state stored anywhere (all insights are `computed` from `garden + plants`); no signal-to-signal effect propagation; the six `effect()`s are each narrow and justified (route-param → load ×2, progressive enrichment ×2, skeleton timing, count-up animation). The codebase carries the scar and the cure of the one signals bug that mattered: the warm-cache effect loop, fixed with `untracked()` + identical-write guard **and** a regression spec (`plants-index-store.spec.ts`).

**Stores:** responsibilities are clean (root Gardens/PlantsIndex/Session/Toast; route-provided GardenDetail destroyed with its route); mutations return typed verdicts so forms render functional errors without store↔form coupling; double-submit is guarded at method entry (exhaust semantics); `finally` resets every pending flag.

**The one structural criticism (REM-005):** plants exist in two writable stores — `GardenDetailStore.plants` and `PlantsIndexStore.byGarden`. Divergence is prevented today by disciplined write-through (`setPlants`), but the invariant lives in convention, not structure. A principal-level fix derives the detail store's plants from the index (single owner) or pins the invariant with a dedicated sync spec.

**resource()/httpResource():** **DO NOT USE** (recorded judgment) — experimental in the installed major; our reads need SWR + de-dup + mutation write-through, which `httpResource` does not model; QueryCache covers it in ~140 tested lines. Revisit when stable. **linkedSignal:** no current state fits its reset-on-source pattern; not introduced. **Signal Forms:** not stable in Angular 22.1 → **KEEP TYPED REACTIVE FORMS** (recorded judgment); the forms are fully typed (`NonNullableFormBuilder`, zero `FormGroup<any>`).

## RxJS Review

Minimal and correct: `retry({count, delay})` + `timer` in the interceptor (backoff + full jitter), `map` for DTO→domain, `firstValueFrom` bridging, `toSignal` for the one form-value stream. No nested subscriptions, no manual `subscribe()`, no shareReplay, no Subject-as-state (all grep-verified). Concurrency semantics reviewed per workflow: saves are exhaust-style via the `saving()` entry guard; search is client-side filtering (no request to switch); no sequential mutation queues exist to need `concatMap`.

## Domain Review

Pure module `shared/utils/garden-insights.ts` implements the equivalents of every required calculation; the overcrowding mirror replicates the server's strict `>` including edit-excludes-self semantics, boundary-tested (exact fit passes; +0.1 fails; edit to full garden passes). Rounding strategy is documented: raw floats in domain math (server parity), display rounding at the formatting edge. **Edge found (REM-002):** _garden_ update has no capacity guard on either side — shrinking `totalSurfaceArea` below used area silently yields >100% utilization (UI clamps and shows Full, but the form neither warns nor blocks). The server permits it, so the client must at least warn.

## API / Slow-API Review

Layering holds: components never see URLs or `HttpClient`; DTOs stop at `core/api` mappers. Per-read UX table (all states runtime-verified):

| Screen / action          | Call(s)                    | Loading UX                                  | Skeleton       | Cache                 | Error state                  | Retry                           | Stale                               | Shift | A11y          |
| ------------------------ | -------------------------- | ------------------------------------------- | -------------- | --------------------- | ---------------------------- | ------------------------------- | ----------------------------------- | ----- | ------------- |
| Dashboard load           | gardens + plants×N         | count-realistic ghosts, `@defer` below fold | ✅             | SWR + de-dup          | designed + Try again         | auto ×3 + manual                | SWR                                 | none  | `role=status` |
| Gardens grid             | gardens + plants×N         | 3 ghost cards; progressive enrichment       | ✅             | SWR                   | designed + Try again         | auto + manual                   | SWR + quiet toast on failed refresh | none  | ✅            |
| Garden detail            | garden ∥ plants (parallel) | header ghost + 5 row ghosts                 | ✅             | SWR (+hover prefetch) | not-found page / error state | auto                            | SWR                                 | none  | ✅            |
| Create/edit garden·plant | POST/PUT                   | button "Saving…", screen stays live         | n/a (mutation) | write-through         | inline verdict / toast       | auto (safe: pre-handler errors) | n/a                                 | none  | `role=alert`  |
| Delete garden·plant      | DELETE                     | optimistic removal                          | n/a            | invalidate            | rollback + Try-again toast   | toast action                    | n/a                                 | none  | ✅            |
| Onboarding               | users                      | 3 ghost rows                                | ✅             | SWR                   | inline + retry               | auto                            | —                                   | none  | ✅            |

No frozen-UI path found. Reads-vs-mutations split matches the professional interpretation exactly (skeletons never wipe rendered content during mutations).

## Skeleton / Async UX Review

The generic system **already exists and is sound**: one `Skeleton` primitive (variants line/title/circle/rect/card, single shimmer implementation on tokens, `aria-hidden`), one `SkeletonGroup` timing wrapper (150 ms appear-delay / 300 ms min-display, `role=status aria-live=polite`), reduced-motion swaps shimmer for opacity pulse, dark-theme gradients tokenized. Feature ghost layouts are co-located inline in each template — a deliberate anti-drift choice; the only true duplication is the garden-card ghost shape (list + dashboard variants) → small extraction task (REM-014), not an epic. Async state is already expressive (`idle|loading|ready|error` + `saving`), not a bare boolean; no ambiguous state combination is renderable.

## UI/UX & Design System Review

Premium verdict holds in both themes: token-driven warm-gray + gradient identity, themed M3 (not Material-demo), designed empty/error states everywhere, hero screen is genuinely the detail page (gauge + proportional bed visualizer + delta chips). Brutal nitpicks that survived review: stat tile prints "20 m²" over a label already containing m² (REM-012); the humidity gauge on an empty garden displays the _target_ as if it were measured average — runtime-confirmed "63% avg humidity" with zero plants (REM-008). Arbitrary-value scan: colors/spacing/radii/motion all tokenized; remaining raw values are one-off geometry (SVG arcs, scroll offsets) not worth tokenizing.

## Error Handling Review

Single taxonomy (`technical`/`functional`/`not-found`), all three backend payload shapes normalized, no raw server text for technical failures, no double-toasting (verdicts return to forms, never toast), global handler as last resort, stale-data-over-error policy on failed refresh. `console.warn` with context appears in 4 store catch paths — consistent with the guidelines but a 20-line logger would centralize it (REM-011).

## Routing Review

Lazy everything, guard-gated shell, friendly 404 for unknown paths, existing-but-missing ids handled (`gardenMissing` state verified). **Defect (REM-001):** `/gardens/not-a-number` → `numberAttribute` yields NaN → `load()` is skipped → no loading, no error, no content: a breadcrumb over a blank page (runtime-reproduced). **Gap (REM-006):** no route titles — document title is "ItpHomeGarden" on every page (runtime-verified).

## Performance Review

Prod build (fresh run): **473.76 kB raw / 126.99 kB transfer initial**, budgets enforced in `angular.json`, per-route lazy chunks, zero build warnings. Zoneless verified at runtime, not by provider presence. Transform/opacity-only animation; skeleton dimensions prevent CLS (0 px horizontal overflow at 360/834 measured); fonts self-hosted with swap; icons are inline SVG. No repeated-request pathology (de-dup verified by spec and network trace).

## Accessibility Review

Strong foundation (landmarks, skip-link first-focusable — runtime-verified; labeled forms; `role=alert` validation; dialog focus + Escape verified; not-color-alone states; rem type; reduced motion). Gaps: no automated axe pass (REM-010); not-found page tops out at `h3` (REM-013); the empty-gauge mislabel is also an a11y truthfulness issue (REM-008).

## Testing Review — risk coverage matrix

| Business risk                                                                 | Test                                      | Quality | Gap         |
| ----------------------------------------------------------------------------- | ----------------------------------------- | ------- | ----------- |
| Capacity math incl. edit semantics + boundaries                               | garden-insights.spec (unit)               | high    | —           |
| Overcrowd UX (block, message, exact fit, edit)                                | plant-form-dialog.spec + e2e flow 2       | high    | —           |
| SWR semantics, de-dup, invalidation, write-version race                       | query-cache.spec                          | high    | —           |
| Retry policy (transient/verdict/budget)                                       | api-interceptors.spec                     | high    | —           |
| Error taxonomy, all payload shapes                                            | api-error.spec                            | high    | —           |
| Store load/success/error/rollback/cache-coherence                             | gardens-store + garden-detail-store specs | high    | —           |
| Effect-loop regression                                                        | plants-index-store.spec                   | high    | —           |
| Screen states (loading/empty/error/success)                                   | garden-list + dashboard specs             | good    | —           |
| Theme + toolbar view logic                                                    | theme-store + garden-view specs           | good    | —           |
| **E2E flows 4–10** (edit/delete/validation/empty/error/slow/mutation-pending) | —                                         | —       | **REM-004** |
| Doc/code truth                                                                | —                                         | —       | REM-003     |

63 specs, 13 files, all passing (fresh run). No implementation-detail assertions found; fake timers everywhere time matters.

## Playwright Review

What exists is above-average: role-based selectors throughout, zero `waitForTimeout` in committed specs, dialog-close-as-commit synchronization, unique-per-invocation data, webServer with `reuseExistingServer`, `retain-on-failure` traces, sequential workers for the shared sqlite. What's missing is scope (2/10 required flows) and determinism tooling: no `page.route()` scenarios for guaranteed-500 / guaranteed-slow / empty responses, no HTML reporter, no failure screenshots, no split between mocked-deterministic and real-API smoke suites, no mobile-viewport smoke, no keyboard/a11y flows. This is the largest single gap in the repository (REM-004 epic).

## Documentation Truth Check

| Claim                                                                       | Verdict                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| README "What I'd do next: E2E smoke suite (Playwright)… dark mode…"         | **FALSE — both shipped.** Actively harmful before review (REM-003) |
| README "48 unit/behaviour/component specs" / plan "56 specs total"          | **OUTDATED** — actual 63 (REM-003: stop hard-coding counts)        |
| ARCHITECTURE / STATE-MANAGEMENT / ERROR-HANDLING / PERFORMANCE docs vs code | TRUE (spot-checked against implementation)                         |
| ACCESSIBILITY "known gaps" honesty                                          | TRUE and commendably honest                                        |
| ADR-001..006                                                                | TRUE                                                               |
| DESIGN-SYSTEM dark-mode section                                             | TRUE (updated when shipped)                                        |

## Security Review

No `innerHTML`, no dynamic URL construction from user input, no secrets/env leakage, localStorage holds only non-sensitive prefs + the documented mock profile, technical server internals never rendered, logs carry context not payloads. Auth remains theoretical by design (ADR-005). No findings beyond P3 hygiene.

## P0 Findings

None. Build/lint/tests/e2e all pass fresh; every case requirement works end-to-end.

## P1 Findings

| ID      | Finding                                                                                                                     | Evidence                                                                                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REM-001 | Non-numeric garden-id deep link renders a blank content area (no loading/error/redirect)                                    | runtime repro: `/gardens/not-a-number` → main contains only breadcrumb; `garden-detail.ts` effect skips `load()` on NaN, `garden-detail.html` has no else-branch for null garden in idle state |
| REM-002 | Garden edit can shrink `totalSurfaceArea` below used area with no warning (server permits; silent >100% utilization)        | `garden-form-dialog.ts` (no cross-check vs used area); `apps/api/.../garden.service.ts` `updateGarden` (no capacity check)                                                                     |
| REM-003 | README truth drift: shipped features listed as future; stale spec counts here and in IMPLEMENTATION-PLAN                    | `README.md` "What I'd do next"; counts 48/56 vs 63 actual                                                                                                                                      |
| REM-004 | Playwright covers 2 of the 10 required flows; no deterministic network-mocked scenarios; reporter/screenshot config minimal | `apps/web-e2e/src/garden-workflows.spec.ts`, `playwright.config.ts`                                                                                                                            |

## P2 Findings

REM-005 dual plants-state ownership · REM-006 no route titles (runtime-verified) · REM-007 no `.gitattributes` (EOL/mode drift already bit this repo on Windows) · REM-008 empty-garden gauge presents target as measured value (runtime-verified) · REM-009 optimistic-delete lacks per-entity re-entrancy guard (retry during in-flight retry snapshots intermediate state) · REM-010 no automated axe scan · REM-011 store-level `console.warn` instead of a tiny logger.

## P3 Findings

REM-012 stat-tile m² duplication · REM-013 not-found page lacks `h1` · REM-014 extract the one genuinely duplicated ghost composite (garden card) · REM-015 search persistence writes localStorage per keystroke · REM-016 optional: 3 visual-regression screenshots (dashboard, detail, skeleton state).

## KEEP — DO NOT REFACTOR

1. **QueryCache** — SWR + de-dup + prefix invalidation + write-version race guard, ~140 lines, 8 specs. Do not replace with a library; it is the exam answer.
2. **Error taxonomy + verdict-returning mutations** — forms render functional errors without store↔form coupling; no double-notification path exists.
3. **`garden-insights.ts` purity** — server-mirroring domain math with boundary specs; keep it dependency-free.
4. **Token system + dark remap** — dark mode shipped with zero component edits; this is the proof the architecture works.
5. **SkeletonGroup timing contract** (appear-delay/min-display + aria) — do not "simplify" it away; it is why nothing flashes or blinks.
6. **Zoneless discipline artifacts** — `untracked()` enrichment path and its regression spec; the effect-loop comment block is engineering history worth keeping.
7. **Retry interceptor scope** (5xx/network only, jitter, documented write-safety rationale tied to this API's `onRequest` errors).
8. **Route-provided GardenDetailStore** lifecycle; **e2e synchronization style** (dialog-close as commit signal, role-based selectors).

## Scores

Requirements 9 · Angular architecture 9 · Signals 8 · SignalStore 8 · RxJS 8 · Domain 9 · API architecture 8 · UI/UX 8 · Design system 9 · Loading/skeleton UX 9 · Mutation UX 8 · Performance 9 · Caching 9 · Error handling 9 · Accessibility 7 · Responsive 8 · Unit/component testing 8 · **Playwright E2E 5** · Documentation 7 · Maintainability 9 · Reviewer experience 8.

**CURRENT OVERALL: 8/10 → EXPECTED AFTER REMEDIATION: 9/10**

## Overall assessment

**Ready for a Lead/Principal-level review — with the four reservations below closed first.**

For: (1) the resilience layer is designed, tested, and documented like production infrastructure, not assignment code; (2) two real race conditions were found, root-caused, fixed at the correct layer, and regression-tested — that narrative is principal-level; (3) domain logic is pure, boundary-tested, and mirrors the server contract with documented rounding; (4) the token system demonstrably paid off (dark mode with zero component changes); (5) zoneless/OnPush/signals discipline is real, verified, and free of the classic effect-abuse patterns; (6) docs-before-code with ADRs shows how this person leads.

Reservations: (7) a reviewer who types a malformed URL gets a blank page — small bug, outsized signal; (8) the README tells reviewers that shipped work is future work — an avoidable credibility hit; (9) the e2e suite doesn't meet the bar the project's own testing strategy sets; (10) the dual plants-state ownership is the one place convention substitutes for structure. All four are addressed in the remediation log; with them closed, the reservations no longer stand.
