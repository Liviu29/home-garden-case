import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSliderModule } from '@angular/material/slider';
import { Garden, GardenInput } from '../../core/api/models';
import { GARDEN_SIZE_PRESETS, TARGET_HUMIDITY_PRESETS } from '../../shared/config/product-defaults';
import { ValuePresets } from '../../shared/ui/value-presets/value-presets';
import { usedSurfaceArea, wouldShrinkBelowUsed } from '../../shared/utils/garden-insights';
import { GardensStore } from './gardens-store';
import { PlantsIndexStore } from './plants-index-store';

interface GardenFormData {
  readonly garden: Garden | null;
}

/**
 * Create/edit garden dialog. Validation mirrors the backend contract exactly
 * (garden.schema.ts): name required, area ≥ 0, humidity 0–100, lat/lng
 * together-or-neither. Server verdicts render inline.
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
    DecimalPipe,
    ValuePresets,
  ],
  templateUrl: './garden-form-dialog.html',
  styleUrl: './garden-form-dialog.scss',
})
export class GardenFormDialog {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly ref = inject(MatDialogRef<GardenFormDialog>);
  private readonly data = inject<GardenFormData>(MAT_DIALOG_DATA);
  protected readonly store = inject(GardensStore);

  private readonly plantsIndex = inject(PlantsIndexStore);

  protected readonly isEdit = this.data.garden !== null;
  protected readonly serverError = signal<string | null>(null);

  constructor() {
    // Shrink-warning needs this garden's plants; loads through the SWR cache,
    // so a warm cache costs nothing.
    const existing = this.data.garden;
    if (existing) {
      this.plantsIndex.ensureForGardens([existing.gardenId]);
    }
  }

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

  private readonly totalAreaValue = toSignal(this.form.controls.totalSurfaceArea.valueChanges, {
    initialValue: this.form.controls.totalSurfaceArea.value,
  });

  // ── Quick presets (product defaults, not backend rules) ──────────────────
  protected readonly sizePresets = GARDEN_SIZE_PRESETS;
  protected readonly humidityPresets = TARGET_HUMIDITY_PRESETS;

  protected readonly currentArea = this.totalAreaValue;
  protected readonly currentHumidity = toSignal(
    this.form.controls.targetHumidityLevel.valueChanges,
    { initialValue: this.form.controls.targetHumidityLevel.value },
  );

  /** Writes through the form control, so every validator still applies. */
  protected applyAreaPreset(value: number): void {
    this.form.controls.totalSurfaceArea.setValue(value);
    this.form.controls.totalSurfaceArea.markAsDirty();
  }

  protected applyHumidityPreset(value: number): void {
    this.form.controls.targetHumidityLevel.setValue(value);
    this.form.controls.targetHumidityLevel.markAsDirty();
  }

  /** m² this garden's plants currently use; null while unknown (plants not loaded). */
  protected readonly usedArea = computed<number | null>(() => {
    const existing = this.data.garden;
    if (!existing) {
      return null;
    }
    const plants = this.plantsIndex.byGarden()[existing.gardenId];
    return plants === undefined ? null : usedSurfaceArea(plants);
  });

  /**
   * Warn (never block — the server permits it) when the edited total
   * would drop below what plants already occupy.
   */
  protected readonly shrinksBelowUsed = computed(() => {
    const existing = this.data.garden;
    const used = this.usedArea();
    if (!existing || used === null) {
      return false;
    }
    const plants = this.plantsIndex.byGarden()[existing.gardenId] ?? [];
    return wouldShrinkBelowUsed(plants, this.totalAreaValue() ?? 0);
  });

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
