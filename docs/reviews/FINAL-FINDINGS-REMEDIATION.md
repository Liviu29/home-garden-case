# Final Architect Findings Remediation

Working record for the remediation pass against the audit of commit `d02addb`.
Each finding is tracked RED → FIX → VERIFY. Statuses are only promoted on
evidence recorded in this file.

**Allowed statuses:** `FIXED` · `RESOLVED BY DOCUMENTATION` ·
`INTENTIONALLY RETAINED — VERIFIED` · `INVALIDATED BY CURRENT ANGULAR 22 GUIDANCE`

## Summary

| ID   | Original severity | Final status                               | Production code changed?                     |
| ---- | ----------------- | ------------------------------------------ | -------------------------------------------- |
| F-01 | P1                | FIXED                                      | yes — `dashboard.scss`                       |
| F-02 | P2                | FIXED                                      | yes — store + two components                 |
| F-03 | P2                | RESOLVED BY DOCUMENTATION                  | **no** — finding was a measurement artifact  |
| F-04 | P2                | FIXED                                      | no — documentation only                      |
| F-05 | P2                | FIXED                                      | yes — one line, plus a §42 consolidation     |
| F-06 | P2                | FIXED                                      | no — test suite + config comment             |
| F-07 | P3                | INTENTIONALLY RETAINED — VERIFIED          | **no** — documentation corrected instead     |
| F-08 | P3                | FIXED                                      | yes — `EmptyState` + callers                 |
| F-09 | P3                | FIXED                                      | yes — `garden-detail.scss`                   |
| F-10 | P3                | INVALIDATED BY CURRENT ANGULAR 22 GUIDANCE | **no** — a false doc claim was fixed instead |
| F-11 | P3                | INTENTIONALLY RETAINED — VERIFIED          | **no** — evidence recorded in ADR-006        |
| F-12 | P3                | RESOLVED BY DOCUMENTATION                  | no                                           |

Nine fixed, two retained by decision with evidence, one withdrawn. Four findings
were resolved _without touching production code_, because in those cases the code
was right and the claim about it was wrong.

---

## F-01 — Dashboard horizontal overflow (P1)

**Status:** FIXED

**Baseline (RED).**
The audit reported document overflow with a long unbreakable garden name.
Re-measuring first showed the audit had _understated_ the defect. Instrumenting
the ancestor chain of `.health-name` produced:

| Viewport | Document overflow | `.health-top` width inside a `.health-card` |
| -------: | ----------------: | ------------------------------------------- |
|      375 |        **200 px** | 542 px inside a 360 px card                 |
|      768 |              0 px | **542 px inside a 360 px card**             |
|     1024 |              0 px | **542 px inside a 360 px card**             |
|     1440 |              0 px | **542 px inside a 369 px card**             |
|     1920 |              0 px | **542 px inside a 369 px card**             |

So the real defect is present at **every** viewport: card content escapes its
own card by ~180 px. It only reaches the _document_ edge at 375 px, where the
card sits against the page gutter. A document-level assertion therefore could
never have caught it at desktop widths — which is why this needed two guards,
not one.

Root cause: `.health-name` is a flex item and `.health-top` a grid item; both
default to `min-width: auto`, whose automatic minimum size refuses to shrink
below the content's intrinsic minimum. An unbreakable token has no soft wrap
opportunity, so `text-overflow: ellipsis` never engages and the row forces its
ancestors wider instead. The same trap existed in the Attention Center
(`.attention-name` had no truncation at all).

**Change.**

- `apps/web-e2e/src/mocked/responsive.spec.ts` — added a hostile-content
  matrix (375 / 768 / 1024 / 1440 / 1920 × dashboard / gardens / garden detail)
  driven by unbreakable garden, plant and species names at 100 % capacity and
  extreme humidity, asserting _both_ zero document overflow and zero
  component-boundary escapes.
- `apps/web/src/app/features/dashboard/dashboard.scss` — `min-width: 0` on
  `.health-top`, `.health-name`, `.health-meta`, `.health-humidity` (and its
  children) and `.attention-top`; `grid-template-columns: minmax(0, 1fr)` on
  `.health-card` and `.attention-body`; `overflow-wrap: anywhere` on the body
  copy that reads better wrapped than truncated; `flex: none` on
  `.attention-badge`; ellipsis truncation on `.attention-name`.

No `overflow-x: hidden` was used anywhere — the layout is fixed, not masked.

**Tests.**

- RED 1 (document overflow, old CSS, 375 px): `Expected: 0  Received: 200`
- RED 2 (containment, old CSS, 1440 px): `Expected: 0  Received: 16`
  — the case the document-level assertion passes while the layout is broken.
- GREEN: `17 passed` across the full responsive spec.

**Result.**
Zero document overflow and zero component escapes at 375 / 768 / 1024 / 1440 /
1920 across `/dashboard`, `/gardens` and `/gardens/:id`. Visual inspection with
ordinary garden names at 1440 and 375 shows no regression to the KPI row,
Attention Center or Garden Health grid.

---

## F-04 — Documented metric drift (P2)

**Status:** FIXED

**Baseline.** A sweep of every reviewer-facing document for numeric claims
(`grep` for test/spec counts, kB figures, file counts, percentages) rather than
just the four values the audit named. The claims split into three groups:

1. **Current-state claims that had drifted** — `PRODUCTION-READINESS.md` gate
   table ("156 tests, 22 files", "46 tests", "6 flows"), README ("25 specs" for
   the layout/camera modules), and the production bundle table.
2. **Approximate architectural figures that are still true** — "~130 kB
   transfer", "~12 kB gz map chunk", "~100 kB-smaller than PixiJS". These carry
   the architectural argument and are stated as approximations, so they stay.
3. **Dated snapshots inside `docs/process/`** — the implementation plan,
   remediation log and cleanup log each record what was true at the time
   ("gates after this epic: …"). These are a historical record, not a claim
   about the current tree, and rewriting them would falsify the history.
   `PRINCIPAL-REVIEW.md` already flags its own count as outdated, which is the
   log behaving correctly.

**Change.**

- `PRODUCTION-READINESS.md` — the three brittle count cells now state the
  outcome and name the command that produces the current number, so they cannot
  drift again. The bundle table keeps exact figures (they carry the budget
  argument) and was regenerated from a fresh production build (see the final
  gate section).
- `README.md` — "pure TS with 25 specs" → the properties those specs assert,
  which is what a reviewer actually wants to know.
- `docs/process/` left as the dated record it is; the docs index now frames it
  that way explicitly (see F-12).

**Result.** No current-state document asserts a count that the repository
contradicts. Where an exact number remains it is either regenerated from this
run or explicitly approximate.

---

## F-05 — Duplicate capacity arithmetic (P2)

**Status:** FIXED

**Baseline.** The audit named one line. A full sweep for `surfaceAreaRequired`
/ `totalSurfaceArea` / `reduce(` across the frontend classified every site:

| Site                         | Classification                                                            |
| ---------------------------- | ------------------------------------------------------------------------- |
| `garden-map-layout.ts:80`    | **DUPLICATE BUSINESS CALCULATION** — the only one                         |
| `dashboard.ts:170`           | authoritative — delegates to `usedSurfaceArea`                            |
| `dashboard.ts:166`           | portfolio total across gardens (different concept, not the capacity rule) |
| `garden-mini-preview.ts:99`  | valid visual transform — per-plant share, not an aggregate                |
| `garden-map.ts:359–362, 431` | authoritative — `usedSurfaceArea` / `freeSurfaceArea` / `occupancyRatio`  |
| `garden-map-layout.ts:102`   | valid visual transform — per-plot share                                   |

So the hole was exactly one line wide, which is worth stating precisely: the
single-source claim was true everywhere else.

**Change.**

- `garden-map-layout.ts` now imports and calls `usedSurfaceArea(ordered)`.
- `garden-map-layout.spec.ts` gained a `capacity single source of truth (F-05)`
  block asserting that the map's **drawn** occupancy equals
  `occupancyRatio(...)` from the domain module at 0 %, 50 %, 97.5 %, 100 %,
  decimal areas and over-capacity (where drawn clamps at 100 % while the domain
  ratio exceeds 1), plus the edit-excludes-self case.

**Tests.**

- RED: replacing the call with a subtly divergent expression
  (`Math.round` per plant) fails **3 tests** — the two fractional-area
  agreement cases and the pre-existing free-strip test.
- GREEN: full unit suite passes.

**Result.** The map can scale capacity (`fitFactor`) but can no longer compute
it. Divergence is now a test failure rather than a silent drift.

---

## F-09 — Breadcrumb target size (P3)

**Status:** FIXED

**Baseline (RED).** Measured at runtime against the pre-fix stylesheet:
`breadcrumb link box: 52x20 FAIL` — below the 24 × 24 px minimum of WCAG 2.2
SC 2.5.8 (AA).

**Change.** `garden-detail.scss` — the breadcrumb link becomes an inline-flex
box with `min-height: 24px` and horizontal padding, offset by an equal negative
inline margin so the row's visual rhythm is unchanged. No pseudo-element hit
areas, so no overlapping targets; the separator and current-page label are not
interactive. The `nav` also gained `aria-label="Breadcrumb"`.

**Tests.** Runtime measurement, desktop and mobile.

**Result.** `breadcrumb link box: 60x24 PASS (>=24)`. Visually identical.

---

## F-08 — Heading hierarchy (P3)

**Status:** FIXED

**Baseline (RED).** Runtime outline extraction against the pre-fix templates:

```
/gardens (with gardens)  SKIPS: h1→h3 at "Backyard Beds"
/gardens (empty)         SKIPS: h1→h3 at "No gardens yet"
```

Two causes, not one: `EmptyState` defaulted to `h3`, **and** the garden cards
themselves were `h3` directly under the page `h1`. The audit only spotted the
first.

**Change.**

- `EmptyState.headingLevel` widened from `1 | 3` to `1 | 2 | 3` with a
  `@switch`. The default stays `3` (nested in a section that owns an `h2`),
  and the visual size stays pinned to `.title`, so semantic level and typography
  remain independent — §16's requirement.
- Every caller audited and placed by its real position in the outline:
  `/gardens` and `/dashboard` page-level empty states → `2`; garden-detail's
  _not found_ / _couldn't load_ branches → `1` (they render **instead of** the
  page `h1`); the plants-panel empty state stays `3` (its panel has an `h2`);
  the 404 page stays `1`.
- Garden card titles `h3` → `h2`, class unchanged.

**Tests.** Runtime outline extraction across seven page states.

**Result.**

```
/gardens (with gardens)      h1:Gardens | h2:Backyard Beds            SKIPS: none
/gardens (empty)             h1:Gardens | h2:No gardens yet           SKIPS: none
/dashboard                   h1:Good morning | h2:Needs attention | h2:Garden health   SKIPS: none
/dashboard (empty)           h1:Good morning | h2:No gardens yet      SKIPS: none
/gardens/1                   h1:Backyard Beds | h2:Garden plan | h2:Plants             SKIPS: none
/gardens/999 (not found)     h1:Garden not found                      SKIPS: none
/404                         h1:This patch is empty                   SKIPS: none
```

---

## F-06 — Fixed Playwright wait (P2)

**Status:** FIXED

**Baseline.** A suite-wide search for `waitForTimeout` / `setTimeout` / `sleep`
found 16 hits, which split cleanly into the two categories §19 asks for:

- **SIMULATED NETWORK DELAY (14 hits)** — `setTimeout` _inside_ `page.route`
  handlers, reproducing the backend's 200–2000 ms latency. These are the
  test's controlled input, not the test waiting. Legitimate; kept.
- **TEST WAITING FOR TIME TO PASS (2 hits)** — the reported
  `contract-resilience.spec.ts:52` `waitForTimeout(3000)`, and a second one the
  audit missed: `welcome.spec.ts:62`, a 20-iteration × 50 ms sampling loop.

**Change.**

- `contract-resilience.spec.ts` — the test wants the _abandoned_ garden-1
  response to land so it can prove the stale response never replaces the
  current screen. It now arms `page.waitForResponse('**/api/gardens/1')`
  **before** navigating and awaits that exact event, then yields two animation
  frames so the app can react. Deterministic, and it finishes as fast as the
  machine can paint rather than always costing 3 s.
- `welcome.spec.ts` — the sampling loop is replaced by a `MutationObserver`
  installed via `addInitScript` that records whether `.zero-state` was _ever_
  in the DOM. This is strictly stronger than the loop it replaces: an observer
  sees every intermediate state, where 20 timed samples see 20 of them.
  (Positive control: `.zero-state` is confirmed present in
  `onboarding.html:133`, so the assertion cannot pass vacuously.)
- `playwright.config.ts` — the policy comment now states what is actually true:
  zero `waitForTimeout` in the suite, and `setTimeout` only inside route
  handlers as simulated latency.

**Tests.** `16 passed` across both affected specs.

**Result.** `waitForTimeout` count in the suite: **0**. The config's stated
policy and the suite now agree, which was the real finding.

---

## F-11 — TypeScript version skew (P3)

**Status:** INTENTIONALLY RETAINED — VERIFIED

**Baseline.** Root declares `typescript ~5.9.2` (resolves 5.9.3); `apps/web`
declares `~6.0.2` (resolves 6.0.3). npm workspaces hoists correctly:
`apps/web/node_modules/typescript` is 6.0.3, the root copy is 5.9.3.

**Investigation.** Rather than aligning by guesswork (§20), I read the declared
peer ranges of the two tools that consume TypeScript:

| Package                        | Peer range                  | Consequence                    |
| ------------------------------ | --------------------------- | ------------------------------ |
| `@angular/compiler-cli@22.1.5` | `typescript >=6.0 <6.1`     | `apps/web` **must** be 6.0.x   |
| `typescript-eslint@8.46.2`     | `typescript >=4.8.4 <6.0.0` | the linter **must not** be 6.x |

**The ranges do not intersect.** A single workspace TypeScript version is not
achievable with the installed toolchain. Raising the root to 6.0.x would put
`typescript-eslint` outside its supported range; lowering `apps/web` to 5.9
would put the Angular compiler outside its own. Either "fix" trades a
documented, working split for an undocumented, unsupported one.

**Change.** No version change. `ADR-006` now records the constraint, the
evidence, and the revisit trigger (a `typescript-eslint` major supporting
TypeScript 6, at which point the split collapses on its own).

**Result.** Lockfile untouched, no install drift. This finding was correct to
raise and wrong to fix — which is worth stating plainly, because "align the
versions" was the obvious-looking action.

---

## F-03 — "1–2 redundant GETs per screen visit" (P2)

**Status:** RESOLVED BY DOCUMENTATION — **the finding was a measurement artifact**

**Baseline.** §22 says not to assume the audit's theory of cause is complete.
It was worse than incomplete: instrumenting `page.on('request')` across the
real navigation paths shows **no duplicates at all**.

```
cold load /dashboard      1 GET /api/users/999 · 1 /api/gardens
                          1 /api/plants/garden/{1,2,3}
navigate to /gardens      (no requests)
back to /dashboard        (no requests)
open /gardens/1           1 /api/gardens/1 · 1 /api/plants/garden/1
```

**What the audit actually measured.** Three candidate causes were probed:

| Probe                                           | Result                                                         |
| ----------------------------------------------- | -------------------------------------------------------------- |
| Hover a card (prefetch directive) then click it | **1** request — prefetch and load collapse via in-flight dedup |
| Two `page.goto()` calls in a row                | **DUP ×2 on everything**                                       |
| Revisit after the 30 s TTL                      | 1 background revalidation per key                              |

The second row is the artifact. `page.goto()` is a **full page load**: it boots
a new application instance and destroys the in-memory cache, so "twice" is two
independent sessions each making one request — not one screen making two. The
original audit walked the app with `goto` per route, which manufactures exactly
the pattern it then reported. The third row is the documented SWR contract,
which §59 explicitly says not to count as a duplicate.

I wrote the original finding, so I want to state the correction plainly rather
than quietly dropping it: **F-03 described a defect that does not exist, caused
by an instrument that changed what it was measuring.**

**Change.** No production code was changed for this finding. What the finding
_did_ earn is a durable guard, per §25:
`apps/web-e2e/src/mocked/request-ownership.spec.ts` asserts the request-count
semantics as behaviour — exactly one request per resource on a cold session,
**zero** on client-side navigation with a fresh cache — and the spec header
documents the cold / fresh / stale contract and names the single owner of each
fetch (`GardensStore` → `/gardens`, `PlantsIndexStore` → `/plants/garden/:id`
for list and dashboard, `GardenDetailStore` → the detail reads).

**Tests.** `1 passed`. The guard fails if any screen ever issues a second
request for a key it already holds.

**Result.** Request ownership is now asserted rather than asserted-about.

---

## F-02 — Effect-driven plant fan-out with load-bearing `untracked()` (P2)

**Status:** FIXED

**Baseline.** `garden-list.ts:64` and `dashboard.ts:82` each ran an
`effect()` that read the garden list, issued N HTTP requests and wrote results
into the root `PlantsIndexStore`. Because the store's warm-cache path read
`byGarden()` and wrote it in the same synchronous pass, the effect registered
its own write as a dependency of its own read — so `untracked()` at
`plants-index-store.ts:50` and `:62` was **load-bearing**: remove it and the
renderer froze. That is the smell: `untracked()` should be an incidental read,
not the thing that makes a loop terminate.

**Change — ownership, not technology.** The component's job is now to _declare
a source_; the store's job is to own the async fan-out lifecycle.

- `PlantsIndexStore.loadFor(ids)` → `ensureForGardens`, built with `rxMethod`.
- Components: no `effect()` at all. Each declares
  `gardenIds = computed(() => …)` and calls
  `this.plantsIndex.ensureForGardens(this.gardenIds, { injector })` once in its
  constructor. The explicit injector ties the subscription to the _component's_
  lifetime, not the root store's.
- Both `untracked()` calls **deleted**. `grep -rn "untracked" apps/web/src`
  now matches only prose in comments — zero calls in production code.

**Why `rxMethod` and not a plain store method (§28).** Not for novelty — for
two concrete properties. First, its handler runs inside a _subscription_
rather than a reactive consumer, so the read→write self-dependency cannot
exist by construction; that is what let the `untracked()` calls be deleted
rather than relocated. Second, `rxMethod` accepts a signal, an observable _or_
a plain value, so the reactive callers (list, dashboard) and the one-shot
imperative caller (`garden-form-dialog`, which needs one garden's plants for
the shrink warning) share **one** API instead of two. A `distinctUntilChanged`
on the id list was added as a bonus: a recomputed source that yields the same
ids no longer re-runs the fan-out.

The existing race-safety design was preserved deliberately (§43): each response
still applies to its own `gardenId` key, and `apply` remains an
identity-checked no-op for unchanged data.

**Tests.** The old regression spec asserted the _old_ contract, so it was
rewritten to assert the new one, and two race/efficiency specs were added:

- warm-cache fan-out driven by a signal source must not loop — and must issue
  **zero** network calls;
- an unchanged garden list must not re-run the fan-out, while a genuinely new
  garden must;
- a stale garden collection landing late must not clobber the current one
  (collection A in flight → source becomes B → A resolves; B stays intact).

Unit suite: **166 passed / 22 files**. Runtime network trace after the
refactor is byte-identical to before it — the restructure changed ownership,
not behaviour.

**Result.** Components hold no fan-out logic and write to no shared store; the
data layer owns the request workflow; the `untracked()` workaround is gone
rather than moved.

---

## F-07 — `@defer` block inside the initial viewport (P3)

**Status:** INTENTIONALLY RETAINED — VERIFIED

**Baseline (re-measured after all UI changes — §31, not the audit's old coordinates).**

| Viewport    | "Garden plan" heading top | Inside initial viewport? |   CLS |
| ----------- | ------------------------: | ------------------------ | ----: |
| 1440 × 900  |                    369 px | **yes**                  | 0.025 |
| 1920 × 1080 |                    369 px | **yes**                  |     — |
| 375 × 812   |                    590 px | yes                      | 0.000 |

So the audit's observation is correct: on a desktop viewport the `on viewport`
trigger fires immediately and the `prefetch on idle` never gets a chance to
help.

**Decision — keep the trigger, fix the claim.** Three reasons, all measured:

1. **The chunk boundary is the real, verified benefit.** The production build
   emits `garden-map` as its own lazy chunk at **49.60 kB raw / 12.29 kB
   transfer**, out of the detail route's bundle. That is worth having whether
   or not the render is delayed.
2. **The trigger is self-tuning.** `on viewport` defers on viewports where the
   map genuinely starts off-screen and fires at once where it doesn't. Swapping
   it for `on idle` or `on interaction` would _delay the showcase screen's
   centrepiece_ on desktop — a worse experience traded for a more impressive-
   sounding trigger. §33 explicitly warns against that.
3. **Hydration is shift-free.** The dimension-matched ghost holds CLS at 0.025
   (1440 × 900) and 0.000 (375 × 812), both far inside the 0.1 "good" threshold.

**Change.** No behavioural change. Three places that overstated the benefit now
describe the measured one: the template comment at the `@defer` site,
`README.md`, and `PERFORMANCE-AND-CACHING.md`. They now say "lazy chunk
boundary", not "the screen's critical content never waits" — because on desktop
it doesn't wait, it just wasn't waiting for the reason the docs implied.

**Result.** The mechanism is unchanged and the documentation is now accurate,
which was the actual defect.

---

## F-10 — No explicit `provideZonelessChangeDetection()` (P3)

**Status:** INVALIDATED BY CURRENT ANGULAR 22 GUIDANCE — plus a real documentation defect found

**Baseline.** Angular 22 is zoneless by default; the provider is available and
stable but is **not** what enables zoneless behaviour. Verified independently:

- `zone.js` is not a dependency of this workspace at all — absent from
  `node_modules` entirely, so it cannot be loaded even accidentally.
- No zone polyfill entry in `angular.json`.
- Zero references to `NgZone`, `provideZoneChangeDetection`, or
  `provideZonelessChangeDetection` anywhere in `apps/web/src`.
- No `detectChanges()` / `markForCheck()` hand-cranking masking a reactivity bug.

So the absence the audit flagged is not a defect, and adding the provider would
assert something false about Angular 22.

**But the finding did surface a real one.** Chasing it turned up
`docs/CODING-GUIDELINES.md:8`, which stated:

> **Zoneless** change detection (`provideZonelessChangeDetection()`)

The application makes no such call. That is exactly the false framing §58
prohibits, and it was in a reviewer-facing document — a reviewer who greps for
the provider on the strength of that line finds nothing and reasonably concludes
the docs are unreliable. Worth noting that the audit filed this backwards: it
proposed adding code to match a doc, when the doc was the thing that was wrong.

**Change.** No provider added. Instead:

- `app.config.ts` carries a block comment explaining that zoneless is the
  Angular 22 default, that the omission is deliberate, and what actually proves
  zoneless operation. A reviewer grepping `app.config.ts` now finds the answer.
- `CODING-GUIDELINES.md` corrected to state the truth.

**Result.** Zoneless verified three ways; no false claim survives in the docs.

---

## F-12 — Documentation discoverability (P3)

**Status:** RESOLVED BY DOCUMENTATION

**Baseline.** 33 markdown files, ~4,000 lines, no index and no entry point. The
material is good, which is why the finding was P3 — but a time-boxed reviewer
had no signposted route through it.

**Change.**

- `README.md` opens with a **Suggested review path**: a 10-minute route (README
  → ARCHITECTURE → the ADRs, with ADR-004 and ADR-007 called out as the ones
  carrying the most weight), a "if you have longer" tier grouped by concern, and
  a **"Background, not required reading"** tier. Phrased as a suggested path,
  never "ignore the rest" (§37).
- `docs/process/` is now explicitly framed as **dated snapshots** — the working
  record of how the build proceeded, describing the state at the time of
  writing rather than the current tree. That single sentence resolves the
  tension behind F-04: those files are allowed to contain historical numbers
  precisely because they are labelled as history.

**AI-residue sweep (§38).** `grep` across `docs/` for prompt-like content,
assistant instructions and scratchpad language returned nothing except this
review set. `CLAUDE.md` and `AGENTS.md` at the repo root were checked against
git history and are **part of the provided repository's initial commit** (Nx's
own generated guidance, shipped by In The Pocket) — not residue from this work,
and therefore left untouched. No ADR or architecture document was deleted.

**Result.** Same material, navigable in the first thirty seconds.

---

## Additional consolidation found during §42

Not one of F-01…F-12, but the same class of issue as F-05 and worth recording.

Sweeping the other "single source" claims (shimmer keyframes, error mapping,
confirm dialog, plant-visual resolver, motion tokens) found them all genuinely
single-source — **except** the per-plant humidity comparison
`plant.idealHumidityLevel - garden.targetHumidityLevel`, which was written out
inline in three places (`garden-detail.ts:174`, `garden-map.ts:259`, `:441`)
while `garden-insights.ts` already owned every other domain calculation.

Added `plantHumidityDelta(garden, plant)` to `garden-insights.ts` and pointed
all three call sites at it. `grep -rn "idealHumidityLevel - "` now returns
exactly one match: the definition. Deliberately kept small — no broad refactor,
per §42.
