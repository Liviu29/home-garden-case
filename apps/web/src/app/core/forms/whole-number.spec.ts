import { FormControl } from '@angular/forms';
import { wholeNumber } from './whole-number';

describe('wholeNumber (the API’s int().positive() for age, mirrored)', () => {
  const errorsFor = (value: number | null) => wholeNumber(new FormControl<number | null>(value));

  it('accepts a whole number, and an empty field', () => {
    expect(errorsFor(33)).toBeNull();
    expect(errorsFor(1)).toBeNull();
    expect(errorsFor(null)).toBeNull();
  });

  it('refuses a fraction', () => {
    expect(errorsFor(1.5)).toEqual({ wholeNumber: true });
    expect(errorsFor(0.5)).toEqual({ wholeNumber: true });
  });
});
