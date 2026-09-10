import { TestBed } from '@angular/core/testing';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { QueryCache, cacheKeys } from './query-cache';

const FRESH_TTL = 30_000;

describe('QueryCache (stale-while-revalidate, ADR-004)', () => {
  let cache: QueryCache;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: APP_CONFIG,
          useValue: {
            apiBaseUrl: '/api',
            retry: { maxAttempts: 3, baseDelayMs: 250, backoffFactor: 3, maxDelayMs: 3000 },
            cache: { freshTtlMs: FRESH_TTL },
            skeleton: { appearDelayMs: 150, minDisplayMs: 300 },
            toastDurationMs: 5000,
          } satisfies AppConfig,
        },
      ],
    });
    cache = TestBed.inject(QueryCache);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('a cache miss fetches and stores the value', async () => {
    const fetcher = vi.fn().mockResolvedValue(['garden']);

    const { cached, revalidate } = cache.swr('gardens', fetcher);

    expect(cached).toBeUndefined();
    await expect(revalidate).resolves.toEqual(['garden']);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.read('gardens')).toEqual(['garden']);
  });

  it('a fresh hit returns the cached value and makes NO request', async () => {
    const fetcher = vi.fn().mockResolvedValue(['fresh']);
    await cache.swr('gardens', fetcher).revalidate;

    vi.advanceTimersByTime(FRESH_TTL - 1);
    const second = cache.swr('gardens', fetcher);

    expect(second.cached).toEqual(['fresh']);
    expect(second.revalidate).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('a stale hit returns the cached value instantly AND revalidates', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(['old']).mockResolvedValueOnce(['new']);
    await cache.swr('gardens', fetcher).revalidate;

    vi.advanceTimersByTime(FRESH_TTL + 1);
    const second = cache.swr('gardens', fetcher);

    expect(second.cached).toEqual(['old']); // instant render, no waiting
    await expect(second.revalidate).resolves.toEqual(['new']);
    expect(cache.read('gardens')).toEqual(['new']);
  });

  it('concurrent identical fetches are de-duplicated into one request', async () => {
    let resolve!: (value: string[]) => void;
    const fetcher = vi.fn().mockImplementation(() => new Promise<string[]>((r) => (resolve = r)));

    const first = cache.swr('gardens', fetcher);
    const second = cache.swr('gardens', fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve(['once']);
    await expect(first.revalidate).resolves.toEqual(['once']);
    await expect(second.revalidate).resolves.toEqual(['once']);
  });

  it('a failed fetch does not poison the cache and can be retried', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(['recovered']);

    await expect(cache.swr('gardens', fetcher).revalidate).rejects.toThrow('boom');
    expect(cache.read('gardens')).toBeUndefined();

    await expect(cache.swr('gardens', fetcher).revalidate).resolves.toEqual(['recovered']);
  });

  it('invalidate drops keys by prefix', async () => {
    cache.set(cacheKeys.plantsOfGarden(1), ['a']);
    cache.set(cacheKeys.plantsOfGarden(2), ['b']);
    cache.set(cacheKeys.gardens, ['g']);

    cache.invalidate('plants:');

    expect(cache.read(cacheKeys.plantsOfGarden(1))).toBeUndefined();
    expect(cache.read(cacheKeys.plantsOfGarden(2))).toBeUndefined();
    expect(cache.read(cacheKeys.gardens)).toEqual(['g']);
  });

  it('a write-through during an in-flight fetch wins over the stale response', async () => {
    // The race: list revalidation is in flight; the user creates a garden;
    // the fetch (started before the create) resolves with a list that lacks it.
    let resolveFetch!: (value: string[]) => void;
    const fetcher = vi
      .fn()
      .mockImplementation(() => new Promise<string[]>((r) => (resolveFetch = r)));

    const { revalidate } = cache.swr('gardens', fetcher);
    cache.set('gardens', ['old-garden', 'NEW-garden']); // mutation writes through
    resolveFetch(['old-garden']); // stale response arrives last

    await expect(revalidate).resolves.toEqual(['old-garden', 'NEW-garden']);
    expect(cache.read('gardens')).toEqual(['old-garden', 'NEW-garden']); // not clobbered
  });

  it('write-through set makes a value fresh (mutations skip refetching)', async () => {
    const fetcher = vi.fn();
    cache.set(cacheKeys.gardens, ['written']);

    const result = cache.swr(cacheKeys.gardens, fetcher);

    expect(result.cached).toEqual(['written']);
    expect(result.revalidate).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
