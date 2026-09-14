import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface ValuePresetOption {
  readonly label: string;
  readonly value: number;
  /** Short qualifier rendered under the label, e.g. "25 m²" or "60%". */
  readonly description?: string;
  readonly recommended?: boolean;
}

/**
 * Quick-pick chips for a numeric form field. These are
 * PRODUCT-LEVEL suggestions, never backend rules: choosing one only writes the
 * value into the form control the parent owns, so every validator (and the
 * server's own verdicts) still applies unchanged. A custom value typed into
 * the field remains first-class — the chips simply highlight when the current
 * value matches one of them.
 */
@Component({
  selector: 'app-value-presets',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="value-presets" role="group" [attr.aria-label]="label()">
      @for (option of options(); track option.value) {
        <button
          type="button"
          class="value-presets__option press-feedback"
          [class.value-presets__option--active]="option.value === value()"
          [attr.aria-pressed]="option.value === value()"
          (click)="selectedChange.emit(option.value)"
        >
          <span class="value-presets__label">
            {{ option.label }}
            @if (option.recommended) {
              <span class="value-presets__badge" i18n>Recommended</span>
            }
          </span>
          @if (option.description) {
            <span class="value-presets__desc">{{ option.description }}</span>
          }
        </button>
      }
    </div>
  `,
  styles: `
    .value-presets {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sp-2);
    }

    .value-presets__option {
      display: grid;
      gap: 0.1rem;
      justify-items: start;
      padding: var(--sp-2) var(--sp-3);
      border-radius: var(--radius-s);
      border: 1px solid var(--border-strong);
      background: var(--surface-1);
      cursor: pointer;
      text-align: left;
      transition:
        border-color var(--dur-fast) var(--ease-out),
        background var(--dur-fast) var(--ease-out);

      &:hover {
        border-color: var(--brand-500);
      }

      &:focus-visible {
        outline: none;
        box-shadow: var(--focus-ring);
      }

      &.value-presets__option--active {
        border-color: var(--brand-500);
        background: var(--brand-soft);
      }
    }

    .value-presets__label {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-2);
      font: 600 var(--fs-caption) var(--font-ui);
      color: var(--text-1);
    }

    .value-presets__badge {
      padding: 0.05rem var(--sp-2);
      border-radius: var(--radius-pill);
      background: var(--brand-soft);
      border: 1px solid var(--brand-soft-border);
      color: var(--brand-700);
      font-size: 0.625rem;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .value-presets__desc {
      font-size: var(--fs-micro);
      color: var(--text-3);
    }
  `,
})
export class ValuePresets {
  /** Accessible name for the chip group, e.g. "Garden size presets". */
  readonly label = input.required<string>();
  readonly options = input.required<readonly ValuePresetOption[]>();
  /** Current form value — highlights a chip when it matches exactly. */
  readonly value = input<number | null>(null);
  readonly selectedChange = output<number>();
}
