import { TestBed } from '@angular/core/testing';
import { GardensApi } from '../../core/api/gardens-api';
import { Garden } from '../../core/api/models';
import { ApiError } from '../../core/errors/api-error';
import { ToastStore } from '../../core/errors/toast-store';
import { QueryCache } from '../../core/resilience/query-cache';
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
    // Runtime-reproduced race (STAB pass): a list fetch that hit the server
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

describe('GardensStore — remediation behaviours', () => {
  it('re-entrant remove for the same garden issues exactly one DELETE (REM-009)', async () => {
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

  it('search persistence is debounced — 10 keystrokes, one storage write (REM-015)', () => {
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
