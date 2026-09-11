import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { GardensApi } from '../../../core/api/gardens-api';
import { plantInputOf } from '../../../core/api/write-payloads';
import { PlantsApi } from '../../../core/api/plants-api';
import { Garden, Plant, PlantInput } from '../../../core/api/models';
import { toApiError } from '../../../core/errors/api-error';
import { ToastStore } from '../../../core/errors/toast-store';
import { Logger } from '../../../core/logging/logger';
import { QueryCache, cacheKeys } from '../../../core/resilience/query-cache';
import {
  averageHumidity,
  freeSurfaceArea,
  humidityDelta,
  occupancyRatio,
  usedSurfaceArea,
} from '../../../domain/garden-insights/garden-insights';
import { MutationResult, RequestStatus } from '../../../state/gardens-store/gardens-store';
import { PlantsIndexStore } from '../../../state/plants-index-store/plants-index-store';
import {
  GardenLayoutRepository,
  LayoutPositions,
} from '../../../state/garden-layout/garden-layout-repository';

interface GardenDetailState {
  garden: Garden | null;
  /** The route's garden id — the key into the single plants owner (PlantsIndexStore). */
  gardenId: number | null;
  gardenStatus: RequestStatus;
  plantsStatus: RequestStatus;
  /**
   * 404 (or an invalid route id) — semantically different from a transient 5xx.
   * Backend audit: this API answers 10% of ALL requests with a random 500, so
   * conflating the two told users their garden did not exist (audit fix #3).
   */
  gardenNotFound: boolean;
  saving: boolean;
  /** m² of a plant POST in flight — drives creation ghosts (ASYNC-UX.md). */
  pendingCreateArea: number | null;
  /** Plant ids with a PUT in flight — their row/plot render as gray ghosts. */
  pendingUpdates: readonly number[];
  /** Plant ids with a DELETE in flight — ghost-confirmed removal. */
  pendingDeletes: readonly number[];
  /** Set on successful create — lets the screen select the new plant. */
  lastCreatedPlantId: number | null;
  /**
   * Bed positions of a plant an undo brought back (under its new id), so the
   * planner on screen puts it where it stood.
   */
  restored: { readonly gardenId: number; readonly positions: LayoutPositions } | null;
}

type BedPosition = LayoutPositions[number];

/**
 * Route-scoped store for one garden (provided by the GardenDetail component,
 * destroyed with it).
 *
 * Ownership: plant entities have exactly ONE writable owner —
 * `PlantsIndexStore.byGarden`. This store holds only the route key and
 * statuses; `plants` is a computed view into the index, so the gardens grid,
 * the dashboard and this screen can never disagree about a garden's plants.
 */
export const GardenDetailStore = signalStore(
  withState<GardenDetailState>({
    garden: null,
    gardenId: null,
    gardenStatus: 'idle',
    plantsStatus: 'idle',
    gardenNotFound: false,
    saving: false,
    pendingCreateArea: null,
    pendingUpdates: [],
    pendingDeletes: [],
    lastCreatedPlantId: null,
    restored: null,
  }),
  withComputed((store) => {
    const plantsIndex = inject(PlantsIndexStore);

    const plants = computed<readonly Plant[]>(() => {
      const id = store.gardenId();
      return id === null ? [] : (plantsIndex.byGarden()[id] ?? []);
    });

    return {
      plants,
      isGardenLoading: computed(() => store.gardenStatus() === 'loading'),
      arePlantsLoading: computed(() => store.plantsStatus() === 'loading'),
      /** 404 / invalid id → designed not-found page. */
      gardenMissing: computed(() => store.gardenNotFound()),
      /** 5xx / network → retryable error state, garden may well still exist. */
      gardenFailed: computed(() => store.gardenStatus() === 'error' && !store.gardenNotFound()),
      /** Plants could not be loaded (and nothing was cached) — retryable. */
      plantsFailed: computed(() => store.plantsStatus() === 'error'),
      // A first plant being created is not "empty": its creation ghost row
      // must render instead of the "Nothing planted yet" state.
      plantsEmpty: computed(
        () =>
          store.plantsStatus() === 'ready' &&
          plants().length === 0 &&
          store.pendingCreateArea() === null,
      ),
      usedArea: computed(() => usedSurfaceArea(plants())),
      freeArea: computed(() => {
        const garden = store.garden();
        return garden ? freeSurfaceArea(garden, plants()) : 0;
      }),
      occupancy: computed(() => {
        const garden = store.garden();
        return garden ? occupancyRatio(garden, plants()) : 0;
      }),
      avgHumidity: computed(() => averageHumidity(plants())),
      humidityDrift: computed(() => {
        const garden = store.garden();
        return garden ? humidityDelta(garden, plants()) : null;
      }),
    };
  }),
  withMethods((store) => {
    const gardensApi = inject(GardensApi);
    const plantsApi = inject(PlantsApi);
    const cache = inject(QueryCache);
    const toasts = inject(ToastStore);
    const logger = inject(Logger);
    const plantsIndex = inject(PlantsIndexStore);
    const layout = inject(GardenLayoutRepository);

    /** All plant writes go through the single owner. */
    const writePlants = (gardenId: number, plants: readonly Plant[]): void => {
      plantsIndex.setPlants(gardenId, plants);
      patchState(store, { plantsStatus: 'ready' });
    };

    const currentPlants = (): readonly Plant[] => store.plants();

    /**
     * Monotonic request token — the store equivalent of `switchMap`.
     * Navigating /gardens/1 → /gardens/2 while garden 1 is still in flight must
     * never let garden 1's slow response land as garden 2 (audit fix #2).
     */
    let loadToken = 0;
    const isStale = (token: number): boolean => token !== loadToken;

    const loadGarden = async (gardenId: number, token: number): Promise<void> => {
      const { cached, revalidate } = cache.swr(cacheKeys.garden(gardenId), () =>
        gardensApi.getById(gardenId),
      );
      if (cached) {
        patchState(store, { garden: cached, gardenStatus: 'ready', gardenNotFound: false });
      } else {
        patchState(store, { gardenStatus: 'loading', gardenNotFound: false });
      }
      if (!revalidate) {
        return;
      }
      try {
        const garden = await revalidate;
        if (isStale(token)) {
          return; // a newer garden is on screen — discard this response
        }
        patchState(store, { garden, gardenStatus: 'ready', gardenNotFound: false });
      } catch (err) {
        const error = toApiError(err);
        if (isStale(token)) {
          return;
        }
        if (!cached) {
          // 404 → the garden is gone; anything else → transient, offer retry.
          patchState(store, {
            gardenStatus: 'error',
            gardenNotFound: error.kind === 'not-found',
          });
        }
        logger.warn('garden-detail:load', error.message);
      }
    };

    const loadPlants = async (gardenId: number, token: number): Promise<void> => {
      const { cached, revalidate } = cache.swr(cacheKeys.plantsOfGarden(gardenId), () =>
        plantsApi.getByGarden(gardenId),
      );
      if (cached) {
        writePlants(gardenId, cached);
      } else {
        patchState(store, { plantsStatus: 'loading' });
      }
      if (!revalidate) {
        return;
      }
      try {
        const plants = await revalidate;
        if (isStale(token)) {
          return;
        }
        writePlants(gardenId, plants);
      } catch (err) {
        if (isStale(token)) {
          return;
        }
        if (!cached) {
          patchState(store, { plantsStatus: 'error' });
        }
        // A missing garden answers 400 here but 404 on /gardens/:id (audit
        // limitation #1) — the garden request owns the not-found verdict.
        logger.warn('garden-detail:plants', toApiError(err).message);
      }
    };

    /**
     * Undo for a removal. The API has no restore, so the plant is planted
     * again — same fields, new id — and its bed goes back where it stood.
     * It may be pressed after leaving the screen: everything it writes is
     * keyed by the plant's own garden, not by the route.
     */
    const restorePlant = async (plant: Plant, spot: BedPosition | undefined): Promise<void> => {
      const onScreen = plant.gardenId === store.gardenId();
      if (onScreen) {
        patchState(store, { pendingCreateArea: plant.surfaceAreaRequired });
      }
      try {
        const restored = await plantsApi.create(plantInputOf(plant));
        // The removal wrote this garden's entry, so the index knows it.
        const known = plantsIndex.byGarden()[plant.gardenId] ?? [];
        plantsIndex.setPlants(plant.gardenId, [
          ...known.filter((p) => p.plantId !== restored.plantId),
          restored,
        ]);
        if (spot) {
          const positions = { [restored.plantId]: spot };
          layout.place(plant.gardenId, positions);
          patchState(store, { restored: { gardenId: plant.gardenId, positions } });
        }
        toasts.success(`“${restored.plantName}” is back.`);
      } catch (err) {
        const error = toApiError(err);
        if (error.kind === 'technical') {
          toasts.error(`Couldn't bring back “${plant.plantName}”.`, {
            label: 'Try again',
            run: () => void restorePlant(plant, spot),
          });
        } else {
          // e.g. its room went to another plant in the meantime (capacity 400)
          toasts.error(`Couldn't bring back “${plant.plantName}”. ${error.message}`);
        }
        logger.warn('garden-detail:restorePlant', error.message);
      } finally {
        if (onScreen) {
          patchState(store, { pendingCreateArea: null });
        }
      }
    };

    return {
      /** Garden + plants load in parallel — neither blocks the other's skeleton. */
      load(gardenId: number): void {
        const token = ++loadToken;
        patchState(store, { gardenId, gardenNotFound: false });
        void loadGarden(gardenId, token);
        void loadPlants(gardenId, token);
      },

      /**
       * Invalid route id (NaN, zero, negative): render the designed
       * not-found state without issuing any request.
       */
      markMissing(): void {
        loadToken++; // cancel anything in flight
        patchState(store, {
          gardenId: null,
          garden: null,
          gardenStatus: 'error',
          gardenNotFound: true,
        });
      },

      async createPlant(input: PlantInput): Promise<MutationResult> {
        patchState(store, { saving: true, pendingCreateArea: input.surfaceAreaRequired });
        try {
          const created = await plantsApi.create(input);
          // Idempotent append — same slow-API revalidation race as
          // GardensStore.create: the plant may already be in the index.
          writePlants(input.gardenId, [
            ...currentPlants().filter((p) => p.plantId !== created.plantId),
            created,
          ]);
          patchState(store, { lastCreatedPlantId: created.plantId });
          toasts.success(`“${created.plantName}” planted.`);
          return { ok: true };
        } catch (err) {
          return failPlantMutation(err, toasts);
        } finally {
          patchState(store, { saving: false, pendingCreateArea: null });
        }
      },

      async updatePlant(plantId: number, input: PlantInput): Promise<MutationResult> {
        patchState(store, {
          saving: true,
          pendingUpdates: [...store.pendingUpdates(), plantId],
        });
        try {
          const updated = await plantsApi.update(plantId, input);
          writePlants(
            input.gardenId,
            currentPlants().map((p) => (p.plantId === plantId ? updated : p)),
          );
          toasts.success(`“${updated.plantName}” updated.`);
          return { ok: true };
        } catch (err) {
          return failPlantMutation(err, toasts);
        } finally {
          patchState(store, {
            saving: false,
            pendingUpdates: store.pendingUpdates().filter((id) => id !== plantId),
          });
        }
      },

      /**
       * Ghost-confirmed delete (ASYNC-UX.md): the plant stays in state but its
       * row/plot render as a gray mutation ghost while the DELETE is in
       * flight; it leaves the UI only when the server confirms. Re-entrant
       * calls per plant are ignored. The confirmation toast offers Undo.
       */
      async removePlant(plant: Plant): Promise<void> {
        if (store.pendingDeletes().includes(plant.plantId)) {
          return;
        }
        // Where its bed stands, read before it goes: an undo puts it back there.
        const spot = layout.load(plant.gardenId)[plant.plantId];
        patchState(store, { pendingDeletes: [...store.pendingDeletes(), plant.plantId] });
        try {
          await plantsApi.delete(plant.plantId);
          writePlants(
            plant.gardenId,
            currentPlants().filter((p) => p.plantId !== plant.plantId),
          );
          toasts.success(`“${plant.plantName}” removed.`, {
            label: 'Undo',
            run: () => void restorePlant(plant, spot),
          });
        } catch (err) {
          // The ghost simply resolves back into the real plant — nothing to roll back.
          const retry = (): void => void this.removePlant(plant);
          toasts.error(`Couldn't remove “${plant.plantName}”.`, {
            label: 'Try again',
            run: retry,
          });
          logger.warn('garden-detail:removePlant', toApiError(err).message);
        } finally {
          patchState(store, {
            pendingDeletes: store.pendingDeletes().filter((id) => id !== plant.plantId),
          });
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
