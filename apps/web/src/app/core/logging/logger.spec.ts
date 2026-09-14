import { TestBed } from '@angular/core/testing';
import { LOG_SINK, type LogEntry } from './log-sink';
import { Logger } from './logger';

/**
 * The logging policy is a product decision, not a detail (ARCHITECTURE.md §4.4):
 * expected unhappy paths stay out of a production console, genuine technical
 * failures always appear, and neither carries a payload.
 *
 * Note on the one branch not asserted here: `warn()`'s production early-return
 * depends on `isDevMode()`, whose flag is process-wide and set irreversibly by
 * `enableProdMode()`. Mocking `@angular/core` to flip it was tried and rejected
 * — it requires disabling Vitest code-splitting and enabling per-file isolation
 * (6× slower suite) to work at all, which is a poor trade for one line. The
 * behaviour is instead pinned by the app never logging warnings in the
 * production e2e run.
 */
describe('Logger', () => {
  let logger: Logger;
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logger = TestBed.inject(Logger);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  it('warns with a context tag, and only a context tag', () => {
    logger.warn('gardens', 'refresh failed, keeping cached list');
    expect(warn).toHaveBeenCalledWith('[gardens] refresh failed, keeping cached list');
  });

  it('reports errors with their original cause attached', () => {
    const cause = new Error('boom');
    logger.error('api:500', 'unhandled technical failure', cause);
    expect(error).toHaveBeenCalledWith('[api:500] unhandled technical failure', cause);
  });

  it('substitutes an empty string when no cause is supplied', () => {
    logger.error('app', 'unhandled error');
    expect(error).toHaveBeenCalledWith('[app] unhandled error', '');
  });

  it('never puts a payload in a message — only the context tag and a sentence', () => {
    logger.warn('plants', 'create rolled back');
    const [message] = warn.mock.calls[0] as [string];
    expect(message).toBe('[plants] create rolled back');
    expect(warn).toHaveBeenCalledTimes(1); // no second argument carrying a DTO
  });

  it('has no sink unless a telemetry endpoint is configured', () => {
    expect(TestBed.inject(LOG_SINK)).toBeNull();
    expect(() => logger.metric('LCP', 1200, 'good')).not.toThrow();
  });
});

describe('Logger — what reaches the sink', () => {
  const written: LogEntry[] = [];
  let logger: Logger;

  beforeEach(() => {
    written.length = 0;
    TestBed.configureTestingModule({
      providers: [{ provide: LOG_SINK, useValue: { write: (e: LogEntry) => written.push(e) } }],
    });
    logger = TestBed.inject(Logger);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('an error goes as its context and sentence — never its cause', () => {
    logger.error('api:500', 'unhandled technical failure', new Error('a payload'));
    expect(written).toEqual([
      { kind: 'error', context: 'api:500', message: 'unhandled technical failure' },
    ]);
  });

  it('a metric goes with its rating, and shows in the development console', () => {
    logger.metric('LCP', 1830, 'good');
    expect(written).toEqual([{ kind: 'metric', name: 'LCP', value: 1830, rating: 'good' }]);
    expect(console.info).toHaveBeenCalledWith('[vitals] LCP 1830 (good)');
  });

  it('expected unhappy paths stay in this browser', () => {
    logger.warn('gardens', 'refresh failed');
    expect(written).toEqual([]);
  });
});
