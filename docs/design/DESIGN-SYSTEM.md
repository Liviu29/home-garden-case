# Design System — "Verdant" (ItpHomeGarden UI)

The visual and motion language for `apps/web`. Goal: a calm, premium, editorial feel — **gray-first with soft gradients**, generous whitespace, and motion that explains rather than decorates. Built on Angular Material (M3) but themed until it reads as a product, not a component demo.

## 1. Principles

1. **The network is invisible.** Content areas never show spinners; they show ghost skeletons shaped like the real content, and cached data appears instantly.
2. **Gray is the canvas, green is the signal.** Neutral surfaces everywhere; the brand green appears only where life/data does — humidity, capacity, success.
3. **Motion has a reason.** Enter/exit choreography, staggered lists, and state morphs; nothing loops, nothing bounces for fun. `prefers-reduced-motion` collapses everything to fades.
4. **Density with air.** Cards with 24px padding, 12–16px radii, soft layered shadows — informative, never cramped.

## 2. Design tokens (`src/styles/_tokens.scss` → CSS custom properties)

### Color — neutral ramp (gray with warm tint)

| Token         | Light     | Use                                           |
| ------------- | --------- | --------------------------------------------- |
| `--surface-0` | `#fafaf9` | app background (with the page gradient below) |
| `--surface-1` | `#ffffff` | cards, dialogs                                |
| `--surface-2` | `#f4f4f3` | inset areas, table headers, hovers            |
| `--border`    | `#e7e5e4` | hairlines (1px), never darker                 |
| `--text-1`    | `#1c1917` | headings                                      |
| `--text-2`    | `#57534e` | body                                          |
| `--text-3`    | `#a8a29e` | captions, placeholders                        |

### Color — brand & semantic

| Token            | Value     | Use                         |
| ---------------- | --------- | --------------------------- |
| `--brand-500`    | `#16a34a` | primary actions, active nav |
| `--brand-600`    | `#15803d` | hover/pressed               |
| `--brand-soft`   | `#f0fdf4` | tinted chips/backgrounds    |
| `--accent-amber` | `#d97706` | warnings (capacity 80–100%) |
| `--danger`       | `#dc2626` | destructive, overcrowding   |
| `--info-blue`    | `#0284c7` | humidity/water hue          |

### Gradients (the signature)

```scss
// Page backdrop — barely-there, top-lit gray
--gradient-page: linear-gradient(180deg, #f5f5f4 0%, #fafaf9 40%, #fafaf9 100%);
// Hero/header panels
--gradient-hero: linear-gradient(135deg, #1c1917 0%, #292524 55%, #1f3d2b 100%);
// Brand CTA
--gradient-brand: linear-gradient(135deg, #16a34a 0%, #0d9488 100%);
// Skeleton shimmer (see §4)
--gradient-shimmer: linear-gradient(
  90deg,
  transparent 0%,
  rgba(255, 255, 255, 0.6) 50%,
  transparent 100%
);
// Card hover sheen
--gradient-sheen: linear-gradient(160deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0) 60%);
```

### Elevation, radius, spacing

- Shadows: `--shadow-1: 0 1px 2px rgb(0 0 0 / .04), 0 1px 3px rgb(0 0 0 / .06)`; `--shadow-2` for hover-lift; `--shadow-3` for dialogs.
- Radii: `--radius-s: 8px`, `--radius-m: 12px`, `--radius-l: 16px`, pills for chips.
- Spacing scale: 4-based (`4/8/12/16/24/32/48/64`), exposed as tokens.

### Typography

- UI: **Inter** (self-hosted, `font-display: swap`), display headings: **Sora** for the dashboard hero numbers.
- Scale in `rem`: 12/13 caption · 14 body · 16 emphasis · 20 h3 · 24 h2 · 32 h1 · 44 stat-display;
  below the caption, `--fs-micro` (11) for chips, badges and labels inside controls and
  `--fs-nano` (10.5) for the smallest marks on the map and the gauge — never for running text.
- Numbers in stats use `font-variant-numeric: tabular-nums`.

## 3. Material theming

- M3 theme via `mat.theme` with a custom palette generated from `--brand-500`, neutral tuned to our warm-gray ramp; density -1 for tables/forms.
- System tokens overridden at `:root` so Material components inherit our surfaces/radii (the global `--mat-*` token overrides live in `src/styles.scss`).
- Components used from Material: dialog, menu, select, datepicker, slider, snackbar (host only — visuals ours), tooltip, form-field (outline appearance, custom radius). Cards, buttons-as-links, stat tiles, capacity bars, gauges: **hand-built** in `shared/ui` for full control.

## 4. Skeleton ghosts (the loading language)

Skeletons are NEUTRAL GRAY (`--skeleton-base`/`--skeleton-highlight` — never
theme-tinted) and cover _every_ verb, not just GET: creation ghosts, localized
update ghosts, ghost-confirmed deletes and in-button ghost bars all reuse the
same tokens, gradient and sweep keyframe. Full contract: [ASYNC-UX.md](ASYNC-UX.md).

Google-style ghost placeholders: gray blocks with a moving gradient shimmer.
One engine, `styles/_skeleton.scss`, owns the look and timing of every one.

- `shared/ui/skeleton`: primitive `<app-skeleton [variant]>` — `line`, `title`, `circle`, `rect`; width/height via inputs (the width is set on the host, so a percentage resolves against the parent in block, grid and flex rows alike); border-radius matches the real element it stands in for. Text stand-ins are padded out to the line box they replace (e.g. a 0.7rem bar in a `fs-caption × 1.5` box), so the ghost holds the text's exact height.
- Composites: `skeleton-garden-card` (shared) and `garden-map-skeleton`; single-use ghost layouts (the dashboard KPI/attention/health ghosts, the detail header, the table rows, the welcome profile cards) stay inline beside the template they mirror. Each mirrors the final layout's line boxes → **zero layout shift** when data lands.
- Shimmer: a static gray base under `--gradient-shimmer`, swept by `shimmer-sweep` (translateX, `--dur-shimmer` 1.4s).
- Appears only after `--skeleton-delay` (150ms, CSS) — a fast response never flashes a ghost — and leaves the moment data lands (no minimum display; real content is never held back).
- Screens always render the _count-realistic_ skeleton (e.g. 3 ghost garden cards, 3 ghost table rows under a ghost header row).
- Reduced motion: shimmer replaced by a slow in-place opacity pulse; the appear delay is kept.

## 5. Motion presets (`src/styles/_motion.scss` + Angular animations)

Timing is token-only (`_tokens.scss`): `--dur-instant` 90ms (press),
`--dur-fast` 160ms (hover, state change), `--dur-base` 240ms (enter, reveal,
selection), `--dur-slow` 500ms (data bars and gauges settling), `--stagger-step`
40ms; easing `--ease-out` for everything entering or settling and
`--ease-in-out` for loading loops only (`--dur-shimmer`, `--dur-pulse`).

| Preset             | Spec                                                                                            | Used for                                 |
| ------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `fade-up-in`       | `--dur-base` `--ease-out`, translateY(8px)→0 + opacity, `backwards` fill                        | cards, sections, toasts entering         |
| `stagger-children` | children `fade-up-in`, `--stagger-step` apart (cap 8)                                           | garden grid, KPI tiles, plant rows       |
| skeleton → content | the ghost leaves the moment data lands; content enters with its own fade-up/stagger             | every cold load                          |
| `lift-hover`       | `--dur-fast` shadow-1→2 + translateY(-2px)                                                      | interactive cards                        |
| bars & gauges      | `transform: scaleX` / dash offset, `--dur-slow`, grow-in on first paint (`@starting-style`)     | capacity bars, KPI strip, map HUD, gauge |
| dialogs            | Material's own open transition (150ms) — no custom keyframe on top                              | dialogs                                  |
| `route-transition` | router `withViewTransitions` — the browser's default cross-fade                                 | page changes                             |
| `press-feedback`   | `--dur-instant` scale .98 on `:active`                                                          | all buttons                              |
| planner            | bed grow-in, one-shot selection ring (`--dur-base`), drop target outline; nothing loops at rest | Garden Map                               |

Rules: transform/opacity only (no animated width/height/top/left), one
property choreographed per element where possible, no motion that loops
without carrying information (loading loops only), and everything honors
`prefers-reduced-motion`: animations and transitions land instantly and exactly
once, delays are dropped — except the skeleton appear delay — and loading
ghosts pulse in place instead of sweeping.

## 6. Key screens & signature components

- **Shell:** slim top bar on `--surface-1`, blurred (`backdrop-filter`) on scroll; nav items with animated active underline in `--gradient-brand`; active profile avatar menu at right.
- **Dashboard — Smart Garden Control Center:** hero panel on `--gradient-hero` (subtle garden-grid motif, staggered 3-step entrance) — greeting, derived portfolio line (gardens · plants · m²), healthy/attention status chips and a "view most urgent" secondary CTA when one exists; four KPI tiles with secondary context lines and a quiet utilization progress strip; an **Attention Center** of rich clickable cards (semantic left accent: amber near-full / red full / blue humidity, capacity bar or target-vs-average mini-scale, "View garden →"), sorted by UI-only severity (full → near-full → humidity by distance; thresholds: capacity ≥ 90%, drift > 15 — presentation, not business rules) and replaced by a positive "Everything looks healthy" card when empty; a **Garden Health** grid — the compact portfolio — whose cards carry a `GardenMiniPreview` (static botanical strip reusing the map's resolved artwork; plants sized by √share; deliberately not a map: no layout duplication, no camera), status chip (text + color, never color alone), capacity numbers + bar and humidity target/average/delta. Desktop uses the 80rem shell: 4 KPI columns, Attention 2fr beside Health 3fr. Loading is a content-shaped `dash-skeleton` from the generic primitives. Last comes **Water today** (`WateringPanel`): one card per garden with something due — plants and m² to water, a chip per watering zone in the planner's zone colours, a note for newly planted beds — then a "Not today" line with when the other gardens are next, or a positive "Nothing needs water today" card. It sits at the bottom so its ghost cards can never move the content above; the hero adds a "N to water today" chip.
- **Gardens:** responsive card grid; each card shows name, location, animated **capacity bar** (green → amber > 80% → red full), plant count, humidity target chip; hover lift + sheen; kebab menu (edit/delete); FAB-style primary "New garden".
- **Garden detail:** header with name + meta + humidity gauge (semi-circular, animated needle, target marker); the **Garden Map** (§8) — the screen's signature; plants table with staggered rows, inline type icons (🥬🍓🌸 as SVG glyph set), per-row humidity delta vs garden target.
- **Plant form (dialog):** live remaining-capacity meter that updates as the user types `surfaceAreaRequired`; slider + numeric input for humidity; instant client-side overcrowding warning, server verdict inline on 400.
- **Empty states:** hand-drawn-style SVG sprout illustration in grays with a single green accent, one-line copy, primary CTA.
- **Toasts:** bottom-center pill, icon + message + optional action, `fade-up-in`/auto-dismiss 5s, or 10s when it carries an action such as Undo; the countdown pauses while the toast is hovered or focused. Error toasts persist until dismissed and carry a Retry action.

## 7. Accessibility & dark mode

- Contrast AA minimum on all token pairs (verified in the tokens file comments).
- Focus ring: 2px `--brand-500` offset ring, on _everything_ interactive.
- Capacity/humidity states always paired with text or icon, never color alone.
- Dark mode: **shipped** as a pure token remap under `:root[data-theme='dark']` (surfaces, text, soft hues, glass topbar, skeleton/sheen gradients, shadows) with `color-scheme` flipping Material. Manual sun/moon toggle in the shell, choice persisted per user, `prefers-color-scheme` as the first-visit default — zero component code changed, which is the point of the token architecture.

## 8. Garden Map — the digital twin (ADR-007)

The Garden Detail screen's signature: a top-down SVG rendering of the garden
surface where **visual area is honest** — every plant plot's area equals its
real `surfaceAreaRequired` and the free soil's area equals the real free area
(a squarified treemap, ADR-007).

Visual language:

- **Surface:** rounded "soil paper" (`--map-surface` gradient) with a 1-unit
  grid — one grid cell ≡ 1 m² at true scale, so the eye can audit the numbers.
- **Humidity halo:** a sky-blue radial wash whose opacity tracks the garden's
  _target_ humidity. It is explicitly a configuration hint, never a
  measurement — the HUD label says "Target humidity".
- **Plots:** rounded beds tinted by plant-type hue; name + m² label when the
  plot is large enough (smaller plots keep their data in the tooltip,
  inspector and aria-label). Hover = soft brand glow; selected = dashed brand
  ring with a one-shot pulse.
- **Free soil:** dashed `--map-free` band; an empty garden shows dashed
  planting-zone circles + "Your garden has space to grow." with a CTA.
- **HUD:** glass chips (capacity used/total with mini bar, free m², target
  humidity with droplet, "Full" badge at 100%) — every number computed by the
  shared domain functions, never re-derived in the renderer.
- **Camera:** drag to pan; pinch, Ctrl/⌘ + wheel or the toolbar to zoom (0.5×–10×; zoomed out
  below fit the garden floats centered on the lawn, clamped so it can't be lost). Embedded in the
  page, a bare wheel scrolls the page and a short hint names the zoom gesture; in fullscreen the
  wheel zooms. Icon toolbar: zoom −/%, +, fit, reset. Map colors are
  `--map-*` tokens, so dark mode ("moonlit" remap) costs zero component code.
- **Botanical artwork (the visual layer):** each plant renders as original
  top-down vector art (8 categories, resolved by keyword heuristics with
  `plantType` fallback — `plant-visual-resolver.ts`), tinted from deterministic
  palettes and seeded with subtle rotation/jitter. Large footprints grow
  deterministic **clusters** (density ∝ honest m², capped at 9) — still one
  plant everywhere it counts. The footprint bed stays visible beneath as the
  mathematically honest geometry; a name-plate label sits at the bed's edge and
  never exceeds it. Scene depth comes from layered surfaces (lawn gradient +
  speckle, tilled free-soil furrows, dotted fence, bed shadows) — all
  procedural SVG, no image assets.

- **Planner chrome (INTERACTIVE-GARDEN-UX.md):** beds are draggable (visual
  only — capacity math never moves); overlapping beds warn with an amber
  dashed outline. The toolbar gains undo/redo/reset-layout, a **layers**
  popover (glass surface, five native checkboxes) and a fullscreen toggle;
  the humidity layer draws per-bed preference halos and labels itself
  "preference vs target — not a measurement". Labels are zoom-LOD'd:
  name-only pills at overview, area detail past 1.35×, selected bed always
  labelled. The Add Plant dialog leads with a horizontal **catalog strip**
  of ranked preset cards (thumb, humidity/area meta, honest fit badge) and
  fits 1440×900 without internal scroll; only the strip scrolls, on its own
  axis.

Motion stays restrained: grow-in on plot insertion via `@starting-style`,
one-shot selection pulse < 0.5 s, all gated by `prefers-reduced-motion`; drag
is direct manipulation (no easing between hand and bed). Deliberately
rejected: minimap, multiple view modes (3D deferred with rationale in
ADR-007) — one clear view beats three shallow ones. Drag-to-place follows the
planner's visual-only guardrail (ADR-007).

## 9. CSS architecture (`src/styles/`)

The stylesheet has four kinds of file, and each kind has one job:

| Layer                     | Files                                                      | Output                                                                                                    |
| ------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Tokens**                | `_tokens.scss`                                             | custom properties on `:root` — colour, type, spacing, motion, stacking; the dark theme is a remap of them |
| **Abstracts**             | `abstracts/` (`_breakpoints`, `_zones`, `_surfaces`)       | none — mixins and functions components `@use` by name (`stylePreprocessorOptions.includePaths`)           |
| **Engines and utilities** | `_motion.scss`, `_skeleton.scss`, the end of `styles.scss` | the animation presets, the one skeleton engine, `.tabular`, `.visually-hidden`                            |
| **Components**            | `*.scss` beside each component, or inline                  | scoped styles, tokens only                                                                                |

**Cascade layers.** `styles.scss` declares `@layer tokens, base, material;` and puts the tokens, the
base element styles and Material's theme in them, lowest first. A layered rule loses to any
unlayered one whatever its specificity, so a token, a `body` rule or Material's theme can never
outrank a component's own style or a utility. The motion and skeleton engines and the utilities
stay unlayered on purpose: they must win over component styles by source order, and their
reduced-motion pairs (`_motion` stops everything with `!important`, `_skeleton` re-enables its slow
pulse with `!important`) rely on the plain rule that the later important declaration wins — inside
layers that order would invert.

**Breakpoints** (`abstracts/_breakpoints.scss`). Five widths, named by the device they stand for;
every media query goes through `bp.down()` / `bp.up()`, so a breakpoint is decided in one place
and reads as intent:

| Name       | Width     | What turns                                                   |
| ---------- | --------- | ------------------------------------------------------------ |
| `phone`    | ≤ 480 px  | the smallest phones — every grid is a single column          |
| `phone-l`  | ≤ 640 px  | large phones — hints and secondary text give way, names hide |
| `tablet-s` | ≤ 720 px  | small tablets, phones in landscape — side panels stack       |
| `tablet`   | ≤ 880 px  | tablets — two-column layouts become one                      |
| `laptop`   | ≤ 1024 px | small laptops — four-column grids become two                 |

Before the map there were 21 queries at ten widths (480, 560, 640, 40rem, 720, 880, 900, 960,
1024…); the odd ones (560, 900, 960) were folded into their neighbours, and the responsive suite
still passes at 375, 768, 1024, 1440 and 1920.

**Stacking** (`_tokens.scss`). The layers that cross components, bottom to top: `--z-topbar`
100, `--z-skip-link` 200, `--z-fullscreen` 300 (the planner over the sticky topbar), `--z-toast`
1000 (over Material's overlays). Stacking _inside_ a component uses small numbers of its own.

**Mixins.** `zones.tint($property, $from)` colours one property by watering zone from the
`data-zone` attribute on the element, its parent or an ancestor — six places used to spell the
three selectors out by hand. `surfaces.card($padding, $radius)` is the one card recipe (raised
surface, hairline border, soft shadow); an accent border, a layout or a hover is set after the
include.

**Naming.** The shared kit (`shared/ui`) is written in BEM: the block is the component
(`.stat-card`, `.toast`, `.value-presets`), its parts are elements (`.stat-card__value`,
`.toast__close`), its states are modifiers (`.status-badge--warning`, `.stat-card__value--ghost`,
`.value-presets__option--active`). A kit component is used everywhere and inspected from
everywhere — in a spec, in the devtools, in an axe report — so its markup names its owner. Feature
components keep short, scoped names (`.health-card`, `.panel-head`): Angular's emulated
encapsulation already ties them to their owner, and their reach is one folder. The skeleton family
keeps its own `ghost-*` vocabulary (§4), which the feature ghosts compose.
