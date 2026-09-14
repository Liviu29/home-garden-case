import { TestBed } from '@angular/core/testing';
import { GardensApi } from '../../core/api/gardens-api';
import { PlantsApi } from '../../core/api/plants-api';
import { SessionStore } from '../../core/auth/session-store';
import { Garden, Plant, PlantInput } from '../../core/api/models';
import { GardenLayoutRepository } from '../garden-layout/garden-layout-repository';
import { ApiError } from '../../core/errors/api-error';
import { ToastStore } from '../../core/errors/toast-store';
import { QueryCache, cacheKeys } from '../../core/resilience/query-cache';
import { GardensStore } from './gardens-store';

const garden = (id: number, name = `Garden ${id}`): Garden => ({
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

describe('GardensStore (behaviour, not implementation)', () => {
  let api: {
    getAll: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let store: InstanceType<typeof GardensStore>;
  let toasts: ToastStore;

  beforeEach(() => {
    api = {
      getAll: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: GardensApi, useValue: api }],
    });
    store = TestBed.inject(GardensStore);
    toasts = TestBed.inject(ToastStore);
  });

  it('load: skeleton state on cold start, then data', async () => {
    let resolve!: (value: Garden[]) => void;
    api.getAll.mockReturnValue(new Promise<Garden[]>((r) => (resolve = r)));

    const loading = store.load();
    expect(store.isLoading()).toBe(true);

    resolve([garden(1)]);
    await loading;
    expect(store.isLoading()).toBe(false);
    expect(store.gardens()).toHaveLength(1);
    expect(store.isEmpty()).toBe(false);
  });

  it('load: cached data renders instantly on the second call — no loading state', async () => {
    api.getAll.mockResolvedValue([garden(1)]);
    await store.load();

    api.getAll.mockClear();
    await store.load();

    expect(store.isLoading()).toBe(false);
    expect(api.getAll).not.toHaveBeenCalled(); // fresh cache hit
  });

  it('load: total failure with no cache becomes the error state', async () => {
    api.getAll.mockRejectedValue(new ApiError('technical', 'boom', 500));
    await store.load();
    expect(store.hasFailed()).toBe(true);
  });

  it('load: a failed refresh keeps the stale list on screen and says so quietly', async () => {
    vi.useFakeTimers();
    try {
      TestBed.inject(QueryCache).set(cacheKeys.gardens, [garden(1)]);
      vi.advanceTimersByTime(31_000); // past the 30 s freshness window: stale, not gone
      api.getAll.mockRejectedValue(new ApiError('technical', 'boom', 500));

      await store.load();

      expect(store.gardens()).toEqual([garden(1)]);
      expect(store.hasFailed()).toBe(false);
      expect(
        toasts.toasts().some((t) => t.tone === 'info' && t.message.includes('cached gardens')),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('create: functional verdict is returned to the form, not toasted as error', async () => {
    const verdict = new ApiError('functional', 'Garden name is required', 400);
    api.create.mockRejectedValue(verdict);

    const result = await store.create({
      gardenName: '',
      totalSurfaceArea: 10,
      targetHumidityLevel: 50,
    });

    expect(result).toEqual({ ok: false, error: verdict });
    expect(toasts.toasts().filter((t) => t.tone === 'error')).toHaveLength(0);
  });

  it('create: never renders a duplicate when a slow revalidation already delivered the new garden', async () => {
    // The race: a list fetch that hit the server
    // AFTER the insert resolves while create() is still awaiting the POST —
    // the store then already contains the created garden.
    api.getAll.mockResolvedValue([garden(1)]);
    await store.load();

    let resolveCreate!: (value: Garden) => void;
    api.create.mockReturnValue(new Promise<Garden>((r) => (resolveCreate = r)));
    const creating = store.create({
      gardenName: 'New',
      totalSurfaceArea: 10,
      targetHumidityLevel: 50,
    });

    // The revalidation lands first, already including the server-side insert.
    api.getAll.mockResolvedValue([garden(1), garden(2, 'New')]);
    TestBed.inject(QueryCache).invalidate('gardens');
    await store.load();
    expect(store.gardens()).toHaveLength(2);

    resolveCreate(garden(2, 'New'));
    await creating;
    expect(store.gardens().map((g) => g.gardenId)).toEqual([1, 2]); // no duplicate card
    expect(store.lastCreatedId()).toBe(2); // the list points this one out
    // …and its plants are known to be none: fresh, no GET to wait on
    const seeded = TestBed.inject(QueryCache).swr(cacheKeys.plantsOfGarden(2), () =>
      Promise.reject(new Error('must not fetch')),
    );
    expect(seeded.cached).toEqual([]);
    expect(seeded.revalidate).toBeFalsy();
  });

  it('remove: ghost-confirmed — the garden stays as a ghost until the server answers', async () => {
    api.getAll.mockResolvedValue([garden(1), garden(2)]);
    await store.load();
    let resolve!: () => void;
    api.delete.mockReturnValue(new Promise<void>((r) => (resolve = r)));

    const removal = store.remove(garden(1));
    // In flight: still listed, marked as a mutation ghost (ASYNC-UX.md)
    expect(store.gardens().map((g) => g.gardenId)).toEqual([1, 2]);
    expect(store.pendingDeletes()).toContain(1);

    resolve();
    await removal;
    expect(store.gardens().map((g) => g.gardenId)).toEqual([2]); // removed on confirmation
    expect(store.pendingDeletes()).toHaveLength(0);
  });

  it('remove: a failed DELETE resolves the ghost back into the card with retry', async () => {
    api.getAll.mockResolvedValue([garden(1), garden(2)]);
    await store.load();
    api.delete.mockRejectedValue(new ApiError('technical', 'boom', 500));

    await store.remove(garden(1));

    expect(store.gardens().map((g) => g.gardenId)).toEqual([1, 2]); // nothing removed
    expect(store.pendingDeletes()).toHaveLength(0);
    const errorToast = toasts.toasts().find((t) => t.tone === 'error');
    expect(errorToast?.actionLabel).toBe('Try again');
  });

  it('mutations keep the cache coherent (a reload after create makes no request)', async () => {
    api.getAll.mockResolvedValue([]);
    await store.load();
    api.create.mockResolvedValue(garden(7, 'Fresh'));

    await store.create({ gardenName: 'Fresh', totalSurfaceArea: 10, targetHumidityLevel: 50 });

    api.getAll.mockClear();
    await store.load();
    expect(api.getAll).not.toHaveBeenCalled();
    expect(TestBed.inject(QueryCache).read('gardens')).toEqual(store.gardens());
  });
});

describe('GardensStore — concurrency and edge cases', () => {
  it('re-entrant remove for the same garden issues exactly one DELETE', async () => {
    const api = {
      getAll: vi.fn().mockResolvedValue([garden(1), garden(2)]),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockReturnValue(new Promise(() => undefined)), // never resolves
    };
    TestBed.configureTestingModule({ providers: [{ provide: GardensApi, useValue: api }] });
    const store = TestBed.inject(GardensStore);
    await store.load();

    void store.remove(garden(1));
    void store.remove(garden(1));

    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(store.gardens().map((g) => g.gardenId)).toEqual([1, 2]); // ghost, not removed yet
    expect(store.pendingDeletes()).toEqual([1]);
  });

  it('search persistence is debounced — 10 keystrokes, one storage write', () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [{ provide: GardensApi, useValue: { getAll: vi.fn() } }],
    });
    const store = TestBed.inject(GardensStore);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    for (const q of [
      't',
      'to',
      'tom',
      'toma',
      'tomat',
      'tomato',
      'tomatoe',
      'tomatoes',
      'x',
      'y',
    ]) {
      store.setQuery(q);
    }
    expect(setItem).not.toHaveBeenCalled(); // trailing debounce
    vi.advanceTimersByTime(301);
    expect(setItem).toHaveBeenCalledTimes(1);

    setItem.mockRestore();
    vi.useRealTimers();
  });
});

describe('GardensStore — update, view state and toast policy', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let store: InstanceType<typeof GardensStore>;
  let toasts: ToastStore;
  let cache: QueryCache;

  beforeEach(() => {
    localStorage.clear();
    api = {
      getAll: vi.fn().mockResolvedValue([garden(1), garden(2)]),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: GardensApi, useValue: api }] });
    store = TestBed.inject(GardensStore);
    toasts = TestBed.inject(ToastStore);
    cache = TestBed.inject(QueryCache);
  });

  describe('update', () => {
    const input = {
      gardenName: 'Renamed',
      totalSurfaceArea: 20,
      targetHumidityLevel: 50,
      locationDescription: null,
      latitude: null,
      longitude: null,
    };

    it('replaces the garden in place, writes through the cache and confirms', async () => {
      await store.load();
      const updated = { ...garden(1), gardenName: 'Renamed' };
      api['update'].mockResolvedValue(updated);
      const set = vi.spyOn(cache, 'set');

      const result = await store.update(1, input);

      expect(result.ok).toBe(true);
      expect(store.gardens().find((g) => g.gardenId === 1)?.gardenName).toBe('Renamed');
      // Write-through, not invalidate: the detail screen must see it with no refetch.
      expect(set).toHaveBeenCalledWith(cacheKeys.garden(1), updated);
      expect(toasts.toasts().some((t) => t.message.includes('updated'))).toBe(true);
    });

    it('marks the garden pending while the PUT is in flight, and clears it after', async () => {
      await store.load();
      let release = (): void => undefined;
      api['update'].mockImplementation(() => new Promise((r) => (release = () => r(garden(1)))));

      const pending = store.update(1, input);
      await vi.waitFor(() => expect(store.pendingUpdates()).toContain(1));
      expect(store.saving()).toBe(true);

      release();
      await pending;
      expect(store.pendingUpdates()).not.toContain(1);
      expect(store.saving()).toBe(false);
    });

    it('returns a functional verdict to the form WITHOUT toasting it', async () => {
      await store.load();
      api['update'].mockRejectedValue(new ApiError('functional', 'Name already used', 400));

      const result = await store.update(1, input);

      expect(result).toMatchObject({ ok: false });
      expect(toasts.toasts().every((t) => t.tone !== 'error')).toBe(true);
    });

    it('toasts a technical failure, because no form can render that', async () => {
      await store.load();
      api['update'].mockRejectedValue(new ApiError('technical', 'Server exploded', 500));

      const result = await store.update(1, input);

      expect(result.ok).toBe(false);
      expect(toasts.toasts().some((t) => t.tone === 'error')).toBe(true);
    });
  });

  describe('view state', () => {
    it('keeps a search query and a sort order', () => {
      store.setQuery('herb');
      store.setSort('utilization');
      expect(store.query()).toBe('herb');
      expect(store.sort()).toBe('utilization');
    });
  });
});

/**
 * The toolbar view survives a reload. The store reads it when it is created
 * (a `withState` factory), so each test stores a value first and then asks
 * for a fresh store — no module reloading needed.
 */
describe('GardensStore — the persisted toolbar view', () => {
  const VIEW_KEY = 'itp-home-garden.gardens-view';

  const storeWith = (stored: string | null) => {
    localStorage.clear();
    if (stored !== null) {
      localStorage.setItem(VIEW_KEY, stored);
    }
    TestBed.configureTestingModule({
      providers: [{ provide: GardensApi, useValue: { getAll: vi.fn() } }],
    });
    return TestBed.inject(GardensStore);
  };
  const viewOf = (store: InstanceType<typeof GardensStore>) => [store.query(), store.sort()];

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('restores the last search and sort order', () => {
    expect(viewOf(storeWith(JSON.stringify({ query: 'herb', sort: 'size' })))).toEqual([
      'herb',
      'size',
    ]);
  });

  it('knows every sort order it can restore', () => {
    expect(viewOf(storeWith(JSON.stringify({ sort: 'utilization' })))).toEqual(['', 'utilization']);
  });

  it('ignores a sort order it does not know and a search that is not text', () => {
    expect(viewOf(storeWith(JSON.stringify({ query: 42, sort: 'colour' })))).toEqual(['', 'name']);
  });

  it('starts from the defaults with nothing stored', () => {
    expect(viewOf(storeWith(null))).toEqual(['', 'name']);
  });

  it('starts from the defaults when the stored value is corrupted', () => {
    expect(viewOf(storeWith('{not json'))).toEqual(['', 'name']);
  });

  it('writes the view back once typing pauses', () => {
    vi.useFakeTimers();
    const store = storeWith(null);

    store.setQuery('mint');
    store.setSort('size');
    expect(localStorage.getItem(VIEW_KEY)).toBeNull();

    vi.advanceTimersByTime(300);
    expect(JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}')).toEqual({
      query: 'mint',
      sort: 'size',
    });
  });
});

describe('GardensStore — a profile sees its own gardens and the shared ones (ADR-009)', () => {
  let gardensApi: Record<string, ReturnType<typeof vi.fn>>;
  let store: InstanceType<typeof GardensStore>;
  let session: SessionStore;
  const profile = (userId: number) => ({
    userId,
    emailAddress: `p${userId}@example.com`,
    firstName: null,
    lastName: null,
    age: null,
  });

  beforeEach(() => {
    localStorage.clear();
    gardensApi = {
      getAll: vi.fn().mockResolvedValue([garden(1)]),
      getById: vi.fn(),
      create: vi.fn().mockResolvedValue(garden(5, 'Mine')),
      update: vi.fn(),
      delete: vi.fn(),
    };
    TestBed.configureTestingModule({ providers: [{ provide: GardensApi, useValue: gardensApi }] });
    session = TestBed.inject(SessionStore);
    store = TestBed.inject(GardensStore);
  });

  it("loads the signed-in profile's list", async () => {
    session.signIn(profile(7));

    await store.load();

    expect(gardensApi['getAll']).toHaveBeenCalledWith(7);
  });

  it("another profile gets its own list — the previous profile's gardens are never shown", async () => {
    session.signIn(profile(7));
    await store.load();
    expect(store.gardens()).toHaveLength(1);

    session.signIn(profile(8));
    gardensApi['getAll'].mockReturnValue(new Promise(() => undefined));
    void store.load();

    expect(store.gardens()).toEqual([]);
    expect(store.isLoading()).toBe(true);
    expect(gardensApi['getAll']).toHaveBeenLastCalledWith(8);
  });

  it('a new garden belongs to the profile that creates it', async () => {
    session.signIn(profile(7));

    await store.create({ gardenName: 'Mine', totalSurfaceArea: 5, targetHumidityLevel: 50 });

    expect(gardensApi['create']).toHaveBeenCalledWith(
      expect.objectContaining({ gardenName: 'Mine' }),
      7,
    );
  });
});

describe('GardensStore — Undo for a deleted garden', () => {
  let gardensApi: Record<string, ReturnType<typeof vi.fn>>;
  let plantsApi: Record<string, ReturnType<typeof vi.fn>>;
  let store: InstanceType<typeof GardensStore>;
  let toasts: ToastStore;
  let cache: QueryCache;
  let layout: GardenLayoutRepository;
  let session: SessionStore;

  const plantOf = (id: number): Plant => ({
    plantId: id,
    plantName: `Plant ${id}`,
    species: 's',
    plantType: 'flower',
    plantationDate: '2026-04-01T00:00:00.000Z',
    surfaceAreaRequired: 2,
    idealHumidityLevel: 50,
    gardenId: 1,
    createdAt: '',
    updatedAt: '',
  });
  const profile = (userId: number) => ({
    userId,
    emailAddress: `p${userId}@example.com`,
    firstName: null,
    lastName: null,
    age: null,
  });

  beforeEach(() => {
    localStorage.clear();
    gardensApi = {
      getAll: vi.fn().mockResolvedValue([garden(1), garden(2)]),
      getById: vi.fn(),
      create: vi.fn().mockResolvedValue(garden(10, 'Garden 1')),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    let nextPlantId = 100;
    plantsApi = {
      create: vi.fn().mockImplementation(async (input: PlantInput): Promise<Plant> => ({
        ...input,
        plantId: nextPlantId++,
        createdAt: '',
        updatedAt: '',
      })),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: GardensApi, useValue: gardensApi },
        { provide: PlantsApi, useValue: plantsApi },
      ],
    });
    store = TestBed.inject(GardensStore);
    toasts = TestBed.inject(ToastStore);
    cache = TestBed.inject(QueryCache);
    layout = TestBed.inject(GardenLayoutRepository);
    session = TestBed.inject(SessionStore);
  });

  /** Deletes `target` with its plants known, and hands back the Undo toast. */
  const deleteWithPlants = async (
    target: Garden = garden(1),
    plants = [plantOf(1), plantOf(2)],
  ) => {
    await store.load();
    cache.set(cacheKeys.plantsOfGarden(target.gardenId), plants);
    await store.remove(target);
    return toasts.toasts().find((t) => t.actionLabel === 'Undo');
  };
  const errorToast = () => toasts.toasts().find((t) => t.tone === 'error');

  it('the delete toast offers Undo, and the deleted garden’s layout is cleared', async () => {
    layout.save(1, { 1: { x: 3, y: 4 } }, [1, 2]);
    const undo = await deleteWithPlants();
    expect(undo).toMatchObject({ tone: 'success', message: 'Garden “Garden 1” deleted.' });
    expect(layout.load(1)).toEqual({});
  });

  it('offers no Undo when its plants were never loaded — it could not bring them back', async () => {
    await store.load();
    await store.remove(garden(1));
    expect(toasts.toasts().some((t) => t.message === 'Garden “Garden 1” deleted.')).toBe(true);
    expect(toasts.toasts().some((t) => t.actionLabel === 'Undo')).toBe(false);
  });

  it('Undo creates the garden and its plants again, and moves the planner layout over', async () => {
    layout.save(1, { 1: { x: 3, y: 4 } }, [1, 2]);
    const undo = await deleteWithPlants();

    undo?.action?.();
    expect(store.creating()).toBe(true); // the creation ghost card stands in
    await vi.waitFor(() => expect(store.creating()).toBe(false));

    // A shared garden comes back shared: no owner is sent.
    expect(gardensApi['create']).toHaveBeenCalledWith(
      expect.objectContaining({ gardenName: 'Garden 1', totalSurfaceArea: 20 }),
    );
    expect(plantsApi['create']).toHaveBeenCalledTimes(2);
    expect(plantsApi['create']).toHaveBeenCalledWith(
      expect.objectContaining({ plantName: 'Plant 1', gardenId: 10 }),
    );
    expect(store.gardens().map((g) => g.gardenId)).toEqual([2, 10]);
    expect(store.lastCreatedId()).toBe(10);
    expect(cache.read(cacheKeys.gardens)).toEqual(store.gardens());
    expect(cache.read<Plant[]>(cacheKeys.plantsOfGarden(10))?.map((p) => p.plantId)).toEqual([
      100, 101,
    ]);
    expect(layout.load(10)).toEqual({ 100: { x: 3, y: 4 } });
    expect(toasts.toasts().some((t) => t.message === 'Garden “Garden 1” is back.')).toBe(true);
  });

  it('the garden goes back to the profile that owned it', async () => {
    session.signIn(profile(7));
    const owned: Garden = { ...garden(1), ownerId: 7 };
    gardensApi['getAll'].mockResolvedValue([owned, garden(2)]);
    const undo = await deleteWithPlants(owned, []);

    undo?.action?.();
    await vi.waitFor(() => expect(store.creating()).toBe(false));

    expect(gardensApi['create']).toHaveBeenCalledWith(
      expect.objectContaining({ gardenName: 'Garden 1' }),
      7,
    );
    expect(store.gardens().map((g) => g.gardenId)).toEqual([2, 10]);
  });

  it("brought back after another profile signed in, it stays out of that profile's list", async () => {
    session.signIn(profile(7));
    const owned: Garden = { ...garden(1), ownerId: 7 };
    gardensApi['getAll'].mockResolvedValue([owned, garden(2)]);
    const undo = await deleteWithPlants(owned, []);

    session.signIn(profile(8));
    undo?.action?.();
    await vi.waitFor(() => expect(store.creating()).toBe(false));

    expect(gardensApi['create']).toHaveBeenCalled();
    expect(store.gardens().map((g) => g.gardenId)).toEqual([2]);
  });

  it('says how many plants could not be replanted', async () => {
    const undo = await deleteWithPlants();
    plantsApi['create'].mockRejectedValueOnce(new ApiError('technical', 'boom', 500));

    undo?.action?.();
    await vi.waitFor(() => expect(store.creating()).toBe(false));

    expect(errorToast()?.message).toBe(
      'Garden “Garden 1” is back, but 1 of its 2 plants could not be replanted.',
    );
    expect(cache.read<Plant[]>(cacheKeys.plantsOfGarden(10))).toHaveLength(1);
  });

  it('says so in the singular when the garden’s only plant could not be replanted', async () => {
    const undo = await deleteWithPlants(garden(1), [plantOf(1)]);
    plantsApi['create'].mockRejectedValueOnce(new ApiError('technical', 'boom', 500));

    undo?.action?.();
    await vi.waitFor(() => expect(store.creating()).toBe(false));

    expect(errorToast()?.message).toBe(
      'Garden “Garden 1” is back, but its plant could not be replanted.',
    );
  });

  it('a technical failure offers Try again', async () => {
    const undo = await deleteWithPlants();
    gardensApi['create'].mockRejectedValueOnce(new ApiError('technical', 'boom', 500));

    undo?.action?.();
    await vi.waitFor(() => expect(store.creating()).toBe(false));
    expect(errorToast()).toMatchObject({
      message: "Couldn't bring back “Garden 1”.",
      actionLabel: 'Try again',
    });

    errorToast()?.action?.();
    await vi.waitFor(() => expect(store.gardens().map((g) => g.gardenId)).toEqual([2, 10]));
  });

  it('a verdict (its owner is gone) is reported with nothing to retry', async () => {
    const undo = await deleteWithPlants();
    gardensApi['create'].mockRejectedValueOnce(
      new ApiError('functional', 'Profile with ID 7 not found', 400),
    );

    undo?.action?.();
    await vi.waitFor(() => expect(store.creating()).toBe(false));

    expect(errorToast()?.actionLabel).toBeUndefined();
    expect(store.gardens().map((g) => g.gardenId)).toEqual([2]);
  });
});
