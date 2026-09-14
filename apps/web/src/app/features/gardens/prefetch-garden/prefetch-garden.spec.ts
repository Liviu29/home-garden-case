import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GardensApi } from '../../../core/api/gardens-api';
import { PlantsApi } from '../../../core/api/plants-api';
import { APP_CONFIG, type AppConfig } from '../../../core/config/app-config';
import { QueryCache, cacheKeys } from '../../../core/resilience/query-cache';
import { PrefetchGarden } from './prefetch-garden';

const CONFIG = {
  apiBaseUrl: '/api',
  retry: { maxAttempts: 1, baseDelayMs: 1, backoffFactor: 1, maxDelayMs: 1 },
  cache: { freshTtlMs: 30_000 },
  toastDurationMs: 5000,
} as AppConfig;

@Component({
  imports: [PrefetchGarden],
  template: `<button type="button" [appPrefetchGarden]="gardenId()">card</button>`,
})
class Host {
  readonly gardenId = signal(7);
}

/**
 * Pointer-intent prefetch. It is progressive enhancement, so the two
 * properties worth pinning are: it warms BOTH cache keys the detail route
 * needs, and a failure is swallowed — a rejected prefetch must never surface
 * as an unhandled rejection or a toast for something the user never asked for.
 */
describe('PrefetchGarden directive', () => {
  let gardensApi: { getById: ReturnType<typeof vi.fn> };
  let plantsApi: { getByGarden: ReturnType<typeof vi.fn> };
  let cache: QueryCache;

  const render = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_CONFIG, useValue: CONFIG },
        { provide: GardensApi, useValue: gardensApi },
        { provide: PlantsApi, useValue: plantsApi },
      ],
    });
    cache = TestBed.inject(QueryCache);
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    gardensApi = { getById: vi.fn().mockResolvedValue({ gardenId: 7 }) };
    plantsApi = { getByGarden: vi.fn().mockResolvedValue([]) };
  });

  it('warms both the garden and its plants on mouseenter', async () => {
    const fixture = render();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;

    button.dispatchEvent(new MouseEvent('mouseenter'));
    await vi.waitFor(() => {
      expect(gardensApi.getById).toHaveBeenCalledWith(7);
      expect(plantsApi.getByGarden).toHaveBeenCalledWith(7);
    });
  });

  it('warms on keyboard focus too, so the pattern is not mouse-only', async () => {
    const fixture = render();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;

    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await vi.waitFor(() => expect(gardensApi.getById).toHaveBeenCalledWith(7));
  });

  it('leaves the results in the cache under the keys the detail route reads', async () => {
    const fixture = render();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;

    button.dispatchEvent(new MouseEvent('mouseenter'));
    await vi.waitFor(() => expect(plantsApi.getByGarden).toHaveBeenCalled());
    await Promise.resolve();

    expect(cache.swr(cacheKeys.garden(7), () => Promise.resolve({})).cached).toBeDefined();
    expect(cache.swr(cacheKeys.plantsOfGarden(7), () => Promise.resolve([])).cached).toBeDefined();
  });

  it('de-duplicates repeated hovers — a second hover costs no second request', async () => {
    const fixture = render();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;

    button.dispatchEvent(new MouseEvent('mouseenter'));
    button.dispatchEvent(new MouseEvent('mouseenter'));
    button.dispatchEvent(new MouseEvent('mouseenter'));
    await vi.waitFor(() => expect(gardensApi.getById).toHaveBeenCalled());

    expect(gardensApi.getById).toHaveBeenCalledTimes(1);
    expect(plantsApi.getByGarden).toHaveBeenCalledTimes(1);
  });

  it('swallows a failed prefetch — the user never asked for it', async () => {
    gardensApi.getById.mockRejectedValue(new Error('500'));
    plantsApi.getByGarden.mockRejectedValue(new Error('500'));
    const unhandled = vi.fn();
    globalThis.addEventListener('unhandledrejection', unhandled);

    const fixture = render();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    button.dispatchEvent(new MouseEvent('mouseenter'));

    await vi.waitFor(() => expect(gardensApi.getById).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(unhandled).not.toHaveBeenCalled();
    globalThis.removeEventListener('unhandledrejection', unhandled);
  });

  it('prefetches the id currently bound, following the input', async () => {
    const fixture = render();
    fixture.componentInstance.gardenId.set(42);
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    button.dispatchEvent(new MouseEvent('mouseenter'));

    await vi.waitFor(() => expect(gardensApi.getById).toHaveBeenCalledWith(42));
  });
});
