import { fromPlantationDate, toPlantationDate } from './plantation-date';

/**
 * Regression guard for the timezone day-shift (API-INTEGRATION.md §7,
 * contract issue 1).
 *
 * These assertions are timezone-independent on purpose: Node caches the
 * process timezone, so flipping `TZ` mid-run is unreliable. Instead we pin the
 * two properties that make the fix correct in *every* timezone:
 *
 *   1. serialization depends only on the LOCAL calendar day (never the instant)
 *   2. the emitted instant is always UTC midnight of that day
 *
 * The cross-timezone behaviour itself was verified against the real backend
 * (Europe/Brussels: the old `.toISOString()` stored 2026-09-09 for a 10 Sep pick).
 */
describe('plantation date serialization (calendar-day safety)', () => {
  it('serializes the local calendar day as UTC midnight', () => {
    expect(toPlantationDate(new Date(2026, 8, 10))).toBe('2026-09-10T00:00:00.000Z');
  });

  it('ignores the time of day — this is what removes the timezone shift', () => {
    // Whatever local time the picker attaches, the calendar day is what counts.
    for (const hour of [0, 1, 12, 22, 23]) {
      expect(toPlantationDate(new Date(2026, 8, 10, hour, 59, 59))).toBe(
        '2026-09-10T00:00:00.000Z',
      );
    }
  });

  it('documents the failure mode it replaces', () => {
    // A Brussels (UTC+2) picker returning local midnight on 10 Sep produced
    // this instant under the old `.toISOString()` — a day early.
    const naiveBrusselsValue = '2026-09-09T22:00:00.000Z';
    expect(naiveBrusselsValue.slice(0, 10)).toBe('2026-09-09');
    // The new serializer can never emit a day other than the one picked.
    expect(toPlantationDate(new Date(2026, 8, 10)).slice(0, 10)).toBe('2026-09-10');
  });

  it('reads a stored value back as the same calendar day, locally', () => {
    const asDate = fromPlantationDate('2026-09-10T00:00:00.000Z');
    expect(asDate.getFullYear()).toBe(2026);
    expect(asDate.getMonth()).toBe(8);
    expect(asDate.getDate()).toBe(10);
  });

  it('round-trips: stored → picker → stored', () => {
    const stored = '2026-09-10T00:00:00.000Z';
    expect(toPlantationDate(fromPlantationDate(stored))).toBe(stored);
  });

  it('reads legacy rows written by the naive serializer without crashing', () => {
    const legacy = fromPlantationDate('2026-09-09T22:00:00.000Z');
    expect(legacy.getDate()).toBe(9); // the UTC day that was actually stored
  });

  it('falls back to a valid date on malformed input', () => {
    expect(Number.isNaN(fromPlantationDate('not-a-date').getTime())).toBe(false);
  });
});
