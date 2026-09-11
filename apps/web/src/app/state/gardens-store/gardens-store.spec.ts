import { TestBed } from '@angular/core/testing';
import { GardensApi } from '../../core/api/gardens-api';
import { Garden } from '../../core/api/models';
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
