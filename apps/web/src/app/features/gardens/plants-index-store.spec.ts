import { effect, Injector, runInInjectionContext } from '@angular/core';
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

describe('PlantsIndexStore (the effect-loop regression guard)', () => {
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
    store.loadFor([5]);
    await vi.waitFor(() => expect(store.byGarden()[5]).toHaveLength(1));
  });

  it('identical warm-cache data is not re-patched (no useless renders)', () => {
    const plants = [plant(1, 5)];
    cache.set(cacheKeys.plantsOfGarden(5), plants);

    store.loadFor([5]);
    const first = store.byGarden();
    store.loadFor([5]);

    expect(store.byGarden()).toBe(first); // same object — nothing rewritten
  });

  it('REGRESSION: loadFor with a warm cache inside an effect must not loop', async () => {
    // The frozen-renderer bug: an effect tracking the garden list calls
    // loadFor; the warm-cache path read+wrote byGarden synchronously inside
    // the effect, registering its own write as a dependency → infinite loop.
    cache.set(cacheKeys.plantsOfGarden(1), [plant(1, 1)]);
    cache.set(cacheKeys.plantsOfGarden(2), [plant(2, 2)]);

    let runs = 0;
    const injector = TestBed.inject(Injector);
    runInInjectionContext(injector, () => {
      effect(() => {
        runs++;
        store.loadFor([1, 2]); // reads byGarden internally — must be untracked
      });
    });

    TestBed.tick(); // flush effects
    await new Promise((r) => setTimeout(r, 20)); // let any (buggy) rescheduling happen
    TestBed.tick();
    await new Promise((r) => setTimeout(r, 20));

    expect(runs).toBeLessThanOrEqual(2); // initial run (+ at most one benign re-run)
  });
});
