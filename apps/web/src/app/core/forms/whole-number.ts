import type { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * A reactive-forms validator for a field the API types as `int().positive()`
 * (a profile's `age`): whole and at least 1, or empty. `Validators.min(1)`
 * alone let 1.5 through to a 400.
 */
export function wholeNumber(control: AbstractControl<number | null>): ValidationErrors | null {
  const value = control.value;
  if (value === null || value === undefined) {
    return null;
  }
  return Number.isInteger(value) ? null : { wholeNumber: true };
}
