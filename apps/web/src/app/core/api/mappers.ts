/**
 * DTO → domain mappers — pure functions.
 * The seam where generated clients would plug in on a larger contract (ADR-006).
 */

import { GardenDto, PlantDto, UserDto } from './dtos';
import { Garden, Plant, UserProfile } from './models';

export function mapToGarden(dto: GardenDto): Garden {
  return {
    gardenId: dto.gardenId,
    gardenName: dto.gardenName,
    totalSurfaceArea: dto.totalSurfaceArea,
    targetHumidityLevel: dto.targetHumidityLevel,
    locationDescription: dto.locationDescription ?? null,
    latitude: dto.latitude ?? null,
    longitude: dto.longitude ?? null,
    ownerId: dto.userId ?? null,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function mapToPlant(dto: PlantDto): Plant {
  return {
    plantId: dto.plantId,
    plantName: dto.plantName,
    species: dto.species,
    plantType: dto.plantType,
    plantationDate: dto.plantationDate,
    surfaceAreaRequired: dto.surfaceAreaRequired,
    idealHumidityLevel: dto.idealHumidityLevel,
    gardenId: dto.gardenId,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function mapToUserProfile(dto: UserDto): UserProfile {
  return {
    userId: dto.userId,
    emailAddress: dto.emailAddress,
    firstName: dto.firstName ?? null,
    lastName: dto.lastName ?? null,
    age: dto.age ?? null,
  };
}
