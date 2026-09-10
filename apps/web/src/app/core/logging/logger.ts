import { Injectable, isDevMode } from '@angular/core';

/**
 * Logging seam (CODING-GUIDELINES: log context, never payloads).
 *
 * Console-backed today; this is the single place a real sink (Sentry,
 * OpenTelemetry) plugs in without touching call sites — see ERROR-HANDLING.md.
 * Production policy is deliberate: expected unhappy paths stay quiet so the
 * browser console is not noise, while genuine technical failures are always
 * reported. Messages carry a context tag and a human sentence only — never a
 * DTO, form value or profile field.
 */
@Injectable({ providedIn: 'root' })
export class Logger {
  /** Expected unhappy paths (failed refresh, rolled-back mutation). */
  warn(context: string, message: string): void {
    if (!isDevMode()) {
      return;
    }
    console.warn(`[${context}] ${message}`);
  }

  /** True technical failures — every one should be alarm-worthy. */
  error(context: string, message: string, cause?: unknown): void {
    console.error(`[${context}] ${message}`, cause ?? '');
  }
}
