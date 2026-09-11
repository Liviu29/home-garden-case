import { SessionStore } from '../../core/auth/session-store';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { GardensApi } from '../../core/api/gardens-api';
import { PlantsApi } from '../../core/api/plants-api';
import { APP_CONFIG, AppConfig } from '../../core/config/app-config';
import { Garden, Plant } from '../../core/api/models';
import { PlantsIndexStore } from '../../state/plants-index-store/plants-index-store';
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
  toastDurationMs: 5000,
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('Dashboard (aggregate insights a user notices)', () => {
  let gardensApi: { getAll: ReturnType<typeof vi.fn> };
  let plantsApi: { getByGarden: ReturnType<typeof vi.fn>; getAll: ReturnType<typeof vi.fn> };

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
    plantsApi = {
      getByGarden: vi.fn().mockResolvedValue([]),
      getAll: vi.fn().mockResolvedValue([]),
    };
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
    // Two gardens: their plants arrive in one request.
    plantsApi.getAll.mockResolvedValue([plant(1, 1, 4), plant(2, 1, 3), plant(3, 2, 2)]);
    const fixture = await mount();

    expect(plantsApi.getByGarden).not.toHaveBeenCalled();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Gardens');
    expect(text).toContain('Plants growing');
    expect(text).toContain('m² of growing space'); // 12 + 8 = 20 total
  });

  it('counts only the plants of the gardens on screen, never a previous profile’s', async () => {
    gardensApi.getAll.mockResolvedValue([garden(1, 'A', 12)]);
    plantsApi.getByGarden.mockResolvedValue([plant(1, 1, 4)]);
    // Garden 9 belongs to a profile signed in earlier: still in the index.
    TestBed.inject(PlantsIndexStore).setPlants(9, [plant(2, 9, 3), plant(3, 9, 3)]);

    const fixture = await mount();

    const vm = fixture.componentInstance as unknown as {
      totalPlants: () => number;
      usedArea: () => number;
    };
    expect(vm.totalPlants()).toBe(1);
    expect(vm.usedArea()).toBe(4);
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
    // The section never just vanishes: a healthy
    // portfolio gets an explicit healthy card, not an absence.
    gardensApi.getAll.mockResolvedValue([garden(1, 'Calm Garden', 20, 50)]);
    plantsApi.getByGarden.mockResolvedValue([plant(1, 1, 5, 52)]);
    const fixture = await mount();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Everything looks healthy');
    expect(fixture.nativeElement.querySelectorAll('.attention-card').length).toBe(0);
  });
});

describe('Dashboard — greeting, KPI edges and insight tones', () => {
  const GARDENS = [garden(1, 'Alpha'), garden(2, 'Beta', 10, 90), garden(3, 'Gamma', 0)];

  type DashApi = {
    greeting: () => string;
    insights: () => readonly {
      statusLabel: string;
      statusTone: string;
      severity: number;
      garden: { gardenId: number };
    }[];
    attention: () => readonly unknown[];
    utilizationPct: () => number;
    totalArea: () => number;
    plantsSettled: () => boolean;
  };

  let gardensApi: Record<string, ReturnType<typeof vi.fn>>;
  let plantsApi: Record<string, ReturnType<typeof vi.fn>>;

  const mountDash = async (over: Partial<Record<number, Plant[]>> = {}) => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: APP_CONFIG, useValue: TEST_CONFIG },
        { provide: GardensApi, useValue: gardensApi },
        {
          provide: PlantsApi,
          useValue: {
            getByGarden: vi.fn((id: number) => Promise.resolve(over[id] ?? [])),
            getAll: vi.fn(() => Promise.resolve(Object.values(over).flat())),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    const vm = fixture.componentInstance as unknown as DashApi;
    // Two waits, deliberately. `plantsSettled()` is `every()` over the garden
    // list, so it is vacuously TRUE before the gardens themselves arrive —
    // waiting on it alone races the test past the state under assertion.
    await vi.waitFor(() => expect(vm.insights().length).toBeGreaterThan(0));
    await vi.waitFor(() => expect(vm.plantsSettled()).toBe(true));
    fixture.detectChanges();
    return { fixture, vm };
  };

  beforeEach(() => {
    localStorage.clear();
    gardensApi = { getAll: vi.fn().mockResolvedValue(GARDENS) };
    plantsApi = {
      getByGarden: vi.fn().mockResolvedValue([]),
      getAll: vi.fn().mockResolvedValue([]),
    };
  });

  afterEach(() => vi.useRealTimers());

  describe('greeting', () => {
    it.each([
      { hour: 8, expected: 'Good morning' },
      { hour: 14, expected: 'Good afternoon' },
      { hour: 21, expected: 'Good evening' },
    ])('says "$expected" at $hour:00', async ({ hour, expected }) => {
      vi.setSystemTime(new Date(2026, 3, 1, hour, 0, 0));
      const { vm } = await mountDash();
      expect(vm.greeting()).toContain(expected);
    });

    it('uses the profile first name when there is a session', async () => {
      vi.setSystemTime(new Date(2026, 3, 1, 8, 0, 0));
      const { vm } = await mountDash();
      TestBed.inject(SessionStore).signIn({
        userId: 1,
        emailAddress: 'a@b.c',
        firstName: 'Liviu',
        lastName: null,
        age: null,
      });
      expect(vm.greeting()).toBe('Good morning, Liviu');
    });

    it('greets anonymously with no session', async () => {
      vi.setSystemTime(new Date(2026, 3, 1, 8, 0, 0));
      const { vm } = await mountDash();
      expect(vm.greeting()).toBe('Good morning');
    });
  });

  describe('insight status', () => {
    it("shows an ellipsis while a garden's plants are unknown", async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          provideNoopAnimations(),
          { provide: APP_CONFIG, useValue: TEST_CONFIG },
          { provide: GardensApi, useValue: gardensApi },
          {
            provide: PlantsApi,
            useValue: {
              getByGarden: vi.fn().mockReturnValue(new Promise(() => undefined)),
              getAll: vi.fn().mockReturnValue(new Promise(() => undefined)),
            },
          },
        ],
      });
      const fixture = TestBed.createComponent(Dashboard);
      fixture.detectChanges();
      await vi.waitFor(() =>
        expect((fixture.componentInstance as unknown as DashApi).insights().length).toBe(3),
      );

      const vm = fixture.componentInstance as unknown as DashApi;
      // No "…" text placeholder: the template shows a badge-sized skeleton instead.
      expect(vm.insights()[0].statusLabel).toBe('');
      expect(vm.insights()[0].statusTone).toBe('neutral');
      expect(vm.plantsSettled()).toBe(false);
    });

    it('ghosts every plant-derived number until the plant lists settle', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          provideNoopAnimations(),
          { provide: APP_CONFIG, useValue: TEST_CONFIG },
          { provide: GardensApi, useValue: gardensApi },
          {
            provide: PlantsApi,
            useValue: {
              getByGarden: vi.fn().mockReturnValue(new Promise(() => undefined)),
              getAll: vi.fn().mockReturnValue(new Promise(() => undefined)),
            },
          },
        ],
      });
      const fixture = TestBed.createComponent(Dashboard);
      fixture.detectChanges();
      await vi.waitFor(() =>
        expect((fixture.componentInstance as unknown as DashApi).insights().length).toBe(3),
      );
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      // The hero sentence: gardens and area are known; the plant count is not.
      const sub = el.querySelector('.hero-sub')!;
      expect(sub.textContent).toContain('3 gardens');
      expect(sub.textContent).not.toMatch(/\d+\s+plants?\b/);
      expect(sub.querySelector('.hero-count-ghost')).not.toBeNull();
      // Plants growing and Utilization hold value ghosts — no partial totals.
      expect(el.querySelectorAll('app-stat-card .value-ghost')).toHaveLength(2);
    });

    it('shows the real plant count once every list has landed', async () => {
      const { fixture } = await mountDash({ 1: [plant(1, 1, 4)] });
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.hero-sub')?.textContent).toContain('1 plant');
      expect(el.querySelector('.hero-count-ghost')).toBeNull();
      expect(el.querySelector('.value-ghost')).toBeNull();
    });

    it('says "No plants yet" for an empty garden', async () => {
      const { vm } = await mountDash();
      expect(vm.insights().some((i) => i.statusLabel === 'No plants yet')).toBe(true);
    });

    it('flags humidity attention when plants drift but capacity is fine', async () => {
      const { vm } = await mountDash({ 2: [plant(21, 2, 1, 20)] });
      const beta = vm.insights().find((i) => i.garden.gardenId === 2);
      expect(beta?.statusLabel).toBe('Humidity attention');
      expect(beta?.statusTone).toBe('warning');
    });

    it('capacity outranks humidity when a garden is nearly full', async () => {
      const { vm } = await mountDash({ 2: [plant(21, 2, 10, 20)] });
      const beta = vm.insights().find((i) => i.garden.gardenId === 2);
      expect(beta?.statusLabel).not.toBe('Humidity attention');
    });

    it('sorts a full garden above a nearly-full one', async () => {
      const { vm } = await mountDash({ 1: [plant(11, 1, 20)], 2: [plant(21, 2, 9.5)] });
      const full = vm.insights().find((i) => i.garden.gardenId === 1);
      const nearly = vm.insights().find((i) => i.garden.gardenId === 2);
      expect(full!.severity).toBeLessThan(nearly!.severity);
    });
  });

  describe('KPI edges', () => {
    it('reports 0% utilization when there is no growing space at all', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          provideNoopAnimations(),
          { provide: APP_CONFIG, useValue: TEST_CONFIG },
          {
            provide: GardensApi,
            useValue: { getAll: vi.fn().mockResolvedValue([garden(3, 'Z', 0)]) },
          },
          { provide: PlantsApi, useValue: plantsApi },
        ],
      });
      const fixture = TestBed.createComponent(Dashboard);
      fixture.detectChanges();
      await fixture.whenStable();

      const vm = fixture.componentInstance as unknown as DashApi;
      expect(vm.totalArea()).toBe(0);
      expect(vm.utilizationPct()).toBe(0);
    });
  });
});
