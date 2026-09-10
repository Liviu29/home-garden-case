# Async UX Standard — Skeleton-First, No Spinners

The design language for EVERY backend interaction is the gray skeleton/ghost.
Progress spinners, circular loaders and spinning button icons are banned — the
guardrail is `npm run check:no-spinners` (tools/check-no-spinners.mjs), and the
mutation e2e suite asserts zero spinner elements at runtime.

## The contract, by verb

| Verb                   | Feedback                                                                                                                                                                                                                                                           | Where it lives                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| **GET** (cold)         | content-shaped skeleton: header ghost, stat ghosts, card/row ghosts, map ghost — dimension-matched, zero layout shift                                                                                                                                              | `SkeletonGroup` + `Skeleton` primitives, per screen |
| **GET** (revalidation) | stale content stays readable (SWR); a failed refresh notes itself with a quiet info toast — content is never destroyed for a refresh                                                                                                                               | QueryCache + stores                                 |
| **POST**               | a **creation ghost** appears where the entity will land: ghost garden card in the grid, ghost plant row in the table, ghost bed on the map; the submit button swaps its label for a gray ghost bar and disables                                                    | `creating` / `pendingCreateArea` store state        |
| **PUT/PATCH**          | **localized replacement ghost**: only the affected row/card/plot/header grays out in place; everything else stays live                                                                                                                                             | `pendingUpdates` store state                        |
| **DELETE**             | **ghost-confirmed removal**: the entity stays visible as a gray, inert ghost until the server confirms, then leaves; on failure it resolves back with a retry toast. Nothing disappears before the server says so, and nothing double-triggers (per-entity guards) | `pendingDeletes` store state                        |
| **Error**              | reads: designed error state with Try again; mutations: the ghost resolves back into real content + error toast with retry; validation verdicts render inline in the form                                                                                           | error taxonomy (ERROR-HANDLING.md)                  |

Metrics (used/free/plants) stay truthful to _confirmed_ state: they update when
the mutation resolves, not while the ghost is showing — the ghost communicates
"in flight", the numbers never lie.

## One engine

A single visual system implements all of it:

- **Tokens**: `--skeleton-base` / `--skeleton-highlight` — NEUTRAL GRAY, never
  theme-tinted (light `#e4e7e7`/`#f4f5f5`, dark `#2b2e2e`/`#3b3f3f`), feeding
  `--gradient-skeleton-base` and the `--gradient-shimmer` sweep.
- **Primitives**: `shared/ui/skeleton/` (`Skeleton` variants line/title/circle/
  rect/card + `SkeletonGroup` timing wrapper + composed ghosts like
  `skeleton-garden-card`, `garden-map-skeleton`).
- **Mutation variant**: the global `.mutation-ghost` utility (grays content in
  place under the same shimmer) and `.btn-ghost` (the in-button bar) reuse the
  same tokens, gradient and `shimmer-sweep` keyframe — no second animation
  system. The SVG map expresses the same variant with its ghost palette
  (`.plot.mutating`, `.ghost-bed`) since DOM shimmer overlays don't reach into
  SVG paint.
- **Timing** (`SkeletonGroup`): 150 ms appear delay (cache hits never flash),
  300 ms minimum display (no blink); mutation ghosts appear instantly — the
  user just acted, feedback must be immediate.

## Accessibility

Skeleton visuals are `aria-hidden`; the affected container carries
`aria-busy="true"`; meaningful hidden status text names the operation
("Planting…", "Removing {plant}", "Creating garden", "Updating garden").
While a modal is open the CDK aria-hides the background, so the in-dialog
button status is what screen readers hear. Under `prefers-reduced-motion` the
shimmer collapses to a slow opacity pulse.

## Tested

`mocked/mutation-ghosts.spec.ts` delays each mutation class deterministically
and asserts: ghost appears → no spinner exists → ghost resolves into real
content (or back into it on failure paths covered by store specs). GET
skeletons are covered by the async-states suite; the repo-level spinner ban by
`check:no-spinners`.
