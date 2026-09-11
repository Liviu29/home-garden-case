import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { GardensApi } from '../../core/api/gardens-api';
import { Garden, GardenInput } from '../../core/api/models';
import { ApiError, toApiError } from '../../core/errors/api-error';
import { ToastStore } from '../../core/errors/toast-store';
import { Logger } from '../../core/logging/logger';
import { QueryCache, cacheKeys } from '../../core/resilience/query-cache';
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
 * ghost-confirmed deletes (ASYNC-UX.md), pessimistic create/update (the
 * server owns validation verdicts the form must render).
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
    const cache = inject(QueryCache);
    const toasts = inject(ToastStore);
    const logger = inject(Logger);

    const applyList = (gardens: readonly Garden[]) =>
      patchState(store, { gardens, status: 'ready' });

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
        const { cached, revalidate } = cache.swr(cacheKeys.gardens, () => api.getAll());

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
            toasts.info('Showing cached gardens — refresh failed.');
          } else {
            patchState(store, { status: 'error' });
          }
          logger.warn('gardens:load', toApiError(err).message);
        }
      },

      async create(input: GardenInput): Promise<MutationResult> {
        patchState(store, { saving: true, creating: true });
        try {
          const created = await api.create(input);
          // A garden that was just created has no plants — that is known, not
          // loading. Seeding its (fresh) plants entry lets the card, the
          // dashboard and the detail page say "0 plants" at once, instead of
          // a ghost that waits on a pointless GET.
          cache.set(cacheKeys.plantsOfGarden(created.gardenId), []);
          // Idempotent append: a background list revalidation that hit the
          // server AFTER the insert may already have delivered this garden
          // (a slow-API race) — a blind append would render
          // the card twice.
          patchState(store, {
            gardens: [...store.gardens().filter((g) => g.gardenId !== created.gardenId), created],
            status: 'ready',
            lastCreatedId: created.gardenId,
          });
          cache.set(cacheKeys.gardens, store.gardens());
          toasts.success(`Garden “${created.gardenName}” created.`);
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
          toasts.success(`Garden “${updated.gardenName}” updated.`);
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
       * only on server confirmation. Re-entrant calls are ignored.
       */
      async remove(garden: Garden): Promise<void> {
        if (store.pendingDeletes().includes(garden.gardenId)) {
          return;
        }
        patchState(store, { pendingDeletes: [...store.pendingDeletes(), garden.gardenId] });

        try {
          await api.delete(garden.gardenId);
          patchState(store, {
            gardens: store.gardens().filter((g) => g.gardenId !== garden.gardenId),
          });
          cache.set(cacheKeys.gardens, store.gardens());
          cache.invalidate(cacheKeys.garden(garden.gardenId));
          cache.invalidate(cacheKeys.plantsOfGarden(garden.gardenId));
          toasts.success(`Garden “${garden.gardenName}” deleted.`);
        } catch (err) {
          // The ghost resolves back into the real card — nothing was removed yet.
          const retry = (): void => void this.remove(garden);
          toasts.error(`Couldn't delete “${garden.gardenName}”.`, {
            label: 'Try again',
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
