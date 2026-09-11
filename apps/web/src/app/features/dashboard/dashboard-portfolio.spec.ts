import {
  ComponentFixture,
  DeferBlockBehavior,
  DeferBlockState,
  TestBed,
} from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import type { Options, SeriesScatterOptions } from 'highcharts';
import { Garden, Plant } from '../../core/api/models';
import { GardensApi } from '../../core/api/gardens-api';
import { PlantsApi } from '../../core/api/plants-api';
import { APP_CONFIG, AppConfig } from '../../core/config/app-config';
import { ThemeStore } from '../../core/config/theme-store';
import { HighchartsLib, HighchartsLoader } from '../../shared/ui/chart/highcharts-loader';
import { Dashboard } from './dashboard';

const garden = (id: number, name: string, area = 20, target = 50): Garden => ({
  gardenId: id,
  gardenName: name,
  totalSurfaceArea: area,
  targetHumidityLevel: target,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
});

const plant = (id: number, gardenId: number, area: number, humidity = 50): Plant => ({
  plantId: id,
  plantName: `P${id}`,
  species: 's',
  plantType: 'vegetable',
  plantationDate: '2026-04-01T00:00:00.000Z',
  surfaceAreaRequired: area,
  idealHumidityLevel: humidity,
  gardenId,
  createdAt: '',
  updatedAt: '',
});

const CONFIG: AppConfig = {
  apiBaseUrl: '/api',
  retry: { maxAttempts: 1, baseDelayMs: 1, backoffFactor: 1, maxDelayMs: 1 },
  cache: { freshTtlMs: 30_000 },
  toastDurationMs: 5000,
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

/**
 * The portfolio map on the dashboard. Highcharts itself is replaced by a fake:
 * what matters here is which gardens reach the chart and what a bubble does.
 */
describe('Dashboard portfolio map', () => {
  let gardensApi: { getAll: ReturnType<typeof vi.fn> };
  let plantsApi: { getByGarden: ReturnType<typeof vi.fn>; getAll: ReturnType<typeof vi.fn> };
  let chart: ReturnType<typeof vi.fn>;
  let instance: { update: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    instance = { update: vi.fn(), destroy: vi.fn() };
    chart = vi.fn<(container: HTMLElement, options: Options) => typeof instance>(() => instance);
    gardensApi = { getAll: vi.fn() };
    plantsApi = { getByGarden: vi.fn().mockResolvedValue([]), getAll: vi.fn() };
    TestBed.configureTestingModule({
      imports: [Dashboard],
      deferBlockBehavior: DeferBlockBehavior.Manual,
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: APP_CONFIG, useValue: CONFIG },
        { provide: GardensApi, useValue: gardensApi },
        { provide: PlantsApi, useValue: plantsApi },
        {
          provide: HighchartsLoader,
          useValue: {
            load: () => Promise.resolve({ chart } as unknown as HighchartsLib),
            prefetchWhenIdle: vi.fn(),
          },
        },
      ],
    });
  });

  afterEach(() => TestBed.inject(ThemeStore).set('light'));

  async function mount() {
    const fixture = TestBed.createComponent(Dashboard);
    await fixture.whenStable();
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
    await tick();
    fixture.detectChanges();
    const section = (fixture.nativeElement as HTMLElement).querySelector(
      'section[aria-labelledby="portfolio-heading"]',
    ) as HTMLElement;
    return { fixture, section };
  }

  async function renderChart(fixture: ComponentFixture<Dashboard>): Promise<Options> {
    const [block] = await fixture.getDeferBlocks();
    await block.render(DeferBlockState.Complete);
    await vi.waitFor(() => expect(chart).toHaveBeenCalled());
    return chart.mock.calls[0][1] as Options;
  }

  it('holds the chart space with a skeleton while plant lists are still arriving', async () => {
    gardensApi.getAll.mockResolvedValue([garden(1, 'A')]);
    plantsApi.getByGarden.mockReturnValue(new Promise(() => undefined));

    const { section } = await mount();

    expect(section.querySelector('app-skeleton')).not.toBeNull();
    expect(section.textContent).not.toContain('Plant something');
  });

  it('asks for a first plant while no garden has any', async () => {
    gardensApi.getAll.mockResolvedValue([garden(1, 'A')]);

    const { section } = await mount();

    expect(section.textContent).toContain('Plant something in a garden to place it on the map.');
  });

  it('plots every planted garden — not the empty ones — and a bubble opens it', async () => {
    gardensApi.getAll.mockResolvedValue([
      garden(1, 'Rooftop', 10),
      garden(2, 'Orchard', 20),
      garden(3, 'New bed', 8),
    ]);
    // Several gardens: their plants arrive in one request.
    plantsApi.getAll.mockResolvedValue([plant(1, 1, 9.5), plant(2, 2, 4, 55)]);
    const { fixture } = await mount();

    const options = await renderChart(fixture);

    expect(plantsApi.getByGarden).not.toHaveBeenCalled();
    const series = options.series as SeriesScatterOptions[];
    expect(series.map((s) => [s.name, (s.data ?? []).length])).toEqual([
      ['Near capacity', 1],
      ['Healthy', 1],
    ]);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const open = options.plotOptions?.series?.point?.events?.click as unknown as (
      this: unknown,
    ) => void;
    open.call({ options: { custom: { gardenId: 2 } } });
    expect(navigate).toHaveBeenCalledWith(['/gardens', 2]);
  });

  it('plots nothing for a garden whose plants could not be loaded', async () => {
    gardensApi.getAll.mockResolvedValue([garden(1, 'Rooftop', 10), garden(4, 'Offline', 8)]);
    plantsApi.getAll.mockRejectedValue(new Error('unavailable'));

    const { section } = await mount();

    expect(section.textContent).toContain('Plant something in a garden to place it on the map.');
  });

  it('warms the chart library once the dashboard has rendered', async () => {
    gardensApi.getAll.mockResolvedValue([]);
    await mount();

    expect(TestBed.inject(HighchartsLoader).prefetchWhenIdle).toHaveBeenCalled();
  });

  it('redraws in the new palette when the theme changes', async () => {
    gardensApi.getAll.mockResolvedValue([garden(1, 'Rooftop', 10)]);
    plantsApi.getByGarden.mockResolvedValue([plant(1, 1, 9.5)]);
    const { fixture } = await mount();
    await renderChart(fixture);

    TestBed.inject(ThemeStore).set('dark');
    fixture.detectChanges();

    await vi.waitFor(() => expect(instance.update).toHaveBeenCalled());
  });
});
