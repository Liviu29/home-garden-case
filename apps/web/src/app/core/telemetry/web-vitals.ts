import { DOCUMENT, Injectable, InjectionToken, inject } from '@angular/core';
import { Logger } from '../logging/logger';

export type VitalName = 'LCP' | 'FCP' | 'CLS' | 'INP' | 'TTFB';
export type VitalRating = 'good' | 'needs-improvement' | 'poor';

/** web.dev thresholds: good up to the first value, poor above the second. */
export const VITAL_THRESHOLDS: Readonly<Record<VitalName, readonly [number, number]>> = {
  LCP: [2500, 4000],
  FCP: [1800, 3000],
  CLS: [0.1, 0.25],
  INP: [200, 500],
  TTFB: [800, 1800],
};

export function rateVital(name: VitalName, value: number): VitalRating {
  const [good, poor] = VITAL_THRESHOLDS[name];
  return value <= good ? 'good' : value <= poor ? 'needs-improvement' : 'poor';
}

interface LayoutShift {
  readonly value: number;
  readonly startTime: number;
  readonly hadRecentInput: boolean;
}

/**
 * CLS: the largest "session window" of layout shifts — shifts less than a
 * second apart, within five seconds in all — leaving out the shifts a user's
 * own input caused.
 */
export function cumulativeLayoutShift(shifts: readonly LayoutShift[]): number {
  let largest = 0;
  let windowValue = 0;
  let windowStart = 0;
  let previous = 0;
  for (const shift of shifts) {
    if (shift.hadRecentInput) {
      continue;
    }
    const continues =
      windowValue > 0 && shift.startTime - previous < 1000 && shift.startTime - windowStart < 5000;
    if (continues) {
      windowValue += shift.value;
    } else {
      windowValue = shift.value;
      windowStart = shift.startTime;
    }
    previous = shift.startTime;
    largest = Math.max(largest, windowValue);
  }
  return largest;
}

/**
 * INP: the slowest interaction, forgiving one outlier per 50 interactions.
 * Null until the user has interacted at all.
 */
export function interactionToNextPaint(durations: readonly number[]): number | null {
  if (durations.length === 0) {
    return null;
  }
  const slowestFirst = [...durations].sort((a, b) => b - a);
  return slowestFirst[Math.min(slowestFirst.length - 1, Math.floor(durations.length / 50))];
}

/** The browser APIs the collector reads — a seam, so tests can drive it. */
export interface VitalsBrowser {
  readonly Observer: typeof PerformanceObserver | null;
  navigation(): { readonly responseStart: number } | undefined;
}

export const VITALS_BROWSER = new InjectionToken<VitalsBrowser>('VITALS_BROWSER', {
  providedIn: 'root',
  factory: () => ({
    Observer: typeof PerformanceObserver === 'undefined' ? null : PerformanceObserver,
    navigation: () =>
      performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined,
  }),
});

/** CLS is unitless (three decimals); the others are milliseconds (whole). */
function rounded(name: VitalName, value: number): number {
  return name === 'CLS' ? Math.round(value * 1000) / 1000 : Math.round(value);
}

/**
 * The Core Web Vitals, plus FCP and TTFB, measured with the browser's own
 * PerformanceObserver — no library — and reported once through the Logger
 * seam when the page is first hidden, which is when their values are final.
 * Browsers that do not support an entry type simply leave that vital out.
 */
@Injectable({ providedIn: 'root' })
export class WebVitals {
  private readonly browser = inject(VITALS_BROWSER);
  private readonly doc = inject(DOCUMENT);
  private readonly logger = inject(Logger);
  private readonly values = new Map<VitalName, number>();
  private started = false;

  start(): void {
    const Observer = this.browser.Observer;
    if (this.started || !Observer) {
      return;
    }
    this.started = true;
    const supported = Observer.supportedEntryTypes ?? [];
    const observe = (
      type: string,
      onEntries: (entries: PerformanceEntryList) => void,
      options: object = {},
    ): void => {
      if (supported.includes(type)) {
        new Observer((list) => onEntries(list.getEntries())).observe({
          type,
          buffered: true,
          ...options,
        });
      }
    };

    observe('largest-contentful-paint', (entries) =>
      this.values.set('LCP', entries[entries.length - 1].startTime),
    );
    observe('paint', (entries) => {
      const fcp = entries.find((e) => e.name === 'first-contentful-paint');
      if (fcp) {
        this.values.set('FCP', fcp.startTime);
      }
    });
    const shifts: LayoutShift[] = [];
    observe('layout-shift', (entries) => {
      shifts.push(...(entries as unknown as LayoutShift[]));
      this.values.set('CLS', cumulativeLayoutShift(shifts));
    });
    const interactions = new Map<number, number>();
    observe(
      'event',
      (entries) => {
        for (const e of entries as unknown as { interactionId?: number; duration: number }[]) {
          if (e.interactionId) {
            const slowest = Math.max(interactions.get(e.interactionId) ?? 0, e.duration);
            interactions.set(e.interactionId, slowest);
          }
        }
        const inp = interactionToNextPaint([...interactions.values()]);
        if (inp !== null) {
          this.values.set('INP', inp);
        }
      },
      { durationThreshold: 40 },
    );
    const navigation = this.browser.navigation();
    if (navigation) {
      this.values.set('TTFB', navigation.responseStart);
    }

    const report = (): void => {
      if (this.doc.visibilityState !== 'hidden') {
        return;
      }
      this.doc.removeEventListener('visibilitychange', report);
      for (const [name, value] of this.values) {
        this.logger.metric(name, rounded(name, value), rateVital(name, value));
      }
    };
    this.doc.addEventListener('visibilitychange', report);
  }
}
