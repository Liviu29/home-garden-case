import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSliderModule } from '@angular/material/slider';
import { Garden, GardenInput } from '../../core/api/models';
import { GardensStore } from './gardens-store';

export interface GardenFormData {
  readonly garden: Garden | null;
}

/**
 * Create/edit garden dialog. Validation mirrors the backend contract exactly
 * (garden.schema.ts): name required, area ≥ 0, humidity 0–100, lat/lng
 * together-or-neither. Server verdicts render inline (CODING-GUIDELINES §6).
 */
@Component({
  selector: 'app-garden-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSliderModule,
  ],
  templateUrl: './garden-form-dialog.html',
  styleUrl: './garden-form-dialog.scss',
})
export class GardenFormDialog {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly ref = inject(MatDialogRef<GardenFormDialog>);
  private readonly data = inject<GardenFormData>(MAT_DIALOG_DATA);
  protected readonly store = inject(GardensStore);

  protected readonly isEdit = this.data.garden !== null;
  protected readonly serverError = signal<string | null>(null);

  // Rules mirror apps/api/src/app/schemas/garden.schema.ts — change together.
  protected readonly form = this.fb.group(
    {
      gardenName: this.fb.control(this.data.garden?.gardenName ?? '', [
        Validators.required,
        noWhitespaceOnly,
      ]),
      totalSurfaceArea: this.fb.control(this.data.garden?.totalSurfaceArea ?? 20, [
        Validators.required,
        Validators.min(0),
      ]),
      targetHumidityLevel: this.fb.control(this.data.garden?.targetHumidityLevel ?? 50, [
        Validators.required,
        Validators.min(0),
        Validators.max(100),
      ]),
      locationDescription: this.fb.control(this.data.garden?.locationDescription ?? ''),
      latitude: this.fb.control<number | null>(this.data.garden?.latitude ?? null, [
        Validators.min(-90),
        Validators.max(90),
      ]),
      longitude: this.fb.control<number | null>(this.data.garden?.longitude ?? null, [
        Validators.min(-180),
        Validators.max(180),
      ]),
    },
    { validators: [coordinatesTogether] },
  );

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.store.saving()) {
      return;
    }
    this.serverError.set(null);

    const raw = this.form.getRawValue();
    const input: GardenInput = {
      gardenName: raw.gardenName.trim(),
      totalSurfaceArea: raw.totalSurfaceArea,
      targetHumidityLevel: raw.targetHumidityLevel,
      locationDescription: raw.locationDescription.trim() || null,
      latitude: raw.latitude,
      longitude: raw.longitude,
    };

    const existing = this.data.garden;
    const result = existing
      ? await this.store.update(existing.gardenId, input)
      : await this.store.create(input);

    if (result.ok) {
      this.ref.close(true);
    } else if (result.error.kind !== 'technical') {
      this.serverError.set(result.error.message);
    }
  }
}

function noWhitespaceOnly(control: { value: string }): { whitespace: true } | null {
  return control.value.trim().length === 0 && control.value.length > 0
    ? { whitespace: true }
    : null;
}

/** Mirrors the backend's refine: both coordinates or neither. */
function coordinatesTogether(group: {
  value: { latitude?: number | null; longitude?: number | null };
}): { coordinatesTogether: true } | null {
  const { latitude, longitude } = group.value;
  const hasLat = latitude !== null && latitude !== undefined;
  const hasLng = longitude !== null && longitude !== undefined;
  return hasLat === hasLng ? null : { coordinatesTogether: true };
}
