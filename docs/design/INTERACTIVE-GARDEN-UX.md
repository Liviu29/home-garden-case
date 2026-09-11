# Interactive Garden UX

How the Garden Detail screen behaves as a _planner_: plant discovery, smart
recommendations, drag-&-drop bed placement, layers, fullscreen, and the rules
that keep all of it honest. Companion documents: ADR-007 (rendering engine +
planner layer), ASYNC-UX.md (skeleton/ghost feedback), DESIGN-SYSTEM.md
(tokens), TESTING-STRATEGY.md (how each behavior is proven).

---

## 1. Plant discovery

The Add Plant dialog opens on a **catalog strip**: a horizontal row of preset
cards ranked for _this_ garden, above the regular form. Two principles:

- **Picking is prefilling, not committing.** Selecting a card patches the form
  (name, species, type, area, humidity) and marks it dirty; every value stays
  editable and every validator stays authoritative. A fully custom plant typed
  by hand is first-class — the catalog is a shortcut, never a gate.
- **The catalog is presentational data, not backend rules.** 27 curated common
  garden plants (`plant-catalog.ts`) with suggested area/humidity. The server's
  schema and overcrowding rule remain the only validation authority.

The search field filters the strip (common + scientific names, case-
insensitive). No match → "No catalog match — describe your plant below," and
the form is right there.

### The provider seam

`PlantCatalogFacade` implements `PlantCatalogProvider` (`search`,
`getRecommendations`). The shipped provider is local and synchronous; an
external API (e.g. Perenual) would be _another provider behind the same
interface_, lazy-loaded and feature-flagged. Deliberately not implemented: the
assignment must never depend on an API key, network availability, or a
third-party rate limit. The seam is the deliverable; the dependency is not.

## 2. Smart recommendations

`calculatePlantRecommendation()` (pure, unit-tested) scores each preset for the
current garden:

| Signal              | Points                             | Why                                                       |
| ------------------- | ---------------------------------- | --------------------------------------------------------- |
| Humidity proximity  | 0–60 (`max(0, 60 − Δ·2)`)          | The garden has one target humidity; plants near it thrive |
| Fits available area | +30                                | Recommending what can't be planted is noise               |
| Variety             | +10 if species not already planted | Nudges diversity, never blocks repeats                    |

Thresholds: Δ ≤ 7 → "excellent", ≤ 15 → "good". Every score ships with
human-readable `reasons[]` and the card's tooltip/aria-label carries them —
**the ranking is explainable, deterministic, and honest**: a plant that doesn't
fit says exactly how many m² it needs vs. what's free, and it is dimmed, not
hidden (the gardener may free space first).

## 3. The dialog fits one screen

Desktop acceptance (Playwright-enforced at 1440×900): **no internal vertical
scroll**. Material caps dialog content at 65vh; this dialog overrides to
`calc(100dvh - 11rem)` and lays the form out in two-column rows (name/species,
type/date, area+presets/humidity, garden-fit/live-preview). Only the catalog
strip scrolls — horizontally, on its own. Small screens degrade to one column
and scroll gracefully.

The **Garden fit** panel (Available / This plant / Remaining + capacity bar)
updates as the user types; the **live preview tile** shows the exact artwork
the plant will wear on the plan, derived from the actual form values so custom
plants get the same treatment as catalog picks.

## 4. Planner interaction (drag & drop)

- **Pointer model**: `pointerdown` on a plot arms a drag _candidate_; movement
  beyond a 5 px threshold becomes a plant drag, otherwise the gesture stays a
  camera pan and a clean click stays selection. Pointer capture is taken lazily
  (only once dragging) so plain clicks keep working. One state machine, no
  library.
- **Drop** commits exactly the spot the dashed drop target showed during the
  drag (`settleDrop`), in this order: within ~12 screen px of the bed's
  **home** (its spot in the automatic arrangement) on both axes it returns
  there exactly — and a bed back home stores no custom position at all; else
  its edges magnetise to the fence and to neighbouring beds' edges, and every
  bed-edge alignment draws a magenta **smart guide**; else it snaps to
  quarter-unit steps (1 unit = 1 m side) along the m² grid. While the bed is
  away, its home slot stays outlined ("Auto spot"), and a live readout above
  the target says `x 1.25 m · y 0 m` (or "Back to its auto spot"). The drop
  selects the plant and pushes an undo entry.
- **Clamping** uses the same bounds the auto-layout packs into — the planting
  surface itself. A bed may touch the fence (which runs just outside the
  surface), never cross it. An untouched bed is therefore already legal, so
  the first drag can never make it jump. Out-of-range positions
  self-heal: rendering clamps them and the next drop re-persists the value.
- **The dragged bed paints on top** of its neighbours (SVG has no z-index, so
  it is rendered last), and label text is not selectable — a drag across a
  name plate moves the bed instead of highlighting the name.
- **Wheel**: embedded in the scrolling page, a bare wheel scrolls the page
  (with a brief "Hold Ctrl/⌘ and scroll to zoom" hint); Ctrl/⌘ + wheel and
  trackpad pinch zoom. In fullscreen the bare wheel zooms.
- **Fit and resizing**: Fit frames the garden in the stage area left clear of
  the toolbar (top band) and the HUD (bottom band), so the controls float
  over lawn, never over a bed. Resizing re-frames a map that is at Fit; a view
  the gardener zoomed or panned is kept (re-clamped). Moving a bed never
  touches the camera.
- **The HUD steps aside during a drag** (fades to 15% opacity): the capacity
  panel must never hide the drop zone it is narrating.
- **What drag can never do**: change a footprint's size, change any capacity
  number, call the backend. The HUD's "m² free" is asserted unchanged across a
  drag in e2e.
- **Overlaps**: allowed (real gardeners overlap canopies), but overlapping beds
  render an amber dashed warning (pure AABB check). The server's Σ area rule is
  untouched.
- **Keyboard**: plots are real focusable buttons. A focused bed moves with its
  **arrow keys** (¼ m along the grid; Shift: 1 m) and **Home** returns it to
  its automatic spot — the keyboard alternative to dragging (WCAG 2.5.7);
  every move is narrated in a polite live region ("Basil moved to 1.25 by 0
  metres"), and a bed at the fence says so instead of silently not moving.
  Arrow keys on the stage itself still pan. Escape cascade: layers panel →
  timeline → fullscreen → selection; `f` fits; the inspector's Focus button
  zooms to the selected bed. Delete never deletes directly — removal always
  goes through the confirm dialog.

## 4b. Planner tools

Every tool below is derived from real data — footprints from the layout,
ideal humidity and plantation dates from the API — and is advice or
presentation only: none of it changes a capacity number or calls the backend.
The pure logic lives in `shared/utils/garden-planner.ts` (unit-tested).

- **Free soil follows the beds.** The open ground is drawn as the garden
  _minus every bed_ (an SVG mask), not as a fixed treemap cell. In the
  automatic arrangement that is identical to the free cell; after a drag, the
  spot a bed left becomes tilled soil and the spot it took stops being
  "available". The "Available · N m²" label sits in the largest empty
  rectangle (exact, O(n³) for n beds).
- **Dimensions.** The bed in hand (dragged, else selected) shows its real
  width and depth in metres — width × depth is exactly its required m².
- **Watering zones** (layer). Each bed's soil is tinted by the preset its
  ideal humidity is closest to — Dry (< 50 %), Balanced (50–69 %), Humid
  (≥ 70 %), the garden form's own 40/60/80 presets. The layers menu shows the
  legend; the inspector's overview shows the planted area per zone.
- **Neighbour clashes.** Beds within 0.3 m of each other share a watering
  pass; if their ideal humidity differs by 25 points or more, one of them is
  always over- or under-watered. The zones layer links them with an amber
  "≠"; the inspector names the clashing neighbours of the selected bed and
  counts them in the overview.
- **Group by water needs.** One click re-places every bed (footprints
  unchanged) so each zone's beds sit together, driest first when that fits.
  A deterministic bottom-left packer tries row- and column-major passes over a
  few in-zone orders, reversing the zone order as a last resort; measured over
  6 000 generated gardens it never fails below 80 % full (1.9 % of gardens at
  80–89 %, 6.5 % at 90–99 % are left alone, with "Not enough open ground to
  regroup these beds without overlaps"). The whole arrangement is ONE undo
  step, and the zones layer turns on to show the result.
- **Planting timeline.** Enabled once plants were planted on at least two
  different days. It replaces the HUD with a player: it replays the garden
  from its first planting day, one day per 900 ms beat, and stops on today;
  a slider scrubs (and pauses). Beds not yet planted on the chosen day are
  dashed outlines and their ground counts as open soil; the readout says the
  date, "N of M plants · X % used" as of that day. Under reduced motion it
  opens paused on the first day. Days are UTC calendar days, formatted from a
  UTC instant (a bare `YYYY-MM-DD` would render as the previous day east of
  Greenwich).
- **Inspector.** A selected bed shows its zone, whether it is "Auto-placed" or
  "Placed by you" (with **Return to auto spot**), and its clashes; nothing
  selected, it summarises the garden with the zones card and offers "Group by
  water needs".

## 5. Layout persistence

Versioned localStorage, one key per garden:
`homeGarden.visualLayout.v2.<gardenId>` → `{ v: 2, positions: { [plantId]: {x, y} } }`.
A retired `v1` key is deleted on load rather than migrated.

- **Not domain state.** The SignalStore never sees positions; the repository is
  injected by the detail screen and merged into the pure layout via
  `applyPositions()`.
- **Corrupt-safe**: wrong version, bad JSON, or non-finite numbers → silent
  fallback to auto-layout (never an error state for cosmetic data).
- **Self-pruning**: saves are filtered to living plants; an empty override map
  removes the key.
- **Undo/redo**: bounded 20-step stacks (past/future) in the detail screen —
  session-scoped by design; persistence stores only the _current_ layout.
- **Reset layout** asks for confirmation, then clears the key and the override
  signal — the deterministic auto-layout is always one click away. **Return
  to auto spot** (inspector, Home key, or dropping a bed on its home) removes
  just that bed's override; **Group by water needs** writes every bed's
  position at once. Both are single undo steps.

## 5b. Area-honest auto layout

The auto arrangement is a **squarified treemap** over the garden world
(ADR-007): every bed's drawn area equals its real m²,
and the free soil is a treemap cell of its own whose area is the real free
area — labelled "Available · N m²" where the label fits, or marked with a
compact "+" when it is tiny. Because the free soil takes part in the treemap,
a small plant beside large ones pairs with it instead of becoming a sliver.
A young garden (under 70% full) gives its beds a near-square block in the
top-left corner — beds plus 30% slack — with open ground to the right and
below, so a first 1 m² bed is a bed, not a fence-to-fence bar. What the HUD
says is what the eye sees:
98% used _looks_ 98% full, 50% looks half, empty looks empty (unit-tested at
all three, plus an e2e on the 98% case). Custom drag positions layer on top
unchanged; identical plant sets always produce identical auto layouts.

## 6. Layers & levels of detail

Six toggles in a glass popover (native checkboxes, labelled): labels,
footprints, grid, humidity preference, watering zones, available space.
CSS-only class toggles on the SVG stage — zero re-layout. The **humidity
layer** renders a halo per bed colored by _preference vs. the garden target_;
the **zones layer** tints each bed's soil by its watering zone and links
clashing neighbours (§4b). The panel says so explicitly ("Preference vs
target — not a measurement"): the app never pretends to have sensor data.
The m² grid and the garden humidity halo are painted on top of the open soil.

Scene art: each bed is a raised bed — a timber frame (`--map-wood`) around
crumbly soil (`--map-soil` + a speck pattern) — with the botanical symbols
(`PlantArtworkDefs`: shaded, veined, per-category, palette-tinted through
`--pv-a/b/c`) growing in it; the lawn beyond the fence carries a grass-blade
pattern. All procedural SVG, no image assets.

Zoom drives label LOD: pills show name-only at overview; past 1.35× zoom the
area detail appears under the pill; the selected plant's label always shows.
Map search (fullscreen header) matches name/species and focuses the first hit.

## 7. Fullscreen

The planner expands to a fixed full-viewport panel (above the sticky topbar),
body scroll locked, with search in the header. Escape exits (after closing any
open popover first). It is the same component with the same state — no mode
fork.

## 8. Plan view vs. 3D

Deliberate deferral, full rationale in ADR-007 ("3D / Three.js: evaluated,
deferred"): a second renderer would re-import every cost the engine decision
rejected (~150 kB+ chunk, canvas a11y, jsdom-untestability, theme bridge) to
show the same honest data. The seam for it exists — a 3D mode is one sibling
component consuming the same layout + positions.

## 9. Async & motion

All planner UI follows ASYNC-UX.md: skeleton-first loading, mutation ghosts,
zero spinners (CI-enforced). Drag movement is direct manipulation (no
animation); grow-in/hover/selection transitions and the timeline's sprout are
CSS, gated by `prefers-reduced-motion` (which also stops the timeline from
auto-playing).

## 10. Proof

- Unit: recommendation scoring/ranking/reasons, catalog search,
  `applyPositions` clamping, overlap detection, layout repository
  corruption/pruning, camera math.
- Mocked e2e (`garden-planner.spec.ts`): the 1440×900 no-scroll contract,
  prefill-from-catalog, drag → persist across reload → reset, undo, fullscreen
  with layers, the humidity note and the Escape cascade.
- Integration e2e: the real-API flows exercise the dialog (catalog autofocus is
  part of the settle contract in `awaitDialogSettled`).
