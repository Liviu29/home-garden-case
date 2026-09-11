import { TestBed } from '@angular/core/testing';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { BeaconSink } from './beacon-sink';
import { LOG_SINK, LogEntry } from './log-sink';

const setVisibility = (state: 'hidden' | 'visible') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

const ERROR: LogEntry = {
  kind: 'error',
  context: 'api:500',
  message: 'unhandled technical failure',
};
const METRIC: LogEntry = { kind: 'metric', name: 'LCP', value: 1830, rating: 'good' };

let sendBeacon: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sendBeacon = vi.fn(() => true);
  Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true });
});

afterEach(() => {
  setVisibility('visible');
  delete (navigator as { sendBeacon?: unknown }).sendBeacon;
});

/** What one beacon carried. */
const sentIn = async (call: number): Promise<Record<string, unknown>[]> => {
  const [, body] = sendBeacon.mock.calls[call] as [string, Blob];
  return JSON.parse(await body.text()) as Record<string, unknown>[];
};

describe('BeaconSink', () => {
  it('holds entries until the page is hidden, then sends them in one beacon', async () => {
    const sink = new BeaconSink('/collect', document);
    sink.write(ERROR);
    sink.write(METRIC);
    setVisibility('visible');
    expect(sendBeacon).not.toHaveBeenCalled();

    setVisibility('hidden');

    expect(sendBeacon).toHaveBeenCalledOnce();
    expect(sendBeacon.mock.calls[0][0]).toBe('/collect');
    const sent = await sentIn(0);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ ...ERROR, page: location.pathname });
    expect(sent[1]).toMatchObject(METRIC);
    expect(typeof sent[0]['at']).toBe('number');
  });

  it('sends nothing when nothing is waiting', () => {
    new BeaconSink('/collect', document);
    setVisibility('hidden');
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('sends a full batch at once, and does not send it again', () => {
    const sink = new BeaconSink('/collect', document);
    for (let i = 0; i < 20; i++) {
      sink.write(METRIC);
    }
    expect(sendBeacon).toHaveBeenCalledOnce();

    setVisibility('hidden');
    expect(sendBeacon).toHaveBeenCalledOnce();
  });

  it('without sendBeacon, drops entries rather than letting them pile up', () => {
    delete (navigator as { sendBeacon?: unknown }).sendBeacon;
    const sink = new BeaconSink('/collect', document);
    sink.write(ERROR);
    expect(() => setVisibility('hidden')).not.toThrow();

    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true });
    sink.flush();
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});

describe('LOG_SINK', () => {
  const withEndpoint = (telemetryEndpoint: string | null | undefined) => {
    TestBed.configureTestingModule({
      providers: [{ provide: APP_CONFIG, useValue: { telemetryEndpoint } as AppConfig }],
    });
    return TestBed.inject(LOG_SINK);
  };

  it('is nothing by default — nothing leaves the browser', () => {
    expect(withEndpoint(null)).toBeNull();
  });

  it('beacons to the configured endpoint, keeping what was written before it loaded', async () => {
    const sink = withEndpoint('/collect');
    sink?.write(ERROR); // before the beacon's chunk has arrived
    await import('./beacon-sink');
    await vi.waitFor(async () => {
      sink?.write(METRIC);
      setVisibility('hidden');
      setVisibility('visible');
      expect(sendBeacon).toHaveBeenCalled();
    });

    const sent = await sentIn(sendBeacon.mock.calls.length - 1);
    expect(sent[0]).toMatchObject(ERROR); // the early entry was kept
    expect(sent.at(-1)).toMatchObject(METRIC);
  });
});
