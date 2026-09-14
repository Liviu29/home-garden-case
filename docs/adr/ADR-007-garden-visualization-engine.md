# ADR-007 — Garden Map visualization engine: SVG over PixiJS

**Status**: Accepted · 2026-09-09

## Context

The Garden Detail screen centres on an **interactive Garden Map** — a lightweight
digital twin of the garden: the surface, each plant as a bed whose drawn area is
its real `surfaceAreaRequired`, free soil, target humidity, pan/zoom, selection, an
inspector and planner tools (drag, undo, layers, fullscreen). This is closer to a
2D scene than a DOM layout, so a rendering engine had to be chosen deliberately.

Constraints that shaped the decision:

- Angular 22, **zoneless** — no per-frame change detection, renderer must not leak
  into SignalStore/domain (ARCHITECTURE.md §5 ownership rules).
- Design system is **CSS custom properties** with a dark theme that is a pure token
  remap (DESIGN-SYSTEM §7).
- Hard accessibility bar: axe scans in both themes are part of the e2e gate.
- Deterministic Playwright tests; unit tests run in jsdom.
- Production initial transfer ≈ 130 kB gz, held by build-enforced budgets.

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
map-camera.ts          — pure: pan/zoom camera math (clamped viewBox), the stage
                         keyboard, screen ↔ map units
map-gestures.ts        — pure: the pointer machine (tap, pan, pinch, bed drag)
timeline-replay.ts     — the planting timeline's state and playback (signals)
plan-rows.ts           — pure: the plan as rows of text
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
- **Stability contract**: layout is a pure function of the plant _set_. The
  treemap re-partitions when the set changes, but identical sets always produce
  identical layouts — a slow revalidation can never rearrange the garden.
- **Renderer animation stays renderer-local**: hover/selection/grow-in are CSS
  on SVG nodes (gated by `prefers-reduced-motion`); signals change only on
  application state (selection, camera, layout) — never per animation frame.
- **Theme**: map colors are `--map-*` tokens consumed via CSS; dark mode costs
  nothing.
- **Style budget**: the scene used to be one component whose stylesheet (~13 kB)
  sat above the 12 kB `anyComponentStyle` warning. The controls around the scene
  are now their own presentational components — `MapToolbar`, `MapHud`,
  `MapLayersPanel`, `MapTimeline`, `MapPlanList`, next to the existing
  `MapInspector` — sharing one glass/button partial (`_map-controls.scss`), and
  the pure view builders live in `garden-map-view.ts`. Every stylesheet is under
  the warning again.
- **One component, one job**: `GardenMap` keeps the scene, the camera and the
  planner state, and is the only unit that touches the DOM. What does not need
  the DOM is its own unit with its own spec: the pointer machine
  (`MapGestures` turns pointer samples into pan/pinch/drag intents), the
  timeline replay (`TimelineReplay`: days, the day in view, playback), the
  plan rows (`buildPlanRows`), the stage keyboard and the screen ↔ map maths
  (`map-camera.ts`). The component went from 1,060 lines to ~840, and every
  planner behaviour is still asserted through the DOM, as a gardener would
  drive it.

## Layout: a squarified treemap

What the HUD says is what the eye sees. A uniform shrink-to-fit packing would
keep _relative_ areas but misstate _absolute_ occupancy — a 98%-full garden could
draw as two-thirds empty lawn while the HUD says "0.5 m² free". The layout is
therefore a **squarified treemap** (Bruls, Huizing, van Wijk 2000), ~60 lines of
pure TypeScript — no library:

- The garden surface is a fixed world whose area **is** `totalSurfaceArea`.
- The treemap partitions it into one cell per plant **plus the free soil**;
  every cell's area equals the real m², exactly — the plant's
  `surfaceAreaRequired`, or the free area (annotated "Available · N m²" where
  the label fits, else a compact "+" marker — 0.5 m² must be visible without
  pretending to be more). `fitFactor` < 1 occurs only for over-capacity
  gardens (total reduced after planting) and scales all cells uniformly.
- Because the free soil takes part in the partition, a small plant beside large
  ones pairs with it instead of becoming a sliver, and every bed stays near
  square. Squarify lays the largest cell first (top-left) — in a young garden
  that is the free soil — so the layout is mirrored to keep the free cell toward
  the bottom-right: beds start top-left, room to grow sits where the eye ends.
  Mirroring preserves every area and adjacency.
- A **young garden** (under 70% full) gives its beds a near-square **block of
  their own** in the top-left corner — the beds plus 30% slack, which pairs with
  small beds exactly as the free cell does — and leaves the rest of the surface
  open to the right and below. Without it, one huge free cell would take a
  near-square block and squeeze the beds into the strip beside it (a 1 m² bed in
  a 25 m² garden would draw as a 20 cm × 4 m bar). The free soil is then 1–3
  cells (`freeCells`; `freeBand` is the largest, where "Available" is labelled);
  beds and free cells still tile the surface exactly. At 70% and above the block
  is not used.

Unit tests assert drawn-occupied-fraction == used/total for 97.5%, 50% and
0% gardens, and an e2e verifies the 98% garden's HUD, free cell and marker
together. Trade-off accepted: adding or deleting a plant re-partitions the map;
determinism per plant set is the contract that matters against this backend.

## The visual layer

**Geometry and imagery are separate layers.** The layout's plot rect remains the
honest capacity footprint (rendered as a raised bed); _inside_ it, a
presentational layer draws original top-down botanical SVG symbols — resolved
from plant name/species by pure keyword heuristics (`plant-visual-resolver.ts`),
tinted via CSS custom properties, deterministically varied (seeded rotation,
palette, cluster jitter — no Math.random), and clustered with density
proportional to the honest area (one plant stays one plant in every number the
app shows). Images never determine capacity; capacity never reads image
dimensions.

Local, original vector artwork was chosen over photographic assets: no
licensing, no network, no CI instability, ~6 kB in the lazy chunk, crisp at any
zoom, theme-adjustable. The richer scene is still tens of SVG nodes per plant,
well inside SVG's comfort zone, and every interactive element remains real,
focusable DOM.

## The planner layer

The map is also an **interactive planner** — drag & drop bed positioning,
undo/redo, layer toggles, fullscreen, a ranked plant catalog in the Add dialog —
built on the same boundary:

- **Positions are presentation, not domain.** Dragging moves a bed's _visual_
  override (`applyPositions()` in the pure layout module, clamped inside the
  garden); the plot's footprint size — the honest capacity area — is never
  editable by drag. Overrides live in versioned localStorage
  (`homeGarden.visualLayout.v2.<gardenId>`, corrupt-safe, pruned to living
  plants), not in the SignalStore domain state, so the backend contract and
  every capacity number stay untouched. The backend has no coordinates; keeping
  positions visual-only is what stops them becoming a second source of truth
  for capacity.
- **Manual overlaps are allowed but flagged** (pure AABB `findOverlappingPlots`)
  as a visual warning only — the server's Σ area rule remains the sole
  authority on crowding.
- **SVG keeps paying off**: drag is three pointer events feeding a signal; the
  layers menu is CSS class toggles; zoom-dependent label LOD is a `computed`.
  None of this needs a scene graph.

## Fitting the stage

The world is drawn at a fixed 1.6 aspect (area-honest: `width × height` always
equals `totalSurfaceArea`), but the panel it lives in is a layout outcome —
wide on desktop, tall on mobile, the viewport's own shape in fullscreen. With
`preserveAspectRatio="meet"` alone, any mismatch letterboxes the garden inside
dead lawn at every zoom level. Zoom 1 therefore means _"this garden fills this
panel"_:

- **The stage takes the world's aspect ratio in CSS** (`aspect-ratio: 1.6`,
  capped by `max-height`), so the common case needs no measurement at all.
- **The camera's content box is grown to the stage's measured ratio** and
  centred on the garden, which covers the cases CSS cannot: fullscreen, mobile,
  and any layout where `max-height` binds. This is the one `ResizeObserver` in
  the engine; it feeds a signal, and the camera's reset source stays the _world_
  so resizing a window never snaps a zoomed-in gardener back to fit.

Strokes are screen-constant. A stroke-width without
`vector-effect: non-scaling-stroke` is expressed in **map units**, and the world
is only ~5.7 units wide, so a `0.5px` border would render tens of pixels thick.
Every stroke in the scene is non-scaling, and an e2e guard sweeps the rendered
SVG for any stroke wider than 10 px.

### 3D / Three.js: evaluated, deferred

An optional "Explore 3D" mode was considered. Three.js (~150 kB+ gz lazy
chunk, WebGL context lifecycle, aria-hidden canvas needing a parallel DOM for
a11y, jsdom-untestable, theme bridge for CSS tokens) would re-import, for a
_second_ renderer, every cost the engine table above rejected — to show the
same honest data with no additional insight. **Deferred deliberately.** The
seam it would plug into already exists and is the same one as the Pixi exit
strategy: a 3D mode is one sibling component consuming `GardenMapLayout` +
positions; nothing upstream would change. If shipped it would be `@defer`red
behind an explicit user action, renderer-only, with the plan view remaining
the accessible default.

## Exit strategy

The renderer depends only on `GardenMapLayout` (plain immutable rects in map
units) and `MapCamera` state. Swapping SVG for PixiJS later means rewriting one
component's template/host bindings against the same view model — domain, stores,
layout algorithm, camera math, tests for all of those, and the inspector/HUD
(plain DOM either way) are untouched. The reverse migration is equally cheap,
which is the point of the boundary.

## Related rejections

- **Angular Pixi wrappers**: not evaluated further once Pixi itself was rejected;
  any Pixi integration would have been a thin adapter around raw Pixi.
- **Minimap**: at fit-zoom the whole garden is visible in one viewport, and the
  camera is clamped (0.5×–10×) so the garden can never be lost; navigation
  never needs the extra chrome.
- **Second view mode ("Capacity")**: plot area _is_ capacity in this layout;
  a toggle would show the same information twice. One clear view kept.
