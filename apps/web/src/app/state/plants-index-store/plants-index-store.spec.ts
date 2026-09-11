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

describe('PlantsIndexStore (fan-out ownership + loop regression guard)', () => {
  let api: { getByGarden: ReturnType<typeof vi.fn> };
  let store: InstanceType<typeof PlantsIndexStore>;
  let cache: QueryCache;

  beforeEach(() => {
    api = { getByGarden: vi.fn() };
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
