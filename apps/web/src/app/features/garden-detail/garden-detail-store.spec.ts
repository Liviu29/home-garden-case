import { TestBed } from '@angular/core/testing';
import { GardensApi } from '../../core/api/gardens-api';
import { PlantsApi } from '../../core/api/plants-api';
import { Garden, Plant } from '../../core/api/models';
import { ApiError } from '../../core/errors/api-error';
import { ToastStore } from '../../core/errors/toast-store';
import { PlantsIndexStore } from '../gardens/plants-index-store';
import { GardenDetailStore } from './garden-detail-store';

const garden: Garden = {
  gardenId: 3,
  gardenName: 'Detail Garden',
  totalSurfaceArea: 20,
  targetHumidityLevel: 50,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
};

const plant = (id: number, area: number, humidity = 60): Plant => ({
  plantId: id,
  plantName: `Plant ${id}`,
  species: 's',
  plantType: 'vegetable',
  plantationDate: '2026-04-01T00:00:00.000Z',
  surfaceAreaRequired: area,
  idealHumidityLevel: humidity,
  gardenId: 3,
  createdAt: '',
  updatedAt: '',
});

describe('GardenDetailStore (derived capacity state + mutation behaviour)', () => {
  let gardensApi: { getById: ReturnType<typeof vi.fn> };
  let plantsApi: {
    getByGarden: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let store: InstanceType<typeof GardenDetailStore>;
  let toasts: ToastStore;

  beforeEach(() => {
    gardensApi = { getById: vi.fn().mockResolvedValue(garden) };
    plantsApi = {
      getByGarden: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        GardenDetailStore, // route-scoped in the app; provided directly here
        { provide: GardensApi, useValue: gardensApi },
        { provide: PlantsApi, useValue: plantsApi },
      ],
    });
    store = TestBed.inject(GardenDetailStore);
    toasts = TestBed.inject(ToastStore);
  });

  it('loads garden and plants in parallel — neither blocks the other', async () => {
    let resolveGarden!: (g: Garden) => void;
    gardensApi.getById.mockReturnValue(new Promise<Garden>((r) => (resolveGarden = r)));
    plantsApi.getByGarden.mockResolvedValue([plant(1, 5)]);

    store.load(3);
    await vi.waitFor(() => expect(store.plants()).toHaveLength(1));
    expect(store.garden()).toBeNull(); // plants arrived while garden still in flight

    resolveGarden(garden);
    await vi.waitFor(() => expect(store.garden()).not.toBeNull());
  });

  // ── Slow-API race conditions (BACKEND-API-AUDIT: every response is delayed
  // 200–2000 ms, so overlapping loads are the norm, not an edge case).
  it('discards a slow response for a garden the user has already left', async () => {
    const other: Garden = { ...garden, gardenId: 4, gardenName: 'Newer Garden' };
    let resolveSlow!: (g: Garden) => void;
    gardensApi.getById
      .mockReturnValueOnce(new Promise<Garden>((r) => (resolveSlow = r))) // garden 3
      .mockResolvedValueOnce(other); // garden 4

    store.load(3); // still in flight…
    store.load(4); // …user navigates on; this response arrives first
    await vi.waitFor(() => expect(store.garden()?.gardenId).toBe(4));

    resolveSlow(garden); // the stale garden-3 response finally lands
    await Promise.resolve();
    await Promise.resolve();

    expect(store.garden()?.gardenId).toBe(4); // never overwritten
    expect(store.garden()?.gardenName).toBe('Newer Garden');
  });

  it('discards a stale FAILURE too — an old error must not blank a newer garden', async () => {
    const other: Garden = { ...garden, gardenId: 4, gardenName: 'Newer Garden' };
    let rejectSlow!: (e: unknown) => void;
    gardensApi.getById
      .mockReturnValueOnce(new Promise<Garden>((_, reject) => (rejectSlow = reject)))
      .mockResolvedValueOnce(other);

    store.load(3);
    store.load(4);
    await vi.waitFor(() => expect(store.garden()?.gardenId).toBe(4));

    rejectSlow(new ApiError('not-found', 'Garden with ID 3 not found', 404));
    await Promise.resolve();
    await Promise.resolve();

    expect(store.gardenMissing()).toBe(false);
    expect(store.garden()?.gardenId).toBe(4);
  });

  // ── 404 vs transient 5xx (the API fails 10% of ALL requests at random)
  it('a 404 means the garden is gone; a 500 means try again', async () => {
    gardensApi.getById.mockRejectedValue(
      new ApiError('not-found', 'Garden with ID 3 not found', 404),
    );
    store.load(3);
    await vi.waitFor(() => expect(store.gardenMissing()).toBe(true));
    expect(store.gardenFailed()).toBe(false);

    const fresh = TestBed.inject(GardenDetailStore);
    void fresh;
    gardensApi.getById.mockRejectedValue(
      new ApiError('technical', 'Something went wrong on our side. Please try again.', 500),
    );
    store.load(5);
    await vi.waitFor(() => expect(store.gardenFailed()).toBe(true));
    expect(store.gardenMissing()).toBe(false); // never "not found" for a random 500
  });

  it('derives capacity + humidity insights instead of storing them', async () => {
    plantsApi.getByGarden.mockResolvedValue([plant(1, 12, 70), plant(2, 3, 50)]);
    store.load(3);
    await vi.waitFor(() => expect(store.plants()).toHaveLength(2));

    expect(store.usedArea()).toBe(15);
    expect(store.freeArea()).toBe(5);
    expect(store.occupancy()).toBeCloseTo(0.75);
    expect(store.avgHumidity()).toBe(60);
    expect(store.humidityDrift()).toBe(10); // avg 60 vs target 50
  });

  it('createPlant returns the functional verdict to the form and does not toast it', async () => {
    store.load(3);
    await vi.waitFor(() => expect(store.plantsStatus()).toBe('ready'));
    const verdict = new ApiError('functional', 'Cannot add plant: would exceed', 400);
    plantsApi.create.mockRejectedValue(verdict);

    const result = await store.createPlant({
      plantName: 'X',
      species: 's',
      plantType: 'vegetable',
      plantationDate: '2026-04-01T00:00:00.000Z',
      surfaceAreaRequired: 99,
      idealHumidityLevel: 50,
      gardenId: 3,
    });

    expect(result).toEqual({ ok: false, error: verdict });
    expect(toasts.toasts().filter((t) => t.tone === 'error')).toHaveLength(0);
    expect(store.saving()).toBe(false); // finally-reset, never stuck
  });

  it('removePlant is ghost-confirmed: the plant stays (as a ghost) until the server says yes', async () => {
    plantsApi.getByGarden.mockResolvedValue([plant(1, 5), plant(2, 3)]);
    store.load(3);
    await vi.waitFor(() => expect(store.plants()).toHaveLength(2));
    let resolve!: () => void;
    plantsApi.delete.mockReturnValue(new Promise<void>((r) => (resolve = r)));

    const target = store.plants()[0];
    const removal = store.removePlant(target);
    // In flight: still present, marked as a mutation ghost (ASYNC-UX.md)
    expect(store.plants()).toHaveLength(2);
    expect(store.pendingDeletes()).toContain(target.plantId);

    resolve();
    await removal;
    expect(store.plants()).toHaveLength(1); // removed only on confirmation
    expect(store.pendingDeletes()).toHaveLength(0);
  });

  it('removePlant failure resolves the ghost back into the plant with a retry affordance', async () => {
    plantsApi.getByGarden.mockResolvedValue([plant(1, 5), plant(2, 3)]);
    store.load(3);
    await vi.waitFor(() => expect(store.plants()).toHaveLength(2));
    plantsApi.delete.mockRejectedValue(new ApiError('technical', 'boom', 500));

    await store.removePlant(store.plants()[0]);

    expect(store.plants()).toHaveLength(2); // nothing was removed
    expect(store.pendingDeletes()).toHaveLength(0); // ghost resolved
    expect(toasts.toasts().find((t) => t.tone === 'error')?.actionLabel).toBe('Try again');
  });
});

describe('GardenDetailStore — remediation behaviours', () => {
  let plantsApi: {
    getByGarden: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let store: InstanceType<typeof GardenDetailStore>;

  beforeEach(() => {
    plantsApi = {
      getByGarden: vi.fn().mockResolvedValue([plant(1, 5), plant(2, 3)]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        GardenDetailStore,
        { provide: GardensApi, useValue: { getById: vi.fn().mockResolvedValue(garden) } },
        { provide: PlantsApi, useValue: plantsApi },
      ],
    });
    store = TestBed.inject(GardenDetailStore);
  });

  it('markMissing renders the not-found state without issuing any request (REM-001)', () => {
    store.markMissing();
    expect(store.gardenMissing()).toBe(true);
    expect(plantsApi.getByGarden).not.toHaveBeenCalled();
  });

  it('plants are a view into the single owner — PlantsIndexStore (REM-005)', async () => {
    store.load(3);
    await vi.waitFor(() => expect(store.plants()).toHaveLength(2));

    const index = TestBed.inject(PlantsIndexStore);
    expect(store.plants()).toBe(index.byGarden()[3]); // same reference, one owner
  });

  it('re-entrant removePlant for the same plant issues exactly one DELETE (REM-009)', async () => {
    store.load(3);
    await vi.waitFor(() => expect(store.plants()).toHaveLength(2));
    plantsApi.delete.mockReturnValue(new Promise(() => undefined)); // never resolves

    const target = store.plants()[0];
    void store.removePlant(target);
    void store.removePlant(target); // double-click / double-retry

    expect(plantsApi.delete).toHaveBeenCalledTimes(1);
    expect(store.plants()).toHaveLength(2); // ghost-confirmed: still present while pending
    expect(store.pendingDeletes()).toEqual([target.plantId]);
  });
});
