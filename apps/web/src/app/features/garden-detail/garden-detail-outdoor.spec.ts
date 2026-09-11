import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Garden } from '../../core/api/models';
import { GardensApi } from '../../core/api/gardens-api';
import { PlantsApi } from '../../core/api/plants-api';
import { APP_CONFIG, AppConfig } from '../../core/config/app-config';
import { QueryCache, cacheKeys } from '../../core/resilience/query-cache';
import { OutdoorConditions, WEATHER_PROVIDER } from '../../core/weather/weather';
import { GardenDetail } from './garden-detail';
import { GardenDetailStore } from './garden-detail-store/garden-detail-store';

const CONFIG = {
  apiBaseUrl: '/api',
  retry: { maxAttempts: 1, baseDelayMs: 1, backoffFactor: 1, maxDelayMs: 1 },
  cache: { freshTtlMs: 30_000 },
  toastDurationMs: 5000,
} as AppConfig;

/** A garden in Ghent, a few metres more precise than the weather needs. */
const GARDEN: Garden = {
  gardenId: 1,
  gardenName: 'Backyard Beds',
  totalSurfaceArea: 20,
  targetHumidityLevel: 60,
  locationDescription: null,
  latitude: 51.054,
  longitude: 3.717,
  createdAt: '',
  updatedAt: '',
};
const NOWHERE: Garden = { ...GARDEN, gardenId: 2, latitude: null, longitude: null };

const READING: OutdoorConditions = {
  humidity: 72.4,
  temperature: 18.4,
  observedAt: '2026-09-11T14:00',
};

describe('GardenDetail — outdoor humidity where the garden is', () => {
  let current: ReturnType<typeof vi.fn>;
  let getById: ReturnType<typeof vi.fn>;

  const render = (garden: Garden) => {
    getById = vi.fn().mockResolvedValue(garden);
    TestBed.configureTestingModule({
      deferBlockBehavior: DeferBlockBehavior.Manual,
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: APP_CONFIG, useValue: CONFIG },
        { provide: GardensApi, useValue: { getById } },
        { provide: PlantsApi, useValue: { getByGarden: vi.fn().mockResolvedValue([]) } },
        { provide: WEATHER_PROVIDER, useValue: { name: 'Test weather', current } },
      ],
    });
    const fixture = TestBed.createComponent(GardenDetail);
    fixture.componentRef.setInput('gardenId', garden.gardenId);
    fixture.detectChanges();
    return {
      fixture,
      el: fixture.nativeElement as HTMLElement,
      store: fixture.debugElement.injector.get(GardenDetailStore),
    };
  };

  const outdoorLine = (el: HTMLElement) =>
    el.querySelector('[data-testid="outdoor"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

  beforeEach(() => {
    // `@defer (on viewport)` asks for an IntersectionObserver jsdom does not have.
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
    current = vi.fn().mockResolvedValue(READING);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('a garden without coordinates asks nothing and shows nothing', async () => {
    const { fixture, el, store } = render(NOWHERE);
    await vi.waitFor(() => expect(store.garden()).not.toBeNull());
    fixture.detectChanges();

    expect(current).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="outdoor"]')).toBeNull();
  });

  it('shows the outdoor humidity and temperature, and where they come from', async () => {
    const { fixture, el } = render(GARDEN);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(outdoorLine(el)).toBe('Outdoors now 72% · 18 °C Test weather');
    });
    expect(current).toHaveBeenCalledWith(51.05, 3.72); // rounded before it leaves the app
  });

  it('shows a ghost while the reading is on its way', async () => {
    current.mockReturnValue(new Promise(() => undefined));
    const { fixture, el, store } = render(GARDEN);
    await vi.waitFor(() => expect(store.garden()).not.toBeNull());
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="outdoor"] app-skeleton')).not.toBeNull();
  });

  it('says so, quietly, when the weather cannot be read', async () => {
    current.mockRejectedValue(new Error('offline'));
    const { fixture, el } = render(GARDEN);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(outdoorLine(el)).toBe('Outdoor humidity is unavailable right now');
    });
  });

  it('a revalidated garden keeps its reading on screen, without asking again', async () => {
    const { fixture, el, store } = render(GARDEN);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(outdoorLine(el)).toContain('Outdoors now');
    });

    getById.mockResolvedValue({ ...GARDEN }); // the same garden, a new object
    TestBed.inject(QueryCache).invalidate(cacheKeys.garden(1));
    store.load(1);
    await vi.waitFor(() => expect(getById).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(store.gardenStatus()).toBe('ready'));
    fixture.detectChanges();

    expect(outdoorLine(el)).toContain('Outdoors now 72%');
    expect(current).toHaveBeenCalledOnce();
  });

  it.each([
    ['answer', (settle: { resolve: (r: OutdoorConditions) => void }) => settle.resolve(READING)],
    ['failure', (settle: { reject: (e: Error) => void }) => settle.reject(new Error('late'))],
  ] as const)('a late %s for a garden already left is ignored', async (_, arrive) => {
    const settle = {} as {
      resolve: (r: OutdoorConditions) => void;
      reject: (e: Error) => void;
    };
    current.mockReturnValue(
      new Promise<OutdoorConditions>((resolve, reject) =>
        Object.assign(settle, { resolve, reject }),
      ),
    );
    const { fixture, el, store } = render(GARDEN);
    await vi.waitFor(() => expect(current).toHaveBeenCalledOnce());

    getById.mockResolvedValue(NOWHERE);
    fixture.componentRef.setInput('gardenId', 2);
    fixture.detectChanges();
    await vi.waitFor(() => expect(store.garden()?.gardenId).toBe(2));
    fixture.detectChanges();

    arrive(settle);
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="outdoor"]')).toBeNull();
  });
});
