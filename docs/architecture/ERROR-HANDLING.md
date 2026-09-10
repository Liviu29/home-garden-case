# Error Handling

One standard for the whole app — screens never invent their own. The taxonomy lives in `core/errors/api-error.ts`; the last line of defense is the global `ErrorHandler`.

## Taxonomy

Every failure is classified exactly once, in `toApiError()`:

| Kind         | Trigger                                   | Retried?                            | Rendered as                                                                                                    |
| ------------ | ----------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `technical`  | 5xx, network (status 0), anything unknown | yes — interceptor, backoff + jitter | if it still surfaces: persistent error toast with a **Try again** action; generic copy, never server internals |
| `functional` | 4xx verdicts (overcrowding, validation)   | **never**                           | inline, in context — on the form field or as a form-level message, server text verbatim                        |
| `not-found`  | 404 (dead deep link)                      | no                                  | designed not-found page with a way back — not a toast                                                          |

Distinctions that matter:

- **Domain/validation errors are expected behaviour**, logged at `warn/info`, never as errors, and never toasted — the user is mid-task and the form is the context.
- **Empty is not an error.** "No gardens yet" renders the shared `EmptyState` with a CTA.
- **Stale beats broken.** If a background revalidation fails while cached data is on screen, the data stays and a quiet info toast notes the refresh failure.
- Users never see stack traces, JSON, status codes, or "Random error thrown" — message extraction (`extractServerMessage`) normalizes all three backend error shapes (`{message}`, `{error, details:[...]}`, zod issue arrays) and technical failures fall back to generic copy.

## Where each piece lives

```
core/errors/
  api-error.ts           # ApiError class + toApiError() + message extraction
  global-error-handler.ts# catches anything unhandled; logs with context, toasts once
  toast-store.ts         # queue; success/info auto-dismiss, errors persist until dismissed
core/http/
  api-interceptors.ts    # retry policy for transient technical failures
```

All logging flows through a minimal `core/logging/Logger` seam (REM-011): console-backed today, the exact interface a Sentry/OpenTelemetry sink would implement in production — call sites never change. Read flows surface retry affordances (error state with "Try again"); mutations roll back optimistic state and toast with a retry action; the app never logs payloads — operation + id + message only ([logging rules](../CODING-GUIDELINES.md#7-errors-logging--ux-standard)).

Tests: `api-error.spec.ts` (mapping, all payload shapes), `api-interceptors.spec.ts` (retries transient, never retries verdicts, budget exhaustion), `gardens-store.spec.ts` (rollback + retry affordance, verdicts returned to forms).
