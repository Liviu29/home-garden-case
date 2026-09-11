import { TestBed } from '@angular/core/testing';
import { Logger } from '../logging/logger';
import {
  VITALS_BROWSER,
  WebVitals,
  cumulativeLayoutShift,
  interactionToNextPaint,
  rateVital,
} from './web-vitals';

/** A PerformanceObserver the test feeds by hand. */
class FakeObserver {
  static supportedEntryTypes: string[] | undefined;
  static instances: FakeObserver[] = [];
  type = '';
  private readonly callback: (list: { getEntries(): unknown[] }) => void;

  constructor(callback: (list: { getEntries(): unknown[] }) => void) {
    this.callback = callback;
    FakeObserver.instances.push(this);
  }

  observe(options: { type: string }): void {
    this.type = options.type;
  }

  static emit(type: string, entries: unknown[]): void {
    FakeObserver.instances.find((o) => o.type === type)?.callback({ getEntries: () => entries });
  }
}

const setVisibility = (state: 'hidden' | 'visible') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('Web Vitals — the rules', () => {
  it('rates against the web.dev thresholds', () => {
    expect(rateVital('LCP', 2500)).toBe('good');
    expect(rateVital('LCP', 2501)).toBe('needs-improvement');
    expect(rateVital('LCP', 4001)).toBe('poor');
    expect(rateVital('CLS', 0.05)).toBe('good');
    expect(rateVital('INP', 600)).toBe('poor');
  });

  it('CLS is the largest session window, leaving out shifts caused by input', () => {
    expect(cumulativeLayoutShift([])).toBe(0);
    expect(
      cumulativeLayoutShift([
        { value: 0.05, startTime: 0, hadRecentInput: false },
        { value: 0.05, startTime: 500, hadRecentInput: false }, // same window
        { value: 0.5, startTime: 900, hadRecentInput: true }, // the user's own doing
        { value: 0.08, startTime: 3000, hadRecentInput: false }, // > 1 s later: a new window
      ]),
    ).toBeCloseTo(0.1);
  });

  it('a session window lasts at most five seconds', () => {
    const everyHalfSecond = Array.from({ length: 14 }, (_, i) => ({
      value: 0.01,
      startTime: i * 500,
      hadRecentInput: false,
    }));
    expect(cumulativeLayoutShift(everyHalfSecond)).toBeCloseTo(0.1); // 10 shifts, not 14
  });

  it('INP is the slowest interaction, forgiving one outlier per 50', () => {
    expect(interactionToNextPaint([])).toBeNull();
    expect(interactionToNextPaint([120, 80])).toBe(120);
    const sixty = [900, ...Array.from({ length: 59 }, (_, i) => 100 + i)];
    expect(interactionToNextPaint(sixty)).toBe(158); // the 900 ms outlier is forgiven
  });
});

describe('WebVitals — the collector', () => {
  let metric: ReturnType<typeof vi.fn>;

  const start = (navigation?: { responseStart: number }) => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Logger, useValue: { metric } },
        {
          provide: VITALS_BROWSER,
          useValue: {
            Observer: FakeObserver as unknown as typeof PerformanceObserver,
            navigation: () => navigation,
          },
        },
      ],
    });
    const vitals = TestBed.inject(WebVitals);
    vitals.start();
    return vitals;
  };

  beforeEach(() => {
    metric = vi.fn();
    FakeObserver.instances = [];
    FakeObserver.supportedEntryTypes = [
      'largest-contentful-paint',
      'paint',
      'layout-shift',
      'event',
    ];
  });

  afterEach(() => setVisibility('visible'));

  it('reports each vital once, rounded and rated, when the page is hidden', () => {
    start({ responseStart: 95.4 });
    FakeObserver.emit('largest-contentful-paint', [{ startTime: 1200 }, { startTime: 2600.4 }]);
    FakeObserver.emit('paint', [
      { name: 'first-paint', startTime: 300 },
      { name: 'first-contentful-paint', startTime: 812.6 },
    ]);
    FakeObserver.emit('layout-shift', [{ value: 0.0234, startTime: 100, hadRecentInput: false }]);
    FakeObserver.emit('event', [
      { interactionId: 1, duration: 120 },
      { interactionId: 1, duration: 180 }, // one interaction, several events: its slowest counts
      { duration: 50 }, // not an interaction
      { interactionId: 2, duration: 90 },
    ]);
    setVisibility('visible');
    expect(metric).not.toHaveBeenCalled(); // values are final only once the page is hidden

    setVisibility('hidden');

    expect(metric.mock.calls).toEqual(
      expect.arrayContaining([
        ['LCP', 2600, 'needs-improvement'],
        ['FCP', 813, 'good'],
        ['CLS', 0.023, 'good'],
        ['INP', 180, 'good'],
        ['TTFB', 95, 'good'],
      ]),
    );
    expect(metric).toHaveBeenCalledTimes(5);

    setVisibility('hidden');
    expect(metric).toHaveBeenCalledTimes(5); // once per page
  });

  it('starts once, however often it is asked', () => {
    start().start();
    expect(FakeObserver.instances).toHaveLength(4);
  });

  it('leaves out what the browser does not measure', () => {
    FakeObserver.supportedEntryTypes = undefined;
    start();
    FakeObserver.emit('paint', [{ name: 'first-paint', startTime: 300 }]);
    setVisibility('hidden');
    expect(FakeObserver.instances).toHaveLength(0);
    expect(metric).not.toHaveBeenCalled();
  });

  it('without paint timing for FCP or an interaction yet, reports neither', () => {
    start();
    FakeObserver.emit('paint', [{ name: 'first-paint', startTime: 300 }]);
    FakeObserver.emit('event', [{ duration: 50 }]);
    setVisibility('hidden');
    expect(metric).not.toHaveBeenCalled();
  });

  it('does nothing in a browser without PerformanceObserver', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Logger, useValue: { metric } },
        { provide: VITALS_BROWSER, useValue: { Observer: null, navigation: () => undefined } },
      ],
    });
    TestBed.inject(WebVitals).start();
    setVisibility('hidden');
    expect(metric).not.toHaveBeenCalled();
  });
});
