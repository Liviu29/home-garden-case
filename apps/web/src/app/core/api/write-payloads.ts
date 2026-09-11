/**
 * Domain → write payload — pure functions, the other direction from mappers.ts.
 * An undone delete writes the entity back with them: only what the API
 * accepts, nothing it assigns (ids, owner, timestamps).
 *
 * A module of their own on purpose: mappers.ts ships in the first load (the
 * session check uses it), and only the lazily loaded stores need these.
 */

import { Garden, GardenInput, Plant, PlantInput } from './models';

export function gardenInputOf(garden: Garden): GardenInput {
  return {
    gardenName: garden.gardenName,
    totalSurfaceArea: garden.totalSurfaceArea,
    targetHumidityLevel: garden.targetHumidityLevel,
    locationDescription: garden.locationDescription,
    latitude: garden.latitude,
    longitude: garden.longitude,
  };
}

/** `gardenId` moves the plant into another garden (a garden that was re-created). */
export function plantInputOf(plant: Plant, gardenId: number = plant.gardenId): PlantInput {
  return {
    plantName: plant.plantName,
    species: plant.species,
    plantType: plant.plantType,
    plantationDate: plant.plantationDate,
    surfaceAreaRequired: plant.surfaceAreaRequired,
    idealHumidityLevel: plant.idealHumidityLevel,
    gardenId,
  };
}
