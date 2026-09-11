import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { distinctUntilChanged, pipe, tap } from 'rxjs';
import { PlantsApi } from '../../core/api/plants-api';
import { Plant } from '../../core/api/models';
import { QueryCache, cacheKeys } from '../../core/resilience/query-cache';

interface PlantsIndexState {
  /** gardenId → its plants; absent key = not loaded yet. */
  byGarden: Readonly<Record<number, readonly Plant[]>>;
  /**
   * gardenIds whose plants could not be loaded and have no cached copy. Lets
   * a card stop showing a loading ghost it would otherwise show forever.
   */
  failed: Readonly<Record<number, true>>;
}

/** Same ids, same order → the load already ran; nothing to do. */
const sameIds = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * Cross-feature index of plants per garden (used by the gardens grid and the
 * dashboard for occupancy/humidity insights, and by the detail screen as its
 * single plants owner). Everything goes through the SWR cache, so cached
 * plants paint instantly and the network never blocks the primary content.
 *
 * One request, not N: when several gardens need fresh plants at once, the
 * store asks `GET /plants` once and files the answer under each garden's own
 * cache key. A single garden (the detail screen, one new card) still uses
 * `GET /plants/garden/{id}` — it is smaller and already cached per garden.
 *
 * THIS STORE OWNS THE LOADING. Components declare a source of garden ids and
 * nothing more; they do not orchestrate requests, and they do not write to
 * this store. That ownership split is what removed the `untracked()` calls
 * this file used to need — see `ensureForGardens` below.
 */
export const PlantsIndexStore = signalStore(
  { providedIn: 'root' },
  withState<PlantsIndexState>({ byGarden: {}, failed: {} }),
  withMethods((store) => {
    const api = inject(PlantsApi);
    const cache = inject(QueryCache);

    const apply = (gardenId: number, plants: readonly Plant[]): void => {
      if (store.failed()[gardenId]) {
        const stillFailed = { ...store.failed() };
        delete stillFailed[gardenId];
        patchState(store, { failed: stillFailed });
      }
      // Skip identical writes: keeps renders minimal.
      if (store.byGarden()[gardenId] === plants) {
        return;
      }
      patchState(store, { byGarden: { ...store.byGarden(), [gardenId]: plants } });
    };

    // Insight data is progressive enhancement — cards render without it.
    // With nothing cached, record the failure so the card can say so instead
    // of shimmering a loading ghost forever.
    const markFailed = (gardenIds: readonly number[]): void => {
      if (gardenIds.length > 0) {
        const failed = { ...store.failed() };
        gardenIds.forEach((id) => (failed[id] = true));
        patchState(store, { failed });
      }
    };

    const loadOne = (gardenId: number): void => {
      const { cached, revalidate } = cache.swr(cacheKeys.plantsOfGarden(gardenId), () =>
        api.getByGarden(gardenId),
      );
      if (cached) {
        apply(gardenId, cached);
      }
      revalidate
        ?.then((plants) => apply(gardenId, plants))
        .catch(() => markFailed(cached ? [] : [gardenId]));
    };

    const loadMany = (gardenIds: readonly number[]): void => {
      // Paint whatever is cached right away; collect what needs the network.
      const snapshot = new Map<number, readonly Plant[] | undefined>();
      for (const gardenId of gardenIds) {
        const key = cacheKeys.plantsOfGarden(gardenId);
        const cached = cache.read<readonly Plant[]>(key);
        if (cached) {
          apply(gardenId, cached);
        }
        if (!cached || !cache.isFresh(key)) {
          snapshot.set(gardenId, cached);
        }
      }

      const stale = [...snapshot.keys()];
      if (stale.length <= 1) {
        stale.forEach(loadOne);
        return;
      }

      cache
        .refresh(cacheKeys.allPlants, () => api.getAll())
        .then((plants) => {
          const grouped = new Map<number, Plant[]>(stale.map((id) => [id, []]));
          for (const plant of plants) {
            grouped.get(plant.gardenId)?.push(plant);
          }
          for (const [gardenId, ofGarden] of grouped) {
            const key = cacheKeys.plantsOfGarden(gardenId);
            // A local mutation (or a per-garden load) wrote this garden while
            // the aggregate was in flight: that view is newer than ours.
            if (cache.read(key) !== snapshot.get(gardenId)) {
              continue;
            }
            cache.set(key, ofGarden);
            apply(gardenId, ofGarden);
          }
        })
        .catch(() => markFailed(stale.filter((id) => !snapshot.get(id))));
    };

    return {
      /**
       * Load (or refresh) plants for a set of gardens; non-blocking.
       *
       * `rxMethod` is deliberate, not decoration. It accepts a *signal* as its
       * source, so a caller passes `gardenIds` once instead of running an
       * `effect()` that both reads the garden list and writes this store — the
       * self-dependency that previously forced `untracked()` around the
       * warm-cache path. The handler runs in a subscription, outside any
       * reactive consumer, so a write here can never re-trigger the read that
       * produced it. `distinctUntilChanged` also collapses recomputations of
       * the source that yield the same ids, so an unchanged garden list costs
       * nothing.
       *
       * The same method still accepts a plain array for one-shot imperative
       * callers, so there is one API rather than two.
       */
      ensureForGardens: rxMethod<readonly number[]>(
        pipe(distinctUntilChanged(sameIds), tap(loadMany)),
      ),

      /** Write-through used by GardenDetailStore after plant mutations. */
      setPlants(gardenId: number, plants: readonly Plant[]): void {
        apply(gardenId, plants);
        cache.set(cacheKeys.plantsOfGarden(gardenId), plants);
      },
    };
  }),
);
