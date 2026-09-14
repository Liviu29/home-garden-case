# Accessibility

Target: WCAG 2.2 AA. Accessibility here is architecture, not garnish — the same shared components that give every screen its loading/empty/error states also carry the a11y behaviour, so screens cannot opt out.

## What is implemented, and where

**Semantics & structure**

- One `h1` per page (PageHeader / hero), sectioned headings (`h2` + `aria-labelledby`) on detail panels; landmarks: `header`, `nav[aria-label="Primary"]`, `main` — the welcome page, outside the shell, has its own `main` and skip link.
- The plants table is a real `<table>` with `scope="col"` headers; the humidity gauge is `role="img"` with a full-sentence `aria-label` (the numbers, not just the shape).

**Garden Map (the SVG digital twin — ADR-007)**

- The map deliberately avoids the canvas-accessibility trap: it is SVG, so every plant plot is a **real focusable element** (`role="button"`, `tabindex="0"`, `aria-pressed`, full-sentence `aria-label` with name, m² and share). No `aria-hidden` canvas, no parallel shadow DOM to keep in sync.
- The `<svg>` itself is `role="group"` with an aria-label that reads the garden's totals and the keyboard contract; it is focusable and supports arrows (pan), `+`/`-` (zoom), `0` (fit), `Escape` (clear selection). Enter/Space on a plot selects it.
- Everything informational also exists as plain DOM: the toolbar is a real `role="toolbar"` of native buttons, the HUD chips are text, and the selected plot's full details render in the inspector `aside[aria-label="Plant inspector"]` with Edit/Remove as real buttons. The hover tooltip is a visual duplicate and is `aria-hidden`.
- **The plan as a list.** The toolbar's _Show the plan as a list_ (`aria-pressed`) opens a labelled region with a real `<table>` — every bed in reading order with its position in metres, width × depth, watering zone and the beds next to it. Each bed name is a button that selects it on the plan and in the inspector. This is the text equivalent of the drawing: a screen-reader user gets the layout, not just the totals.
- The e2e a11y suite scans the detail page **with the map hydrated** and asserts plot keyboard operation (focus + Enter → `aria-pressed` + inspector); the planner suite scans the plan list too.

**Charts (Highcharts — ADR-008)**

- Both charts load Highcharts' accessibility module: the chart is a labelled region with a summary, and every bubble or column is a keyboard-reachable graphic whose name is a full sentence ("Rooftop: 95% full, 9.5 of 10 m². Plants want 60% humidity, 10 points above the 50% target."). Arrow keys move between points; Enter does what a click does.
- Colour is never the only signal: the zone is also in each column's description and tooltip, and the plants table below repeats every value.

**Keyboard**

- Skip-to-content link as the first focusable element of every page, visible on keyboard focus, jumping to `#main-content`.
- **Focus follows navigation.** After a route change, focus moves to the new page's `main` (`tabindex="-1"`, no ring — a landmark, not a control), so a keyboard or screen-reader user starts the new page at its content instead of wherever focus was left on the old one. The page load itself is left alone: a document starts at its top. (`app.ts`, asserted in `app.spec.ts`.)
- **The fullscreen planner behaves like a dialog.** It traps focus (`cdkTrapFocus`), opens on its search field, returns focus to the control that opened it, and gives the page its scroll back even when the screen is left while the planner is still fullscreen.
- Everything interactive is a native `button`/`a` — no clickable divs. Focus is never trapped except in dialogs, where Material CDK manages containment and restore; `cdkFocusInitial` lands on the primary action.
- Visible focus everywhere: a global `:focus-visible` ring (2px brand ring with offset) that no component removes.

**Forms & validation**

- Every field has a real `<mat-label>`; errors render inside `mat-error` (wired via `aria-describedby` by Material); cross-field and server verdicts render as `role="alert"` paragraphs so they are announced when they appear — and the cross-field verdicts (a plant that would overcrowd its garden, a garden shrunk below its plants, one coordinate without the other) also describe the fields they judge (`aria-describedby`), so a screen reader hears the verdict on the input, not only at the moment it appears.
- The humidity sliders are labelled via `aria-labelledby` with a live numeric readout; validation happens on input, not only on submit.

**Loading & async**

- SkeletonGroup exposes `role="status"` + `aria-live="polite"` with a visually-hidden "Loading…"; the ghost blocks themselves are `aria-hidden`. A search on the gardens grid announces what it left ("3 gardens match your search", a visually-hidden `role="status"`), for those who cannot see the grid change.
- The toast host is an `aria-live="polite"` region; error toasts persist until dismissed (no timed removal of content the user hasn't seen); dismiss buttons carry `aria-label`. A timed toast pauses while the pointer is on it or focus is inside it (WCAG 2.2.1), so a keyboard user can still reach its Undo.

**Not color alone**

- Capacity states pair color with the numbers and a text status (Healthy / Nearly full / Full); humidity drift pairs color with ▲/▼ glyphs and signed values; plant-type blocks carry text labels and a legend.

**Motion & display**

- `prefers-reduced-motion` collapses every animation to ≤1 ms and swaps the shimmer for a slow opacity pulse (see `_motion.scss`).
- All type in `rem` — browser font-size settings scale the whole app; contrast pairs are AA-checked in the token file.

**Automated verification**

- @axe-core/playwright scans dashboard (both themes, portfolio map included), gardens and garden detail (humidity profile included) in the mocked e2e project; `serious`/`critical` violations fail the suite. Accent tokens (`--text-3`, amber, info, danger) are tuned per theme to pass AA (darker in light, lighter in dark). Scans run under reduced-motion emulation so entry animations can't blend colors mid-scan.
- Keyboard behaviour is asserted in e2e: dialog autofocus, focus containment, Escape-restore to trigger, slider arrow-key operation. Unit specs drive Material through the CDK component harnesses (menus, selects, dialogs, form fields) rather than its DOM, so what a test presses is what a user reaches.
- The `nl` Playwright project boots the Dutch build on a development server of its own and checks the document language, the first headings and the decimal comma — the second build is run, not only compiled.

## Known gaps

- The Garden Map's grid and humidity halo are decorative and carry no semantics (by design); the layout reaches assistive technology through the plan list and the inspector. There is no arrow-key navigation _between_ beds — on a focused bed the arrows move it (the keyboard alternative to dragging), so beds are reached with Tab or from the list.
