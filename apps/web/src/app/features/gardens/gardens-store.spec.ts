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

  it('remove: optimistic — the garden disappears before the server answers', async () => {
    api.getAll.mockResolvedValue([garden(1), garden(2)]);
    await store.load();
    let resolve!: () => void;
    api.delete.mockReturnValue(new Promise<void>((r) => (resolve = r)));

    const removal = store.remove(garden(1));
    expect(store.gardens().map((g) => g.gardenId)).toEqual([2]); // gone instantly

    resolve();
    await removal;
    expect(store.gardens().map((g) => g.gardenId)).toEqual([2]);
  });

  it('remove: rolls back the snapshot and offers retry when the server fails', async () => {
    api.getAll.mockResolvedValue([garden(1), garden(2)]);
    await store.load();
    api.delete.mockRejectedValue(new ApiError('technical', 'boom', 500));

    await store.remove(garden(1));

    expect(store.gardens().map((g) => g.gardenId)).toEqual([1, 2]); // restored
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
