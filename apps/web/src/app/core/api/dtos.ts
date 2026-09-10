/**
 * API DTOs — hand-written mirrors of the backend zod contracts (ADR-006).
 * Source of truth: apps/api/src/app/schemas/*.schema.ts
 * Any contract change updates both sides in the same commit.
 */

import { PlantType } from './models';

/** Mirrors `gardenResponseSchema` (garden.schema.ts) */
export interface GardenDto {
  gardenId: number;
  gardenName: string;
  totalSurfaceArea: number;
  targetHumidityLevel: number;
  locationDescription?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors `plantResponseSchema` (plant.schema.ts) */
export interface PlantDto {
  plantId: number;
  plantName: string;
  species: string;
  plantType: PlantType;
  plantationDate: string;
  surfaceAreaRequired: number;
  idealHumidityLevel: number;
  gardenId: number;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors `userResponseSchema` (user.schema.ts) */
export interface UserDto {
  userId: number;
  emailAddress: string;
  firstName?: string | null;
  lastName?: string | null;
  age?: number | null;
  createdAt: string;
  updatedAt: string;
}
