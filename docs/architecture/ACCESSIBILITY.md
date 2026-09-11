# Accessibility

Target: WCAG 2.2 AA. Accessibility here is architecture, not garnish — the same shared components that give every screen its loading/empty/error states also carry the a11y behaviour, so screens cannot opt out.

## What is implemented, and where

**Semantics & structure**

- One `h1` per page (PageHeader / hero), sectioned headings (`h2` + `aria-labelledby`) on detail panels; landmarks: `header`, `nav[aria-label="Primary"]`, `main`.
- The plants table is a real `<table>` with `scope="col"` headers; the humidity gauge is `role="img"` with a full-sentence `aria-label` (the numbers, not just the shape).

**Garden Map (the SVG digital twin — ADR-007)**

- The map deliberately avoids the canvas-accessibility trap: it is SVG, so every plant plot is a **real focusable element** (`role="button"`, `tabindex="0"`, `aria-pressed`, full-sentence `aria-label` with name, m² and share). No `aria-hidden` canvas, no parallel shadow DOM to keep in sync.
- The `<svg>` itself is `role="group"` with an aria-label that reads the garden's totals and the keyboard contract; it is focusable and supports arrows (pan), `+`/`-` (zoom), `0` (fit), `Escape` (clear selection). Enter/Space on a plot selects it.
- Everything informational also exists as plain DOM: the toolbar is a real `role="toolbar"` of native buttons, the HUD chips are text, and the selected plot's full details render in the inspector `aside[aria-label="Plant inspector"]` with Edit/Remove as real buttons. The hover tooltip is a visual duplicate and is `aria-hidden`.
- The e2e a11y suite scans the detail page **with the map hydrated** and asserts plot keyboard operation (focus + Enter → `aria-pressed` + inspector).

**Charts (Highcharts — ADR-008)**

- Both charts load Highcharts' accessibility module: the chart is a labelled region with a summary, and every bubble or column is a keyboard-reachable graphic whose name is a full sentence ("Rooftop: 95% full, 9.5 of 10 m². Plants want 60% humidity, 10 points above the 50% target."). Arrow keys move between points; Enter does what a click does.
- Colour is never the only signal: the zone is also in each column's description and tooltip, and the plants table below repeats every value.

**Keyboard**

- Skip-to-content link as the first focusable element, visible on keyboard focus, jumping to `#main-content`.
- Everything interactive is a native `button`/`a` — no clickable divs. Focus is never trapped except in dialogs, where Material CDK manages containment and restore; `cdkFocusInitial` lands on the primary action.
- Visible focus everywhere: a global `:focus-visible` ring (2px brand ring with offset) that no component removes.

**Forms & validation**

- Every field has a real `<mat-label>`; errors render inside `mat-error` (wired via `aria-describedby` by Material); cross-field and server verdicts render as `role="alert"` paragraphs so they are announced when they appear.
- The humidity sliders are labelled via `aria-labelledby` with a live numeric readout; validation happens on input, not only on submit.

**Loading & async**

- SkeletonGroup exposes `role="status"` + `aria-live="polite"` with a visually-hidden "Loading…"; the ghost blocks themselves are `aria-hidden`.
- The toast host is an `aria-live="polite"` region; error toasts persist until dismissed (no timed removal of content the user hasn't seen); dismiss buttons carry `aria-label`.

**Not color alone**

- Capacity states pair color with the numbers and a text status (Healthy / Nearly full / Full); humidity drift pairs color with ▲/▼ glyphs and signed values; plant-type blocks carry text labels and a legend.

**Motion & display**

- `prefers-reduced-motion` collapses every animation to ≤1 ms and swaps the shimmer for a slow opacity pulse (see `_motion.scss`).
- All type in `rem` — browser font-size settings scale the whole app; contrast pairs are AA-checked in the token file.

**Automated verification**

- @axe-core/playwright scans dashboard (both themes, portfolio map included), gardens and garden detail (humidity profile included) in the mocked e2e project; `serious`/`critical` violations fail the suite. Accent tokens (`--text-3`, amber, info, danger) are tuned per theme to pass AA (darker in light, lighter in dark). Scans run under reduced-motion emulation so entry animations can't blend colors mid-scan.
- Keyboard behaviour is asserted in e2e: dialog autofocus, focus containment, Escape-restore to trigger, slider arrow-key operation.

## Known gaps

- The Garden Map's grid/humidity halo are purely decorative and carry no semantics (by design); a screen-reader user gets the totals from the map's group label, the HUD text and the plants table rather than a spatial rendering. The plot nodes themselves are fully operable.
- Map wheel-zoom intercepts scroll while the pointer is over the map surface (standard map behaviour); keyboard users are unaffected (arrows/`+`/`-` operate on the focused map only).
