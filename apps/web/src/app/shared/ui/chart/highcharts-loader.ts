import { DestroyRef, Injectable, InjectionToken, inject } from '@angular/core';
import type * as Highcharts from 'highcharts';

/** The Highcharts namespace, with the modules below registered on it. */
export type HighchartsLib = typeof Highcharts;

/**
 * Highcharts core plus the two modules the app uses, as ES modules. Each
 * module imports and extends the same core file, so core comes first. The
 * dynamic imports keep all of it out of the route chunks: the library is
 * fetched the first time a chart is about to render, or earlier when a screen
 * with a chart goes idle (ADR-008). The portfolio map's bubbles are sized
 * scatter markers, so `highcharts-more` is not needed.
 */
export async function importHighcharts(): Promise<HighchartsLib> {
  const { default: Highcharts } = await import('highcharts/esm/highcharts.js');
  await import('highcharts/esm/modules/variwide.js'); // variwide series
  await import('highcharts/esm/modules/accessibility.js'); // keyboard + screen readers
  return Highcharts;
}

/** Swappable in tests, where a fake library stands in for the real one. */
export const HIGHCHARTS_IMPORT = new InjectionToken<() => Promise<HighchartsLib>>(
  'HIGHCHARTS_IMPORT',
  { factory: () => importHighcharts },
);

/** How long the browser may postpone the idle prefetch before running it anyway. */
const IDLE_TIMEOUT_MS = 4000;
/** Browsers without requestIdleCallback (Safari) prefetch after this delay instead. */
const FALLBACK_DELAY_MS = 1500;

/** Loads Highcharts once per app; a failed load is retried on the next request. */
@Injectable({ providedIn: 'root' })
export class HighchartsLoader {
  private readonly importLibrary = inject(HIGHCHARTS_IMPORT);
  private readonly destroyRef = inject(DestroyRef);
  private pending: Promise<HighchartsLib> | null = null;
  private prefetchScheduled = false;

  load(): Promise<HighchartsLib> {
    this.pending ??= this.importLibrary().catch((err: unknown) => {
      this.pending = null;
      throw err;
    });
    return this.pending;
  }

  /**
   * Fetch the library while the browser is idle, on screens that will show a
   * chart, so the first chart scrolled into view draws at once instead of
   * waiting for ~125 kB of downloads. Harmless when a chart asks first: the
   * load is shared. A failure here is left to the chart, which retries and
   * shows its fallback.
   */
  prefetchWhenIdle(): void {
    if (this.pending || this.prefetchScheduled) {
      return;
    }
    this.prefetchScheduled = true;
    const start = (): void => {
      this.load().catch(() => undefined);
    };
    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(start, { timeout: IDLE_TIMEOUT_MS });
      this.destroyRef.onDestroy(() => cancelIdleCallback(handle));
    } else {
      const handle = setTimeout(start, FALLBACK_DELAY_MS);
      this.destroyRef.onDestroy(() => clearTimeout(handle));
    }
  }
}
