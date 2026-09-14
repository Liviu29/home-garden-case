import type { Garden, Plant } from '../../core/api/models';
import type { PlantPreset } from '../catalog/plant-catalog';
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
  /** Why it scores as it does — truthful, and the card's to put into words. */
  readonly reasons: readonly RecommendationReason[];
}

/** One ingredient of a score, with the numbers a sentence about it needs. */
export type RecommendationReason =
  | { readonly kind: 'humidity-close'; readonly humidity: number; readonly target: number }
  | { readonly kind: 'humidity-near'; readonly delta: number }
  | { readonly kind: 'humidity-off'; readonly humidity: number; readonly delta: number }
  | { readonly kind: 'fits'; readonly available: number }
  | { readonly kind: 'too-big'; readonly area: number; readonly available: number }
  | { readonly kind: 'already-planted' };

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

  const reasons: RecommendationReason[] = [];
  if (humidityMatch === 'excellent') {
    reasons.push({
      kind: 'humidity-close',
      humidity: preset.suggestedHumidity,
      target: garden.targetHumidityLevel,
    });
  } else if (humidityMatch === 'good') {
    reasons.push({ kind: 'humidity-near', delta: humidityDelta });
  } else {
    reasons.push({
      kind: 'humidity-off',
      humidity: preset.suggestedHumidity,
      delta: humidityDelta,
    });
  }
  reasons.push(
    fitsAvailableArea
      ? { kind: 'fits', available: round1(availableArea) }
      : { kind: 'too-big', area: preset.suggestedArea, available: round1(availableArea) },
  );
  if (alreadyPlanted) {
    reasons.push({ kind: 'already-planted' });
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
