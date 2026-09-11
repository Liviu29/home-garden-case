import { LogEntry, LogSink } from './log-sink';

/** A batch this large is sent at once instead of waiting for the page to be hidden. */
const MAX_BATCH = 20;

/**
 * Sends entries to a collector endpoint with `navigator.sendBeacon`: batched,
 * and flushed when the page is hidden — the one moment every browser
 * reliably lets a request out, tab close included — without ever blocking
 * the page. Each entry carries the route it happened on, a path such as
 * `/gardens/12`, which names no person.
 */
export class BeaconSink implements LogSink {
  private readonly endpoint: string;
  private readonly doc: Document;
  private batch: object[] = [];

  constructor(endpoint: string, doc: Document) {
    this.endpoint = endpoint;
    this.doc = doc;
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden') {
        this.flush();
      }
    });
  }

  write(entry: LogEntry): void {
    this.batch.push({ ...entry, page: this.doc.location.pathname, at: Date.now() });
    if (this.batch.length >= MAX_BATCH) {
      this.flush();
    }
  }

  /** Sends what is waiting. Without sendBeacon it is dropped, never left to pile up. */
  flush(): void {
    const batch = this.batch;
    this.batch = [];
    const navigator = this.doc.defaultView?.navigator;
    if (batch.length > 0 && navigator?.sendBeacon) {
      navigator.sendBeacon(
        this.endpoint,
        new Blob([JSON.stringify(batch)], { type: 'application/json' }),
      );
    }
  }
}
