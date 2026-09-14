import type { GardenDto, PlantDto, UserDto } from './dtos';
import { mapToGarden, mapToPlant, mapToUserProfile } from './mappers';

/**
 * The DTO→domain seam (ADR-006). Its whole job is to normalise the optional
 * fields the backend may omit or send as null into a domain shape where
 * "absent" is exactly one value: `null`. Anything downstream that branches on
 * `?? null` depends on this being true.
 */
describe('DTO → domain mappers', () => {
  const gardenDto: GardenDto = {
    gardenId: 1,
    gardenName: 'Backyard',
    totalSurfaceArea: 20,
    targetHumidityLevel: 55,
    locationDescription: 'behind the shed',
    latitude: 51.05,
    longitude: 3.72,
    userId: 4,
    createdAt: '2026-04-01 00:00:00',
    updatedAt: '2026-04-02 00:00:00',
  };

  it('copies a fully-populated garden across verbatim, its owner as ownerId', () => {
    expect(mapToGarden(gardenDto)).toEqual({
      gardenId: 1,
      gardenName: 'Backyard',
      totalSurfaceArea: 20,
      targetHumidityLevel: 55,
      locationDescription: 'behind the shed',
      latitude: 51.05,
      longitude: 3.72,
      ownerId: 4,
      createdAt: '2026-04-01 00:00:00',
      updatedAt: '2026-04-02 00:00:00',
    });
  });

  it('reads a garden without an owner as shared (ownerId null)', () => {
    const shared = { ...gardenDto };
    delete (shared as Partial<GardenDto>).userId;
    expect(mapToGarden(shared).ownerId).toBeNull();
  });

  it('normalises every optional garden field to null when omitted', () => {
    const sparse = { ...gardenDto };
    delete (sparse as Partial<GardenDto>).locationDescription;
    delete (sparse as Partial<GardenDto>).latitude;
    delete (sparse as Partial<GardenDto>).longitude;

    const garden = mapToGarden(sparse);
    expect(garden.locationDescription).toBeNull();
    expect(garden.latitude).toBeNull();
    expect(garden.longitude).toBeNull();
  });

  it('keeps a real zero coordinate rather than nulling it (0 is falsy but valid)', () => {
    const atNullIsland = mapToGarden({ ...gardenDto, latitude: 0, longitude: 0 });
    expect(atNullIsland.latitude).toBe(0);
    expect(atNullIsland.longitude).toBe(0);
  });

  it('maps a plant across verbatim', () => {
    const dto: PlantDto = {
      plantId: 7,
      plantName: 'Tomato',
      species: 'Solanum lycopersicum',
      plantType: 'vegetable',
      plantationDate: '2026-04-01T00:00:00.000Z',
      surfaceAreaRequired: 2.5,
      idealHumidityLevel: 65,
      gardenId: 1,
      createdAt: '2026-04-01 00:00:00',
      updatedAt: '2026-04-01 00:00:00',
    };
    expect(mapToPlant(dto)).toEqual(dto);
  });

  it('normalises optional profile fields to null', () => {
    const dto: UserDto = {
      userId: 9,
      emailAddress: 'someone@example.com',
      createdAt: '',
      updatedAt: '',
    };

    expect(mapToUserProfile(dto)).toEqual({
      userId: 9,
      emailAddress: 'someone@example.com',
      firstName: null,
      lastName: null,
      age: null,
    });
  });

  it('keeps age 0 rather than nulling it', () => {
    const dto = {
      userId: 9,
      emailAddress: 'a@b.c',
      firstName: 'A',
      lastName: 'B',
      age: 0,
      createdAt: '',
      updatedAt: '',
    } as UserDto;
    expect(mapToUserProfile(dto).age).toBe(0);
  });

  it('drops fields the domain does not model (createdAt/updatedAt on a profile)', () => {
    const dto = {
      userId: 1,
      emailAddress: 'a@b.c',
      firstName: 'A',
      lastName: 'B',
      age: 30,
      createdAt: 'x',
      updatedAt: 'y',
    } as UserDto;
    expect(Object.keys(mapToUserProfile(dto)).sort()).toEqual([
      'age',
      'emailAddress',
      'firstName',
      'lastName',
      'userId',
    ]);
  });
});
