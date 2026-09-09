import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { GardensApi } from '../../core/api/gardens-api';
import { Garden, GardenInput } from '../../core/api/models';
import { ApiError, toApiError } from '../../core/errors/api-error';
import { ToastStore } from '../../core/errors/toast-store';
import { QueryCache, cacheKeys } from '../../core/resilience/query-cache';

export type RequestStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Mutations resolve to a typed verdict so forms can render functional errors inline. */
export type MutationResult = { ok: true } | { ok: false; error: ApiError };

interface GardensState {
  gardens: readonly Garden[];
  status: RequestStatus;
  /** Set while a create/update runs (submit buttons show inline progress). */
  saving: boolean;
}

/**
 * Root-scoped garden state (ARCHITECTURE §5): SWR-backed reads, optimistic
 * delete with rollback, pessimistic create/update (the server owns validation
 * verdicts the form must render).
 */
export const GardensStore = signalStore(
  { providedIn: 'root' },
  withState<GardensState>({
    gardens: [],
    status: 'idle',
    saving: false,
  }),
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

    const applyList = (gardens: readonly Garden[]) =>
      patchState(store, { gardens, status: 'ready' });

    return {
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
          logTechnical('gardens:load', err);
        }
      },

      async create(input: GardenInput): Promise<MutationResult> {
        patchState(store, { saving: true });
        try {
          const created = await api.create(input);
          patchState(store, { gardens: [...store.gardens(), created], status: 'ready' });
          cache.set(cacheKeys.gardens, store.gardens());
          toasts.success(`Garden “${created.gardenName}” created.`);
          return { ok: true };
        } catch (err) {
          return failMutation(err, toasts);
        } finally {
          patchState(store, { saving: false });
        }
      },

      async update(gardenId: number, input: GardenInput): Promise<MutationResult> {
        patchState(store, { saving: true });
        try {
          const updated = await api.update(gardenId, input);
          patchState(store, {
            gardens: store.gardens().map((g) => (g.gardenId === gardenId ? updated : g)),
          });
          cache.set(cacheKeys.gardens, store.gardens());
          cache.invalidate(cacheKeys.garden(gardenId));
          toasts.success(`Garden “${updated.gardenName}” updated.`);
          return { ok: true };
        } catch (err) {
          return failMutation(err, toasts);
        } finally {
          patchState(store, { saving: false });
        }
      },

      /** Optimistic: the card disappears instantly; rollback + retry toast on failure. */
      async remove(garden: Garden): Promise<void> {
        const snapshot = store.gardens();
        patchState(store, {
          gardens: snapshot.filter((g) => g.gardenId !== garden.gardenId),
        });

        try {
          await api.delete(garden.gardenId);
          cache.set(cacheKeys.gardens, store.gardens());
          cache.invalidate(cacheKeys.garden(garden.gardenId));
          cache.invalidate(cacheKeys.plantsOfGarden(garden.gardenId));
          toasts.success(`Garden “${garden.gardenName}” deleted.`);
        } catch (err) {
          patchState(store, { gardens: snapshot });
          const retry = (): void => void this.remove(garden);
          toasts.error(`Couldn't delete “${garden.gardenName}”.`, {
            label: 'Try again',
            run: retry,
          });
          logTechnical('gardens:delete', err);
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

function logTechnical(operation: string, err: unknown): void {
  console.warn(`[${operation}] failed`, toApiError(err).message);
}
