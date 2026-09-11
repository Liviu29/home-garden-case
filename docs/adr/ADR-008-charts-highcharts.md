# ADR-008 — Charts: Highcharts, loaded on demand

**Status**: Accepted · 2026-09-11

## Context

Two questions the app answers are clearer as charts than as more cards:

- **"Which gardens need me, and why?"** The dashboard's _portfolio map_ places every planted
  garden by how full it is and how far its plants' humidity drifts from its target, sized by
  its area, with the two attention rules drawn as bands.
- **"Does this garden's planting match its humidity target?"** The garden's _humidity profile_
  draws one column per plant, as wide as the m² it takes and as tall as the humidity it wants,
  against the garden's target.

Both need what charting libraries exist for: scaled axes and ticks, tooltips, label collision
handling, responsive rules and — for this app's bar — keyboard access and screen-reader
descriptions. The garden planner stays hand-rolled SVG ([ADR-007](./ADR-007-garden-visualization-engine.md))
because it is a domain scene with custom interaction; these two are standard analytic charts.

## Options considered

|                   | Hand-rolled SVG | Chart.js                     | ECharts                             | **Highcharts 13**                                                                  |
| ----------------- | --------------- | ---------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| Bubble + variwide | build both      | bubble only                  | bubble; variwide as a custom series | both built in (`highcharts-more`, `variwide`)                                      |
| Rendering         | SVG             | canvas                       | canvas or SVG                       | SVG                                                                                |
| Accessibility     | build it all    | canvas: needs a parallel DOM | ARIA description, limited keyboard  | accessibility module: keyboard navigation, per-point descriptions, a chart summary |
| Licence           | —               | MIT                          | Apache-2.0                          | free for non-commercial use; commercial use needs a licence                        |

## Decision

**Highcharts**, behind three rules:

1. **Loaded on demand.** `HighchartsLoader` imports the core and the three modules the app uses
   (`highcharts-more`, `variwide`, `accessibility`) with dynamic imports, once per app. Each
   chart sits in `@defer (on viewport)` behind a skeleton of the same size, so no route pays for
   the library until a chart scrolls into view. A failed load shows a text fallback and is
   retried on the next request.
2. **Options are pure functions of domain data.** `portfolioChartOptions` and
   `humidityProfileOptions` take plain data and a colour palette and return Highcharts options,
   unit-tested without Highcharts. The bands, zones and thresholds come from the domain
   (`ATTENTION_OCCUPANCY_RATIO`, `ATTENTION_HUMIDITY_DRIFT`, `wateringZone`), so a chart cannot
   disagree with the Attention Center or the planner.
3. **One wrapper.** `<app-chart>` takes options, creates the chart once, updates the same
   instance when the options change, and destroys it with the component.

Colours come from the design tokens, read when the options are built and rebuilt when the theme
changes: Highcharts writes SVG presentation attributes, where `var(--token)` does not resolve.

Both charts lead back into the app: choosing a bubble opens that garden; choosing a column selects
the plant on the planner, and the planner's selection outlines its column.

## Consequences

- **Bundle.** The initial bundle is unchanged (133.1 kB transferred). The library arrives in
  lazy chunks on the first chart view — core 90.6 kB, accessibility 35.1 kB, `highcharts-more`
  30.4 kB, `variwide` 1.7 kB: about **158 kB transferred**, once per session.
- **Accessibility.** Every bubble and column is a labelled, keyboard-reachable graphic. The axe
  scans in both themes include both charts, and the Playwright tests find points by their
  accessible names.
- **Testing.** The option builders are unit-tested as pure functions, `<app-chart>` is tested
  with a fake library, and the loader test imports the real modules and checks that the series
  types and accessibility support are registered.
- **Licence.** Highcharts is free for non-commercial use, which covers this case; a commercial
  product would need a licence. Because features only build options and render through
  `<app-chart>`, replacing the library would touch two builder files and one component.
- **No third-party requests.** The export module is not loaded and the credit link is off; the
  library is bundled, so nothing is fetched from Highcharts' servers.
- **Trade-off accepted.** About 158 kB for two charts is heavy next to a 133 kB app shell. It is
  deferred, cached after the first view, and buys accessibility the app would otherwise have to
  build and maintain itself.
