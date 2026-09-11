/**
 * Frontend domain models: plain names; DTOs live in dtos.ts.
 * Mapped from API DTOs in mappers.ts — components and stores only ever see these.
 */

export type PlantType = 'vegetable' | 'fruit' | 'flower';

export const PLANT_TYPES: readonly PlantType[] = ['vegetable', 'fruit', 'flower'];

export interface Garden {
  readonly gardenId: number;
  readonly gardenName: string;
  /** m² */
  readonly totalSurfaceArea: number;
  /** 0–100, configurable per garden (case requirement) */
  readonly targetHumidityLevel: number;
  readonly locationDescription: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Plant {
  readonly plantId: number;
  readonly plantName: string;
  readonly species: string;
  readonly plantType: PlantType;
  /** ISO datetime */
  readonly plantationDate: string;
  /** m² */
  readonly surfaceAreaRequired: number;
  /** 0–100 */
  readonly idealHumidityLevel: number;
  readonly gardenId: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UserProfile {
  readonly userId: number;
  readonly emailAddress: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly age: number | null;
}

// ── Write payloads ───────────────────────────────────────────────────────────

export interface GardenInput {
  readonly gardenName: string;
  readonly totalSurfaceArea: number;
  readonly targetHumidityLevel: number;
  readonly locationDescription?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
}

export interface PlantInput {
  readonly plantName: string;
  readonly species: string;
  readonly plantType: PlantType;
  readonly plantationDate: string;
  readonly surfaceAreaRequired: number;
  readonly idealHumidityLevel: number;
  readonly gardenId: number;
}

export interface UserProfileInput {
  readonly emailAddress: string;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly age?: number | null;
}
