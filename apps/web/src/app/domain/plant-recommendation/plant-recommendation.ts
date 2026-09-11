import { Garden, Plant } from '../../core/api/models';
import { PlantPreset } from '../catalog/plant-catalog';
import { remainingCapacity } from '../garden-insights/garden-insights';

/**
 * Deterministic, transparent recommendation scoring.
 * No machine learning, no fake percentages — three explainable ingredients:
 *
 *   1. humidity match  — how close the preset's ideal humidity sits to the
 *                        garden's configured target (0–60 pts)
 *   2. area fit        — whether the suggested footprint fits the remaining
 *                        capacity (30 pts; a preset that doesn't fit is
 *                        never hidden, it's labeled)
 *   3. variety bonus   — a species not already planted keeps the garden
 *                        interesting (10 pts)
 *
 * Pure function of (preset, garden, plants) — unit-tested, reproducible.
 */

export interface PlantRecommendation {
  readonly preset: PlantPreset;
  readonly score: number;
  /** |preset humidity − garden target| in percentage points. */
  readonly humidityDelta: number;
  readonly humidityMatch: 'excellent' | 'good' | 'off';
  readonly fitsAvailableArea: boolean;
  /** m² still free for this plant right now. */
  readonly availableArea: number;
  readonly alreadyPlanted: boolean;
  /** Human-readable, truthful reasons shown on the card. */
  readonly reasons: readonly string[];
}

export function calculatePlantRecommendation(
  preset: PlantPreset,
  garden: Garden,
  plants: readonly Plant[],
): PlantRecommendation {
  const availableArea = remainingCapacity(garden, plants);
  const humidityDelta = Math.abs(preset.suggestedHumidity - garden.targetHumidityLevel);
  const humidityMatch = humidityDelta <= 7 ? 'excellent' : humidityDelta <= 15 ? 'good' : 'off';
  const fitsAvailableArea = preset.suggestedArea <= availableArea;
  const alreadyPlanted = plants.some(
    (p) =>
      p.plantName.toLowerCase() === preset.commonName.toLowerCase() ||
      p.species.toLowerCase() === preset.scientificName.toLowerCase(),
  );

  const humidityScore = Math.max(0, 60 - humidityDelta * 2);
  const fitScore = fitsAvailableArea ? 30 : 0;
  const varietyScore = alreadyPlanted ? 0 : 10;

  const reasons: string[] = [];
  if (humidityMatch === 'excellent') {
    reasons.push(
      $localize`Close humidity match (${preset.suggestedHumidity}:humidity:% vs ${garden.targetHumidityLevel}:target:% target)`,
    );
  } else if (humidityMatch === 'good') {
    reasons.push($localize`Reasonable humidity match (±${humidityDelta}:delta:%)`);
  } else {
    reasons.push(
      $localize`Prefers ${preset.suggestedHumidity}:humidity:% humidity — ${humidityDelta}:delta:% off your target`,
    );
  }
  reasons.push(
    fitsAvailableArea
      ? $localize`Fits the ${round1(availableArea)}:available: m² still free`
      : $localize`Needs ${preset.suggestedArea}:area: m² — only ${round1(availableArea)}:available: m² free`,
  );
  if (alreadyPlanted) {
    reasons.push($localize`Already growing in this garden`);
  }

  return {
    preset,
    score: humidityScore + fitScore + varietyScore,
    humidityDelta,
    humidityMatch,
    fitsAvailableArea,
    availableArea,
    alreadyPlanted,
    reasons,
  };
}

/** Rank a catalog for one garden: best matches first, stable order on ties. */
export function rankCatalog(
  catalog: readonly PlantPreset[],
  garden: Garden,
  plants: readonly Plant[],
): readonly PlantRecommendation[] {
  return catalog
    .map((preset) => calculatePlantRecommendation(preset, garden, plants))
    .sort((a, b) => b.score - a.score || a.preset.commonName.localeCompare(b.preset.commonName));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
