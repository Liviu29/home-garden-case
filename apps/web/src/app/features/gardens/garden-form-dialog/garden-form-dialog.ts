import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  FormField,
  form,
  max,
  maxLength,
  min,
  required,
  schema,
  submit,
  validate,
  validateTree,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSliderModule } from '@angular/material/slider';
import type { Garden, GardenInput } from '../../../core/api/models';
import {
  GARDEN_SIZE_PRESETS,
  TARGET_HUMIDITY_PRESETS,
} from '../../../shared/ui/value-presets/product-defaults';
import { ValuePresets } from '../../../shared/ui/value-presets/value-presets';
import {
  usedSurfaceArea,
  wouldShrinkBelowUsed,
} from '../../../domain/garden-insights/garden-insights';
import { GardensStore } from '../../../state/gardens-store/gardens-store';
import { PlantsIndexStore } from '../../../state/plants-index-store/plants-index-store';

interface GardenFormData {
  readonly garden: Garden | null;
}

/** What the form edits. A number field the user empties reads as null, which `required` refuses. */
export interface GardenModel {
  gardenName: string;
  totalSurfaceArea: number | null;
  targetHumidityLevel: number;
  locationDescription: string;
  latitude: number | null;
  longitude: number | null;
}

/** Every rule the form knows. Mirrors apps/api/src/app/schemas/garden.schema.ts — change together. */
const gardenSchema = schema<GardenModel>((g) => {
  required(g.gardenName, { message: $localize`Garden name is required` });
  maxLength(g.gardenName, 80);
  // Spaces alone are not a name; the input is trimmed on submit.
  validate(g.gardenName, ({ value }) =>
    value().length > 0 && value().trim().length === 0
      ? { kind: 'whitespace', message: $localize`Garden name is required` }
      : undefined,
  );
  required(g.totalSurfaceArea, { message: $localize`Surface area is required` });
  min(g.totalSurfaceArea, 0, { message: $localize`Surface area can't be negative` });
  required(g.targetHumidityLevel);
  min(g.targetHumidityLevel, 0);
  max(g.targetHumidityLevel, 100);
  min(g.latitude, -90, { message: $localize`Between −90 and 90` });
  max(g.latitude, 90, { message: $localize`Between −90 and 90` });
  min(g.longitude, -180, { message: $localize`Between −180 and 180` });
  max(g.longitude, 180, { message: $localize`Between −180 and 180` });
  // The backend's refine: both coordinates, or neither — a rule of the whole form.
  validateTree(g, ({ value }) => {
    const { latitude, longitude } = value();
    return (latitude === null) === (longitude === null)
      ? undefined
      : {
          kind: 'coordinatesTogether',
          message: $localize`Provide both latitude and longitude, or leave both empty.`,
        };
  });
});

/**
 * Create/edit garden dialog, on Signal Forms: the model is a signal, the
 * rules are a schema, and everything the screen derives — the live shrink
 * warning, the preset highlights, the errors — is a computed over them.
 * Server verdicts render inline.
 */
@Component({
  selector: 'app-garden-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
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
  private readonly ref = inject(MatDialogRef<GardenFormDialog>);
  private readonly data = inject<GardenFormData>(MAT_DIALOG_DATA);
  protected readonly store = inject(GardensStore);

  private readonly plantsIndex = inject(PlantsIndexStore);

  protected readonly isEdit = this.data.garden !== null;
  protected readonly title = this.isEdit ? $localize`Edit garden` : $localize`New garden`;
  protected readonly submitLabel = this.isEdit ? $localize`Save changes` : $localize`Create garden`;
  /** Announced (visually hidden) while the create/update is in flight. */
  protected readonly pendingLabel = this.isEdit
    ? $localize`Updating garden`
    : $localize`Creating garden`;
  protected readonly serverError = signal<string | null>(null);

  constructor() {
    // Shrink-warning needs this garden's plants; loads through the SWR cache,
    // so a warm cache costs nothing.
    const existing = this.data.garden;
    if (existing) {
      this.plantsIndex.ensureForGardens([existing.gardenId]);
    }
  }

  protected readonly model = signal<GardenModel>({
    gardenName: this.data.garden?.gardenName ?? '',
    totalSurfaceArea: this.data.garden?.totalSurfaceArea ?? 20,
    targetHumidityLevel: this.data.garden?.targetHumidityLevel ?? 50,
    locationDescription: this.data.garden?.locationDescription ?? '',
    latitude: this.data.garden?.latitude ?? null,
    longitude: this.data.garden?.longitude ?? null,
  });

  protected readonly f = form(this.model, gardenSchema);

  // ── Quick presets (product defaults, not backend rules) ──────────────────
  protected readonly sizePresets = GARDEN_SIZE_PRESETS;
  protected readonly humidityPresets = TARGET_HUMIDITY_PRESETS;

  protected readonly currentArea = computed(() => this.model().totalSurfaceArea);
  protected readonly currentHumidity = computed(() => this.model().targetHumidityLevel);

  /** Writes through the field, so every rule still applies. */
  protected applyAreaPreset(value: number): void {
    this.f.totalSurfaceArea().value.set(value);
    this.f.totalSurfaceArea().markAsDirty();
  }

  protected applyHumidityPreset(value: number): void {
    this.f.targetHumidityLevel().value.set(value);
    this.f.targetHumidityLevel().markAsDirty();
  }

  /** The form-wide coordinates rule, once either coordinate has been touched. */
  protected readonly coordinatesError = computed(() => {
    const touched = this.f.latitude().touched() || this.f.longitude().touched();
    return touched ? (this.f().getError('coordinatesTogether')?.message ?? null) : null;
  });

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
    return wouldShrinkBelowUsed(plants, this.model().totalSurfaceArea ?? 0);
  });

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.submit();
  }

  /**
   * `submit()` marks every field touched and runs the action only when the
   * form is valid. The store is single-flight, so a second submit while one
   * is in flight joins it.
   */
  protected submit(): Promise<boolean> {
    this.serverError.set(null);
    return submit(this.f, async () => {
      const raw = this.model();
      const input: GardenInput = {
        gardenName: raw.gardenName.trim(),
        totalSurfaceArea: raw.totalSurfaceArea ?? 0,
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
        // The server verdict is authoritative — render it inline, verbatim.
        this.serverError.set(result.error.message);
      }
      return undefined;
    });
  }
}
