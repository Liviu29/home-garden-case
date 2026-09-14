# ADR-011: Signal Forms for the garden and plant dialogs

**Status:** accepted · 2026-09-14

## Context

The two dialogs that carry the case's business rules — the garden form and the plant form — were
typed reactive forms (`NonNullableFormBuilder`). Everything the screens derive from what the user
types (the live garden-fit meter, the preset highlights, the artwork preview, the shrink warning)
is a signal, so each dialog bridged its controls with `toSignal(control.valueChanges)`: seven
bridges in all. The templates read `form.controls.x.hasError()` and `.value` directly — plain
properties, not signals — which under zoneless change detection repaint only because the DOM event
that changed them happened to schedule a check. And the capacity rule lived beside the form
(`overcrowds()`), so the submit button and `submit()` each checked it separately from
`form.invalid`.

Angular 22.1 ships Signal Forms (`@angular/forms/signals`) as stable public API. Its `[formField]`
directive provides `NgControl`, so Material's inputs, select, slider and datepicker bind to it
without a compatibility layer.

## Decision

The garden and plant dialogs move to Signal Forms:

- The model is a `signal` of a plain object (`GardenModel`, `PlantModel`); the rules are a `schema`
  — `required`, `min`, `max`, `maxLength`, a `validate` for the whitespace-only name, and a
  `validateTree` for "both coordinates or neither". They mirror the backend's zod schemas; a
  number field the user empties reads as `null`, which `required` refuses.
- **The capacity rule is a validator on the area field**, built from the same domain function
  the rest of the app uses (`wouldOvercrowd`). It is part of `f().invalid()`: the submit button
  and `submit()` cannot disagree with it, and its verdict is rendered where the garden-fit meter
  is, in the user's locale.
- Everything derived reads the model signal: no `valueChanges` bridges, and every template read
  (`errors()`, `invalid()`, `touched()`, the humidity value) is tracked.
- `submit()` marks every field touched and runs the store's write only when the form is valid; the
  store is single-flight (ADR-004), so a double click joins the request in flight. A functional
  server verdict still renders inline, verbatim.
- The welcome screen and the profile dialog keep their reactive forms: they carry no derived
  state, so nothing would be gained. `signals/compat` exists should they ever need to share rules.

## Consequences

- Seven `toSignal` bridges and two parallel capacity checks are gone; the rules of each form are one
  readable list at the top of its file.
- Material's `mat-error` shows a field's first error message; the messages are `$localize` strings in
  the schema rather than `i18n` text in the template, so the same Dutch translations apply.
- Signal Forms is a separate entry point of `@angular/forms`. Both dialogs are lazy chunks, so the
  first load does not pay for it; the budgets still gate the build.
- `[formField]` refuses native `min`, `max` and `maxlength` attributes on its element (the schema
  sets them). The `step` attribute remains the template's.
- The `<form>` must carry `novalidate`. `[formField]` sets the native `required` and `min`
  attributes from the schema, and `ReactiveFormsModule` — which added `novalidate` to every form
  on its own — is gone: without it the browser's constraint-validation bubble blocks the submit
  before `submit()` can mark the fields touched and show the app's messages (found by the
  integration suite, pinned by a unit test in each dialog).
