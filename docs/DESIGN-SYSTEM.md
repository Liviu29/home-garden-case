# Design System — "Verdant" (ItpHomeGarden UI)

The visual and motion language for `apps/web`. Goal: a calm, premium, editorial feel — **gray-first with soft gradients**, generous whitespace, and motion that explains rather than decorates. Built on Angular Material (M3) but themed until it reads as a product, not a component demo.

## 1. Principles

1. **The network is invisible.** Content areas never show spinners; they show ghost skeletons shaped like the real content, and cached data appears instantly.
2. **Gray is the canvas, green is the signal.** Neutral surfaces everywhere; the brand green appears only where life/data does — humidity, capacity, success.
3. **Motion has a reason.** Enter/exit choreography, staggered lists, and state morphs; nothing loops, nothing bounces for fun. `prefers-reduced-motion` collapses everything to fades.
4. **Density with air.** Cards with 24px padding, 12–16px radii, soft layered shadows — informative, never cramped.

## 2. Design tokens (`shared/styles/_tokens.scss` → CSS custom properties)

### Color — neutral ramp (gray with warm tint)
| Token | Light | Use |
|---|---|---|
| `--surface-0` | `#fafaf9` | app background (with the page gradient below) |
| `--surface-1` | `#ffffff` | cards, dialogs |
| `--surface-2` | `#f4f4f3` | inset areas, table headers, hovers |
| `--border` | `#e7e5e4` | hairlines (1px), never darker |
| `--text-1` | `#1c1917` | headings |
| `--text-2` | `#57534e` | body |
| `--text-3` | `#a8a29e` | captions, placeholders |

### Color — brand & semantic
| Token | Value | Use |
|---|---|---|
| `--brand-500` | `#16a34a` | primary actions, active nav |
| `--brand-600` | `#15803d` | hover/pressed |
| `--brand-soft` | `#f0fdf4` | tinted chips/backgrounds |
| `--accent-amber` | `#d97706` | warnings (capacity 80–100%) |
| `--danger` | `#dc2626` | destructive, overcrowding |
| `--info-blue` | `#0284c7` | humidity/water hue |

### Gradients (the signature)
```scss
// Page backdrop — barely-there, top-lit gray
--gradient-page:    linear-gradient(180deg, #f5f5f4 0%, #fafaf9 40%, #fafaf9 100%);
// Hero/header panels
--gradient-hero:    linear-gradient(135deg, #1c1917 0%, #292524 55%, #1f3d2b 100%);
// Brand CTA
--gradient-brand:   linear-gradient(135deg, #16a34a 0%, #0d9488 100%);
// Skeleton shimmer (see §4)
--gradient-shimmer: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.6) 50%, transparent 100%);
// Card hover sheen
--gradient-sheen:   linear-gradient(160deg, rgba(255,255,255,.9), rgba(255,255,255,0) 60%);
```

### Elevation, radius, spacing
- Shadows: `--shadow-1: 0 1px 2px rgb(0 0 0 / .04), 0 1px 3px rgb(0 0 0 / .06)`; `--shadow-2` for hover-lift; `--shadow-3` for dialogs.
- Radii: `--radius-s: 8px`, `--radius-m: 12px`, `--radius-l: 16px`, pills for chips.
- Spacing scale: 4-based (`4/8/12/16/24/32/48/64`), exposed as tokens.

### Typography
- UI: **Inter** (self-hosted, `font-display: swap`), display headings: **Sora** for the dashboard hero numbers.
- Scale in `rem`: 12/13 caption · 14 body · 16 emphasis · 20 h3 · 24 h2 · 32 h1 · 44 stat-display.
- Numbers in stats use `font-variant-numeric: tabular-nums`.

## 3. Material theming

- M3 theme via `mat.theme` with a custom palette generated from `--brand-500`, neutral tuned to our warm-gray ramp; density -1 for tables/forms.
- System tokens overridden at `:root` so Material components inherit our surfaces/radii (`--mdc-*`/`--mat-*` token overrides in one file: `shared/styles/_material-overrides.scss`).
- Components used from Material: dialog, menu, select, datepicker, slider, snackbar (host only — visuals ours), tooltip, form-field (outline appearance, custom radius). Cards, buttons-as-links, stat tiles, capacity bars, gauges: **hand-built** in `shared/ui` for full control.

## 4. Skeleton ghosts (the loading language)

Google-style ghost placeholders: gray blocks with a moving gradient shimmer.

- `shared/ui/skeleton`: primitives `<app-skeleton [variant]>` — `line`, `title`, `circle`, `rect`, `card`; width/height via inputs; border-radius matches the real element it stands in for.
- Composites per screen: `skeleton-garden-card`, `skeleton-stat-tile`, `skeleton-table-row`, `skeleton-detail-header` — each mirrors the exact final layout dimensions → **zero layout shift** when data lands.
- Shimmer: `--gradient-shimmer` swept by a 1.4s `translateX` keyframe on a masked overlay; the whole group shares one animation timeline (no per-block phase drift).
- Appears only after a 150ms delay (avoids flash on cache hits); minimum display 300ms once shown (avoids blink).
- Screens always render the *count-realistic* skeleton (e.g. 3 ghost garden cards, 5 ghost table rows).
- Reduced motion: shimmer replaced by a slow opacity pulse.

## 5. Motion presets (`shared/styles/_motion.scss` + Angular animations)

| Preset | Spec | Used for |
|---|---|---|
| `fade-up-in` | 240ms `cubic-bezier(.2,.8,.2,1)`, translateY(8px)→0 + opacity | cards, sections entering |
| `stagger-list` | children `fade-up-in` with 40ms stagger (cap 8) | garden grid, plant rows |
| `crossfade-swap` | 180ms out / 220ms in | skeleton → content morph |
| `lift-hover` | 160ms shadow-1→2 + translateY(-2px) + sheen | interactive cards |
| `count-up` | rAF-driven number tween, 600ms ease-out | dashboard stats |
| `bar-grow` | width 0→value, 500ms, 150ms delay | capacity bars, humidity gauges |
| `dialog-pop` | 200ms scale .96→1 + fade | dialogs |
| `route-transition` | router `withViewTransitions` — shared-axis fade/slide 250ms | page changes |
| `press-feedback` | 90ms scale .98 on `:active` | all buttons |

Rules: 150–300ms range for UI, one property choreographed per element where possible, GPU-friendly (`transform`/`opacity` only), everything honors `prefers-reduced-motion`.

## 6. Key screens & signature components

- **Shell:** slim top bar on `--surface-1`, blurred (`backdrop-filter`) on scroll; nav items with animated active underline in `--gradient-brand`; active profile avatar menu at right.
- **Dashboard:** hero panel on `--gradient-hero` with white text — greeting, total gardens/plants, aggregate humidity state; `count-up` stat tiles; per-garden humidity-vs-target delta chips (▲ above / ▼ below target, blue/amber); "attention" list (gardens > 90% capacity or humidity drift > 15).
- **Gardens:** responsive card grid; each card shows name, location, animated **capacity bar** (green → amber > 80% → red full), plant count, humidity target chip; hover lift + sheen; kebab menu (edit/delete); FAB-style primary "New garden".
- **Garden detail:** header with name + meta + humidity gauge (semi-circular, animated needle, target marker); **occupancy visualizer** — proportional treemap-style blocks, one per plant, sized by `surfaceAreaRequired`, colored by plant type (vegetable/fruit/flower hues), free space rendered as a dashed "available" block; plants table with staggered rows, inline type icons (🥬🍓🌸 as SVG glyph set), per-row humidity delta vs garden target.
- **Plant form (dialog):** live remaining-capacity meter that updates as the user types `surfaceAreaRequired`; slider + numeric input for humidity; instant client-side overcrowding warning, server verdict inline on 400.
- **Empty states:** hand-drawn-style SVG sprout illustration in grays with a single green accent, one-line copy, primary CTA.
- **Toasts:** bottom-center pill, icon + message + optional action, `fade-up-in`/auto-dismiss 5s; error toasts persist until dismissed and carry a Retry action.

## 7. Accessibility & dark mode

- Contrast AA minimum on all token pairs (verified in the tokens file comments).
- Focus ring: 2px `--brand-500` offset ring, on *everything* interactive.
- Capacity/humidity states always paired with text or icon, never color alone.
- Dark mode: token remap only (`prefers-color-scheme` + manual toggle stored per user) — surfaces flip to `#0c0a09/#1c1917`, gradients get dark variants; component code untouched. Shipped if time allows; tokens are structured for it either way.
