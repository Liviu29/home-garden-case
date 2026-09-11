import type { Options, Point, SeriesBubbleOptions } from 'highcharts';
import {
  ATTENTION_HUMIDITY_DRIFT,
  ATTENTION_OCCUPANCY_RATIO,
} from '../../../domain/garden-insights/garden-insights';
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
  capacity: 'Near capacity',
  humidity: 'Humidity drift',
  healthy: 'Healthy',
};

const round = (value: number, digits = 0): number => Number(value.toFixed(digits));
const signed = (value: number): string => {
  const whole = round(value);
  return `${whole > 0 ? '+' : whole < 0 ? '−' : '±'}${Math.abs(whole)}`;
};
const pointOf = (point: Point): PortfolioPoint => point.options.custom as PortfolioPoint;

/** One sentence per garden, shared by the tooltip and by screen readers. */
export function describeGarden(p: PortfolioPoint): string {
  const drift = round(p.drift);
  const humidity =
    drift === 0
      ? `right on the ${p.target}% target`
      : `${Math.abs(drift)} points ${drift > 0 ? 'above' : 'below'} the ${p.target}% target`;
  return (
    `${p.name}: ${round(p.occupancyPct)}% full, ${round(p.used, 1)} of ${p.area} m². ` +
    `Plants want ${round(p.average)}% humidity, ${humidity}.`
  );
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
  const xMax = Math.max(100, Math.ceil((fullest + 5) / 10) * 10);
  const yMax = Math.max(30, Math.ceil((widestDrift + 8) / 10) * 10);
  const axisText = { color: palette.muted, fontSize: '12px' };
  const bandText = { color: palette.faint, fontSize: '11px', fontWeight: '600' };

  const series = (['capacity', 'humidity', 'healthy'] as const)
    .map((kind): SeriesBubbleOptions => ({
      type: 'bubble',
      name: SERIES_NAME[kind],
      color:
        kind === 'capacity' ? palette.warn : kind === 'humidity' ? palette.info : palette.brand,
      data: points
        .filter((p) => p.kind === kind)
        .map((p) => ({
          x: round(p.occupancyPct, 1),
          y: round(p.drift, 1),
          z: p.area,
          name: p.name,
          custom: p,
        })),
      dataLabels: {
        // Name the gardens that need attention; healthy ones stay quiet.
        enabled: kind !== 'healthy',
        formatter: function (this: Point) {
          return escapeLabel(String(this.name ?? ''));
        },
        // Click-through: a name label must never cover its own bubble.
        style: {
          color: palette.text,
          textOutline: 'none',
          fontSize: '11px',
          fontWeight: '600',
          pointerEvents: 'none',
        },
      },
    }))
    .filter((s) => (s.data?.length ?? 0) > 0);

  return {
    chart: {
      type: 'bubble',
      backgroundColor: 'transparent',
      spacing: [8, 8, 8, 8],
      style: { fontFamily: 'inherit' },
    },
    title: { text: undefined },
    credits: { enabled: false },
    accessibility: {
      description:
        `Bubble chart of ${points.length} planted gardens. Horizontal: share of the surface in ` +
        `use. Vertical: how far the plants' average ideal humidity is from the garden's target. ` +
        `Bubble size: garden area. Gardens at least ${nearPct}% full, or more than ${tolerance} ` +
        `points from their target, need attention.`,
      point: {
        descriptionFormatter: (point) => `${describeGarden(pointOf(point))} Opens the garden.`,
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
      title: { text: 'Capacity used', style: axisText },
      labels: { format: '{value}%', style: axisText },
      plotBands: [
        {
          from: nearPct,
          to: xMax,
          color: withAlpha(palette.warn, 0.1),
          label: {
            text: `Near capacity ≥ ${nearPct}%`,
            rotation: 0,
            verticalAlign: 'top',
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
      title: { text: 'Humidity drift vs target', style: axisText },
      labels: { formatter: (ctx) => signed(Number(ctx.value)), style: axisText },
      plotBands: [
        {
          from: tolerance,
          to: yMax,
          color: withAlpha(palette.humid, 0.1),
          label: { text: 'Plants want more humidity', align: 'left', x: 8, y: 16, style: bandText },
        },
        {
          from: -yMax,
          to: -tolerance,
          color: withAlpha(palette.dry, 0.14),
          label: {
            text: 'Plants want less humidity',
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
          `${round(p.occupancyPct)}% full · ${round(p.used, 1)} of ${p.area} m²<br/>` +
          `Plants want ${round(p.average)}% · target ${p.target}% (${signed(p.drift)})`
        );
      },
    },
    plotOptions: {
      bubble: {
        minSize: 14,
        maxSize: 56,
        sizeBy: 'area',
        zMin: 0,
        marker: { fillOpacity: 0.55, lineWidth: 1.5 },
      },
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
            plotOptions: { bubble: { maxSize: 36 }, series: { dataLabels: { enabled: false } } },
          },
        },
      ],
    },
  };
}
