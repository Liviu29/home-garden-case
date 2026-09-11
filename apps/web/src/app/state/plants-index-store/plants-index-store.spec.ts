import { Injector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PlantsApi } from '../../core/api/plants-api';
import { Plant } from '../../core/api/models';
import { QueryCache, cacheKeys } from '../../core/resilience/query-cache';
import { PlantsIndexStore } from './plants-index-store';

const plant = (id: number, gardenId: number): Plant => ({
  plantId: id,
  plantName: `P${id}`,
  species: 's',
  plantType: 'vegetable',
  plantationDate: '2026-04-01T00:00:00.000Z',
  surfaceAreaRequired: 1,
  idealHumidityLevel: 50,
  gardenId,
  createdAt: '',
  updatedAt: '',
});

describe('PlantsIndexStore (loading ownership + loop regression guard)', () => {
  let api: { getByGarden: ReturnType<typeof vi.fn>; getAll: ReturnType<typeof vi.fn> };
  let store: InstanceType<typeof PlantsIndexStore>;
  let cache: QueryCache;

  beforeEach(() => {
    api = { getByGarden: vi.fn(), getAll: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: PlantsApi, useValue: api }] });
    store = TestBed.inject(PlantsIndexStore);
    cache = TestBed.inject(QueryCache);
  });

  it('loads plants per garden and exposes them by id', async () => {
    api.getByGarden.mockResolvedValue([plant(1, 5)]);
    store.ensureForGardens([5]);
    await vi.waitFor(() => expect(store.byGarden()[5]).toHaveLength(1));
  });

  it('records a failed load with nothing cached, so cards stop showing a loading ghost', async () => {
    api.getByGarden.mockRejectedValue(new Error('boom'));

    store.ensureForGardens([5]);

    await vi.waitFor(() => expect(store.failed()[5]).toBe(true));
    expect(store.byGarden()[5]).toBeUndefined();
  });

  it('clears the failure as soon as that garden’s plants arrive', async () => {
    api.getByGarden.mockRejectedValue(new Error('boom'));
    store.ensureForGardens([5]);
    await vi.waitFor(() => expect(store.failed()[5]).toBe(true));

    store.setPlants(5, [plant(1, 5)]);

    expect(store.failed()[5]).toBeUndefined();
    expect(store.byGarden()[5]).toHaveLength(1);
  });

  it('identical warm-cache data is not re-patched (no useless renders)', () => {
    const plants = [plant(1, 5)];
    cache.set(cacheKeys.plantsOfGarden(5), plants);

    store.ensureForGardens([5]);
    const first = store.byGarden();
    store.ensureForGardens([5]);

    expect(store.byGarden()).toBe(first); // same object — nothing rewritten
  });

  it('REGRESSION: a warm-cache fan-out driven by a signal source must not loop', async () => {
    // The frozen-renderer bug: a component effect tracking the garden list
    // called into this store, whose warm-cache path read AND wrote `byGarden`
    // synchronously — registering its own write as a dependency of the read
    // that produced it. The fix is structural: the source is a signal handed
    // to an rxMethod, whose handler runs in a subscription rather than in a
    // reactive consumer, so there is no dependency to re-trigger.
    api.getByGarden.mockResolvedValue([plant(9, 9)]);
    cache.set(cacheKeys.plantsOfGarden(1), [plant(1, 1)]);
    cache.set(cacheKeys.plantsOfGarden(2), [plant(2, 2)]);

    const ids = signal<readonly number[]>([1, 2]);
    const injector = TestBed.inject(Injector);
    runInInjectionContext(injector, () => store.ensureForGardens(ids, { injector }));

    TestBed.tick();
    await new Promise((r) => setTimeout(r, 20)); // let any (buggy) rescheduling happen
    TestBed.tick();
    await new Promise((r) => setTimeout(r, 20));

    expect(store.byGarden()[1]).toHaveLength(1);
    expect(store.byGarden()[2]).toHaveLength(1);
    // The warm-cache path must not have issued network calls at all.
    expect(api.getByGarden).not.toHaveBeenCalled();
  });

  it('an unchanged garden list does not re-run the fan-out', async () => {
    api.getByGarden.mockResolvedValue([plant(1, 5)]);
    const ids = signal<readonly number[]>([5]);
    const injector = TestBed.inject(Injector);
    runInInjectionContext(injector, () => store.ensureForGardens(ids, { injector }));

    await vi.waitFor(() => expect(api.getByGarden).toHaveBeenCalledTimes(1));

    // A recomputed source that yields the SAME ids must not fan out again.
    ids.set([5]);
    TestBed.tick();
    await new Promise((r) => setTimeout(r, 20));
    expect(api.getByGarden).toHaveBeenCalledTimes(1);

    // A genuinely new garden does.
    ids.set([5, 6]);
    TestBed.tick();
    await vi.waitFor(() => expect(api.getByGarden).toHaveBeenCalledTimes(2));
  });

  describe('one request for many gardens', () => {
    it('loads several gardens with a single GET /plants, filed per garden', async () => {
      api.getAll.mockResolvedValue([plant(1, 1), plant(2, 2), plant(3, 2), plant(9, 99)]);

      store.ensureForGardens([1, 2, 3]);

      await vi.waitFor(() => expect(store.byGarden()[3]).toEqual([]));
      expect(api.getAll).toHaveBeenCalledTimes(1);
      expect(api.getByGarden).not.toHaveBeenCalled();
      expect(store.byGarden()[1]).toHaveLength(1);
      expect(store.byGarden()[2]).toHaveLength(2);
      // Filed under each garden's own key, so the detail screen reuses it.
      expect(cache.read(cacheKeys.plantsOfGarden(2))).toHaveLength(2);
      // A garden nobody asked for is not indexed.
      expect(store.byGarden()[99]).toBeUndefined();
    });

    it('only asks for the gardens that are not fresh in the cache', async () => {
      cache.set(cacheKeys.plantsOfGarden(1), [plant(1, 1)]);
      api.getByGarden.mockResolvedValue([plant(2, 2)]);

      store.ensureForGardens([1, 2]);

      await vi.waitFor(() => expect(store.byGarden()[2]).toHaveLength(1));
      expect(api.getByGarden).toHaveBeenCalledExactlyOnceWith(2);
      expect(api.getAll).not.toHaveBeenCalled();
    });

    it('paints stale cached plants at once, then replaces them with the answer', async () => {
      const stale = [plant(1, 1)];
      cache.set(cacheKeys.plantsOfGarden(1), stale);
      cache.set(cacheKeys.plantsOfGarden(2), []);
      vi.spyOn(cache, 'isFresh').mockReturnValue(false);
      api.getAll.mockResolvedValue([plant(1, 1), plant(5, 1), plant(2, 2)]);

      store.ensureForGardens([1, 2]);
      expect(store.byGarden()[1]).toBe(stale); // synchronously, before the network

      await vi.waitFor(() => expect(store.byGarden()[1]).toHaveLength(2));
      expect(store.byGarden()[2]).toHaveLength(1);
    });

    it('a failed request marks only the gardens with nothing cached', async () => {
      cache.set(cacheKeys.plantsOfGarden(1), [plant(1, 1)]);
      vi.spyOn(cache, 'isFresh').mockReturnValue(false);
      api.getAll.mockRejectedValue(new Error('boom'));

      store.ensureForGardens([1, 2, 3]);

      await vi.waitFor(() => expect(store.failed()[2]).toBe(true));
      expect(store.failed()[3]).toBe(true);
      expect(store.failed()[1]).toBeUndefined();
      expect(store.byGarden()[1]).toHaveLength(1); // the cached copy stays
    });

    it('a failed single-garden refresh keeps the cached copy and marks nothing', async () => {
      cache.set(cacheKeys.plantsOfGarden(1), [plant(1, 1)]);
      vi.spyOn(cache, 'isFresh').mockReturnValue(false);
      api.getByGarden.mockRejectedValue(new Error('boom'));

      store.ensureForGardens([1]);

      await vi.waitFor(() => expect(api.getByGarden).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r));
      expect(store.failed()).toEqual({});
      expect(store.byGarden()[1]).toHaveLength(1);
    });

    it('a mutation written while the request is in flight is not overwritten', async () => {
      let answer: (plants: Plant[]) => void = () => undefined;
      api.getAll.mockReturnValue(new Promise<Plant[]>((resolve) => (answer = resolve)));

      store.ensureForGardens([1, 2]);
      const justAdded = [plant(7, 1), plant(8, 1)];
      store.setPlants(1, justAdded); // e.g. a plant created on the detail screen
      answer([plant(7, 1), plant(2, 2)]); // the older server view lands afterwards

      await vi.waitFor(() => expect(store.byGarden()[2]).toHaveLength(1));
      expect(store.byGarden()[1]).toBe(justAdded);
      expect(cache.read(cacheKeys.plantsOfGarden(1))).toBe(justAdded);
    });
  });

  it('a stale garden collection landing late never removes the current one', async () => {
    // Collection A = [1], then the user navigates and the source becomes [2].
    // A's in-flight response must still resolve into its own key and must not
    // clobber or delete B's entry.
    let resolveA: (p: Plant[]) => void = () => undefined;
    api.getByGarden.mockImplementation((gardenId: number) =>
      gardenId === 1
        ? new Promise<Plant[]>((res) => (resolveA = res))
        : Promise.resolve([plant(2, 2)]),
    );

    const ids = signal<readonly number[]>([1]);
    const injector = TestBed.inject(Injector);
    runInInjectionContext(injector, () => store.ensureForGardens(ids, { injector }));
    await new Promise((r) => setTimeout(r, 10));

    ids.set([2]);
    TestBed.tick();
    await vi.waitFor(() => expect(store.byGarden()[2]).toHaveLength(1));

    resolveA([plant(1, 1)]); // the abandoned collection finally answers
    await vi.waitFor(() => expect(store.byGarden()[1]).toHaveLength(1));

    expect(store.byGarden()[2]).toHaveLength(1); // still intact
  });
});
