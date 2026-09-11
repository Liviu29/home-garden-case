import type { Point, SeriesBubbleOptions, XAxisOptions, YAxisOptions } from 'highcharts';
import {
  ATTENTION_HUMIDITY_DRIFT,
  ATTENTION_OCCUPANCY_RATIO,
} from '../../../domain/garden-insights/garden-insights';
import { ChartPalette } from '../../../shared/ui/chart/chart-palette';
import { PortfolioPoint, describeGarden, portfolioChartOptions } from './portfolio-chart-options';

const PALETTE: ChartPalette = {
  text: '#111111',
  muted: '#222222',
  faint: '#333333',
  grid: '#444444',
  surface: '#ffffff',
  brand: '#00aa00',
  warn: '#aa6600',
  danger: '#aa0000',
  info: '#0000aa',
  dry: '#ccaa44',
  balanced: '#44aa66',
  humid: '#3388dd',
};

const garden = (over: Partial<PortfolioPoint>): PortfolioPoint => ({
  gardenId: 1,
  name: 'Garden',
  occupancyPct: 50,
  drift: 0,
  area: 20,
  used: 10,
  target: 50,
  average: 50,
  kind: 'healthy',
  ...over,
});

type Callback = (this: unknown, ...args: unknown[]) => unknown;
const invoke = (fn: unknown, self: unknown, ...args: unknown[]) =>
  (fn as Callback).call(self, ...args);
const asPoint = (p: PortfolioPoint) =>
  ({ name: p.name, options: { custom: p } }) as unknown as Point;

describe('portfolioChartOptions (the dashboard portfolio map)', () => {
  const gardens = [
    garden({
      gardenId: 1,
      name: 'Rooftop',
      occupancyPct: 100,
      used: 10,
      area: 10,
      kind: 'capacity',
    }),
    garden({
      gardenId: 2,
      name: 'Balcony <Jungle>',
      occupancyPct: 38.3,
      drift: 41.25,
      average: 76.25,
      target: 35,
      area: 6,
      used: 2.3,
      kind: 'humidity',
    }),
    garden({ gardenId: 3, name: 'Orchard', occupancyPct: 53.3, drift: 1.4, area: 120, used: 64 }),
  ];
  const options = portfolioChartOptions(gardens, PALETTE, vi.fn());
  const series = options.series as SeriesBubbleOptions[];
  const x = options.xAxis as XAxisOptions;
  const y = options.yAxis as YAxisOptions;

  it('draws one bubble series per reason a garden sits where it does', () => {
    expect(series.map((s) => [s.name, s.color])).toEqual([
      ['Near capacity', PALETTE.warn],
      ['Humidity drift', PALETTE.info],
      ['Healthy', PALETTE.brand],
    ]);
  });

  it('leaves out a group with no gardens, so the legend never lists an empty one', () => {
    const onlyHealthy = portfolioChartOptions([gardens[2]], PALETTE, vi.fn());
    expect((onlyHealthy.series as SeriesBubbleOptions[]).map((s) => s.name)).toEqual(['Healthy']);
  });

  it('places each garden by fullness (x), humidity drift (y) and area (z)', () => {
    expect(series[1].data).toEqual([
      expect.objectContaining({ x: 38.3, y: 41.3, z: 6, name: 'Balcony <Jungle>' }),
    ]);
  });

  it('shades the two attention rules exactly where the dashboard applies them', () => {
    expect(x.plotBands?.[0]).toMatchObject({ from: ATTENTION_OCCUPANCY_RATIO * 100, to: x.max });
    expect(y.plotBands?.map((band) => [band.from, band.to])).toEqual([
      [ATTENTION_HUMIDITY_DRIFT, y.max],
      [y.min, -ATTENTION_HUMIDITY_DRIFT],
    ]);
    expect(x.plotLines?.[0]).toMatchObject({ value: 100 });
  });

  it('keeps every garden on the canvas: the axes grow with the data, symmetric around target', () => {
    expect([x.min, x.max]).toEqual([0, 110]);
    expect([y.min, y.max]).toEqual([-50, 50]);

    const calm = portfolioChartOptions([garden({ occupancyPct: 20 })], PALETTE, vi.fn());
    expect((calm.xAxis as XAxisOptions).max).toBe(100);
    expect((calm.yAxis as YAxisOptions).max).toBe(30);

    const shrunk = portfolioChartOptions([garden({ occupancyPct: 132 })], PALETTE, vi.fn());
    expect((shrunk.xAxis as XAxisOptions).max).toBe(140);
  });

  it('labels the drift axis with explicit signs', () => {
    const label = (value: number) => invoke(y.labels?.formatter, undefined, { value });
    expect([label(20), label(-10), label(0)]).toEqual(['+20', '−10', '±0']);
  });

  it('explains a garden in one sentence, for the tooltip and for screen readers', () => {
    expect(describeGarden(gardens[1])).toBe(
      'Balcony <Jungle>: 38% full, 2.3 of 6 m². Plants want 76% humidity, 41 points above the 35% target.',
    );
    expect(describeGarden(garden({ drift: -12.4, average: 37.6 }))).toContain(
      '12 points below the 50% target',
    );

    const tooltip = invoke(options.tooltip?.pointFormatter, asPoint(gardens[1])) as string;
    expect(tooltip).toContain('<b>Balcony &lt;Jungle&gt;</b>');
    expect(tooltip).toContain('target 35% (+41)');

    const spoken = options.accessibility?.point?.descriptionFormatter?.(asPoint(gardens[0]));
    expect(spoken).toBe(
      'Rooftop: 100% full, 10 of 10 m². Plants want 50% humidity, right on the 50% target. Opens the garden.',
    );
  });

  it('names only the gardens that need attention, and escapes the name', () => {
    const labels = series.map((s) => s.dataLabels as { enabled?: boolean; formatter?: unknown });
    expect(labels.map((l) => l.enabled)).toEqual([true, true, false]);
    expect(invoke(labels[1].formatter, asPoint(gardens[1]))).toBe('Balcony &lt;Jungle&gt;');
  });

  it('opens the garden behind a bubble when it is chosen', () => {
    const onOpen = vi.fn();
    const chosen = portfolioChartOptions(gardens, PALETTE, onOpen);

    invoke(chosen.plotOptions?.series?.point?.events?.click, asPoint(gardens[2]));

    expect(onOpen).toHaveBeenCalledWith(3);
  });

  it('gives narrow screens a bottom legend, smaller bubbles and no labels', () => {
    expect(options.responsive?.rules?.[0]).toMatchObject({
      condition: { maxWidth: 560 },
      chartOptions: {
        legend: { verticalAlign: 'bottom' },
        plotOptions: { bubble: { maxSize: 36 }, series: { dataLabels: { enabled: false } } },
      },
    });
  });

  it('stays quiet about itself: no Highcharts title or credit link', () => {
    expect(options.title?.text).toBeUndefined();
    expect(options.credits?.enabled).toBe(false);
  });
});
