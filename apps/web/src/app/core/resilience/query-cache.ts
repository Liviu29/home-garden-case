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
 * - mutations invalidate by key prefix
 */
@Injectable({ providedIn: 'root' })
export class QueryCache {
  private readonly config = inject(APP_CONFIG);
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  /**
   * Bumped by every write-through `set()`. An in-flight fetch that started
   * before a local mutation wrote through resolves to the mutation's (newer)
   * view instead of its own stale response — otherwise creating a garden
   * while the list revalidates would make the new card vanish (race fixed
   * by spec: 'a write-through during an in-flight fetch wins').
   */
  private readonly writeVersions = new Map<string, number>();

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
    this.writeVersions.set(key, (this.writeVersions.get(key) ?? 0) + 1);
    this.entries.set(key, { value, storedAt: Date.now() });
  }

  /** Drop every key starting with the prefix (e.g. `plants:garden:3`, or all `gardens`). */
  invalidate(prefix: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }
  }

  clear(): void {
    this.entries.clear();
  }

  private dedupedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const versionAtStart = this.writeVersions.get(key) ?? 0;
    const request = fetcher()
      .then((value) => {
        if ((this.writeVersions.get(key) ?? 0) !== versionAtStart) {
          // A mutation wrote through while this response was in flight — the
          // response is older than what the user already sees. Prefer the
          // mutated view; fall back to the response only if it was invalidated.
          const current = this.read<T>(key);
          return current ?? value;
        }
        this.entries.set(key, { value, storedAt: Date.now() });
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, request);
    return request;
  }
}

/** Central cache-key registry so invalidation never relies on ad-hoc strings. */
export const cacheKeys = {
  gardens: 'gardens',
  garden: (gardenId: number) => `gardens:${gardenId}`,
  plantsOfGarden: (gardenId: number) => `plants:garden:${gardenId}`,
  plants: 'plants',
  users: 'users',
} as const;
