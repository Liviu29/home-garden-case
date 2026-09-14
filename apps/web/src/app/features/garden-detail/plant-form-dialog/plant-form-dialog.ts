import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe, formatNumber } from '@angular/common';
import {
  FormField,
  form,
  max,
  min,
  required,
  schema,
  submit,
  validate,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { type Garden, PLANT_TYPES, type Plant, type PlantInput } from '../../../core/api/models';
import { PlantCatalogFacade } from '../../../core/catalog/plant-catalog-facade';
import { PLANT_AREA_PRESETS } from '../../../shared/ui/value-presets/product-defaults';
import { CapacityBar } from '../../../shared/ui/capacity-bar/capacity-bar';
import { PlantThumb } from '../../../shared/ui/plant-visuals/plant-thumb';
import { PLANT_TYPE_LABEL } from '../../../shared/ui/plant-visuals/plant-type-label';
import { ValuePresets } from '../../../shared/ui/value-presets/value-presets';
import type { PlantRecommendation } from '../../../domain/plant-recommendation/plant-recommendation';
import { reasonsText } from './recommendation-reasons';
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
}

/** What the form edits. A number field the user empties reads as null, which `required` refuses. */
export interface PlantModel {
  plantName: string;
  species: string;
  plantType: Plant['plantType'];
  plantationDate: Date | null;
  surfaceAreaRequired: number | null;
  idealHumidityLevel: number;
}

/**
 * Every rule the form knows. Mirrors apps/api/src/app/schemas/plant.schema.ts
 * — change together. The capacity rule is here too, as a validator on the
 * area field: the client-side mirror of the server's verdict, which stays
 * authoritative and renders inline when it arrives.
 */
const plantSchema = (data: PlantFormData, formatArea: (m2: number) => string) =>
  schema<PlantModel>((p) => {
    required(p.plantName, { message: $localize`Plant name is required` });
    required(p.species, { message: $localize`Species is required` });
    required(p.plantType);
    required(p.plantationDate, { message: $localize`Plantation date is required` });
    required(p.surfaceAreaRequired, { message: $localize`Surface area is required` });
    min(p.surfaceAreaRequired, 0, { message: $localize`Surface area can't be negative` });
    validate(p.surfaceAreaRequired, ({ value }) => {
      const requested = value() ?? 0;
      if (!wouldOvercrowd(data.garden, data.plants, requested, data.plant?.plantId)) {
        return undefined;
      }
      const available = remainingCapacity(data.garden, data.plants, data.plant?.plantId);
      return {
        kind: 'overcrowded',
        message: $localize`This plant requires ${formatArea(requested)}:required: m², but only ${formatArea(available)}:available: m² is available in this garden.`,
      };
    });
    required(p.idealHumidityLevel);
    min(p.idealHumidityLevel, 0);
    max(p.idealHumidityLevel, 100);
  });

/**
 * Create/edit plant dialog — the validation showcase, on Signal Forms: the
 * model is a signal, the rules (the capacity rule included) are a schema,
 * and the live garden-fit meter, the preview and the errors are computeds
 * over them. The server verdict stays authoritative and renders inline on 400.
 */
@Component({
  selector: 'app-plant-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
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
  private readonly ref = inject(MatDialogRef<PlantFormDialog>);
  private readonly locale = inject(LOCALE_ID);
  protected readonly data = inject<PlantFormData>(MAT_DIALOG_DATA);
  /** The garden screen's route-scoped store, reached through the dialog's injector. */
  protected readonly store = inject(GardenDetailStore);

  protected readonly isEdit = this.data.plant !== null;
  protected readonly heading = this.isEdit ? $localize`Edit plant` : $localize`Add a plant`;
  protected readonly submitLabel = this.isEdit ? $localize`Save changes` : $localize`Add plant`;
  /** Announced while the save is in flight. */
  protected readonly pendingLabel = this.isEdit ? $localize`Saving plant` : $localize`Planting`;
  protected readonly plantTypes = PLANT_TYPES;
  /** What the type select shows; the value sent stays the API's own. */
  protected readonly plantTypeLabels = PLANT_TYPE_LABEL;
  protected readonly serverError = signal<string | null>(null);

  protected readonly model = signal<PlantModel>({
    plantName: this.data.plant?.plantName ?? '',
    species: this.data.plant?.species ?? '',
    plantType: this.data.plant?.plantType ?? 'vegetable',
    plantationDate: this.data.plant
      ? fromPlantationDate(this.data.plant.plantationDate)
      : new Date(),
    surfaceAreaRequired: this.data.plant?.surfaceAreaRequired ?? 1,
    idealHumidityLevel: this.data.plant?.idealHumidityLevel ?? 50,
  });

  protected readonly f = form(
    this.model,
    plantSchema(this.data, (m2) => formatNumber(m2, this.locale, '1.0-2')),
  );

  /** Convenience quick-picks (product defaults, not botany, not backend rules). */
  protected readonly areaPresets = PLANT_AREA_PRESETS;
  protected readonly currentArea = computed(() => this.model().surfaceAreaRequired);

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
    this.model.update((m) => ({
      ...m,
      plantName: rec.preset.commonName,
      species: rec.preset.scientificName,
      plantType: rec.preset.plantType,
      surfaceAreaRequired: rec.preset.suggestedArea,
      idealHumidityLevel: rec.preset.suggestedHumidity,
    }));
    this.f().markAsDirty();
  }

  /** The card’s reasons, in words. */
  protected readonly reasonsOf = reasonsText;

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
  protected readonly previewPlant = computed(() => ({
    plantId: 0,
    plantName: this.model().plantName || $localize`New plant`,
    species: this.model().species,
    plantType: this.model().plantType,
  }));

  /** Writes through the field — the overcrowding rule still applies live. */
  protected applyAreaPreset(value: number): void {
    this.f.surfaceAreaRequired().value.set(value);
    this.f.surfaceAreaRequired().markAsDirty();
  }

  /** m² the rest of the garden leaves for this plant (self excluded on edit). */
  protected readonly capacityLeft = computed(() =>
    remainingCapacity(this.data.garden, this.data.plants, this.data.plant?.plantId),
  );

  /** The capacity rule's verdict on what the form asks for, from the schema. */
  protected readonly overcrowdedMessage = computed(
    () => this.f.surfaceAreaRequired().getError('overcrowded')?.message ?? null,
  );
  protected readonly overcrowds = computed(() => this.overcrowdedMessage() !== null);

  /** The area field's own error, if any — the capacity verdict has a place of its own. */
  protected readonly areaError = computed(
    () =>
      this.f
        .surfaceAreaRequired()
        .errors()
        .find((e) => e.kind !== 'overcrowded') ?? null,
  );

  /** What this form currently asks for (never negative for display purposes). */
  protected readonly requires = computed(() => Math.max(0, this.model().surfaceAreaRequired ?? 0));

  /** Occupancy preview: other plants' area + what this form currently asks for. */
  protected readonly previewUsed = computed(() => {
    const others = usedSurfaceArea(
      this.data.plants.filter((p) => p.plantId !== this.data.plant?.plantId),
    );
    return others + this.requires();
  });

  /** m² left in the garden after saving this form as-is (negative = overcrowded). */
  protected readonly remainingAfterSave = computed(() => this.capacityLeft() - this.requires());

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.submit();
  }

  /**
   * `submit()` marks every field touched and runs the action only when the
   * form is valid — the capacity rule included. The store is single-flight,
   * so a second submit while one is in flight joins it.
   */
  protected submit(): Promise<boolean> {
    this.serverError.set(null);
    return submit(this.f, async () => {
      const raw = this.model();
      const input: PlantInput = {
        plantName: raw.plantName.trim(),
        species: raw.species.trim(),
        plantType: raw.plantType,
        plantationDate: toPlantationDate(raw.plantationDate ?? new Date()),
        surfaceAreaRequired: raw.surfaceAreaRequired ?? 0,
        idealHumidityLevel: raw.idealHumidityLevel,
        gardenId: this.data.garden.gardenId,
      };

      const existing = this.data.plant;
      const result = existing
        ? await this.store.updatePlant(existing.plantId, input)
        : await this.store.createPlant(input);

      if (result.ok) {
        this.ref.close(true);
      } else if (result.error.kind !== 'technical') {
        // The server verdict is authoritative — render it inline, verbatim.
        this.serverError.set(result.error.message);
      }
      return undefined;
    });
  }
}
