import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { Garden, PLANT_TYPES, Plant, PlantInput } from '../../core/api/models';
import { CapacityBar } from '../../shared/ui/capacity-bar/capacity-bar';
import {
  remainingCapacity,
  usedSurfaceArea,
  wouldOvercrowd,
} from '../../shared/utils/garden-insights';
import { GardenDetailStore } from './garden-detail-store';

export interface PlantFormData {
  readonly garden: Garden;
  readonly plants: readonly Plant[];
  readonly plant: Plant | null;
  readonly store: InstanceType<typeof GardenDetailStore>;
}

/**
 * Create/edit plant dialog — the validation showcase:
 * - rules mirror plant.schema.ts 1:1 (required fields, humidity 0–100, area ≥ 0)
 * - live remaining-capacity meter reacts to the surface-area field
 * - the overcrowding rule runs client-side for instant feedback, while the
 *   server verdict stays authoritative and renders inline on 400
 */
@Component({
  selector: 'app-plant-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatSliderModule,
    MatDatepickerModule,
    MatNativeDateModule,
    CapacityBar,
  ],
  templateUrl: './plant-form-dialog.html',
  styleUrl: './plant-form-dialog.scss',
})
export class PlantFormDialog {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly ref = inject(MatDialogRef<PlantFormDialog>);
  protected readonly data = inject<PlantFormData>(MAT_DIALOG_DATA);

  protected readonly isEdit = this.data.plant !== null;
  protected readonly plantTypes = PLANT_TYPES;
  protected readonly serverError = signal<string | null>(null);

  // Rules mirror apps/api/src/app/schemas/plant.schema.ts — change together.
  protected readonly form = this.fb.group({
    plantName: this.fb.control(this.data.plant?.plantName ?? '', [Validators.required]),
    species: this.fb.control(this.data.plant?.species ?? '', [Validators.required]),
    plantType: this.fb.control<Plant['plantType']>(this.data.plant?.plantType ?? 'vegetable', [
      Validators.required,
    ]),
    plantationDate: this.fb.control<Date>(
      this.data.plant ? new Date(this.data.plant.plantationDate) : new Date(),
      [Validators.required],
    ),
    surfaceAreaRequired: this.fb.control(this.data.plant?.surfaceAreaRequired ?? 1, [
      Validators.required,
      Validators.min(0),
    ]),
    idealHumidityLevel: this.fb.control(this.data.plant?.idealHumidityLevel ?? 50, [
      Validators.required,
      Validators.min(0),
      Validators.max(100),
    ]),
  });

  private readonly requestedArea = toSignal(this.form.controls.surfaceAreaRequired.valueChanges, {
    initialValue: this.form.controls.surfaceAreaRequired.value,
  });

  /** m² the rest of the garden leaves for this plant (self excluded on edit). */
  protected readonly capacityLeft = computed(() =>
    remainingCapacity(this.data.garden, this.data.plants, this.data.plant?.plantId),
  );

  /** Live client-side mirror of the server's overcrowding rule. */
  protected readonly overcrowds = computed(() =>
    wouldOvercrowd(
      this.data.garden,
      this.data.plants,
      this.requestedArea() ?? 0,
      this.data.plant?.plantId,
    ),
  );

  /** Occupancy preview: other plants' area + what this form currently asks for. */
  protected readonly previewUsed = computed(() => {
    const others = usedSurfaceArea(
      this.data.plants.filter((p) => p.plantId !== this.data.plant?.plantId),
    );
    return others + Math.max(0, this.requestedArea() ?? 0);
  });

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.overcrowds() || this.data.store.saving()) {
      return;
    }
    this.serverError.set(null);

    const raw = this.form.getRawValue();
    const input: PlantInput = {
      plantName: raw.plantName.trim(),
      species: raw.species.trim(),
      plantType: raw.plantType,
      plantationDate: raw.plantationDate.toISOString(),
      surfaceAreaRequired: raw.surfaceAreaRequired,
      idealHumidityLevel: raw.idealHumidityLevel,
      gardenId: this.data.garden.gardenId,
    };

    const existing = this.data.plant;
    const result = existing
      ? await this.data.store.updatePlant(existing.plantId, input)
      : await this.data.store.createPlant(input);

    if (result.ok) {
      this.ref.close(true);
    } else if (result.error.kind !== 'technical') {
      // The server verdict is authoritative — render it inline, verbatim.
      this.serverError.set(result.error.message);
    }
  }
}
