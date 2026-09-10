# Interactive Garden UX

How the Garden Detail screen behaves as a _planner_: plant discovery, smart
recommendations, drag-&-drop bed placement, layers, fullscreen, and the rules
that keep all of it honest. Companion documents: ADR-007 (rendering engine +
planner amendment), ASYNC-UX.md (skeleton/ghost feedback), DESIGN-SYSTEM.md
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
- **Drop** commits the clamped rendered position — snapped to quarter-unit
  steps (`snapPosition`, 1 unit = 1 m side) so arrangements align with the m²
  grid instead of landing on arbitrary fractions — selects the plant, and
  pushes an undo entry. Clamping honors the auto-layout's own gutter inset: a
  bed can never sit flush on the fence or poke past the surface's rounded
  corner, so its shadow, selection outline and label always stay on the lawn.
  Out-of-range positions from older saves self-heal: rendering clamps them and
  the next drop re-persists the clamped value.
- **The HUD steps aside during a drag** (fades to 15% opacity): the capacity
  panel must never hide the drop zone it is narrating.
- **What drag can never do**: change a footprint's size, change any capacity
  number, call the backend. The HUD's "m² free" is asserted unchanged across a
  drag in e2e.
- **Overlaps**: allowed (real gardeners overlap canopies), but overlapping beds
  render an amber dashed warning (pure AABB check). The server's Σ area rule is
  untouched.
- **Keyboard**: plots are real focusable buttons; selection, Escape cascade
  (layers panel → fullscreen → selection), `f` to fit, and the inspector's
  Focus button (zooms to the selected bed) keep the planner usable without a
  mouse. Delete never deletes directly — removal always goes through the
  confirm dialog.

## 5. Layout persistence

Versioned localStorage, one key per garden:
`homeGarden.visualLayout.v1.<gardenId>` → `{ v: 1, positions: { [plantId]: {x, y} } }`.

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
  signal — the deterministic auto-layout is always one click away.

## 5b. Area-honest auto layout

The auto arrangement is a **squarified treemap** over the garden world
(ADR-007 area-honesty amendment): every bed's drawn area equals its real m²,
and the free region is an explicit tilled strip whose width is the real free
share — labelled "Available · N m²" when it has room, or marked with a
compact "+" when it is a sliver. What the HUD says is what the eye sees:
98% used _looks_ 98% full, 50% looks half, empty looks empty (unit-tested at
all three, plus an e2e on the 98% case). Custom drag positions layer on top
unchanged; identical plant sets always produce identical auto layouts.

## 6. Layers & levels of detail

Five toggles in a glass popover (native checkboxes, labelled): labels,
footprints, grid, humidity preference, available space. CSS-only class toggles
on the SVG stage — zero re-layout. The **humidity layer** renders a halo per
bed colored by _preference vs. the garden target_ and the panel says so
explicitly ("Preference vs target — not a measurement"): the app never
pretends to have sensor data.

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
animation); grow-in/hover/selection transitions are CSS, gated by
`prefers-reduced-motion`.

## 10. Proof

- Unit: recommendation scoring/ranking/reasons, catalog search,
  `applyPositions` clamping, overlap detection, layout repository
  corruption/pruning, camera math.
- Mocked e2e (`garden-planner.spec.ts`): the 1440×900 no-scroll contract,
  prefill-from-catalog, drag → persist across reload → reset, undo, fullscreen
  - layers + humidity note + Escape cascade.
- Integration e2e: the real-API flows exercise the dialog (catalog autofocus is
  part of the settle contract in `awaitDialogSettled`).
