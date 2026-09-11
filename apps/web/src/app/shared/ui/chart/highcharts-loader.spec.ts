import { TestBed } from '@angular/core/testing';
import {
  HIGHCHARTS_IMPORT,
  HighchartsLib,
  HighchartsLoader,
  importHighcharts,
} from './highcharts-loader';

describe('HighchartsLoader', () => {
  const loaderWith = (importLibrary: () => Promise<HighchartsLib>) => {
    TestBed.configureTestingModule({
      providers: [{ provide: HIGHCHARTS_IMPORT, useValue: importLibrary }],
    });
    return TestBed.inject(HighchartsLoader);
  };

  afterEach(() => {
    // Tear the app down while the stubbed idle APIs still exist: the loader
    // cancels its pending prefetch on destroy.
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('imports the library once, however many charts ask for it', async () => {
    const library = {} as HighchartsLib;
    const importLibrary = vi.fn().mockResolvedValue(library);
    const loader = loaderWith(importLibrary);

    const [first, second] = await Promise.all([loader.load(), loader.load()]);

    expect(first).toBe(library);
    expect(second).toBe(library);
    expect(importLibrary).toHaveBeenCalledTimes(1);
  });

  it('retries after a failed load instead of remembering the failure', async () => {
    const library = {} as HighchartsLib;
    const importLibrary = vi
      .fn()
      .mockRejectedValueOnce(new Error('chunk failed to load'))
      .mockResolvedValueOnce(library);
    const loader = loaderWith(importLibrary);

    await expect(loader.load()).rejects.toThrow('chunk failed to load');
    await expect(loader.load()).resolves.toBe(library);
    expect(importLibrary).toHaveBeenCalledTimes(2);
  });

  it('imports the real library unless a test swaps it', () => {
    expect(TestBed.inject(HIGHCHARTS_IMPORT)).toBe(importHighcharts);
  });

  it('registers the series types and the accessibility support the charts rely on', async () => {
    const Highcharts = await importHighcharts();
    const seriesTypes = (Highcharts as unknown as { seriesTypes: Record<string, unknown> })
      .seriesTypes;

    expect(typeof Highcharts.chart).toBe('function');
    expect(seriesTypes['scatter']).toBeDefined();
    expect(seriesTypes['variwide']).toBeDefined();
    // The portfolio bubbles are sized scatter markers: highcharts-more stays out.
    expect(seriesTypes['bubble']).toBeUndefined();
    expect(Highcharts.defaultOptions.accessibility?.keyboardNavigation).toBeDefined();
  });

  describe('prefetch on idle', () => {
    it('fetches the library when the browser is idle, once', () => {
      const idle = vi.fn<(cb: () => void, opts?: IdleRequestOptions) => number>(() => 7);
      vi.stubGlobal('requestIdleCallback', idle);
      vi.stubGlobal('cancelIdleCallback', vi.fn());
      const importLibrary = vi.fn().mockResolvedValue({} as HighchartsLib);
      const loader = loaderWith(importLibrary);

      loader.prefetchWhenIdle();
      loader.prefetchWhenIdle();
      expect(idle).toHaveBeenCalledTimes(1);
      expect(importLibrary).not.toHaveBeenCalled(); // not before the browser is idle

      idle.mock.calls[0][0]();
      expect(importLibrary).toHaveBeenCalledTimes(1);
    });

    it('falls back to a short timer where requestIdleCallback is missing', () => {
      vi.useFakeTimers();
      vi.stubGlobal('requestIdleCallback', undefined);
      const importLibrary = vi.fn().mockResolvedValue({} as HighchartsLib);
      const loader = loaderWith(importLibrary);

      loader.prefetchWhenIdle();
      vi.advanceTimersByTime(1500);

      expect(importLibrary).toHaveBeenCalledTimes(1);
    });

    it('does nothing when a chart already started the load', async () => {
      const idle = vi.fn(() => 1);
      vi.stubGlobal('requestIdleCallback', idle);
      const loader = loaderWith(vi.fn().mockResolvedValue({} as HighchartsLib));

      await loader.load();
      loader.prefetchWhenIdle();

      expect(idle).not.toHaveBeenCalled();
    });

    it('swallows a failed prefetch, leaving the retry to the chart', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('requestIdleCallback', undefined);
      const library = {} as HighchartsLib;
      const importLibrary = vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(library);
      const loader = loaderWith(importLibrary);

      loader.prefetchWhenIdle();
      await vi.advanceTimersByTimeAsync(1500);

      await expect(loader.load()).resolves.toBe(library);
    });

    it('cancels a pending prefetch when the app is torn down', () => {
      vi.useFakeTimers();
      vi.stubGlobal('requestIdleCallback', undefined);
      const importLibrary = vi.fn().mockResolvedValue({} as HighchartsLib);
      loaderWith(importLibrary).prefetchWhenIdle();

      TestBed.resetTestingModule();
      vi.advanceTimersByTime(1500);

      expect(importLibrary).not.toHaveBeenCalled();
    });

    it('cancels a pending idle callback when the app is torn down', () => {
      const cancel = vi.fn();
      vi.stubGlobal(
        'requestIdleCallback',
        vi.fn(() => 42),
      );
      vi.stubGlobal('cancelIdleCallback', cancel);
      loaderWith(vi.fn()).prefetchWhenIdle();

      TestBed.resetTestingModule();

      expect(cancel).toHaveBeenCalledWith(42);
    });
  });
});
