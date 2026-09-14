import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
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
import { Garden, PLANT_TYPES, Plant, PlantInput } from '../../../core/api/models';
import { PlantCatalogFacade } from '../../../domain/catalog/plant-catalog-facade';
import { PLANT_AREA_PRESETS } from '../../../shared/ui/value-presets/product-defaults';
import { CapacityBar } from '../../../shared/ui/capacity-bar/capacity-bar';
import { PlantThumb } from '../../../shared/ui/plant-visuals/plant-thumb';
import { PLANT_TYPE_LABEL } from '../../../shared/ui/plant-visuals/plant-type-label';
import { ValuePresets } from '../../../shared/ui/value-presets/value-presets';
import { PlantRecommendation } from '../../../domain/plant-recommendation/plant-recommendation';
import {
  fromPlantationDate,
  toPlantationDate,
} from '../../../domain/plantation-date/plantation-date';
import {
  remainingCapacity,
  usedSurfaceArea,
  wouldOvercrowd,
} from '../../../domain/garden-insights/garden-insights';
import { GardenDetailStore } from '../garden-detail-store/garden-detail-store';

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
    DecimalPipe,
    ValuePresets,
    PlantThumb,
  ],
  templateUrl: './plant-form-dialog.html',
  styleUrl: './plant-form-dialog.scss',
})
export class PlantFormDialog {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly ref = inject(MatDialogRef<PlantFormDialog>);
  protected readonly data = inject<PlantFormData>(MAT_DIALOG_DATA);

  protected readonly isEdit = this.data.plant !== null;
  protected readonly heading = this.isEdit ? $localize`Edit plant` : $localize`Add a plant`;
  protected readonly submitLabel = this.isEdit ? $localize`Save changes` : $localize`Add plant`;
  /** Announced while the save is in flight. */
  protected readonly pendingLabel = this.isEdit ? $localize`Saving plant` : $localize`Planting`;
  protected readonly plantTypes = PLANT_TYPES;
  /** What the type select shows; the value sent stays the API's own. */
  protected readonly plantTypeLabels = PLANT_TYPE_LABEL;
  protected readonly serverError = signal<string | null>(null);

  // Rules mirror apps/api/src/app/schemas/plant.schema.ts — change together.
  protected readonly form = this.fb.group({
    plantName: this.fb.control(this.data.plant?.plantName ?? '', [Validators.required]),
    species: this.fb.control(this.data.plant?.species ?? '', [Validators.required]),
    plantType: this.fb.control<Plant['plantType']>(this.data.plant?.plantType ?? 'vegetable', [
      Validators.required,
    ]),
    plantationDate: this.fb.control<Date>(
      this.data.plant ? fromPlantationDate(this.data.plant.plantationDate) : new Date(),
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

  /** Convenience quick-picks (product defaults, not botany, not backend rules). */
  protected readonly areaPresets = PLANT_AREA_PRESETS;
  protected readonly currentArea = this.requestedArea;

  // ── Plant discovery: local catalog, ranked for THIS
  // garden; selecting a card prefills — every value stays editable and every
  // validator stays authoritative. Custom plants remain first-class.
  private readonly catalog = inject(PlantCatalogFacade);
  protected readonly query = signal('');

  /** Typed bridge for the native input event — keeps `$any` out of templates. */
  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
  protected readonly selectedPresetId = signal<string | null>(null);

  private readonly ranked = this.catalog.recommendSync(this.data.garden, this.data.plants);

  protected readonly cards = computed<readonly PlantRecommendation[]>(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) {
      return this.ranked.slice(0, 8); // best matches for this garden
    }
    return this.ranked.filter(
      (r) =>
        r.preset.commonName.toLowerCase().includes(q) ||
        r.preset.scientificName.toLowerCase().includes(q),
    );
  });

  protected applyPreset(rec: PlantRecommendation): void {
    this.selectedPresetId.set(rec.preset.id);
    this.form.patchValue({
      plantName: rec.preset.commonName,
      species: rec.preset.scientificName,
      plantType: rec.preset.plantType,
      surfaceAreaRequired: rec.preset.suggestedArea,
      idealHumidityLevel: rec.preset.suggestedHumidity,
    });
    this.form.markAsDirty();
  }

  protected fitBadge(rec: PlantRecommendation): string {
    if (!rec.fitsAvailableArea) {
      return $localize`Needs ${rec.preset.suggestedArea}:area: m²`;
    }
    if (rec.humidityMatch === 'excellent') {
      return $localize`Excellent fit`;
    }
    if (rec.humidityMatch === 'good') {
      return $localize`Good fit`;
    }
    return $localize`Prefers ${rec.preset.suggestedHumidity}:humidity:% humidity`;
  }

  // ── Live preview: always derived from the ACTUAL form values, so custom
  // plants get the same treatment as catalog picks (generic artwork fallback).
  private readonly nameValue = toSignal(this.form.controls.plantName.valueChanges, {
    initialValue: this.form.controls.plantName.value,
  });
  private readonly speciesValue = toSignal(this.form.controls.species.valueChanges, {
    initialValue: this.form.controls.species.value,
  });
  private readonly typeValue = toSignal(this.form.controls.plantType.valueChanges, {
    initialValue: this.form.controls.plantType.value,
  });

  protected readonly previewPlant = computed(() => ({
    plantId: 0,
    plantName: this.nameValue() || $localize`New plant`,
    species: this.speciesValue() || '',
    plantType: this.typeValue(),
  }));

  /** Writes through the control — the overcrowding check still applies live. */
  protected applyAreaPreset(value: number): void {
    this.form.controls.surfaceAreaRequired.setValue(value);
    this.form.controls.surfaceAreaRequired.markAsDirty();
  }

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

  /** What this form currently asks for (never negative for display purposes). */
  protected readonly requires = computed(() => Math.max(0, this.requestedArea() ?? 0));

  /** m² left in the garden after saving this form as-is (negative = overcrowded). */
  protected readonly remainingAfterSave = computed(() => this.capacityLeft() - this.requires());

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
      plantationDate: toPlantationDate(raw.plantationDate),
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
