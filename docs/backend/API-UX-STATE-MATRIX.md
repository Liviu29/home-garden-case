# API ↔ UX state matrix

Every meaningful frontend API operation and the state it renders. Derived from
BACKEND-API-AUDIT.md — the columns exist because the backend can actually
produce them (there is no auth, so there is no 401/403 column).

Legend: ✅ implemented · N/A the backend cannot produce this here · ⚠️ known gap

| Operation                                 | Success                            | Initial load            | Pending mutation               | Empty                     | Validation                                              | Business error                                                    | 404                            | 5xx                       | Network         | Retry               | Race/cancel          | Skeleton/ghost | E2E                                         |
| ----------------------------------------- | ---------------------------------- | ----------------------- | ------------------------------ | ------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------ | ------------------------- | --------------- | ------------------- | -------------------- | -------------- | ------------------------------------------- |
| `GET /users` (Welcome)                    | ✅ profile cards                   | ✅ card-shaped ghosts   | N/A                            | ✅ onboarding state + CTA | N/A                                                     | N/A                                                               | N/A                            | ✅ ErrorState + Try again | ✅ same         | ✅ re-skeleton      | N/A single screen    | ✅             | ✅ `welcome.spec`                           |
| `GET /users/{id}` (session check)         | ✅ refresh local profile           | N/A (background)        | N/A                            | N/A                       | N/A                                                     | N/A                                                               | ✅ sign out → Welcome          | ✅ **session kept**       | ✅ session kept | N/A                 | N/A                  | N/A silent     | ✅ `welcome.spec` ×2                        |
| `GET /users/email/{email}` (409 recovery) | ✅ signs in                        | N/A                     | ✅ button ghost                | N/A                       | N/A                                                     | N/A                                                               | ✅ inline "pick from the list" | ✅ inline message         | ✅ same         | ✅ retryable action | N/A                  | ✅             | ✅ `welcome.spec`                           |
| `POST /users`                             | ✅ signs in                        | N/A                     | ✅ submit-button ghost         | N/A                       | ✅ inline field errors                                  | ✅ **409 → "continue as that profile"**                           | N/A                            | ✅ inline message         | ✅ same         | ✅ resubmit         | ✅ single-flight     | ✅             | ✅ `welcome.spec` ×2                        |
| `PUT /users/{id}` (edit profile)          | ✅ adopts server response          | N/A                     | ✅ submit-button ghost         | N/A                       | ✅ inline (email, age>0)                                | ✅ 409 → inline copy                                              | ✅ inline message              | ✅ inline message         | ✅ same         | ✅ resubmit         | ✅ single-flight     | ✅             | ⚠️ manual (dialog)                          |
| `DELETE /users/{id}`                      | ✅ sign out + toast                | N/A                     | ✅ menu item disabled          | N/A                       | N/A                                                     | N/A                                                               | ✅ reconciles (signs out)      | ✅ toast + profile kept   | ✅ same         | ✅ retry action     | ✅ single-flight     | ✅             | ⚠️ manual (menu)                            |
| `GET /gardens`                            | ✅ grid                            | ✅ card skeletons       | N/A                            | ✅ EmptyState + CTA       | N/A                                                     | N/A                                                               | N/A                            | ✅ ErrorState + Try again | ✅ same         | ✅                  | ✅ SWR keeps stale   | ✅             | ✅ `async-states`                           |
| `GET /gardens/{id}`                       | ✅ detail                          | ✅ full-page skeleton   | N/A                            | N/A                       | ✅ invalid id → not-found, no request                   | ✅ over-capacity clamped + true %                                 | ✅ **not-found page**          | ✅ **retry page**         | ✅ same         | ✅ Try again        | ✅ **token guard**   | ✅             | ✅ `contract-resilience` ×3                 |
| `POST /gardens`                           | ✅ card appears                    | N/A                     | ✅ ghost card in grid          | N/A                       | ✅ inline (name, area, lat+lng pair)                    | N/A (no capacity rule here)                                       | N/A                            | ✅ inline + toast         | ✅ same         | ✅ resubmit         | ✅ idempotent append | ✅             | ✅ `mutation-ghosts`                        |
| `PUT /gardens/{id}`                       | ✅ header + cache write-through    | N/A                     | ✅ localized card/header ghost | N/A                       | ✅ inline                                               | ⚠️ **backend allows shrink below occupancy** — client warns first | ✅ inline message              | ✅ inline + toast         | ✅ same         | ✅ resubmit         | ✅ single-flight     | ✅             | ✅ `mutation-ghosts`                        |
| `DELETE /gardens/{id}`                    | ✅ card leaves + cascade copy      | N/A                     | ✅ ghost-confirmed card        | N/A                       | N/A                                                     | N/A                                                               | ✅ reconciles                  | ✅ restores + retry toast | ✅ same         | ✅ toast retry      | ✅ single-flight     | ✅             | ✅ `mutation-ghosts`                        |
| `GET /plants/garden/{id}`                 | ✅ table + map                     | ✅ table + map skeleton | N/A                            | ✅ "Ready to grow" + CTA  | ✅ 400 for missing garden — garden 404 owns the verdict | N/A                                                               | ✅ via garden                  | ✅ localized error        | ✅ same         | ✅                  | ✅ **token guard**   | ✅             | ✅ `garden-map`, `contract-resilience`      |
| `POST /plants`                            | ✅ row + bed + capacity            | N/A                     | ✅ ghost row + ghost bed       | N/A                       | ✅ inline (type/humidity/area)                          | ✅ **capacity 400 inline, verbatim**                              | ✅ garden gone → message       | ✅ inline + toast         | ✅ same         | ✅ resubmit         | ✅ idempotent append | ✅             | ✅ `contract-resilience`, `mutation-ghosts` |
| `PUT /plants/{id}`                        | ✅ server response adopted         | N/A                     | ✅ row + bed ghost             | N/A                       | ✅ inline                                               | ✅ capacity (self excluded, mirrors server)                       | ✅ inline message              | ✅ inline + toast         | ✅ same         | ✅ resubmit         | ✅ single-flight     | ✅             | ✅ `mutation-ghosts`                        |
| `DELETE /plants/{id}`                     | ✅ row/bed leave, capacity updates | N/A                     | ✅ ghost-confirmed row + bed   | N/A                       | N/A                                                     | N/A                                                               | ✅ reconciles                  | ✅ restores + retry toast | ✅ same         | ✅ toast retry      | ✅ single-flight     | ✅             | ✅ `mutation-ghosts`                        |

## Notes on the N/A entries

- **401/403** — the backend has no authentication at all (no middleware, no
  headers, `auth { mode: none }` in Bruno). Inventing runtime auth handling
  would be fiction; the production design lives in ADR-005.
- **Pagination / filtering / sorting** — no query parameters exist on any
  endpoint, so there is no server-side variant to support.
- **Timeout** — no explicit client timeout is imposed. The API's own delay is
  200–2000 ms by design; aborting a legitimately slow request would turn a
  working page into an error. The skeleton simply stays until the response
  lands (§49), and the retry interceptor covers real failures.
- **Cancellation** — Angular's `HttpClient` cancels on unsubscribe, but these
  stores await promises, so the guarantee is enforced where it matters: a stale
  response is _discarded_ by the request token rather than applied.

## Screen coverage

| Screen          | Backend dependency                             | Loading            | Empty              | Error                   | Mutation                        |
| --------------- | ---------------------------------------------- | ------------------ | ------------------ | ----------------------- | ------------------------------- |
| Welcome         | `GET /users` (+ POST, email lookup)            | ✅ card ghosts     | ✅ onboarding      | ✅ retry                | ✅ button ghost                 |
| Dashboard       | `GET /gardens` + `GET /plants/garden/{id}` × N | ✅ content-shaped  | ✅ onboarding CTA  | ✅ retry                | ✅ derived values follow stores |
| Gardens         | `GET /gardens`                                 | ✅ card skeletons  | ✅ EmptyState      | ✅ retry                | ✅ ghost card/row               |
| Garden Detail   | `GET /gardens/{id}` + plants                   | ✅ full silhouette | ✅ "Ready to grow" | ✅ **404 vs 5xx split** | ✅ ghosts everywhere            |
| Garden Planner  | same data, no extra calls                      | ✅ map skeleton    | ✅ prepared bed    | ✅ inherits detail      | ✅ bed ghosts                   |
| Profile dialogs | `PUT`/`DELETE /users/{id}`                     | N/A                | N/A                | ✅ inline + toast       | ✅ button ghost                 |
| Not-found page  | –                                              | N/A                | N/A                | ✅ designed             | N/A                             |

**Spinner count: 0** — enforced by `npm run check:no-spinners` and asserted at
runtime in the mocked suite.
