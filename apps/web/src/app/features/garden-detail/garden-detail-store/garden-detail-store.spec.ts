import { TestBed } from '@angular/core/testing';
import { GardensApi } from '../../../core/api/gardens-api';
import { PlantsApi } from '../../../core/api/plants-api';
import { Garden, Plant } from '../../../core/api/models';
import { ApiError } from '../../../core/errors/api-error';
import { ToastStore } from '../../../core/errors/toast-store';
import { PlantsIndexStore } from '../../../state/plants-index-store/plants-index-store';
import { GardenLayoutRepository } from '../../../state/garden-layout/garden-layout-repository';
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

  // ── Slow-API race conditions (the API delays every response
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

describe('GardenDetailStore — concurrency and edge cases', () => {
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

  it('markMissing renders the not-found state without issuing any request', () => {
    store.markMissing();
    expect(store.gardenMissing()).toBe(true);
    expect(plantsApi.getByGarden).not.toHaveBeenCalled();
  });

  it('plants are a view into the single owner — PlantsIndexStore', async () => {
    store.load(3);
    await vi.waitFor(() => expect(store.plants()).toHaveLength(2));

    const index = TestBed.inject(PlantsIndexStore);
    expect(store.plants()).toBe(index.byGarden()[3]); // same reference, one owner
  });

  it('re-entrant removePlant for the same plant issues exactly one DELETE', async () => {
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

describe('GardenDetailStore — plant create/update paths', () => {
  const GARDEN = {
    gardenId: 1,
    gardenName: 'G',
    totalSurfaceArea: 20,
    targetHumidityLevel: 50,
    locationDescription: null,
    latitude: null,
    longitude: null,
    createdAt: '',
    updatedAt: '',
  };
  const mkPlant = (plantId: number, plantName = `P${plantId}`) => ({
    plantId,
    plantName,
    species: 's',
    plantType: 'vegetable' as const,
    plantationDate: '2026-04-01T00:00:00.000Z',
    surfaceAreaRequired: 3,
    idealHumidityLevel: 55,
    gardenId: 1,
    createdAt: '',
    updatedAt: '',
  });
  const INPUT = {
    gardenId: 1,
    plantName: 'Tomato',
    species: 's',
    plantType: 'vegetable' as const,
    plantationDate: '2026-04-01T00:00:00.000Z',
    surfaceAreaRequired: 3,
    idealHumidityLevel: 55,
  };

  let gardensApi: Record<string, ReturnType<typeof vi.fn>>;
  let plantsApi: Record<string, ReturnType<typeof vi.fn>>;
  let store: InstanceType<typeof GardenDetailStore>;
  let toasts: ToastStore;

  const loaded = async () => {
    store.load(1);
    await vi.waitFor(() => expect(store.garden()).not.toBeNull());
    await vi.waitFor(() => expect(store.plantsStatus()).toBe('ready'));
  };

  beforeEach(() => {
    gardensApi = { getById: vi.fn().mockResolvedValue(GARDEN) };
    plantsApi = {
      getByGarden: vi.fn().mockResolvedValue([mkPlant(1)]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        GardenDetailStore,
        { provide: GardensApi, useValue: gardensApi },
        { provide: PlantsApi, useValue: plantsApi },
      ],
    });
    store = TestBed.inject(GardenDetailStore);
    toasts = TestBed.inject(ToastStore);
  });

  describe('createPlant', () => {
    it('appends the created plant, records it and confirms', async () => {
      await loaded();
      plantsApi['create'].mockResolvedValue(mkPlant(2, 'Tomato'));

      const result = await store.createPlant(INPUT);

      expect(result.ok).toBe(true);
      expect(store.plants().map((p) => p.plantId)).toContain(2);
      expect(store.lastCreatedPlantId()).toBe(2);
      expect(toasts.toasts().some((t) => t.message.includes('planted'))).toBe(true);
    });

    it('is idempotent when a slow revalidation already delivered the plant', async () => {
      await loaded();
      const created = mkPlant(2, 'Tomato');
      plantsApi['create'].mockImplementation(async () => {
        // The background refresh lands first, exactly as the slow API allows.
        store.load(1);
        return created;
      });

      await store.createPlant(INPUT);

      expect(store.plants().filter((p) => p.plantId === 2)).toHaveLength(1);
    });

    it('exposes the pending footprint while the create is in flight, then clears it', async () => {
      await loaded();
      let release = (): void => undefined;
      plantsApi['create'].mockImplementation(
        () => new Promise((r) => (release = () => r(mkPlant(2)))),
      );

      const pending = store.createPlant(INPUT);
      await vi.waitFor(() => expect(store.pendingCreateArea()).toBe(3));

      release();
      await pending;
      expect(store.pendingCreateArea()).toBeNull();
      expect(store.saving()).toBe(false);
    });

    it('a first plant in flight is not an empty garden — its creation ghost must render', async () => {
      plantsApi['getByGarden'].mockResolvedValue([]);
      await loaded();
      expect(store.plantsEmpty()).toBe(true);
      let release = (): void => undefined;
      plantsApi['create'].mockImplementation(
        () => new Promise((r) => (release = () => r(mkPlant(2)))),
      );

      const pending = store.createPlant(INPUT);
      await vi.waitFor(() => expect(store.pendingCreateArea()).toBe(3));
      // Regression: "Nothing planted yet" used to stay up here, hiding the ghost row.
      expect(store.plantsEmpty()).toBe(false);

      release();
      await pending;
      expect(store.plantsEmpty()).toBe(false); // it now has its first plant
    });

    it('returns a technical failure AND toasts it', async () => {
      await loaded();
      plantsApi['create'].mockRejectedValue(new ApiError('technical', 'Server exploded', 500));

      const result = await store.createPlant(INPUT);

      expect(result.ok).toBe(false);
      expect(toasts.toasts().some((t) => t.tone === 'error')).toBe(true);
    });
  });

  describe('updatePlant', () => {
    it('replaces the plant in place and confirms', async () => {
      await loaded();
      plantsApi['update'].mockResolvedValue(mkPlant(1, 'Renamed'));

      const result = await store.updatePlant(1, INPUT);

      expect(result.ok).toBe(true);
      expect(store.plants().find((p) => p.plantId === 1)?.plantName).toBe('Renamed');
      expect(toasts.toasts().some((t) => t.message.includes('updated'))).toBe(true);
    });

    it('marks the plant pending while the PUT is in flight, then clears it', async () => {
      await loaded();
      let release = (): void => undefined;
      plantsApi['update'].mockImplementation(
        () => new Promise((r) => (release = () => r(mkPlant(1)))),
      );

      const pending = store.updatePlant(1, INPUT);
      await vi.waitFor(() => expect(store.pendingUpdates()).toContain(1));

      release();
      await pending;
      expect(store.pendingUpdates()).not.toContain(1);
    });

    it('returns a functional verdict to the form without toasting it', async () => {
      await loaded();
      plantsApi['update'].mockRejectedValue(new ApiError('functional', 'Too big', 400));

      const result = await store.updatePlant(1, INPUT);

      expect(result).toMatchObject({ ok: false });
      expect(toasts.toasts().every((t) => t.tone !== 'error')).toBe(true);
    });
  });

  describe('single flight (a double-clicked Save sends one request)', () => {
    it('a second createPlant while one is in flight joins it: one POST, one plant', async () => {
      await loaded();
      let release = (): void => undefined;
      plantsApi['create'].mockImplementation(
        () => new Promise((r) => (release = () => r(mkPlant(2, 'Tomato')))),
      );

      const first = store.createPlant(INPUT);
      const second = store.createPlant(INPUT);

      expect(second).toBe(first);
      expect(plantsApi['create']).toHaveBeenCalledTimes(1);
      release();
      await expect(second).resolves.toEqual({ ok: true });
      expect(store.plants().filter((p) => p.plantId === 2)).toHaveLength(1);
      expect(store.saving()).toBe(false);
    });

    it('a second updatePlant of the same plant joins the one in flight; another plant does not', async () => {
      await loaded();
      const releases: (() => void)[] = [];
      plantsApi['update'].mockImplementation(
        (id: number) => new Promise((r) => releases.push(() => r(mkPlant(id, 'Renamed')))),
      );

      const first = store.updatePlant(1, INPUT);
      const again = store.updatePlant(1, INPUT);
      const other = store.updatePlant(2, INPUT);

      expect(again).toBe(first);
      expect(other).not.toBe(first);
      expect(plantsApi['update']).toHaveBeenCalledTimes(2);
      releases.forEach((release) => release());
      await Promise.all([first, other]);
      expect(store.pendingUpdates()).toEqual([]);
    });
  });

  describe('plants read failures', () => {
    it('shows the plants error state when nothing is cached', async () => {
      plantsApi['getByGarden'].mockRejectedValue(new ApiError('technical', 'boom', 500));
      store.load(1);
      await vi.waitFor(() => expect(store.plantsStatus()).toBe('error'));
      // Exposed as a retryable failure — never an empty garden, never "loading".
      expect(store.plantsFailed()).toBe(true);
      expect(store.plantsEmpty()).toBe(false);
      expect(store.arePlantsLoading()).toBe(false);
    });

    it('keeps cached plants when only the refresh fails', async () => {
      await loaded();
      expect(store.plants()).toHaveLength(1);

      plantsApi['getByGarden'].mockRejectedValue(new ApiError('technical', 'boom', 500));
      store.load(1);
      await new Promise((r) => setTimeout(r, 10));

      expect(store.plants()).toHaveLength(1); // stale data beats an error screen
    });
  });
});

describe('GardenDetailStore — derived state before a garden exists', () => {
  let store: InstanceType<typeof GardenDetailStore>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        GardenDetailStore,
        { provide: GardensApi, useValue: { getById: vi.fn().mockResolvedValue(null) } },
        { provide: PlantsApi, useValue: { getByGarden: vi.fn().mockResolvedValue([]) } },
      ],
    });
    store = TestBed.inject(GardenDetailStore);
  });

  /**
   * Every capacity derivation must answer safely before the garden arrives.
   * These are the values a skeleton screen reads on its very first render, so
   * `undefined` or `NaN` here would reach the DOM.
   */
  it('answers with safe zeros while no garden is loaded', () => {
    expect(store.plants()).toEqual([]);
    expect(store.usedArea()).toBe(0);
    expect(store.freeArea()).toBe(0);
    expect(store.occupancy()).toBe(0);
    expect(store.avgHumidity()).toBeNull();
    expect(store.humidityDrift()).toBeNull();
  });

  it('markMissing renders the not-found state without a request', () => {
    store.markMissing();
    expect(store.gardenMissing()).toBe(true);
    expect(store.gardenFailed()).toBe(false);
  });

  it('reports plants as empty only once they have actually loaded', async () => {
    expect(store.plantsEmpty()).toBe(false); // not loaded ≠ empty
    store.load(1);
    await vi.waitFor(() => expect(store.plantsEmpty()).toBe(true));
  });
});

describe('GardenDetailStore — Undo for a removed plant', () => {
  let plantsApi: Record<string, ReturnType<typeof vi.fn>>;
  let store: InstanceType<typeof GardenDetailStore>;
  let toasts: ToastStore;
  let layout: GardenLayoutRepository;

  beforeEach(() => {
    localStorage.clear();
    plantsApi = {
      getByGarden: vi.fn().mockResolvedValue([plant(1, 5), plant(2, 3)]),
      create: vi.fn().mockResolvedValue(plant(9, 5)),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        GardenDetailStore,
        { provide: GardensApi, useValue: { getById: vi.fn().mockResolvedValue(garden) } },
        { provide: PlantsApi, useValue: plantsApi },
      ],
    });
    store = TestBed.inject(GardenDetailStore);
    toasts = TestBed.inject(ToastStore);
    layout = TestBed.inject(GardenLayoutRepository);
  });

  /** Loads garden 3, removes Plant 1 and hands back the removal toast. */
  const removePlantOne = async () => {
    store.load(3);
    await vi.waitFor(() => expect(store.plants()).toHaveLength(2));
    await store.removePlant(store.plants()[0]);
    return toasts.toasts().find((t) => t.actionLabel === 'Undo');
  };
  const errorToast = () => toasts.toasts().find((t) => t.tone === 'error');

  it('the removal toast offers Undo', async () => {
    const undo = await removePlantOne();
    expect(undo).toMatchObject({ tone: 'success', message: '“Plant 1” removed.' });
  });

  it('Undo plants it again with the same fields, and its bed goes back where it stood', async () => {
    layout.save(3, { 1: { x: 4, y: 2 } }, [1, 2]);
    const undo = await removePlantOne();

    undo?.action?.();
    await vi.waitFor(() => expect(store.plants().map((p) => p.plantId)).toEqual([2, 9]));

    expect(plantsApi['create']).toHaveBeenCalledWith({
      plantName: 'Plant 1',
      species: 's',
      plantType: 'vegetable',
      plantationDate: '2026-04-01T00:00:00.000Z',
      surfaceAreaRequired: 5,
      idealHumidityLevel: 60,
      gardenId: 3,
    });
    expect(layout.load(3)[9]).toEqual({ x: 4, y: 2 });
    expect(store.restored()).toEqual({ gardenId: 3, positions: { 9: { x: 4, y: 2 } } });
    expect(toasts.toasts().some((t) => t.message === '“Plant 9” is back.')).toBe(true);
  });

  it('a bed that was never moved gets no position — the auto-layout places it', async () => {
    const undo = await removePlantOne();

    undo?.action?.();
    await vi.waitFor(() => expect(store.plants()).toHaveLength(2));

    expect(layout.load(3)).toEqual({});
    expect(store.restored()).toBeNull();
  });

  it('shows a creation ghost while the plant is replanted', async () => {
    const undo = await removePlantOne();
    let resolve!: (p: Plant) => void;
    plantsApi['create'].mockReturnValue(new Promise<Plant>((r) => (resolve = r)));

    undo?.action?.();
    expect(store.pendingCreateArea()).toBe(5);

    resolve(plant(9, 5));
    await vi.waitFor(() => expect(store.pendingCreateArea()).toBeNull());
  });

  it('pressed after moving on to another garden, it lands in its own garden, not on screen', async () => {
    const undo = await removePlantOne();
    store.load(4);
    let resolve!: (p: Plant) => void;
    plantsApi['create'].mockReturnValue(new Promise<Plant>((r) => (resolve = r)));

    undo?.action?.();
    expect(store.pendingCreateArea()).toBeNull(); // no ghost in someone else's garden

    resolve(plant(9, 5));
    const index = TestBed.inject(PlantsIndexStore);
    await vi.waitFor(() => expect(index.byGarden()[3].map((p) => p.plantId)).toEqual([2, 9]));
  });

  it('a technical failure says so and offers Try again', async () => {
    const undo = await removePlantOne();
    plantsApi['create'].mockRejectedValueOnce(new ApiError('technical', 'boom', 500));

    undo?.action?.();
    await vi.waitFor(() => expect(errorToast()?.actionLabel).toBe('Try again'));
    expect(errorToast()?.message).toBe("Couldn't bring back “Plant 1”.");

    errorToast()?.action?.();
    await vi.waitFor(() => expect(store.plants()).toHaveLength(2));
  });

  it('a verdict (the room went to another plant meanwhile) is shown as it is, with nothing to retry', async () => {
    const undo = await removePlantOne();
    plantsApi['create'].mockRejectedValue(
      new ApiError('functional', 'Not enough room left in this garden.', 400),
    );

    undo?.action?.();
    await vi.waitFor(() => expect(errorToast()).toBeDefined());
    expect(errorToast()?.message).toContain('Not enough room left in this garden.');
    expect(errorToast()?.actionLabel).toBeUndefined();
    expect(store.plants().map((p) => p.plantId)).toEqual([2]);
  });
});
