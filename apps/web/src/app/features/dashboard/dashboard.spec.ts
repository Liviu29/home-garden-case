import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { GardensApi } from '../../core/api/gardens-api';
import { PlantsApi } from '../../core/api/plants-api';
import { APP_CONFIG, AppConfig } from '../../core/config/app-config';
import { Garden, Plant } from '../../core/api/models';
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

const TEST_CONFIG: AppConfig = {
  apiBaseUrl: '/api',
  retry: { maxAttempts: 1, baseDelayMs: 1, backoffFactor: 1, maxDelayMs: 1 },
  cache: { freshTtlMs: 30_000 },
  skeleton: { appearDelayMs: 0, minDisplayMs: 0 },
  toastDurationMs: 5000,
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('Dashboard (aggregate insights a user notices)', () => {
  let gardensApi: { getAll: ReturnType<typeof vi.fn> };
  let plantsApi: { getByGarden: ReturnType<typeof vi.fn> };

  async function mount() {
    const fixture = TestBed.createComponent(Dashboard);
    await fixture.whenStable();
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
    await tick();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    gardensApi = { getAll: vi.fn() };
    plantsApi = { getByGarden: vi.fn().mockResolvedValue([]) };
    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: APP_CONFIG, useValue: TEST_CONFIG },
        { provide: GardensApi, useValue: gardensApi },
        { provide: PlantsApi, useValue: plantsApi },
      ],
    });
  });

  it('renders the designed empty state with a create CTA when there are no gardens', async () => {
    gardensApi.getAll.mockResolvedValue([]);
    const fixture = await mount();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('app-empty-state')).not.toBeNull();
    expect(el.textContent).toContain('No gardens yet');
  });

  it('aggregates stats across gardens: counts and total growing space', async () => {
    gardensApi.getAll.mockResolvedValue([garden(1, 'A', 12), garden(2, 'B', 8)]);
    plantsApi.getByGarden.mockImplementation((id: number) =>
      Promise.resolve(id === 1 ? [plant(1, 1, 4), plant(2, 1, 3)] : [plant(3, 2, 2)]),
    );
    const fixture = await mount();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Gardens');
    expect(text).toContain('Plants growing');
    expect(text).toContain('m² of growing space'); // 12 + 8 = 20 total
  });

  it('surfaces a needs-attention row for a garden at >= 90% capacity', async () => {
    gardensApi.getAll.mockResolvedValue([garden(1, 'Packed Garden', 10)]);
    plantsApi.getByGarden.mockResolvedValue([plant(1, 1, 9.5)]); // 95%
    const fixture = await mount();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Needs attention');
    expect(el.textContent).toContain('Almost full'); // semantic status label at 95%
    expect(el.textContent).toContain('Packed Garden');
  });

  it('shows the positive "all healthy" state when no garden needs attention', async () => {
    // The section never just vanishes (control-center brief §10): a healthy
    // portfolio gets an explicit healthy card, not an absence.
    gardensApi.getAll.mockResolvedValue([garden(1, 'Calm Garden', 20, 50)]);
    plantsApi.getByGarden.mockResolvedValue([plant(1, 1, 5, 52)]);
    const fixture = await mount();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Everything looks healthy');
    expect(fixture.nativeElement.querySelectorAll('.attention-card').length).toBe(0);
  });
});
