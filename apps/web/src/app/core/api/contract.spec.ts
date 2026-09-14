import {
  createGardenSchema,
  createPlantSchema,
  createUserSchema,
  gardenResponseSchema,
  plantResponseSchema,
  userResponseSchema,
} from '@itp-home-garden/api-contract';
import type { GardenDto, PlantDto, UserDto } from './dtos';
import { mapToGarden, mapToPlant, mapToUserProfile } from './mappers';
import type { GardenInput, PlantInput, UserProfileInput } from './models';

/**
 * The client's types are inferred from the API's zod schemas, so a shape
 * drift is a compile error. These specs close the remaining gap: a value
 * the client builds against those types is one the API's own validators
 * accept, and a value the API answers with is one the mappers understand.
 */
describe('the API contract, as the client uses it', () => {
  const gardenDto: GardenDto = {
    gardenId: 1,
    gardenName: 'Backyard',
    totalSurfaceArea: 20,
    targetHumidityLevel: 55,
    locationDescription: null,
    latitude: 51.05,
    longitude: 3.72,
    userId: null,
    createdAt: '2026-09-01 08:00:00',
    updatedAt: '2026-09-01 08:00:00',
  };
  const plantDto: PlantDto = {
    plantId: 3,
    plantName: 'Tomato',
    species: 'Solanum lycopersicum',
    plantType: 'vegetable',
    plantationDate: '2026-04-01T00:00:00.000Z',
    surfaceAreaRequired: 2,
    idealHumidityLevel: 60,
    gardenId: 1,
    createdAt: '',
    updatedAt: '',
  };
  const userDto: UserDto = {
    userId: 7,
    emailAddress: 'liviu@example.com',
    firstName: 'Liviu',
    lastName: null,
    age: 33,
    createdAt: '',
    updatedAt: '',
  };

  it('answers the API can give are answers the mappers read', () => {
    expect(gardenResponseSchema.safeParse(gardenDto).success).toBe(true);
    expect(plantResponseSchema.safeParse(plantDto).success).toBe(true);
    expect(userResponseSchema.safeParse(userDto).success).toBe(true);

    expect(mapToGarden(gardenDto).ownerId).toBeNull();
    expect(mapToPlant(plantDto).plantType).toBe('vegetable');
    expect(mapToUserProfile(userDto).lastName).toBeNull();
  });

  it('what the client sends is what the API accepts', () => {
    const garden: GardenInput = {
      gardenName: 'Bed',
      totalSurfaceArea: 12,
      targetHumidityLevel: 55,
      locationDescription: null,
      latitude: null,
      longitude: null,
    };
    const plant: PlantInput = {
      plantName: 'Basil',
      species: 'Ocimum basilicum',
      plantType: 'vegetable',
      plantationDate: '2026-04-01T00:00:00.000Z',
      surfaceAreaRequired: 0.5,
      idealHumidityLevel: 60,
      gardenId: 1,
    };
    const user: UserProfileInput = { emailAddress: 'maya@example.com', firstName: 'Maya', age: 29 };

    expect(createGardenSchema.safeParse(garden).success).toBe(true);
    expect(createPlantSchema.safeParse(plant).success).toBe(true);
    expect(createUserSchema.safeParse(user).success).toBe(true);
  });

  it('the rules the client mirrors are the API’s rules', () => {
    // Both coordinates or neither — the garden form's validateTree.
    expect(createGardenSchema.safeParse({ ...gardenDto, longitude: null }).success).toBe(false);
    // Age is a whole positive number — the profile forms' integer check.
    expect(createUserSchema.safeParse({ ...userDto, age: 1.5 }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...userDto, age: 0 }).success).toBe(false);
  });
});
