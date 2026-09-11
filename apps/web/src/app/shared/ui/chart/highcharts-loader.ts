import { Injectable, InjectionToken, inject } from '@angular/core';

/** The Highcharts namespace, with the modules below registered on it. */
export type HighchartsLib = typeof import('highcharts');

/**
 * Highcharts core plus the three modules the app uses, as ES modules. Each
 * module imports and extends the same core file, so core comes first. The
 * dynamic imports keep all of it out of the route chunks: the library is
 * fetched the first time a chart is about to render (ADR-008).
 */
export async function importHighcharts(): Promise<HighchartsLib> {
  const { default: Highcharts } = await import('highcharts/esm/highcharts.js');
  await import('highcharts/esm/highcharts-more.js'); // bubble series
  await import('highcharts/esm/modules/variwide.js'); // variwide series
  await import('highcharts/esm/modules/accessibility.js'); // keyboard + screen readers
  return Highcharts;
}

/** Swappable in tests, where a fake library stands in for the real one. */
export const HIGHCHARTS_IMPORT = new InjectionToken<() => Promise<HighchartsLib>>(
  'HIGHCHARTS_IMPORT',
  { factory: () => importHighcharts },
);

/** Loads Highcharts once per app; a failed load is retried on the next request. */
@Injectable({ providedIn: 'root' })
export class HighchartsLoader {
  private readonly importLibrary = inject(HIGHCHARTS_IMPORT);
  private pending: Promise<HighchartsLib> | null = null;

  load(): Promise<HighchartsLib> {
    this.pending ??= this.importLibrary().catch((err: unknown) => {
      this.pending = null;
      throw err;
    });
    return this.pending;
  }
}
