import { DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import type { Options, PointOptionsObject, SeriesVariwideOptions } from 'highcharts';
import { Garden, Plant } from '../../core/api/models';
import { GardensApi } from '../../core/api/gardens-api';
import { PlantsApi } from '../../core/api/plants-api';
import { APP_CONFIG, AppConfig } from '../../core/config/app-config';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm-dialog';
import { HighchartsLib, HighchartsLoader } from '../../shared/ui/chart/highcharts-loader';
import { GardenDetail } from './garden-detail';
import { GardenDetailStore } from './garden-detail-store/garden-detail-store';

const CONFIG = {
  apiBaseUrl: '/api',
  retry: { maxAttempts: 1, baseDelayMs: 1, backoffFactor: 1, maxDelayMs: 1 },
  cache: { freshTtlMs: 30_000 },
  toastDurationMs: 5000,
} as AppConfig;

const GARDEN: Garden = {
  gardenId: 1,
  gardenName: 'Backyard Beds',
  totalSurfaceArea: 20,
  targetHumidityLevel: 60,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
};

const plant = (plantId: number, plantName: string, humidity: number): Plant => ({
  plantId,
  plantName,
  species: 'sp',
  plantType: 'vegetable',
  plantationDate: '2026-04-01T00:00:00.000Z',
  surfaceAreaRequired: 5,
  idealHumidityLevel: humidity,
  gardenId: 1,
  createdAt: '',
  updatedAt: '',
});

type ProfileApi = {
  humidityProfile: () => Options | null;
  selectedPlantId: { (): number | null; set: (v: number | null) => void };
  findOnPlan: (plantId: number) => void;
};

const dataOf = (options: Options) =>
  (options.series as SeriesVariwideOptions[])[0].data as PointOptionsObject[];

/**
 * The humidity profile on garden detail. Highcharts is replaced by a fake:
 * what matters is when the chart appears, what it is given, and that a
 * column finds its plant on the plan.
 */
describe('GardenDetail humidity profile', () => {
  let gardensApi: Record<string, ReturnType<typeof vi.fn>>;
  let plantsApi: Record<string, ReturnType<typeof vi.fn>>;
  let chart: ReturnType<typeof vi.fn>;
  let instance: { update: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  let scrollIntoView: ReturnType<typeof vi.fn>;

  const render = () => {
    TestBed.configureTestingModule({
      deferBlockBehavior: DeferBlockBehavior.Manual,
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: APP_CONFIG, useValue: CONFIG },
        { provide: GardensApi, useValue: gardensApi },
        { provide: PlantsApi, useValue: plantsApi },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: ConfirmService, useValue: { confirm: vi.fn() } },
        {
          provide: HighchartsLoader,
          useValue: { load: () => Promise.resolve({ chart } as unknown as HighchartsLib) },
        },
      ],
    });
    const fixture = TestBed.createComponent(GardenDetail);
    fixture.componentRef.setInput('gardenId', 1);
    fixture.detectChanges();
    return {
      fixture,
      vm: fixture.componentInstance as unknown as ProfileApi,
      store: fixture.debugElement.injector.get(GardenDetailStore),
      el: fixture.nativeElement as HTMLElement,
    };
  };

  const section = (el: HTMLElement) =>
    el.querySelector('section[aria-labelledby="humidity-heading"]');

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = (): void => undefined;
        unobserve = (): void => undefined;
        disconnect = (): void => undefined;
        takeRecords = (): [] => [];
        root = null;
        rootMargin = '';
        thresholds = [];
      },
    );
    scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: scrollIntoView,
      configurable: true,
      writable: true,
    });
    instance = { update: vi.fn(), destroy: vi.fn() };
    chart = vi.fn<(container: HTMLElement, options: Options) => typeof instance>(() => instance);
    gardensApi = { getById: vi.fn().mockResolvedValue(GARDEN) };
    plantsApi = {
      getByGarden: vi.fn().mockResolvedValue([plant(11, 'Tomato', 70), plant(12, 'Basil', 60)]),
    };
  });

  afterEach(() => vi.unstubAllGlobals());

  it('offers nothing to draw before the garden arrives, or for a garden without plants', async () => {
    plantsApi['getByGarden'].mockResolvedValue([]);
    const { fixture, vm, store, el } = render();
    expect(vm.humidityProfile()).toBeNull();

    await vi.waitFor(() => expect(store.plantsStatus()).toBe('ready'));
    fixture.detectChanges();

    expect(vm.humidityProfile()).toBeNull();
    expect(section(el)).toBeNull();
  });

  it('offers nothing to draw when the plant list could not load', async () => {
    plantsApi['getByGarden'].mockRejectedValue(new Error('unavailable'));
    const { vm, store } = render();

    await vi.waitFor(() => expect(store.plantsFailed()).toBe(true));

    expect(vm.humidityProfile()).toBeNull();
  });

  it('draws one column per plant, driest first, and a column finds its plant on the plan', async () => {
    const { fixture, vm, store, el } = render();
    await vi.waitFor(() => expect(store.plantsStatus()).toBe('ready'));
    fixture.detectChanges();
    expect(section(el)?.textContent).toContain('Humidity profile');
    expect(section(el)?.querySelector('.zone-key')?.textContent).toContain('Humid ≥ 70%');

    const blocks = await fixture.getDeferBlocks();
    await blocks[1].render(DeferBlockState.Complete);
    await vi.waitFor(() => expect(chart).toHaveBeenCalled());

    const options = chart.mock.calls[0][1] as Options;
    expect(dataOf(options).map((d) => d.name)).toEqual(['Basil', 'Tomato']);

    const choose = options.plotOptions?.variwide?.point?.events?.click as unknown as (
      this: unknown,
    ) => void;
    choose.call({ options: { custom: { plantId: 11 } } });
    expect(vm.selectedPlantId()).toBe(11);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });

  it('outlines the plant selected on the plan and redraws when the selection changes', async () => {
    const { fixture, vm, store } = render();
    await vi.waitFor(() => expect(store.plantsStatus()).toBe('ready'));
    fixture.detectChanges();
    const blocks = await fixture.getDeferBlocks();
    await blocks[1].render(DeferBlockState.Complete);
    await vi.waitFor(() => expect(chart).toHaveBeenCalled());

    vm.selectedPlantId.set(12);
    fixture.detectChanges();

    await vi.waitFor(() => expect(instance.update).toHaveBeenCalled());
    const updated = instance.update.mock.calls.at(-1)?.[0] as Options;
    expect(dataOf(updated).map((d) => d.borderWidth)).toEqual([3, 1]);
  });

  it('still selects the plant when the plan is not on the page', () => {
    const { vm } = render();

    vm.findOnPlan(5);

    expect(vm.selectedPlantId()).toBe(5);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
