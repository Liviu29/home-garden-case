import { TestBed } from '@angular/core/testing';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
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

  it('refresh force-fetches even while the entry is fresh, and still de-duplicates', async () => {
    const fetcher = vi.fn().mockResolvedValue(['v1']);
    await cache.swr('gardens', fetcher).revalidate;
    fetcher.mockResolvedValue(['v2']);

    const first = cache.refresh('gardens', fetcher);
    const second = cache.refresh('gardens', fetcher);

    await expect(first).resolves.toEqual(['v2']);
    await expect(second).resolves.toEqual(['v2']);
    expect(fetcher).toHaveBeenCalledTimes(2); // the initial load + ONE forced refresh
    expect(cache.read('gardens')).toEqual(['v2']);
  });

  it('clear drops every entry', () => {
    cache.set('gardens', ['a']);
    cache.set('gardens:1', { gardenId: 1 });

    cache.clear();

    expect(cache.read('gardens')).toBeUndefined();
    expect(cache.read('gardens:1')).toBeUndefined();
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

  it('invalidate drops exactly one key — garden 3 leaves garden 30 alone', () => {
    cache.set(cacheKeys.garden(3), { gardenId: 3 });
    cache.set(cacheKeys.garden(30), { gardenId: 30 });
    cache.set(cacheKeys.plantsOfGarden(3), ['a']);

    cache.invalidate(cacheKeys.garden(3));

    expect(cache.read(cacheKeys.garden(3))).toBeUndefined();
    expect(cache.read(cacheKeys.garden(30))).toEqual({ gardenId: 30 });
    expect(cache.read(cacheKeys.plantsOfGarden(3))).toEqual(['a']);
  });

  it('an invalidated fetch is not stored, and the next swr starts its own request', async () => {
    let answerOld = (value: string[]): void => void value;
    const oldFetcher = vi.fn(() => new Promise<string[]>((r) => (answerOld = r)));
    const newFetcher = vi.fn().mockResolvedValue(['new']);

    const stale = cache.swr('gardens', oldFetcher).revalidate;
    cache.invalidate('gardens');
    const fresh = cache.swr('gardens', newFetcher).revalidate;

    expect(fresh).not.toBe(stale); // not de-duplicated onto the old question
    expect(newFetcher).toHaveBeenCalledTimes(1);
    await fresh;
    answerOld(['old']);
    await stale;

    expect(cache.read('gardens')).toEqual(['new']);
  });

  it('clear forgets the in-flight fetches too', async () => {
    let answer = (value: string[]): void => void value;
    const fetcher = vi.fn(() => new Promise<string[]>((r) => (answer = r)));

    const pending = cache.swr('gardens', fetcher).revalidate;
    cache.clear();
    answer(['from before']);
    await pending;

    expect(cache.read('gardens')).toBeUndefined();
  });

  it('the gardens key is one per profile', () => {
    expect(cacheKeys.gardens(7)).not.toBe(cacheKeys.gardens(8));
    expect(cacheKeys.gardens(null)).not.toBe(cacheKeys.gardens(7));
    expect(cacheKeys.gardens(3)).not.toBe(cacheKeys.garden(3));
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
    cache.set(cacheKeys.gardens(null), ['written']);

    const result = cache.swr(cacheKeys.gardens(null), fetcher);

    expect(result.cached).toEqual(['written']);
    expect(result.revalidate).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
