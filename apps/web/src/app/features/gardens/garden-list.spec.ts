import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { GardensApi } from '../../core/api/gardens-api';
import { PlantsApi } from '../../core/api/plants-api';
import { APP_CONFIG, AppConfig } from '../../core/config/app-config';
import { Garden } from '../../core/api/models';
import { ApiError } from '../../core/errors/api-error';
import { GardenList } from './garden-list';

const garden = (id: number, name: string): Garden => ({
  gardenId: id,
  gardenName: name,
  totalSurfaceArea: 20,
  targetHumidityLevel: 50,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
});

/** Zero skeleton delays so states are assertable without timer gymnastics. */
const TEST_CONFIG: AppConfig = {
  apiBaseUrl: '/api',
  retry: { maxAttempts: 3, baseDelayMs: 1, backoffFactor: 1, maxDelayMs: 1 },
  cache: { freshTtlMs: 30_000 },
  skeleton: { appearDelayMs: 0, minDisplayMs: 0 },
  toastDurationMs: 5000,
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('GardenList (screen states a user notices)', () => {
  let gardensApi: { getAll: ReturnType<typeof vi.fn> };

  async function mount() {
    const fixture = TestBed.createComponent(GardenList);
    await fixture.whenStable();
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  beforeEach(() => {
    gardensApi = { getAll: vi.fn() };
    TestBed.configureTestingModule({
      imports: [GardenList],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: APP_CONFIG, useValue: TEST_CONFIG },
        { provide: GardensApi, useValue: gardensApi },
        { provide: PlantsApi, useValue: { getByGarden: vi.fn().mockResolvedValue([]) } },
      ],
    });
  });

  it('renders ghost skeleton cards while gardens load', async () => {
    gardensApi.getAll.mockReturnValue(new Promise(() => undefined)); // never resolves
    const fixture = await mount();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('app-skeleton').length).toBeGreaterThan(0);
    expect(el.querySelector('[role="status"]')).not.toBeNull(); // accessible loading
  });

  it('renders a garden card per garden on success', async () => {
    gardensApi.getAll.mockResolvedValue([garden(1, 'Backyard'), garden(2, 'Patio')]);
    const fixture = await mount();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Backyard');
    expect(text).toContain('Patio');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('article.card')).toHaveLength(2);
  });

  it('renders the designed empty state with a create CTA when there are no gardens', async () => {
    gardensApi.getAll.mockResolvedValue([]);
    const fixture = await mount();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('app-empty-state')).not.toBeNull();
    expect(el.textContent).toContain('No gardens yet');
    expect(el.textContent).toContain('Create your first garden');
  });

  it('renders the error state with a retry affordance when loading fails outright', async () => {
    gardensApi.getAll.mockRejectedValue(new ApiError('technical', 'boom', 500));
    const fixture = await mount();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Couldn't load your gardens");
    const retry = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Try again'),
    );
    expect(retry).toBeDefined();
  });
});
