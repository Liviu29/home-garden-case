# Final Architect Review — Findings

**Scope:** Independent Staff/Principal-level audit of the Home Garden Angular application
**Originally audited at:** `d02addb`
**Re-verified after remediation:** 2026-09-10
**Reviewer stance:** adversarial. Nothing here is taken from the project's own documentation on trust; every claim was measured against the working tree, the running app, or the test/build output.

> **This document has two lives.** It was written as an audit of `d02addb`, then
> updated after a full remediation pass. Findings are not deleted — each one
> keeps its original severity and gains what was done about it, so the
> architectural reasoning survives even where the conclusion changed. The
> blow-by-blow record, including the RED/GREEN evidence for each fix, is in
> [FINAL-FINDINGS-REMEDIATION.md](./FINAL-FINDINGS-REMEDIATION.md).

---

## Final status table

| ID   | Original severity | Final status                                   | Verification                                                                                                                          |
| ---- | ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | P1                | **FIXED**                                      | responsive E2E matrix at 375/768/1024/1440/1920 × 3 routes; two guards proven RED first (200 px overflow, 16 escaping elements)       |
| F-02 | P2                | **FIXED**                                      | fan-out moved into the store via `rxMethod`; both `untracked()` calls deleted; loop, dedup and stale-collection specs                 |
| F-03 | P2                | **RESOLVED BY DOCUMENTATION**                  | finding was a measurement artifact — network trace shows no duplicates; request-count contract now asserted by an E2E guard           |
| F-04 | P2                | **FIXED**                                      | every reviewer-facing numeric claim regenerated or made durable; bundle table rebuilt from a fresh production build                   |
| F-05 | P2                | **FIXED**                                      | map now calls `usedSurfaceArea`; agreement asserted at 0/50/97.5/100 %, decimals, over-capacity, edit-excludes-self; guard proven RED |
| F-06 | P2                | **FIXED**                                      | zero `waitForTimeout` in the suite; replaced with `waitForResponse` + a `MutationObserver`; config policy corrected                   |
| F-07 | P3                | **INTENTIONALLY RETAINED — VERIFIED**          | lazy chunk verified in the build (49.60 kB raw / 12.29 kB transfer); CLS 0.025 / 0.000; docs corrected to claim the real benefit      |
| F-08 | P3                | **FIXED**                                      | heading outlines extracted at runtime across 7 page states — zero skips; guard proven RED (`h1→h3` twice)                             |
| F-09 | P3                | **FIXED**                                      | breadcrumb target measured 52×20 → **60×24**; WCAG 2.2 SC 2.5.8 satisfied                                                             |
| F-10 | P3                | **INVALIDATED BY CURRENT ANGULAR 22 GUIDANCE** | zoneless verified three ways; the finding was backwards — the _doc_ claimed a provider the app never called, and the doc was fixed    |
| F-11 | P3                | **INTENTIONALLY RETAINED — VERIFIED**          | peer ranges do not intersect (`@angular/compiler-cli` needs TS ≥6.0, `typescript-eslint` needs <6.0); recorded in ADR-006             |
| F-12 | P3                | **RESOLVED BY DOCUMENTATION**                  | README gained a suggested review path; `docs/process/` framed as dated snapshots                                                      |

**Remaining:** P0 **0** · P1 **0** · P2 **0** · P3 **0 open** (two retained by decision, with evidence).

---

## Executive Summary

This was a strong submission when it was audited, and the remediation pass closed
every finding that should be closed. The architecture is coherent, the Angular 22
usage is current and deliberate rather than decorative, the backend hostility
(uniform 200–2000 ms latency, 10 % injected 500s) is treated as a _product_
problem and solved in the UX layer rather than merely retried in the network
layer, and the test pyramid is real.

Three things about the remediation are worth a reviewer's attention more than the
fixes themselves.

**The P1 was worse than the audit recorded, and the audit's own guard could not
have caught it.** F-01 was filed as "26 px of overflow at 375, 85 px at 1024".
Measuring the ancestor chain instead of the document showed card content escaping
its own card by ~180 px at _every_ viewport — it only reaches the document edge
at 375 px, where the card sits against the page gutter. A document-level
assertion is therefore structurally incapable of catching this at desktop widths,
which is why the fix ships two guards and both were proven RED before the CSS was
touched (200 px overflow at 375; 16 escaping elements at 1440).

**One finding was wrong, and one was backwards.** F-03 ("1–2 redundant GETs per
screen") does not reproduce: instrumenting the real navigation paths shows exactly
one request per resource and _zero_ on warm-cache navigation. The audit had walked
the app with `page.goto()` per route — a full page load that boots a new app and
destroys the cache, manufacturing the very duplication it then reported. F-10
proposed adding `provideZonelessChangeDetection()` so a reviewer's grep would
succeed; the actual defect was that `CODING-GUIDELINES.md` _claimed_ the app
called it when it never did. The fix was to correct the document, not to add code
to satisfy a false claim.

**Two findings were correct to raise and wrong to fix.** F-11 looked like version
skew; the declared peer ranges of `@angular/compiler-cli` (TS ≥ 6.0) and
`typescript-eslint` (TS < 6.0) do not intersect, so a single workspace version is
not achievable — aligning them would have moved a working documented split to a
broken undocumented one. F-07's `@defer` genuinely fires immediately on desktop,
but changing the trigger would delay the showcase screen's centrepiece to make a
mechanism look more impressive; the chunk boundary is the real, measured benefit
and the documentation now says so.

---

## Final Readiness Verdict

### 🟢 READY TO SEND — STRONG YES

P0 = 0. P1 = 0. Every P2 is resolved. Both retained P3 items are retained _by
decision_, with measured evidence and a recorded revisit trigger, which is a
different thing from an outstanding item.

The submission gate below is fully green, all quality gates pass, and the guards
protecting the two riskiest properties — no horizontal overflow, one request per
resource — were each proven to fail against the defective code before being
accepted.

---

## Scoring

Scores are out of 10 and calibrated against a strong Lead/Principal candidate
submission, **not** a typical take-home. Arrows show movement across the
remediation pass.

| Dimension               |      Score | Basis                                                                                                                                  |
| ----------------------- | ---------: | -------------------------------------------------------------------------------------------------------------------------------------- |
| Requirements coverage   |          9 | Every functional requirement met; both bonus items answered with working code _and_ written theory.                                    |
| Architecture & layering |          9 | Feature/shared/core separation holds; no cross-feature imports; domain logic in `shared/utils`, not components.                        |
| Angular 22 idiom        |          9 | Standalone, zoneless, OnPush everywhere, control flow blocks, `@defer`, `host` object over decorators.                                 |
| Signals usage           |  8 → **9** | The two fan-out effects are gone; **zero `untracked()` calls remain in production code**.                                              |
| SignalStore design      |          9 | Monotonic request-generation token is the right `switchMap` equivalent for a store; the plants index now owns its own async lifecycle. |
| RxJS usage              |          9 | Deliberately minimal. `rxMethod` was added for two concrete properties, not for novelty — see F-02.                                    |
| Domain modeling         | 9 → **10** | Capacity had exactly one leak; it is closed and locked by a test. Per-plant humidity comparison consolidated too.                      |
| Backend integration     |          9 | Contract audited and documented; client validates rather than trusts.                                                                  |
| API resilience          |         10 | Retry with full jitter; write-retry safety reasoned from the actual hook ordering, not assumed.                                        |
| Async UX strategy       |          9 | Skeleton-first with a 150 ms appear delay; SWR cache with in-flight dedup. Latency hidden, not narrated.                               |
| Skeleton implementation |          9 | Shapes match final content; one shared keyframe; zero spinners (verified by scan).                                                     |
| UI quality              |  8 → **9** | F-01 closed at the containment level, not just the symptom.                                                                            |
| Visual consistency      |  8 → **9** | Tokenised throughout; contrast pairs added with measured ratios.                                                                       |
| Garden Planner          |          9 | Squarified treemap is area-honest — the correct call for a _planner_; camera is viewport-aware.                                        |
| Design system / SCSS    |          9 | Token layer is disciplined; no magic colours in feature styles.                                                                        |
| Accessibility           |  8 → **9** | Zero heading skips across seven page states; target size meets WCAG 2.2 AA.                                                            |
| Responsive behaviour    |  7 → **9** | Now guarded by a hostile-content matrix (5 viewports × 3 routes) asserting both document overflow and component containment.           |
| Performance             |          9 | 129.58 kB transfer initial; lazy routes; measured CLS 0.025 / 0.000.                                                                   |
| Testing strategy        | 9 → **10** | Every fix guarded, and every guard proven RED against the defective code first.                                                        |
| Playwright quality      |          9 | Two projects; stable at zero retries; **zero fixed waits**.                                                                            |
| Security posture        |          9 | No secrets, no source maps in prod, no `innerHTML` sinks, no `eval`, no localhost leak.                                                |
| DEV/PROD configuration  |          9 | Environments separated properly; production build verified clean.                                                                      |
| Documentation           |  8 → **9** | A false Angular claim removed, brittle counts made durable, a review path added.                                                       |
| Maintainability         |          9 | Naming is consistent and boring in the good way.                                                                                       |
| Reviewer experience     |  8 → **9** | A signposted route through 33 documents, and `docs/process/` labelled as history.                                                      |

### Headline scores

|                                 |              |
| ------------------------------- | ------------ |
| **Overall technical quality**   | **9.5 / 10** |
| **Overall UI/UX quality**       | **9 / 10**   |
| **Overall submission strength** | **9 / 10**   |

---

## P0 — Submission Blockers

**None** — at audit time or now.

---

## P1 — Must Fix Before Submission

### F-01 — Dashboard content escapes its card; document overflows at 375 px — ✅ RESOLVED

**Original issue.** With an unbreakable garden name, `.health-name` (a flex item)
and `.health-top` (a grid item) both defaulted to `min-width: auto`, whose
automatic minimum size refuses to shrink below the content's intrinsic minimum.
`text-overflow: ellipsis` therefore never engaged; the row forced its ancestors
wider instead. Filed as 26 px / 85 px of document overflow; re-measurement showed
**200 px at 375 px** and, more importantly, `.health-top` rendering **542 px wide
inside a 360 px card at every viewport**. The Attention Center had the same trap,
with no truncation at all on `.attention-name`.

Aggravating context: `README.md` guaranteed no horizontal overflow at any
viewport, and `responsive.spec.ts` seeded a _breakable_ fixture ("Mobile Garden
with a fairly long name"), so the spec that looked like coverage asserted a case
that could not fail.

**Remediation.** `min-width: 0` on the flex/grid items that must be allowed to
shrink; `grid-template-columns: minmax(0, 1fr)` on `.health-card` and
`.attention-body`; `overflow-wrap: anywhere` on body copy that reads better
wrapped than truncated; `flex: none` on the badge; ellipsis on `.attention-name`.
No `overflow-x: hidden` anywhere — the layout is fixed, not masked.

**Verification.** A hostile-content matrix (375 / 768 / 1024 / 1440 / 1920 ×
dashboard / gardens / detail) with unbreakable garden, plant and species names at
100 % capacity and extreme humidity, asserting **both** zero document overflow
**and** zero component-boundary escapes. Both guards proven RED first:
`Expected: 0  Received: 200` (document, 375) and `Expected: 0  Received: 16`
(containment, 1440 — the case the document assertion passes while broken).
GREEN: 17/17. Ordinary garden names inspected visually at 1440 and 375: no
regression.

---

## P2 — Should Fix

### F-02 — Effect-driven fan-out with load-bearing `untracked()` — ✅ RESOLVED

**Original issue.** Two component `effect()`s read the garden list, issued N HTTP
requests and wrote into a root store. The store's warm-cache path read and wrote
`byGarden()` in the same synchronous pass, so the effect registered its own write
as a dependency of its own read — making `untracked()` **load-bearing**: remove
it and the renderer froze.

**Remediation — ownership, not technology.** `PlantsIndexStore` now owns the
fan-out through `rxMethod`; components declare a `gardenIds` computed and hand it
over once, with an explicit injector so the subscription dies with the component.
No component effect, no component writes into a shared store, and **both
`untracked()` calls deleted** rather than relocated — `rxMethod`'s handler runs
in a subscription rather than a reactive consumer, so the self-dependency cannot
exist by construction. `distinctUntilChanged` on the id list means an unchanged
garden list costs nothing. RxJS was chosen for those two properties plus the fact
that one API now serves both the reactive and the one-shot imperative caller —
not for novelty (§28).

**Verification.** `grep -rn "untracked" apps/web/src` matches only prose. Specs:
warm-cache fan-out must not loop _and_ must issue zero network calls; an
unchanged list must not re-fan-out while a new garden must; a stale collection
landing late must not clobber the current one. Runtime network trace after the
refactor is identical to before it.

### F-03 — "1–2 redundant GETs per screen visit" — ⚠️ WITHDRAWN (measurement artifact)

**Original issue as filed.** `GET /api/gardens` ×2 and `GET /api/plants/garden/19`
×2 on a normal screen visit.

**What re-measurement showed.** No duplicates anywhere:

```
cold /dashboard    1 × /api/gardens · 1 × /api/plants/garden/{1,2,3}
→ /gardens         (no requests)
→ /dashboard       (no requests)
open /gardens/1    1 × /api/gardens/1 · 1 × /api/plants/garden/1
```

Three candidate causes were probed. Hover-prefetch followed by a click collapses
to **one** request (in-flight dedup works). Post-TTL revisit issues one background
revalidation, which is the documented SWR contract. The duplication appears only
when two `page.goto()` calls run back to back — a **full page load** that boots a
new application and destroys the in-memory cache, so "twice" is two independent
sessions making one request each. The original audit walked the app that way.

**Outcome.** No production change. The finding earned a durable artifact instead:
`request-ownership.spec.ts` asserts the request-count contract as behaviour (cold
→ 1, fresh cache → 0, stale → 1 background refresh) and names the single owner of
each fetch.

### F-04 — Documented metric drift — ✅ RESOLVED

**Original issue.** Four stated numbers had drifted from the tree. A full sweep
found the claims split three ways: current-state claims that had drifted;
approximate architectural figures still true; and dated snapshots inside
`docs/process/` recording what was true when written.

**Remediation.** Brittle counts in `PRODUCTION-READINESS.md` now state the outcome
and name the command that produces the current number, so they cannot drift again.
The bundle table was regenerated from a fresh production build. `README.md`'s "25
specs" became the properties those specs assert. `docs/process/` was left as the
historical record it is, and the README now labels it as such — which is what
makes its dated numbers legitimate rather than stale.

### F-05 — Duplicate capacity arithmetic — ✅ RESOLVED

**Original issue.** `garden-map-layout.ts:80` re-derived used area instead of
calling `usedSurfaceArea`, the one authority the HUD, the forms and the server's
overcrowding rule share.

**Remediation.** A full classification sweep confirmed the hole was exactly one
line wide — every other site was either authoritative or a legitimate per-plant
visual transform. That line now calls `usedSurfaceArea(ordered)`. Separately (per
§42), the per-plant humidity comparison was inlined in three places and now lives
in `garden-insights.ts` as `plantHumidityDelta`.

**Verification.** New specs assert the map's _drawn_ occupancy equals
`occupancyRatio` at 0 / 50 / 97.5 / 100 %, decimal areas, over-capacity (drawn
clamps at 100 % while the domain ratio exceeds 1) and edit-excludes-self. Guard
proven RED: a subtly divergent expression fails 3 tests.

### F-06 — Fixed Playwright wait contradicting the config's own ban — ✅ RESOLVED

**Original issue.** `waitForTimeout(3000)` in `contract-resilience.spec.ts` while
`playwright.config.ts` declared fixed waits banned.

**Remediation.** A suite-wide sweep separated the 14 legitimate route-handler
`setTimeout`s (simulated backend latency — the test's input) from the 2 real
violations, one of which the audit missed. The resilience spec now arms
`page.waitForResponse('**/api/gardens/1')` _before_ navigating and awaits that
exact event, then yields two animation frames. The second, a 20 × 50 ms sampling
loop in `welcome.spec.ts`, became a `MutationObserver` that records whether the
zero-state was _ever_ in the DOM — strictly stronger than sampling, since an
observer sees every intermediate state. The config comment now states what is
actually true.

**Verification.** `waitForTimeout` count in the suite: **0**. Both specs green.

---

## P3 — Polish

### F-07 — `@defer` inside the initial viewport — 🔒 RETAINED BY DECISION

Re-measured after all UI changes: the map heading sits at 369 px in a 900 px
viewport, so `on viewport` fires immediately on desktop. Kept, for three measured
reasons: the production build emits `garden-map` as its own chunk (49.60 kB raw /
**12.29 kB transfer**), which is the real benefit; `on viewport` is self-tuning,
deferring only where the map genuinely starts off-screen, whereas `on idle` or
`on interaction` would delay the showcase screen's centrepiece to make the
mechanism look more impressive; and the dimension-matched ghost holds CLS at
**0.025** (1440×900) and **0.000** (375×812). The template comment, README and
PERFORMANCE-AND-CACHING.md were corrected to claim the chunk boundary rather than
delayed work.

### F-08 — Heading hierarchy — ✅ RESOLVED

Two causes, not the one filed: `EmptyState` defaulted to `h3`, **and** garden card
titles were `h3` directly under the page `h1`. `EmptyState.headingLevel` widened
to `1 | 2 | 3` (default still 3, visual size still pinned to `.title`, so semantic
level and typography stay independent), every caller placed by its real position
in the outline, and card titles moved to `h2` with the class unchanged. Guard
proven RED (`h1→h3` on two page states); now zero skips across seven page states.

### F-09 — Breadcrumb target size — ✅ RESOLVED

Measured **52 × 20** against WCAG 2.2 SC 2.5.8's 24 × 24 minimum. The link became
an inline-flex box with `min-height: 24px` and horizontal padding offset by an
equal negative margin, so the hit area grew and the visual rhythm did not. No
pseudo-element tricks, so no overlapping targets. Now **60 × 24**. The `nav` also
gained `aria-label="Breadcrumb"`.

### F-10 — No explicit `provideZonelessChangeDetection()` — ⚠️ INVALIDATED (and reversed)

Angular 22 is zoneless by default; the provider is not what enables it. Verified
three ways: `zone.js` is absent from the workspace entirely, there is no polyfill
entry, and nothing references `NgZone` or hand-cranks `detectChanges()`. The real
defect was the opposite of the one filed — `CODING-GUIDELINES.md` claimed the app
called `provideZonelessChangeDetection()`, which it never did. The document was
corrected and `app.config.ts` gained a comment explaining the deliberate omission
and what actually proves zoneless operation, so a reviewer's grep now lands on an
answer instead of a silence.

### F-11 — Two TypeScript versions — 🔒 RETAINED BY DECISION

`@angular/compiler-cli@22.1.5` declares `typescript >=6.0 <6.1`;
`typescript-eslint@8.46.2` declares `>=4.8.4 <6.0.0`. **The ranges do not
intersect**, so one workspace version is not achievable with the installed
toolchain — root stays 5.9.x for ESLint and the API build, `apps/web` stays 6.0.x
for the Angular compiler. Recorded in ADR-006 with the revisit trigger (a
`typescript-eslint` major supporting TypeScript 6). No lockfile change.

### F-12 — Documentation discoverability — ✅ RESOLVED

`README.md` now opens with a **Suggested review path**: a 10-minute route, a
longer tier grouped by concern, and a "Background, not required reading" tier —
phrased as a suggestion, never "ignore the rest". `docs/process/` is explicitly
framed as dated snapshots. An AI-residue sweep found none; `CLAUDE.md` and
`AGENTS.md` were confirmed against git history to be part of the **provided
repository's initial commit** and left untouched. No ADR or architecture document
was deleted.

---

## Category Assessments

**Angular 22 usage.** Current and intentional throughout: standalone, zoneless
(verified three ways), `OnPush` everywhere, new control flow, `host` object, an
honest `@defer`. No deprecated API in a full-tree scan.

**Signals.** Broad and correct use of `input()`, `output()`, `model()`,
`computed()`, `linkedSignal()` and `toSignal()`. `linkedSignal` for camera state
that must reset when the garden changes is exactly the right primitive. Zero
`untracked()` calls remain in production code.

**SignalStore.** The monotonic request-generation token is the store-level answer
to out-of-order responses that naïve store code usually gets wrong. Scoping is
deliberate: feature stores route-provided, the plants index root — and that index
now owns its own async lifecycle rather than being driven from components.

**RxJS.** Sparing and load-bearing: the retry/backoff interceptor is a stream
problem written as one, and `rxMethod` earns its place by making a structural
problem impossible rather than by looking modern.

**Domain modeling.** One capacity rule, mirroring the server's `>` comparison and
its self-exclusion on edit, with agreement between the domain and the map now
asserted by test. Humidity comparison consolidated to match.

**API / backend integration.** The contract was audited and the defects documented
rather than patched, which was correct given the instruction not to modify the
backend. Retry semantics were reasoned from the actual hook ordering — failure is
injected in `onRequest`, before the handler, which is what makes retrying writes
safe _here_ — and that distinction between this backend and general production
guidance is written down.

**Async UX / skeletons.** The strongest single aspect. Zero spinners in the
codebase. Skeletons mirror final layout, so no reflow on settle. A 150 ms appear
delay avoids flashing on fast responses. SWR keeps navigation instant on revisit —
now measured at zero requests, not merely claimed.

**UI, responsive, accessibility.** The weakest dimension at audit time is now
among the better-guarded: a hostile-content matrix across five viewports and three
routes, asserting containment as well as overflow. Heading outline clean across
seven page states; target sizes meet WCAG 2.2 AA.

**Performance.** 129.58 kB transfer initial, lazy routes, a real lazy chunk for
the map, CLS measured rather than assumed.

**Testing & Playwright.** A real pyramid, two projects (real API vs mocked), zero
retries, zero fixed waits — and, unusually, every guard added in this pass was
watched fail against the defective code before it was accepted.

**Security.** Clean: no secrets, no source maps in the production build, no
`innerHTML`/`bypassSecurityTrust` sinks, no `eval`, no localhost leak into the
bundle.

**Overengineering / underengineering.** Little of either. The treemap, retry
interceptor, request-generation token and SWR cache each pay for themselves
against this backend's behaviour. The one place effort had outrun return was
documentation volume, and that is now navigable rather than trimmed.

**Technical debt register.** Two items, both retained by decision with recorded
evidence and revisit triggers: the `@defer` trigger (F-07) and the TypeScript
split (F-11). Nothing else outstanding.

---

## Quality Gates — Measured After Remediation

Every gate re-run against the current tree; none quoted from documentation.

| Gate                              | Result                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint (api + web + web-e2e)        | **PASS** — 0 errors, 0 warnings                                                                                                                |
| Typecheck (api + web)             | **PASS** — strict + `strictTemplates`                                                                                                          |
| Unit / component                  | **PASS** — **166 passed, 22 files**                                                                                                            |
| E2E mocked, run 1                 | **PASS** — **66 passed**, `--retries=0`                                                                                                        |
| E2E mocked, run 2                 | **PASS** — **66 passed**, `--retries=0`, consecutive                                                                                           |
| E2E integration (real API)        | **PASS** — **6 passed**, `--retries=0`                                                                                                         |
| Production build                  | **PASS** — 485.81 kB raw / **129.58 kB transfer**                                                                                              |
| Bundle breakdown                  | garden-detail 35.06 · garden-map 12.29 · dashboard 7.72 · onboarding 5.32 · garden-list 3.88 · profile-dialog 1.83 · styles 3.89 (kB transfer) |
| Responsive                        | **PASS** — 375 / 768 / 1024 / 1440 / 1920, zero document overflow, zero component escapes                                                      |
| Accessibility                     | **PASS** — zero heading skips across 7 page states; breadcrumb 60 × 24                                                                         |
| CLS around the deferred map       | 0.025 (1440×900) · 0.000 (375×812)                                                                                                             |
| Spinners in codebase              | **0**                                                                                                                                          |
| Fixed waits in E2E suite          | **0**                                                                                                                                          |
| `untracked()` in production code  | **0**                                                                                                                                          |
| Source maps in prod build         | **0**                                                                                                                                          |
| Secrets / tokens / localhost leak | **0**                                                                                                                                          |

---

## Submission Gate

| Criterion                                                         | Status     |
| ----------------------------------------------------------------- | ---------- |
| Clones, installs and runs from a clean checkout                   | ✅         |
| All functional requirements implemented                           | ✅         |
| Both bonus requirements addressed (working code + written theory) | ✅         |
| Backend unmodified                                                | ✅         |
| All quality gates green                                           | ✅         |
| Production build clean and secret-free                            | ✅         |
| No P0 blockers                                                    | ✅         |
| No P1 items outstanding                                           | ✅         |
| No P2 items outstanding                                           | ✅         |
| Documentation numerically accurate                                | ✅         |
| No false framework claims in documentation                        | ✅         |
| **Cleared to send**                                               | ✅ **Yes** |

---

## Optional / Post-Case

Neither of these is an open item; both are decisions with a recorded trigger.

- **F-07** — revisit the `@defer` trigger only if the detail page's layout ever
  moves the map below the fold on desktop, at which point `on viewport` starts
  deferring on its own and nothing needs changing anyway.
- **F-11** — collapse to a single workspace TypeScript version once
  `typescript-eslint` ships a major supporting TypeScript 6.

---

## Closing Assessment

**Is this project ready to be sent to reviewers for a Lead / Principal Frontend
Architect position?**

Yes.

What the code demonstrates is the thing a Principal reviewer is actually looking
for: identifying the real problem in a brief and solving it at the right layer.
The brief said the backend is slow. The weak response is retries and a spinner.
This response treats latency as a UX problem, hides it behind skeletons that
don't reflow, dedupes and caches so the second visit costs nothing, and reasons
from the backend's actual hook ordering to establish that retrying writes is safe
here. That judgement is visible in the code, not just asserted in the docs.

What the remediation pass adds is a second, rarer signal. Of twelve findings,
nine were fixed, two were investigated and deliberately _not_ fixed with the
evidence written down, and one was withdrawn because the instrument that produced
it had changed what it was measuring. A reviewer can check any of those claims in
minutes, because each one names the measurement. The temptation in a pass like
this is to fix all twelve and report twelve fixes; the more useful outcome — and
the one here — is a repository where the remaining decisions are documented well
enough to be argued with.

The one caveat I would still raise, honestly: this codebase carries an unusual
amount of documentation for a take-home. That is now a navigable strength rather
than a wall, but a reviewer who dislikes documentation-heavy submissions will
still find it heavy. That is a matter of taste, not correctness — and the code
stands on its own without any of it.
