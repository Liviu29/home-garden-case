import { Garden, Plant } from '../../core/api/models';

/**
 * Pure domain math — the primary unit-test target.
 * Mirrors the backend's overcrowding rule in plant.service.ts — same numbers,
 * same comparison, changed together or not at all.
 */

export function usedSurfaceArea(plants: readonly Plant[]): number {
  return plants.reduce((sum, plant) => sum + plant.surfaceAreaRequired, 0);
}

export function freeSurfaceArea(garden: Garden, plants: readonly Plant[]): number {
  return Math.max(0, garden.totalSurfaceArea - usedSurfaceArea(plants));
}

export function occupancyRatio(garden: Garden, plants: readonly Plant[]): number {
  if (garden.totalSurfaceArea <= 0) {
    return 0;
  }
  return usedSurfaceArea(plants) / garden.totalSurfaceArea;
}

/**
 * Client-side mirror of the server's overcrowding validation. `excludePlantId`
 * matches the server's update semantics (the plant's own area doesn't count
 * against itself).
 */
export function wouldOvercrowd(
  garden: Garden,
  plants: readonly Plant[],
  requestedArea: number,
  excludePlantId?: number,
): boolean {
  const otherArea = usedSurfaceArea(plants.filter((p) => p.plantId !== excludePlantId));
  return otherArea + requestedArea > garden.totalSurfaceArea;
}

/** Remaining m² available to a plant (its own current area excluded on edit). */
export function remainingCapacity(
  garden: Garden,
  plants: readonly Plant[],
  excludePlantId?: number,
): number {
  const otherArea = usedSurfaceArea(plants.filter((p) => p.plantId !== excludePlantId));
  return Math.max(0, garden.totalSurfaceArea - otherArea);
}

/** Average ideal humidity of a garden's plants; null when the garden is empty. */
export function averageHumidity(plants: readonly Plant[]): number | null {
  if (plants.length === 0) {
    return null;
  }
  return plants.reduce((sum, p) => sum + p.idealHumidityLevel, 0) / plants.length;
}

/**
 * Signed drift for ONE plant: what it wants minus what the garden targets.
 * Same comparison the garden-level aggregate uses, in one place — the detail
 * table, the map inspector and the map's plot chips all read it from here.
 */
export function plantHumidityDelta(garden: Garden, plant: Plant): number {
  return plant.idealHumidityLevel - garden.targetHumidityLevel;
}

/** Signed drift between what plants want and what the garden targets. */
export function humidityDelta(garden: Garden, plants: readonly Plant[]): number | null {
  const avg = averageHumidity(plants);
  return avg === null ? null : avg - garden.targetHumidityLevel;
}

/**
 * Garden-edit guard: would setting a new total surface area leave
 * the garden below what its plants already use? The server permits this
 * (no capacity check on garden update — see API-INTEGRATION.md proposal #7),
 * so the client warns rather than blocks.
 */
export function wouldShrinkBelowUsed(plants: readonly Plant[], newTotalArea: number): boolean {
  return newTotalArea < usedSurfaceArea(plants);
}

/**
 * Semantic capacity status — UI-ONLY visualization thresholds, not business
 * rules (the only business rule is the server's strict `>` overcrowding check).
 */
export type CapacityStatus = 'healthy' | 'approaching' | 'almost-full' | 'full';

export const CAPACITY_STATUS_LABEL: Readonly<Record<CapacityStatus, string>> = {
  healthy: 'Healthy capacity',
  approaching: 'Approaching capacity',
  'almost-full': 'Almost full',
  full: 'Full',
};

export function capacityStatus(garden: Garden, plants: readonly Plant[]): CapacityStatus {
  const ratio = occupancyRatio(garden, plants);
  if (ratio >= 1) {
    return 'full';
  }
  if (ratio >= 0.9) {
    return 'almost-full';
  }
  if (ratio >= 0.7) {
    return 'approaching';
  }
  return 'healthy';
}

/** Attention thresholds used by the dashboard (DESIGN-SYSTEM §6). */
export const ATTENTION_OCCUPANCY_RATIO = 0.9;
export const ATTENTION_HUMIDITY_DRIFT = 15;

interface GardenAttention {
  readonly nearCapacity: boolean;
  readonly humidityDrift: boolean;
}

export function gardenAttention(garden: Garden, plants: readonly Plant[]): GardenAttention {
  const delta = humidityDelta(garden, plants);
  return {
    nearCapacity: occupancyRatio(garden, plants) >= ATTENTION_OCCUPANCY_RATIO,
    humidityDrift: delta !== null && Math.abs(delta) > ATTENTION_HUMIDITY_DRIFT,
  };
}
