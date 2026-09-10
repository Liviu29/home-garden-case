# ADR-007 — Garden Map visualization engine: SVG over PixiJS

**Status**: Accepted · 2026-09-09

## Context

The Garden Detail screen gains an **Interactive Garden Map** — a lightweight digital
twin of the garden: the surface, each plant as a plot whose visual area tracks its
real `surfaceAreaRequired`, free soil, target humidity, pan/zoom, selection and an
inspector. This is closer to a 2D scene than a DOM layout, so a rendering engine
had to be chosen deliberately.

Constraints that shaped the decision:

- Angular 22, **zoneless** — no per-frame change detection, renderer must not leak
  into SignalStore/domain (STATE-MANAGEMENT.md ownership rules).
- Design system is **CSS custom properties** with a dark theme that is a pure token
  remap (DESIGN-SYSTEM §7).
- Hard accessibility bar: axe scans in both themes are part of the e2e gate.
- Deterministic Playwright tests; unit tests run in jsdom.
- Current production transfer size ≈ 130 kB — the budget discipline is a feature
  of this submission.

## Options considered

|                            | SVG (in Angular)                                    | Canvas 2D (hand-rolled)                       | **PixiJS 8.20 + pixi-viewport 6**                             | Konva 10     | Fabric 6       |
| -------------------------- | --------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------- | ------------ | -------------- |
| Scene scale it's built for | ≤ ~2k nodes                                         | any                                           | 10k+ sprites, WebGL                                           | 2–5k shapes  | design editors |
| Added lazy-chunk cost (gz) | **0 kB**                                            | 0 kB                                          | ~100–140 kB                                                   | ~50 kB       | ~90 kB         |
| Theme tokens (`var(--…)`)  | **native**                                          | resolved-color bridge + repaint on theme flip | same bridge                                                   | same         | same           |
| Accessibility              | **real DOM: focusable nodes, roles, axe-scannable** | aria-hidden + parallel DOM                    | aria-hidden + parallel DOM                                    | partial      | partial        |
| Zoneless fit               | events → signals, no ticker                         | own rAF loop                                  | own ticker (fine, but lifecycle to manage)                    | own loop     | own loop       |
| jsdom unit tests           | **yes**                                             | no (canvas stub)                              | no                                                            | no           | no             |
| Playwright assertions      | **real nodes**                                      | pixel-poking                                  | pixel-poking                                                  | pixel-poking | pixel-poking   |
| Text at high zoom          | **crisp (vector)**                                  | re-rasterize                                  | re-rasterize                                                  | re-rasterize | re-rasterize   |
| Destroy/leak surface       | none beyond DOM                                     | context + loop                                | `app.destroy()`, textures, viewport listeners, ResizeObserver | similar      | similar        |

## Decision

**SVG, rendered directly by Angular** (no wrapper library), behind a strict
boundary:

```
GardenDetailStore (signals: garden, plants, usedArea, freeArea…)
        ↓  plain data
GardenMap component (feature)
        ↓  computed
garden-map-layout.ts   — pure: view model + deterministic squarified-treemap layout
map-camera.ts          — pure: pan/zoom camera math (clamped viewBox)
        ↓  immutable rects in map units
<svg [viewBox]> template — the only place that knows it's SVG
```

A garden holds tens of plants, not tens of thousands of sprites. Every strength
PixiJS has (WebGL batching, filters, texture atlases) goes unused at this scale,
while every cost stays: a ~100 kB+ chunk, a CSS-variable→hex color bridge that
must re-render the scene on every theme flip, an `aria-hidden` canvas that forces
a duplicate DOM for accessibility, untestability in jsdom, and a
destroy-lifecycle to audit for leaks. SVG gives the same visual quality at this
node count with none of that — and the plant plots are _real focusable elements_,
so keyboard support and axe coverage come from the platform.

pixi-viewport's job (pan, wheel zoom, pinch, clamping, fit) is here a ~100-line
pure `MapCamera` class with unit tests — acceptable to own, since it is just
clamped viewBox arithmetic.

## Consequences

- **Bundle impact: zero.** The map still ships in its own deferred chunk
  (`@defer` in Garden Detail) so the screen's critical content renders first.
- **Determinism**: layout is a pure function of `(garden, plants)` — sorted by
  area desc then `plantId`, partitioned by a pure squarified treemap. No
  `Math.random()`; reopening a garden never rearranges it. Order-independence
  is unit-tested.
- **Renderer animation stays renderer-local**: hover/selection/grow-in are CSS
  on SVG nodes (gated by `prefers-reduced-motion`); signals change only on
  application state (selection, camera, layout) — never per animation frame.
- **Theme**: map colors are `--map-*` tokens consumed via CSS; dark mode costs
  nothing.
- **Stability contract** _(amended — see "The area-honesty amendment")_:
  layout is a pure function of the plant _set_. The treemap re-partitions when
  the set changes, but identical sets always produce identical layouts — a
  slow revalidation can never rearrange the garden. Unit-tested.
- **Style budget**: the scene stylesheet (soil, plots, HUD, inspector,
  toolbar, layers, planner chrome, tooltip, motion gates) compiles to ~11 kB,
  so the `anyComponentStyle` warning was raised 4→12 kB (error 8→16 kB). Deliberate:
  the map is the one scene-like component in the app, and minifying its source
  for a byte target would cost the maintainability the budget exists to protect.

## The visual layer (amendment)

The map later gained realism without touching the architecture: **geometry and
imagery are separate layers**. The layout's plot rect remains the honest
capacity footprint (rendered as a raised bed); _inside_ it, a presentational
layer draws original top-down botanical SVG symbols — resolved from plant
name/species by pure keyword heuristics (`plant-visual-resolver.ts`), tinted
via CSS custom properties, deterministically varied (seeded rotation, palette,
cluster jitter — no Math.random), and clustered with density proportional to
the honest area (one plant stays one plant in every number the app shows).
Images never determine capacity; capacity never reads image dimensions.

Local, original vector artwork was chosen over photographic assets
(ASSET-CREDITS.md): no licensing, no network, no CI instability, ~6 kB in the
lazy chunk, crisp at any zoom, theme-adjustable. This is also why no WebGL
engine became necessary — the richer scene is still tens of SVG nodes per
plant, well inside SVG's comfort zone, and every interactive element remains
real, focusable DOM.

## The area-honesty amendment: squarified treemap

The original layout was shelf packing with gutters and a uniform
shrink-to-fit. It preserved _relative_ areas, but at high occupancy the
shrink made the map lie about _absolute_ occupancy: a 98%-full garden could
render two-thirds empty lawn while the HUD said "0.5 m² free" — the exact
mismatch a reviewer spots in three seconds.

The engine was replaced by a **squarified treemap** (Bruls, Huizing, van
Wijk 2000), implemented as ~60 lines of pure TypeScript — no library:

- The garden surface is a fixed world whose area **is** `totalSurfaceArea`.
- The free region is an explicit right-hand strip whose area **is** the free
  area (annotated "Available · N m²", or a compact "+" marker when it is a
  sliver — 0.5 m² must be visible without pretending to be half the garden).
- The plants partition the remaining region; every cell's area equals the
  plant's real `surfaceAreaRequired`, exactly. `fitFactor` < 1 now occurs
  only for over-capacity gardens (total shrunk after planting) and scales all
  cells uniformly.

Unit tests assert drawn-occupied-fraction == used/total for 97.5%, 50% and
0% gardens, and an e2e verifies the 98% garden's HUD, free strip and marker
together. The trade-off accepted: add/delete re-partitions the map (the old
shelf layout kept earlier plants pinned while the fit scale was stable);
determinism per set is the contract that matters against this backend, and
it is preserved.

## The planner layer (amendment)

A later feature pass turned the map into an **interactive planner** — drag &
drop bed positioning, undo/redo, layer toggles, fullscreen, a ranked plant
catalog in the Add dialog — again without touching the architecture:

- **Positions are presentation, not domain.** Dragging moves a bed's _visual_
  override (`applyPositions()` in the pure layout module, clamped inside the
  garden); the plot's footprint size — the honest capacity area — is never
  editable by drag. Overrides live in versioned localStorage
  (`homeGarden.visualLayout.v1.<gardenId>`, corrupt-safe, pruned to living
  plants), not in the SignalStore domain state, so the backend contract and
  every capacity number stay untouched. This supersedes the earlier
  "drag-to-place rejected" note below: the progressive-enhancement path
  described there is exactly what was implemented once placement _did_ become
  a product requirement — the rejection's reasoning (no second source of truth
  for capacity) still holds and is enforced by the layer split.
- **Manual overlaps are allowed but flagged** (pure AABB `findOverlappingPlots`)
  as a visual warning only — the server's Σ area rule remains the sole
  authority on crowding.
- **SVG kept paying off**: drag is three pointer events feeding a signal; the
  layers menu is CSS class toggles; zoom-dependent label LOD is a `computed`.
  None of this needed a scene graph.

### 3D / Three.js: evaluated, deferred

The brief allowed an optional "Explore 3D" mode. Three.js (~150 kB+ gz lazy
chunk, WebGL context lifecycle, aria-hidden canvas needing a parallel DOM for
a11y, jsdom-untestable, theme bridge for CSS tokens) would re-import, for a
_second_ renderer, every cost the engine table above rejected — to show the
same honest data with no additional insight, in an assignment whose stated
values are budget discipline and testability. **Deferred deliberately.** The
seam it would plug into already exists and is the same one as the Pixi exit
strategy: a 3D mode is one sibling component consuming `GardenMapLayout` +
positions; nothing upstream would change. If shipped it would be `@defer`red
behind an explicit user action, renderer-only, with the plan view remaining
the accessible default.

## The fit amendment: the camera measures its stage

The world is drawn at a fixed 1.6 aspect (area-honest: `width × height` always
equals `totalSurfaceArea`), but the panel it lives in is a layout outcome —
wide on desktop, tall on mobile, the viewport's own shape in fullscreen. With
`preserveAspectRatio="meet"`, any mismatch letterboxes: on a 2.07-wide panel
the garden was pinned to ~46% of the width, padded with dead lawn on both
sides, and every zoom level inherited that margin.

Two changes, one outcome — zoom 1 means _"this garden fills this panel"_:

- **The stage takes the world's aspect ratio in CSS** (`aspect-ratio: 1.6`,
  capped by `max-height`), so the common case needs no measurement at all.
- **The camera's content box is grown to the stage's measured ratio** and
  centred on the garden, which covers the cases CSS cannot: fullscreen, mobile,
  and any layout where `max-height` binds. This is the one `ResizeObserver` in
  the engine; it feeds a signal, and the camera's reset source stays the _world_
  so resizing a window never snaps a zoomed-in gardener back to fit.

A related defect surfaced in the same pass: a stroke-width without
`vector-effect: non-scaling-stroke` is expressed in **map units**, and the
world is only ~5.7 units wide. The name-plate's `0.5px` border was rendering
69 px thick at fit and ten times that zoomed in. Every stroke in the scene is
now screen-constant, and an e2e guard sweeps the rendered SVG for any stroke
wider than 10 px so the next one is caught by a test rather than by eye.

## Exit strategy

The renderer depends only on `GardenMapLayout` (plain immutable rects in map
units) and `MapCamera` state. Swapping SVG for PixiJS later means rewriting one
component's template/host bindings against the same view model — domain, stores,
layout algorithm, camera math, tests for all of those, and the inspector/HUD
(plain DOM either way) are untouched. The reverse migration is equally cheap,
which is the point of the boundary.

## Related rejections (same feature)

- **Angular Pixi wrappers**: not evaluated further once Pixi itself was rejected;
  the standing rule (§43 of the feature brief) would have been a thin adapter
  around raw Pixi regardless.
- **Minimap**: at fit-zoom the whole garden is visible in one viewport and max
  zoom is 6×; navigation never gets lost enough to justify the chrome.
- **Drag-to-place plants** _(superseded — see "The planner layer" above)_: the
  original rejection reasoned that the backend has no coordinates and inventing
  client-persisted positions adds a second source of truth. When placement
  became a product requirement, the reserved progressive-enhancement path
  (localStorage `homeGarden.visualLayout.v1.<gardenId>`) was implemented with
  the same guardrail: positions are visual-only and never feed capacity.
- **Second view mode ("Capacity")**: plot area _is_ capacity in this layout;
  a toggle would show the same information twice. One clear view kept.
