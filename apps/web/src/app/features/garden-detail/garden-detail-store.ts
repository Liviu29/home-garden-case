import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { GardensApi } from '../../core/api/gardens-api';
import { PlantsApi } from '../../core/api/plants-api';
import { Garden, Plant, PlantInput } from '../../core/api/models';
import { toApiError } from '../../core/errors/api-error';
import { ToastStore } from '../../core/errors/toast-store';
import { QueryCache, cacheKeys } from '../../core/resilience/query-cache';
import {
  averageHumidity,
  freeSurfaceArea,
  humidityDelta,
  occupancyRatio,
  usedSurfaceArea,
} from '../../shared/utils/garden-insights';
import { MutationResult, RequestStatus } from '../gardens/gardens-store';
import { PlantsIndexStore } from '../gardens/plants-index-store';

interface GardenDetailState {
  garden: Garden | null;
  plants: readonly Plant[];
  gardenStatus: RequestStatus;
  plantsStatus: RequestStatus;
  saving: boolean;
}

/**
 * Route-scoped store for one garden and its plants (provided by the
 * GardenDetail component, destroyed with it). Loads garden + plants in
 * parallel through the SWR cache; derives all occupancy/humidity insights.
 */
export const GardenDetailStore = signalStore(
  withState<GardenDetailState>({
    garden: null,
    plants: [],
    gardenStatus: 'idle',
    plantsStatus: 'idle',
    saving: false,
  }),
  withComputed((store) => ({
    isGardenLoading: computed(() => store.gardenStatus() === 'loading'),
    arePlantsLoading: computed(() => store.plantsStatus() === 'loading'),
    gardenMissing: computed(() => store.gardenStatus() === 'error'),
    plantsEmpty: computed(() => store.plantsStatus() === 'ready' && store.plants().length === 0),
    usedArea: computed(() => usedSurfaceArea(store.plants())),
    freeArea: computed(() => {
      const garden = store.garden();
      return garden ? freeSurfaceArea(garden, store.plants()) : 0;
    }),
    occupancy: computed(() => {
      const garden = store.garden();
      return garden ? occupancyRatio(garden, store.plants()) : 0;
    }),
    avgHumidity: computed(() => averageHumidity(store.plants())),
    humidityDrift: computed(() => {
      const garden = store.garden();
      return garden ? humidityDelta(garden, store.plants()) : null;
    }),
  })),
  withMethods((store) => {
    const gardensApi = inject(GardensApi);
    const plantsApi = inject(PlantsApi);
    const cache = inject(QueryCache);
    const toasts = inject(ToastStore);
    const plantsIndex = inject(PlantsIndexStore);

    const applyPlants = (gardenId: number, plants: readonly Plant[]): void => {
      patchState(store, { plants, plantsStatus: 'ready' });
      plantsIndex.setPlants(gardenId, plants);
    };

    const loadGarden = async (gardenId: number): Promise<void> => {
      const { cached, revalidate } = cache.swr(cacheKeys.garden(gardenId), () =>
        gardensApi.getById(gardenId),
      );
      if (cached) {
        patchState(store, { garden: cached, gardenStatus: 'ready' });
      } else {
        patchState(store, { gardenStatus: 'loading' });
      }
      if (!revalidate) {
        return;
      }
      try {
        patchState(store, { garden: await revalidate, gardenStatus: 'ready' });
      } catch (err) {
        if (!cached) {
          patchState(store, { gardenStatus: 'error' });
        }
        console.warn('[garden-detail:load]', toApiError(err).message);
      }
    };

    const loadPlants = async (gardenId: number): Promise<void> => {
      const { cached, revalidate } = cache.swr(cacheKeys.plantsOfGarden(gardenId), () =>
        plantsApi.getByGarden(gardenId),
      );
      if (cached) {
        patchState(store, { plants: cached, plantsStatus: 'ready' });
      } else {
        patchState(store, { plantsStatus: 'loading' });
      }
      if (!revalidate) {
        return;
      }
      try {
        applyPlants(gardenId, await revalidate);
      } catch (err) {
        if (!cached) {
          patchState(store, { plantsStatus: 'error' });
        }
        console.warn('[garden-detail:plants]', toApiError(err).message);
      }
    };

    return {
      /** Garden + plants load in parallel — neither blocks the other's skeleton. */
      load(gardenId: number): void {
        void loadGarden(gardenId);
        void loadPlants(gardenId);
      },

      async createPlant(input: PlantInput): Promise<MutationResult> {
        patchState(store, { saving: true });
        try {
          const created = await plantsApi.create(input);
          applyPlants(input.gardenId, [...store.plants(), created]);
          toasts.success(`“${created.plantName}” planted.`);
          return { ok: true };
        } catch (err) {
          return failPlantMutation(err, toasts);
        } finally {
          patchState(store, { saving: false });
        }
      },

      async updatePlant(plantId: number, input: PlantInput): Promise<MutationResult> {
        patchState(store, { saving: true });
        try {
          const updated = await plantsApi.update(plantId, input);
          applyPlants(
            input.gardenId,
            store.plants().map((p) => (p.plantId === plantId ? updated : p)),
          );
          toasts.success(`“${updated.plantName}” updated.`);
          return { ok: true };
        } catch (err) {
          return failPlantMutation(err, toasts);
        } finally {
          patchState(store, { saving: false });
        }
      },

      /** Optimistic delete with rollback (ADR-004). */
      async removePlant(plant: Plant): Promise<void> {
        const snapshot = store.plants();
        patchState(store, { plants: snapshot.filter((p) => p.plantId !== plant.plantId) });
        try {
          await plantsApi.delete(plant.plantId);
          applyPlants(plant.gardenId, store.plants());
          toasts.success(`“${plant.plantName}” removed.`);
        } catch (err) {
          patchState(store, { plants: snapshot });
          const retry = (): void => void this.removePlant(plant);
          toasts.error(`Couldn't remove “${plant.plantName}”.`, {
            label: 'Try again',
            run: retry,
          });
          console.warn('[garden-detail:removePlant]', toApiError(err).message);
        }
      },
    };
  }),
);

function failPlantMutation(err: unknown, toasts: ToastStore): MutationResult {
  const error = toApiError(err);
  if (error.kind === 'technical') {
    toasts.error(error.message);
  }
  return { ok: false, error };
}
