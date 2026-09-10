# Loading Experience

The backend takes up to 2 s per call; the loading experience is therefore a designed system, not a spinner. Companion: [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md) §4–5, [PERFORMANCE-AND-CACHING.md](../architecture/PERFORMANCE-AND-CACHING.md).

## Hierarchy of loading states

1. **Nothing** — fresh cache hit: content renders instantly, no indicator at all. The best loading state is none; after first visit this is the common case.
2. **Skeleton ghosts** — cold or invalidated data: count-realistic, dimension-matched gray blocks with a shared shimmer sweep. Content areas never show spinners.
3. **Scoped progress** — mutations: the submit button itself shows "Saving…"; the rest of the screen stays live. No full-screen blocking, ever.
4. **Optimistic completion** — deletes: the item leaves the UI immediately; failure rolls back with an error toast + Try again.

## Timing rules (implemented in `SkeletonGroup`)

| Rule            | Value                                                      | Why                                                                     |
| --------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| Appear delay    | 150 ms                                                     | a cache hit resolving in <150 ms never flashes a skeleton               |
| Minimum display | 300 ms                                                     | once shown, a skeleton never blinks out — the swap reads as intentional |
| Shimmer period  | 1.4 s, one shared timeline                                 | all ghosts sweep in phase; no strobing                                  |
| Content entry   | crossfade + 8 px rise, 240 ms; lists stagger 40 ms (cap 8) | data "settles in" instead of popping                                    |

## Composition rule

One shimmer implementation, in the `Skeleton` primitive. Ghost layouts used from more than one screen become shape-only composites (`skeleton-garden-card`); single-use ghost layouts stay inline beside the template they mirror — co-location beats a parallel skeleton component tree that drifts (REM-014, deliberate). The Garden Map's ghost (`garden-map-skeleton`) is a named composite because it serves two states from one shape: the plants-loading branch _and_ the `@defer` placeholder while the map's lazy chunk arrives — frame, toolbar pill, ghost plots and HUD chips mirror the real silhouette, all built from the shared primitives.

## Layout stability

Skeleton composites mirror the exact final layout (3 ghost garden cards, 5 ghost table rows, dimension-matched header ghost) → zero layout shift when data lands. Bars/gauges animate `transform`/`stroke-dashoffset` only.

## Accessibility

The skeleton region is `role="status" aria-live="polite"` with visually-hidden "Loading…" text; ghost blocks are `aria-hidden`. Under `prefers-reduced-motion` the shimmer becomes a slow opacity pulse and entry animations collapse to fades.

## Anti-patterns we explicitly avoid

Full-screen spinner overlays; skeletons that don't match content shape; disabling the whole form while saving; blocking route navigation on data (navigation is skeleton-first — the route renders immediately and data streams in); indefinite spinners with no retry path.
