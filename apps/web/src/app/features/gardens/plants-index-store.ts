import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { PlantsApi } from '../../core/api/plants-api';
import { Plant } from '../../core/api/models';
import { QueryCache, cacheKeys } from '../../core/resilience/query-cache';

interface PlantsIndexState {
  /** gardenId → its plants; absent key = not loaded yet. */
  byGarden: Readonly<Record<number, readonly Plant[]>>;
}

/**
 * Cross-feature index of plants per garden (used by the gardens grid and the
 * dashboard for occupancy/humidity insights). Each garden's plants load
 * through the SWR cache, in parallel, individually retried — so the N+1 shape
 * of the API (API-ANALYSIS gap #2) never blocks the primary content.
 */
export const PlantsIndexStore = signalStore(
  { providedIn: 'root' },
  withState<PlantsIndexState>({ byGarden: {} }),
  withMethods((store) => {
    const api = inject(PlantsApi);
    const cache = inject(QueryCache);

    const apply = (gardenId: number, plants: readonly Plant[]) =>
      patchState(store, { byGarden: { ...store.byGarden(), [gardenId]: plants } });

    return {
      /** Kick off (or refresh) plant loads for the given gardens; non-blocking. */
      loadFor(gardenIds: readonly number[]): void {
        for (const gardenId of gardenIds) {
          const { cached, revalidate } = cache.swr(cacheKeys.plantsOfGarden(gardenId), () =>
            api.getByGarden(gardenId),
          );
          if (cached) {
            apply(gardenId, cached);
          }
          revalidate
            ?.then((plants) => apply(gardenId, plants))
            .catch(() => {
              // Insight data is progressive enhancement — cards render without it.
            });
        }
      },

      /** Write-through used by GardenDetailStore after plant mutations. */
      setPlants(gardenId: number, plants: readonly Plant[]): void {
        apply(gardenId, plants);
        cache.set(cacheKeys.plantsOfGarden(gardenId), plants);
      },
    };
  }),
);
