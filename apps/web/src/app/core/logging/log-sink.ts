import { DOCUMENT, InjectionToken, inject } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';

/**
 * What the Logger hands to a sink: a context tag and a sentence, or a
 * measurement — never a payload (no DTO, form value or profile field).
 */
export type LogEntry =
  | { readonly kind: 'error'; readonly context: string; readonly message: string }
  | {
      readonly kind: 'metric';
      readonly name: string;
      readonly value: number;
      readonly rating: string;
    };

/** Where log entries go beyond the console: a collector, Sentry, OpenTelemetry. */
export interface LogSink {
  write(entry: LogEntry): void;
}

/**
 * The app's sink: a sendBeacon collector when an endpoint is configured
 * (`environment.telemetryEndpoint`), otherwise none — by default nothing
 * leaves the browser. The beacon (beacon-sink.ts) is a chunk of its own, so
 * an app without an endpoint never downloads it; entries written before it
 * arrives are passed on, in order, once it has. A Sentry or OpenTelemetry
 * adapter would be provided here instead; call sites never change.
 */
export const LOG_SINK = new InjectionToken<LogSink | null>('LOG_SINK', {
  providedIn: 'root',
  factory: () => {
    const endpoint = inject(APP_CONFIG).telemetryEndpoint;
    if (!endpoint) {
      return null;
    }
    const doc = inject(DOCUMENT);
    const beacon = import('./beacon-sink').then(({ BeaconSink }) => new BeaconSink(endpoint, doc));
    return { write: (entry) => void beacon.then((sink) => sink.write(entry)) };
  },
});
