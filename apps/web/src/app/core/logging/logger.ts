import { Injectable, inject, isDevMode } from '@angular/core';
import { LOG_SINK } from './log-sink';

/**
 * Logging seam: log context, never payloads.
 *
 * The console, plus an optional sink (`LOG_SINK`): the single place a
 * collector, Sentry or OpenTelemetry plugs in without touching call sites —
 * see ARCHITECTURE.md §4.4. Production policy is deliberate: expected
 * unhappy paths stay quiet so the browser console is not noise, while
 * genuine technical failures are always reported. Messages carry a context
 * tag and a human sentence only — never a DTO, form value or profile field.
 */
@Injectable({ providedIn: 'root' })
export class Logger {
  private readonly sink = inject(LOG_SINK);

  /** Expected unhappy paths (failed refresh, rolled-back mutation). Stay local. */
  warn(context: string, message: string): void {
    if (!isDevMode()) {
      return;
    }
    console.warn(`[${context}] ${message}`);
  }

  /**
   * True technical failures — every one should be alarm-worthy. The sink gets
   * the context and the sentence; the cause stays in this browser's console.
   */
  error(context: string, message: string, cause?: unknown): void {
    console.error(`[${context}] ${message}`, cause ?? '');
    this.sink?.write({ kind: 'error', context, message });
  }

  /** A measurement, such as a Web Vital: to the sink, and to the console in development. */
  metric(name: string, value: number, rating: string): void {
    if (isDevMode()) {
      console.info(`[vitals] ${name} ${value} (${rating})`);
    }
    this.sink?.write({ kind: 'metric', name, value, rating });
  }
}
