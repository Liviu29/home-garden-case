import { Garden, Plant } from './models';
import { gardenInputOf, plantInputOf } from './write-payloads';

/** An undone delete writes the entity back: only what the API accepts, nothing it assigns. */
describe('domain → write payload', () => {
  const garden: Garden = {
    gardenId: 3,
    gardenName: 'Back Garden',
    totalSurfaceArea: 20,
    targetHumidityLevel: 55,
    locationDescription: 'Behind the shed',
    latitude: 51.05,
    longitude: 3.72,
    ownerId: 7,
    createdAt: 'x',
    updatedAt: 'y',
  };
  const plant: Plant = {
    plantId: 9,
    plantName: 'Tomato',
    species: 'Solanum lycopersicum',
    plantType: 'vegetable',
    plantationDate: '2026-04-01T00:00:00.000Z',
    surfaceAreaRequired: 2,
    idealHumidityLevel: 60,
    gardenId: 3,
    createdAt: 'x',
    updatedAt: 'y',
  };

  it('a garden keeps its fields; id, owner and timestamps stay with the server', () => {
    expect(gardenInputOf(garden)).toEqual({
      gardenName: 'Back Garden',
      totalSurfaceArea: 20,
      targetHumidityLevel: 55,
      locationDescription: 'Behind the shed',
      latitude: 51.05,
      longitude: 3.72,
    });
  });

  it('a plant stays in its own garden unless it is given another', () => {
    expect(plantInputOf(plant)).toEqual({
      plantName: 'Tomato',
      species: 'Solanum lycopersicum',
      plantType: 'vegetable',
      plantationDate: '2026-04-01T00:00:00.000Z',
      surfaceAreaRequired: 2,
      idealHumidityLevel: 60,
      gardenId: 3,
    });
    expect(plantInputOf(plant, 12).gardenId).toBe(12);
  });
});
