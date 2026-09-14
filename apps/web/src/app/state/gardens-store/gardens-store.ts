import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { GardensApi } from '../../core/api/gardens-api';
import { gardenInputOf, plantInputOf } from '../../core/api/write-payloads';
import { PlantsApi } from '../../core/api/plants-api';
import { SessionStore } from '../../core/auth/session-store';
import { Garden, GardenInput, Plant } from '../../core/api/models';
import { ApiError, toApiError } from '../../core/errors/api-error';
import { ToastStore } from '../../core/errors/toast-store';
import { Logger } from '../../core/logging/logger';
import { QueryCache, cacheKeys } from '../../core/resilience/query-cache';
import { GardenLayoutRepository, LayoutPositions } from '../garden-layout/garden-layout-repository';
import { GardenSort } from './garden-view';

export type RequestStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Mutations resolve to a typed verdict so forms can render functional errors inline. */
export type MutationResult = { ok: true } | { ok: false; error: ApiError };

interface GardensState {
  gardens: readonly Garden[];
  status: RequestStatus;
  /** Set while a create/update runs (submit buttons show a ghost bar). */
  saving: boolean;
  /** A garden POST in flight — the grid shows a ghost card (ASYNC-UX.md). */
  creating: boolean;
  /** The garden created last in this session — the list points it out once. */
  lastCreatedId: number | null;
  /** Garden ids with a PUT in flight — their card/header render as ghosts. */
  pendingUpdates: readonly number[];
  /** Toolbar view state — persisted; the last-used view is restored, never reset. */
  query: string;
  sort: GardenSort;
  /** Garden ids with a DELETE in flight — ghost-confirmed removal. */
  pendingDeletes: readonly number[];
  /** The profile the loaded list belongs to (ADR-009); null before any profile. */
  listOwner: number | null;
}

const VIEW_STORAGE_KEY = 'itp-home-garden.gardens-view';

function readPersistedView(): { query: string; sort: GardenSort } {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { query?: unknown; sort?: unknown };
      const sort: GardenSort =
        parsed.sort === 'size' || parsed.sort === 'utilization' ? parsed.sort : 'name';
      return { query: typeof parsed.query === 'string' ? parsed.query : '', sort };
    }
  } catch {
    // corrupted/unavailable storage — defaults below
  }
  return { query: '', sort: 'name' };
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;

/** Trailing-debounced: typing stays instant, storage writes don't churn. */
function persistView(query: string, sort: GardenSort): void {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ query, sort }));
    } catch {
      // storage unavailable — view just won't survive reloads
    }
  }, 300);
}

/**
 * Root-scoped garden state (ARCHITECTURE §5): SWR-backed reads,
 * ghost-confirmed deletes with Undo (ASYNC-UX.md), pessimistic create/update
 * (the server owns validation verdicts the form must render).
 */
export const GardensStore = signalStore(
  { providedIn: 'root' },
  // A factory, not a literal: the persisted view is read when the store is
  // created, not when this module is first imported.
  withState<GardensState>(() => ({
    gardens: [],
    status: 'idle',
    saving: false,
    creating: false,
    lastCreatedId: null,
    pendingUpdates: [],
    pendingDeletes: [],
    listOwner: null,
    ...readPersistedView(),
  })),
  withComputed((store) => ({
    isLoading: computed(() => store.status() === 'loading'),
    hasFailed: computed(() => store.status() === 'error'),
    isEmpty: computed(() => store.status() === 'ready' && store.gardens().length === 0),
    count: computed(() => store.gardens().length),
  })),
  withMethods((store) => {
    const api = inject(GardensApi);
    const plantsApi = inject(PlantsApi);
    const cache = inject(QueryCache);
    const toasts = inject(ToastStore);
    const logger = inject(Logger);
    const session = inject(SessionStore);
    const layout = inject(GardenLayoutRepository);

    const applyList = (gardens: readonly Garden[]) =>
      patchState(store, { gardens, status: 'ready' });

    /** The signed-in profile — whose gardens (plus the shared ones) the list shows. */
    const profileId = (): number | null => session.profile()?.userId ?? null;

    /** Idempotent add: a revalidation may already have delivered this garden. */
    const addToList = (garden: Garden): void => {
      patchState(store, {
        gardens: [...store.gardens().filter((g) => g.gardenId !== garden.gardenId), garden],
        status: 'ready',
        lastCreatedId: garden.gardenId,
      });
      cache.set(cacheKeys.gardens, store.gardens());
    };

    /**
     * Undo for a deleted garden. The API has no restore, and deleting a
     * garden deletes its plants, so both are created again — same fields,
     * same owner, new ids — and the planner layout moves to the new ids. A
     * creation ghost card stands in until the garden is whole.
     */
    const restoreGarden = async (
      garden: Garden,
      plants: readonly Plant[],
      layoutBefore: LayoutPositions,
    ): Promise<void> => {
      patchState(store, { creating: true });
      try {
        const owner = garden.ownerId ?? null;
        const input = gardenInputOf(garden);
        const restored = await (owner === null ? api.create(input) : api.create(input, owner));

        // One at a time: the API checks capacity per insert, and they all fitted before.
        const replanted: Plant[] = [];
        const positions: Record<number, LayoutPositions[number]> = {};
        for (const plant of plants) {
          try {
            const back = await plantsApi.create(plantInputOf(plant, restored.gardenId));
            replanted.push(back);
            const spot = layoutBefore[plant.plantId];
            if (spot) {
              positions[back.plantId] = spot;
            }
          } catch (err) {
            logger.warn('gardens:restore-plant', toApiError(err).message);
          }
        }
        cache.set(cacheKeys.plantsOfGarden(restored.gardenId), replanted);
        layout.place(restored.gardenId, positions);

        // Another profile may have signed in since; its list stays its own.
        if (owner === null || owner === profileId()) {
          addToList(restored);
        }
        const lost = plants.length - replanted.length;
        if (lost === 0) {
          toasts.success($localize`Garden “${restored.gardenName}:name:” is back.`);
        } else {
          toasts.error(
            plants.length === 1
              ? $localize`Garden “${restored.gardenName}:name:” is back, but its plant could not be replanted.`
              : $localize`Garden “${restored.gardenName}:name:” is back, but ${lost}:lost: of its ${plants.length}:total: plants could not be replanted.`,
          );
        }
      } catch (err) {
        const error = toApiError(err);
        toasts.error(
          $localize`Couldn't bring back “${garden.gardenName}:name:”.`,
          error.kind === 'technical'
            ? {
                label: $localize`Try again`,
                run: () => void restoreGarden(garden, plants, layoutBefore),
              }
            : undefined,
        );
        logger.warn('gardens:restore', error.message);
      } finally {
        patchState(store, { creating: false });
      }
    };

    return {
      setQuery(query: string): void {
        patchState(store, { query });
        persistView(query, store.sort());
      },

      setSort(sort: GardenSort): void {
        patchState(store, { sort });
        persistView(store.query(), sort);
      },

      /** SWR load: cached list renders instantly; stale data revalidates behind it. */
      async load(): Promise<void> {
        const owner = profileId();
        if (owner !== store.listOwner()) {
          // Another profile signed in: its list is a different list. Drop the
          // cached one rather than flash the previous profile's gardens.
          cache.invalidate(cacheKeys.gardens);
          patchState(store, { gardens: [], listOwner: owner });
        }
        const { cached, revalidate } = cache.swr(cacheKeys.gardens, () =>
          api.getAll(owner ?? undefined),
        );

        if (cached) {
          applyList(cached);
        } else {
          patchState(store, { status: 'loading' });
        }

        if (!revalidate) {
          return;
        }
        try {
          applyList(await revalidate);
        } catch (err) {
          if (cached) {
            // Stale data on screen beats an error screen; note it quietly.
            toasts.info($localize`Showing cached gardens — refresh failed.`);
          } else {
            patchState(store, { status: 'error' });
          }
          logger.warn('gardens:load', toApiError(err).message);
        }
      },

      async create(input: GardenInput): Promise<MutationResult> {
        patchState(store, { saving: true, creating: true });
        try {
          // The signed-in profile owns what it creates (ADR-009).
          const owner = profileId();
          const created = await (owner === null ? api.create(input) : api.create(input, owner));
          // A garden that was just created has no plants — that is known, not
          // loading. Seeding its (fresh) plants entry lets the card, the
          // dashboard and the detail page say "0 plants" at once, instead of
          // a ghost that waits on a pointless GET.
          cache.set(cacheKeys.plantsOfGarden(created.gardenId), []);
          // Idempotent append: a background list revalidation that hit the
          // server AFTER the insert may already have delivered this garden
          // (a slow-API race) — a blind append would render
          // the card twice.
          addToList(created);
          toasts.success($localize`Garden “${created.gardenName}:name:” created.`);
          return { ok: true };
        } catch (err) {
          return failMutation(err, toasts);
        } finally {
          patchState(store, { saving: false, creating: false });
        }
      },

      async update(gardenId: number, input: GardenInput): Promise<MutationResult> {
        patchState(store, {
          saving: true,
          pendingUpdates: [...store.pendingUpdates(), gardenId],
        });
        try {
          const updated = await api.update(gardenId, input);
          patchState(store, {
            gardens: store.gardens().map((g) => (g.gardenId === gardenId ? updated : g)),
          });
          cache.set(cacheKeys.gardens, store.gardens());
          // Write-through (not invalidate): the detail screen re-reads this
          // key on reload and must see the update instantly, with no refetch.
          cache.set(cacheKeys.garden(gardenId), updated);
          toasts.success($localize`Garden “${updated.gardenName}:name:” updated.`);
          return { ok: true };
        } catch (err) {
          return failMutation(err, toasts);
        } finally {
          patchState(store, {
            saving: false,
            pendingUpdates: store.pendingUpdates().filter((id) => id !== gardenId),
          });
        }
      },

      /**
       * Ghost-confirmed delete (ASYNC-UX.md): the card stays but renders as a
       * gray mutation ghost while the DELETE is in flight; it leaves the grid
       * only on server confirmation. Re-entrant calls are ignored. The
       * confirmation toast offers Undo whenever the garden's plants are known.
       */
      async remove(garden: Garden): Promise<void> {
        if (store.pendingDeletes().includes(garden.gardenId)) {
          return;
        }
        // Read before the DELETE, which takes the plants with it: an undo
        // needs them, and the planner layout, to put the garden back whole.
        const plants = cache.read<readonly Plant[]>(cacheKeys.plantsOfGarden(garden.gardenId));
        const layoutBefore = layout.load(garden.gardenId);
        patchState(store, { pendingDeletes: [...store.pendingDeletes(), garden.gardenId] });

        try {
          await api.delete(garden.gardenId);
          patchState(store, {
            gardens: store.gardens().filter((g) => g.gardenId !== garden.gardenId),
          });
          cache.set(cacheKeys.gardens, store.gardens());
          cache.invalidate(cacheKeys.garden(garden.gardenId));
          cache.invalidate(cacheKeys.plantsOfGarden(garden.gardenId));
          layout.reset(garden.gardenId);
          toasts.success(
            $localize`Garden “${garden.gardenName}:name:” deleted.`,
            // Without its plants an undo would quietly bring back less than was deleted.
            plants
              ? {
                  label: $localize`Undo`,
                  run: () => void restoreGarden(garden, plants, layoutBefore),
                }
              : undefined,
          );
        } catch (err) {
          // The ghost resolves back into the real card — nothing was removed yet.
          const retry = (): void => void this.remove(garden);
          toasts.error($localize`Couldn't delete “${garden.gardenName}:name:”.`, {
            label: $localize`Try again`,
            run: retry,
          });
          logger.warn('gardens:delete', toApiError(err).message);
        } finally {
          patchState(store, {
            pendingDeletes: store.pendingDeletes().filter((id) => id !== garden.gardenId),
          });
        }
      },
    };
  }),
);

function failMutation(err: unknown, toasts: ToastStore): MutationResult {
  const error = toApiError(err);
  if (error.kind === 'technical') {
    toasts.error(error.message);
  }
  // Functional verdicts go back to the form — rendered inline, never toasted.
  return { ok: false, error };
}
