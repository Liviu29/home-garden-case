import { Injectable, inject } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';

interface CacheEntry {
  value: unknown;
  storedAt: number;
}

interface SwrResult<T> {
  /** Last known value (fresh or stale) — render it immediately when present. */
  readonly cached: T | undefined;
  /**
   * Resolves with up-to-date data. `null` when the cache was fresh — nothing
   * to await, no request was made.
   */
  readonly revalidate: Promise<T> | null;
}

/**
 * Stale-while-revalidate query cache (ADR-004) — the client-side answer to a
 * backend that adds 200–2000 ms to every response.
 *
 * - fresh hit  → cached value, NO network
 * - stale hit  → cached value instantly + background revalidation
 * - miss       → fetch (caller renders skeletons meanwhile)
 * - identical concurrent fetches are de-duplicated into one in-flight promise
 * - mutations invalidate one key, or write the fresh value through
 */
@Injectable({ providedIn: 'root' })
export class QueryCache {
  private readonly config = inject(APP_CONFIG);
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  /**
   * Bumped by every write-through `set()` and every `invalidate()`. An
   * in-flight fetch that started before either resolves to what the cache
   * holds now (or its own value, when nothing is held) instead of storing
   * its response — otherwise creating a garden while the list revalidates
   * would make the new card vanish, and a profile switch would file the
   * previous profile's list under the new one (specs: 'a write-through
   * during an in-flight fetch wins', 'an invalidated fetch is not stored').
   */
  private readonly writeVersions = new Map<string, number>();
  /** Bumped by `clear()`: every fetch that was in flight is then a stranger. */
  private generation = 0;

  read<T>(key: string): T | undefined {
    return this.entries.get(key)?.value as T | undefined;
  }

  isFresh(key: string): boolean {
    const entry = this.entries.get(key);
    return !!entry && Date.now() - entry.storedAt < this.config.cache.freshTtlMs;
  }

  swr<T>(key: string, fetcher: () => Promise<T>): SwrResult<T> {
    const cached = this.read<T>(key);

    if (cached !== undefined && this.isFresh(key)) {
      return { cached, revalidate: null };
    }
    return { cached, revalidate: this.dedupedFetch(key, fetcher) };
  }

  /** Force-fetch (used by explicit refresh actions); still de-duplicates. */
  refresh<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    return this.dedupedFetch(key, fetcher);
  }

  /** Write-through: mutations that already know the fresh value store it directly. */
  set<T>(key: string, value: T): void {
    this.bump(key);
    this.entries.set(key, { value, storedAt: Date.now() });
  }

  /**
   * Forget one key — exactly that key: `gardens:3` leaves `gardens:30` alone.
   * A fetch in flight for it is forgotten too, so the next `swr` starts a
   * request of its own instead of joining one that answers an old question,
   * and the late answer is not stored.
   */
  invalidate(key: string): void {
    this.bump(key);
    this.entries.delete(key);
    this.inflight.delete(key);
  }

  /** Forget everything, in-flight fetches included — a session change. */
  clear(): void {
    this.generation++;
    this.entries.clear();
    this.inflight.clear();
    this.writeVersions.clear();
  }

  private bump(key: string): void {
    this.writeVersions.set(key, (this.writeVersions.get(key) ?? 0) + 1);
  }

  private dedupedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const versionAtStart = this.writeVersions.get(key) ?? 0;
    const generationAtStart = this.generation;
    const request = fetcher()
      .then((value) => {
        const superseded =
          this.generation !== generationAtStart ||
          (this.writeVersions.get(key) ?? 0) !== versionAtStart;
        if (superseded) {
          // A mutation wrote through, or the key was invalidated, while this
          // response was in flight: it answers an older question. Prefer what
          // the cache holds now; hand back the response only as a value, never
          // as the cache's.
          const current = this.read<T>(key);
          return current ?? value;
        }
        this.entries.set(key, { value, storedAt: Date.now() });
        return value;
      })
      .finally(() => {
        if (this.inflight.get(key) === request) {
          this.inflight.delete(key);
        }
      });

    this.inflight.set(key, request);
    return request;
  }
}

/** Central cache-key registry so invalidation never relies on ad-hoc strings. */
export const cacheKeys = {
  /** A profile's list (its own gardens and the shared ones, ADR-009); `null` before any profile. */
  gardens: (owner: number | null): string =>
    owner === null ? 'gardens' : `gardens:owner:${owner}`,
  garden: (gardenId: number) => `gardens:${gardenId}`,
  plantsOfGarden: (gardenId: number) => `plants:garden:${gardenId}`,
  /** The one-request `GET /plants`; only de-duplicates, its result is filed per garden. */
  allPlants: 'plants:all',
  users: 'users',
} as const;
