# Async UX — Skeleton-First, No Spinners

The backend takes up to 2 s per call and fails 10% of requests, so loading is a designed system,
not a spinner. The design language for **every** backend interaction is the gray skeleton or
ghost. Progress spinners, circular loaders and spinning button icons are banned — the guardrail is
`npm run check:no-spinners` (`tools/check-no-spinners.mjs`), and the mutation e2e suite asserts zero
spinner elements at runtime.

## Hierarchy of loading states

1. **Nothing** — a fresh cache hit renders instantly with no indicator at all. After the first visit
   this is the common case; the best loading state is none.
2. **Skeleton ghosts** — cold or invalidated data: content-shaped, dimension-matched gray blocks
   under one shimmer.
3. **In-place mutation ghosts** — only the affected element grays out; the rest of the screen stays
   live. No full-screen blocking, ever.
4. **Ghost-confirmed completion** — a deleted item stays as a gray, inert ghost until the server
   confirms, then leaves.

## The contract, by verb

| Verb                   | Feedback                                                                                                                                                                                                                                                                                                                                                                                  | Where it lives                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **GET** (cold)         | content-shaped skeleton: header, stat, card, row and planner ghosts — dimension-matched, zero layout shift. Data that arrives in parts keeps the missing part as a ghost of its own size: a garden before its plants shows ghost plant-derived numbers, and the dashboard ghosts its plant count and utilization until every garden's plants have landed — never a partial or fake number | `SkeletonGroup` + `Skeleton` primitives, per screen                    |
| **GET** (revalidation) | stale content stays readable (SWR); a failed refresh notes itself with a quiet info toast — content is never destroyed for a refresh                                                                                                                                                                                                                                                      | QueryCache + stores                                                    |
| **POST**               | a **creation ghost** where the entity will land: ghost garden card, ghost plant row, ghost bed on the plan; the submit button swaps its label for a gray ghost bar and disables. A newly created garden then glows briefly and scrolls into view, because it lands in its sorted place                                                                                                    | `creating` / `pendingCreateArea` store state                           |
| **PUT**                | **localized ghost**: only the affected row, card, bed or header grays out in place                                                                                                                                                                                                                                                                                                        | `pendingUpdates` store state                                           |
| **DELETE**             | **ghost-confirmed removal**: the entity stays visible, gray and inert until the server confirms, then leaves; on failure it resolves back with a Try again toast. Nothing disappears before the server says so, and nothing double-triggers (per-entity guards)                                                                                                                           | `pendingDeletes` store state                                           |
| **Error**              | reads: a designed error state with Try again — including a garden's plants — never a skeleton that loads forever; mutations: after the transparent retries, the ghost resolves back into real content plus an error toast (a failed create or edit keeps its dialog open with the input intact); validation verdicts render inline in the form                                            | [ARCHITECTURE §4.3](../architecture/ARCHITECTURE.md#43-error-taxonomy) |

Metrics (used, free, plant counts) stay truthful to **confirmed** state: they update when the
mutation resolves, not while the ghost shows. The ghost says "in flight"; the numbers never lie.

## One engine

`styles/_skeleton.scss` is the **only** place that defines a loading surface's gradient,
keyframes, radius, timing and reduced-motion behaviour. Features compose layout only.

- **Tokens** — `--skeleton-base` / `--skeleton-highlight`, neutral gray and never theme-tinted
  (light `#e4e7e7`/`#f4f5f5`, dark `#2b2e2e`/`#3b3f3f`), feeding `--gradient-skeleton-base` and the
  `--gradient-shimmer` highlight.
- **Engine classes** — every surface is a static gray base under one moving highlight:
  - `.skeleton-shimmer` — the block the `Skeleton` primitive renders;
  - `.mutation-ghost` — the real element grayed in place (a static veil; only the highlight moves);
  - `.btn-ghost` in a `.btn-stack` — the in-button bar. The label stays in the layout, only
    `visibility: hidden` while pending, so the button keeps its exact width;
  - `.skeleton-pulse` — the planner's SVG ghosts, since an HTML overlay cannot reach into SVG;
  - `.skeleton-appear` — the delayed appearance below.
- **Primitives** (`shared/ui/skeleton/`) — `Skeleton` (line / title / circle / rect, shape only),
  `SkeletonGroup` (the cold-load wrapper) and two composites used from more than one place:
  `skeleton-garden-card` and `garden-map-skeleton` (which serves both the plants-loading state and
  the `@defer` placeholder). Single-use ghost layouts stay inline beside the template they mirror —
  co-location beats a parallel skeleton tree that drifts.

## Timing

| Rule            | Value                                                                  | Why                                                                                               |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Appear delay    | `--skeleton-delay` 150 ms, then a `--dur-fast` fade-in (pure CSS)      | a response that beats 150 ms never paints a skeleton; the ghost reserves its space from frame one |
| Minimum display | none                                                                   | real content is never held back to "finish" a skeleton — it renders the moment it lands           |
| Shimmer period  | `--dur-shimmer` 1.4 s                                                  | a calm sweep; reduced motion swaps it for a 2.5 s in-place pulse                                  |
| Content entry   | fade + 8 px rise, `--dur-base`; lists stagger `--stagger-step` (cap 8) | data settles in instead of popping                                                                |

Mutation ghosts appear instantly: the user just acted, so feedback must be immediate.

## Layout stability

Skeleton composites mirror the final layout row for row — ghost garden cards carry the capacity
caption, track and status chip; ghost table rows sit under a ghost header; the detail header ghost
is built on the real header's classes — so nothing shifts when data lands (measured:
dashboard values and hero line 0 px difference; garden cards within 0.1 px except where a status
label's own width changes the wrap). Bars and gauges animate `transform` / `stroke-dashoffset` only.

## Accessibility

Skeleton visuals are `aria-hidden`. `SkeletonGroup` marks its host `aria-busy` and keeps a
persistent polite `role="status"` region whose text is its label ("Loading gardens") while loading
and empty afterwards — a live region inserted together with its text is often never announced. A
ghosted card or header is `aria-busy` and `inert` (no keyboard route to Edit or Delete on something
mid-mutation); hidden status text names each operation ("Planting…", "Creating garden", "Deleting
profile…"). While a modal is open the CDK hides the background from assistive tech, so the in-dialog
button status is what screen readers hear. Under `prefers-reduced-motion` the sweep becomes a slow
in-place pulse and the appear delay is kept — a delay is not motion.

## Tested

`mocked/mutation-ghosts.spec.ts` delays each mutation deterministically and asserts: the ghost
appears → no spinner exists → the ghost resolves into real content, and a mutation that keeps
failing resolves **back** into content with an actionable error. `mocked/async-states.spec.ts`
covers cold-load skeletons, the error → retry path (including a garden's plants), that a response
faster than the appear delay never renders a visible ghost (sampled every frame), and the
reduced-motion pulse.

## Anti-patterns avoided

Full-screen spinner overlays; skeletons that do not match the content's shape; disabling a whole
form while saving; blocking route navigation on data (navigation is skeleton-first — the route
renders immediately and data streams in); indefinite loading with no retry path.
