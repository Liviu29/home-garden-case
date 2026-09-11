import type { Point, PointOptionsObject, SeriesVariwideOptions, YAxisOptions } from 'highcharts';
import { Garden, Plant } from '../../../core/api/models';
import { ChartPalette } from '../../../shared/ui/chart/chart-palette';
import { ProfilePlant, describePlant, humidityProfileOptions } from './humidity-profile-options';

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

const GARDEN: Garden = {
  gardenId: 7,
  gardenName: 'City Balcony',
  totalSurfaceArea: 6,
  targetHumidityLevel: 35,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
};

const plant = (plantId: number, plantName: string, humidity: number, area: number): Plant => ({
  plantId,
  plantName,
  species: 'sp',
  plantType: 'flower',
  plantationDate: '2026-06-01T00:00:00.000Z',
  surfaceAreaRequired: area,
  idealHumidityLevel: humidity,
  gardenId: 7,
  createdAt: '',
  updatedAt: '',
});

type Callback = (this: unknown, ...args: unknown[]) => unknown;
const invoke = (fn: unknown, self: unknown) => (fn as Callback).call(self);
const pointsOf = (options: ReturnType<typeof humidityProfileOptions>) =>
  (options.series as SeriesVariwideOptions[])[0].data as PointOptionsObject[];
const asPoint = (datum: PointOptionsObject) => ({ options: datum }) as unknown as Point;

describe('humidityProfileOptions (the garden humidity profile)', () => {
  const plants = [
    plant(1, 'Mint', 70, 0.4),
    plant(2, 'Fern <b>', 80, 0.8),
    plant(3, 'Aloe', 25, 0.5),
  ];
  const options = humidityProfileOptions(GARDEN, plants, null, PALETTE, vi.fn());
  const data = pointsOf(options);

  it('draws one column per plant, driest first, as wide as the m² it takes', () => {
    expect(data.map((d) => [d.name, d.y, d.z])).toEqual([
      ['Aloe', 25, 0.5],
      ['Mint', 70, 0.4],
      ['Fern <b>', 80, 0.8],
    ]);
  });

  it("colours every column by the planner's watering zone, boundaries included", () => {
    expect(data.map((d) => d.color)).toEqual([PALETTE.dry, PALETTE.humid, PALETTE.humid]);

    const edges = humidityProfileOptions(
      GARDEN,
      [plant(4, 'A', 49, 1), plant(5, 'B', 50, 1), plant(6, 'C', 69, 1), plant(7, 'D', 70, 1)],
      null,
      PALETTE,
      vi.fn(),
    );
    expect(pointsOf(edges).map((d) => d.color)).toEqual([
      PALETTE.dry,
      PALETTE.balanced,
      PALETTE.balanced,
      PALETTE.humid,
    ]);
  });

  it('marks the garden target and the ±15 tolerance, kept inside 0–100 %', () => {
    const y = options.yAxis as YAxisOptions;
    expect(y.plotLines?.[0]).toMatchObject({ value: 35 });
    expect(y.plotBands?.[0]).toMatchObject({ from: 20, to: 50 });

    const dry = humidityProfileOptions(
      { ...GARDEN, targetHumidityLevel: 5 },
      plants,
      null,
      PALETTE,
      vi.fn(),
    );
    const wet = humidityProfileOptions(
      { ...GARDEN, targetHumidityLevel: 95 },
      plants,
      null,
      PALETTE,
      vi.fn(),
    );
    expect((dry.yAxis as YAxisOptions).plotBands?.[0]).toMatchObject({ from: 0, to: 20 });
    expect((wet.yAxis as YAxisOptions).plotBands?.[0]).toMatchObject({ from: 80, to: 100 });
  });

  it('outlines the plant that is selected on the plan', () => {
    const selected = pointsOf(humidityProfileOptions(GARDEN, plants, 1, PALETTE, vi.fn()));
    expect(selected.map((d) => d.borderWidth)).toEqual([1, 3, 1]);
    expect(selected[1].borderColor).toBe(PALETTE.text);
  });

  it('explains each plant in one sentence, for the tooltip and for screen readers', () => {
    const fern = data[2].custom as ProfilePlant;
    expect(describePlant(fern)).toBe(
      'Fern <b>: wants 80% humidity, 45 points above the 35% target; 0.8 m², 13% of the garden; Humid watering zone.',
    );
    expect(describePlant({ ...fern, delta: 0 })).toContain('right on the 35% target');
    expect(describePlant({ ...fern, delta: -10 })).toContain('10 points below the 35% target');

    const tooltip = invoke(options.tooltip?.pointFormatter, asPoint(data[2])) as string;
    expect(tooltip).toContain('<b>Fern &lt;b&gt;</b>');
    expect(tooltip).toContain('Wants 80% · +45 vs the 35% target');
    expect(tooltip).toContain('Humid watering zone');

    const spoken = options.accessibility?.point?.descriptionFormatter?.(asPoint(data[0]));
    expect(spoken).toContain('Aloe: wants 25% humidity, 10 points below the 35% target');
    expect(spoken).toContain('Selecting it finds the plant on the plan.');
  });

  it('finds the plant on the plan when its column is chosen', () => {
    const onSelect = vi.fn();
    const chosen = humidityProfileOptions(GARDEN, plants, null, PALETTE, onSelect);

    invoke(chosen.plotOptions?.variwide?.point?.events?.click, asPoint(pointsOf(chosen)[1]));

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('never divides by a zero-sized garden', () => {
    const empty = pointsOf(
      humidityProfileOptions({ ...GARDEN, totalSurfaceArea: 0 }, plants, null, PALETTE, vi.fn()),
    );
    expect(empty.every((d) => (d.custom as ProfilePlant).share === 0)).toBe(true);
  });
});
