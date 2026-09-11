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

  it('registers the series types and the accessibility support the charts rely on', async () => {
    const Highcharts = await importHighcharts();

    expect(typeof Highcharts.chart).toBe('function');
    expect(
      (Highcharts as unknown as { seriesTypes: Record<string, unknown> }).seriesTypes['bubble'],
    ).toBeDefined();
    expect(
      (Highcharts as unknown as { seriesTypes: Record<string, unknown> }).seriesTypes['variwide'],
    ).toBeDefined();
    expect(Highcharts.defaultOptions.accessibility?.keyboardNavigation).toBeDefined();
  });
});
