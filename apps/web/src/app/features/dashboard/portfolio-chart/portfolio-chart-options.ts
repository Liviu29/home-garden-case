import type { Options, Point, SeriesScatterOptions } from 'highcharts';
import {
  ATTENTION_HUMIDITY_DRIFT,
  ATTENTION_OCCUPANCY_RATIO,
} from '../../../domain/garden-insights/garden-insights';
import { plantedGardensCount, pointsCount } from '../../../core/i18n/plurals';
import { ChartPalette, escapeLabel, withAlpha } from '../../../shared/ui/chart/chart-palette';

/** Why a garden sits where it does — the same reasons as the Attention Center. */
export type PortfolioKind = 'capacity' | 'humidity' | 'healthy';

export interface PortfolioPoint {
  readonly gardenId: number;
  readonly name: string;
  /** Share of the surface in use, in % (above 100 after a garden was shrunk). */
  readonly occupancyPct: number;
  /** The plants' average ideal humidity minus the garden's target, in points. */
  readonly drift: number;
  readonly area: number;
  readonly used: number;
  readonly target: number;
  readonly average: number;
  readonly kind: PortfolioKind;
}

const SERIES_NAME: Readonly<Record<PortfolioKind, string>> = {
  capacity: $localize`Near capacity`,
  humidity: $localize`Humidity drift`,
  healthy: $localize`Healthy`,
};

/** Marker radius range in px — the smallest garden stays clickable, the largest never swamps. */
const MIN_RADIUS = 7;
const MAX_RADIUS = 26;
/** Gap between a marker's edge and its name label, in px. */
const LABEL_GAP = 4;
/**
 * Gardens crowd together near 100%, where Highcharts would hide every label
 * that collides. Their names are stacked in rows off the markers' line
 * instead — the fullest just above it, the next just below, then further out
 * — so no name crosses a neighbour's marker. A row clears a label's padded box.
 */
const LABEL_ROWS = [-1, 1, -2, 2, -3, 3] as const;
const LABEL_ROW_PX = 22;

const round = (value: number, digits = 0): number => Number(value.toFixed(digits));
const signed = (value: number): string => {
  const whole = round(value);
  return `${whole > 0 ? '+' : whole < 0 ? '−' : '±'}${Math.abs(whole)}`;
};
const pointOf = (point: Point): PortfolioPoint => point.options.custom as PortfolioPoint;

/**
 * A garden's marker radius: its drawn AREA is proportional to its m², the way
 * a bubble chart sizes bubbles. Drawing the bubbles as sized scatter markers
 * keeps the whole `highcharts-more` module (~30 kB gzipped) out of the app.
 */
export function markerRadius(area: number, largestArea: number): number {
  if (largestArea <= 0) {
    return MIN_RADIUS;
  }
  const share = Math.sqrt(Math.max(0, area) / largestArea);
  return round(MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * share, 1);
}

/** One sentence per garden, shared by the tooltip and by screen readers. */
export function describeGarden(p: PortfolioPoint): string {
  const drift = round(p.drift);
  const humidity =
    drift === 0
      ? $localize`right on the ${p.target}:target:% target`
      : drift > 0
        ? $localize`${pointsCount(Math.abs(drift))}:points: above the ${p.target}:target:% target`
        : $localize`${pointsCount(Math.abs(drift))}:points: below the ${p.target}:target:% target`;
  return $localize`${p.name}:name:: ${round(p.occupancyPct)}:occupancy:% full, ${round(p.used, 1)}:used: of ${p.area}:area: m². Plants want ${round(p.average)}:average:% humidity, ${humidity}:humidity:.`;
}

/**
 * The portfolio map: every planted garden placed by how full it is (x) and
 * how far its plants' humidity drifts from its target (y), sized by its area.
 * The shaded bands are the dashboard's attention rules, drawn from the same
 * domain constants, so the picture and the cards can never disagree.
 */
export function portfolioChartOptions(
  points: readonly PortfolioPoint[],
  palette: ChartPalette,
  onOpen: (gardenId: number) => void,
): Options {
  const nearPct = ATTENTION_OCCUPANCY_RATIO * 100;
  const tolerance = ATTENTION_HUMIDITY_DRIFT;
  const fullest = Math.max(0, ...points.map((p) => p.occupancyPct));
  const widestDrift = Math.max(0, ...points.map((p) => Math.abs(p.drift)));
  const largestArea = Math.max(0, ...points.map((p) => p.area));
  const xMax = Math.max(100, Math.ceil((fullest + 5) / 10) * 10);
  const yMax = Math.max(30, Math.ceil((widestDrift + 8) / 10) * 10);
  const axisText = { color: palette.muted, fontSize: '12px' };
  const bandText = { color: palette.faint, fontSize: '11px', fontWeight: '600' };
  const labelRow = new Map(
    points
      .filter((p) => p.occupancyPct >= nearPct)
      .sort((a, b) => b.occupancyPct - a.occupancyPct || a.gardenId - b.gardenId)
      .map((p, i) => [p.gardenId, LABEL_ROWS[i % LABEL_ROWS.length]]),
  );

  const series = (['capacity', 'humidity', 'healthy'] as const)
    .map((kind): SeriesScatterOptions => {
      const color =
        kind === 'capacity' ? palette.warn : kind === 'humidity' ? palette.info : palette.brand;
      return {
        type: 'scatter',
        id: kind,
        name: SERIES_NAME[kind],
        color,
        marker: {
          symbol: 'circle',
          fillColor: withAlpha(color, 0.55),
          lineColor: color,
          lineWidth: 1.5,
        },
        data: points
          .filter((p) => p.kind === kind)
          .map((p) => {
            const radius = markerRadius(p.area, largestArea);
            // In the near-capacity band the name reads leftwards, away from
            // the 100% line and the plot edge, so it never sits on either.
            const leftwards = p.occupancyPct >= nearPct;
            return {
              x: round(p.occupancyPct, 1),
              y: round(p.drift, 1),
              name: p.name,
              marker: { radius },
              dataLabels: {
                align: leftwards ? ('right' as const) : ('left' as const),
                x: leftwards ? -(radius + LABEL_GAP) : radius + LABEL_GAP,
                y: (labelRow.get(p.gardenId) ?? 0) * LABEL_ROW_PX,
              },
              custom: p,
            };
          }),
        dataLabels: {
          // Name the gardens that need attention; healthy ones stay quiet.
          enabled: kind !== 'healthy',
          verticalAlign: 'middle',
          y: 0,
          formatter: function (this: Point) {
            return escapeLabel(String(this.name ?? ''));
          },
          // Click-through: a name label must never block its own marker.
          style: {
            color: palette.text,
            textOutline: 'none',
            fontSize: '11px',
            fontWeight: '600',
            pointerEvents: 'none',
          },
        },
      };
    })
    .filter((s) => (s.data?.length ?? 0) > 0);

  return {
    chart: {
      type: 'scatter',
      backgroundColor: 'transparent',
      spacing: [8, 8, 8, 8],
      style: { fontFamily: 'inherit' },
    },
    title: { text: undefined },
    credits: { enabled: false },
    accessibility: {
      description: $localize`Bubble chart of ${plantedGardensCount(points.length)}:gardens:. Horizontal: share of the surface in use. Vertical: how far the plants' average ideal humidity is from the garden's target. Bubble size: garden area. Gardens at least ${nearPct}:nearPct:% full, or more than ${tolerance}:tolerance: points from their target, need attention.`,
      point: {
        descriptionFormatter: (point) =>
          $localize`${describeGarden(pointOf(point))}:description: Opens the garden.`,
      },
    },
    legend: {
      align: 'right',
      verticalAlign: 'top',
      itemStyle: { color: palette.text, fontWeight: '500', fontSize: '12px' },
      itemHoverStyle: { color: palette.text },
      itemHiddenStyle: { color: palette.faint },
    },
    xAxis: {
      min: 0,
      max: xMax,
      tickInterval: 10,
      gridLineWidth: 1,
      gridLineColor: palette.grid,
      lineColor: palette.grid,
      tickColor: palette.grid,
      title: { text: $localize`Capacity used`, style: axisText },
      labels: { format: '{value}%', style: axisText },
      plotBands: [
        {
          from: nearPct,
          to: xMax,
          color: withAlpha(palette.warn, 0.1),
          // Short and anchored at the band's left edge, clear of the 100% line
          // (the legend already says "Near capacity").
          label: {
            text: $localize`≥ ${nearPct}:percent:% full`,
            rotation: 0,
            align: 'left',
            verticalAlign: 'top',
            x: 6,
            y: 14,
            style: bandText,
          },
        },
      ],
      plotLines: [
        { value: 100, color: palette.danger, width: 1, dashStyle: 'ShortDash', zIndex: 3 },
      ],
    },
    yAxis: {
      min: -yMax,
      max: yMax,
      tickInterval: 10,
      startOnTick: false,
      endOnTick: false,
      gridLineColor: palette.grid,
      title: { text: $localize`Humidity drift vs target`, style: axisText },
      labels: { formatter: (ctx) => signed(Number(ctx.value)), style: axisText },
      plotBands: [
        {
          from: tolerance,
          to: yMax,
          color: withAlpha(palette.humid, 0.1),
          label: {
            text: $localize`Plants want more humidity`,
            align: 'left',
            x: 8,
            y: 16,
            style: bandText,
          },
        },
        {
          from: -yMax,
          to: -tolerance,
          color: withAlpha(palette.dry, 0.14),
          label: {
            text: $localize`Plants want less humidity`,
            align: 'left',
            verticalAlign: 'bottom',
            x: 8,
            y: -8,
            style: bandText,
          },
        },
      ],
      plotLines: [
        {
          value: 0,
          color: palette.muted,
          width: 1,
          zIndex: 3,
        },
      ],
    },
    tooltip: {
      backgroundColor: palette.surface,
      borderColor: palette.grid,
      style: { color: palette.text, fontSize: '12px' },
      headerFormat: '',
      pointFormatter: function (this: Point) {
        const p = pointOf(this);
        return (
          `<b>${escapeLabel(p.name)}</b><br/>` +
          $localize`${round(p.occupancyPct)}:occupancy:% full · ${round(p.used, 1)}:used: of ${p.area}:area: m²` +
          '<br/>' +
          $localize`Plants want ${round(p.average)}:average:% · target ${p.target}:target:% (${signed(p.drift)}:drift:)`
        );
      },
    },
    plotOptions: {
      series: {
        cursor: 'pointer',
        point: {
          events: {
            click: function (this: Point) {
              onOpen(pointOf(this).gardenId);
            },
          },
        },
      },
    },
    series,
    responsive: {
      rules: [
        {
          condition: { maxWidth: 560 },
          chartOptions: {
            legend: { align: 'center', verticalAlign: 'bottom' },
            yAxis: { title: { text: undefined } },
            // Series options outrank plotOptions, so the labels are switched
            // off per series (matched by id), not with a plotOptions default.
            series: series.map((s) => ({ id: s.id, dataLabels: { enabled: false } })),
          },
        },
      ],
    },
  };
}
