import { Garden, Plant } from '../../core/api/models';
import { filterAndSortGardens } from './garden-view';

const garden = (id: number, name: string, area = 20, location: string | null = null): Garden => ({
  gardenId: id,
  gardenName: name,
  totalSurfaceArea: area,
  targetHumidityLevel: 50,
  locationDescription: location,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
});

const plants = (gardenId: number, area: number): Plant[] => [
  {
    plantId: gardenId * 100,
    plantName: 'p',
    species: 's',
    plantType: 'vegetable',
    plantationDate: '2026-04-01T00:00:00.000Z',
    surfaceAreaRequired: area,
    idealHumidityLevel: 50,
    gardenId,
    createdAt: '',
    updatedAt: '',
  },
];

describe('filterAndSortGardens (toolbar view logic)', () => {
  const backyard = garden(1, 'Backyard', 30, 'behind the house');
  const patio = garden(2, 'Herb Patio', 8);
  const rooftop = garden(3, 'Rooftop', 20);

  it('matches on name and location, case-insensitively', () => {
    const all = [backyard, patio, rooftop];
    expect(filterAndSortGardens(all, {}, 'PATIO', 'name')).toEqual([patio]);
    expect(filterAndSortGardens(all, {}, 'behind the', 'name')).toEqual([backyard]);
    expect(filterAndSortGardens(all, {}, '', 'name')).toHaveLength(3);
  });

  it('sorts by name alphabetically and by size descending', () => {
    const all = [rooftop, backyard, patio];
    expect(filterAndSortGardens(all, {}, '', 'name').map((g) => g.gardenName)).toEqual([
      'Backyard',
      'Herb Patio',
      'Rooftop',
    ]);
    expect(filterAndSortGardens(all, {}, '', 'size').map((g) => g.totalSurfaceArea)).toEqual([
      30, 20, 8,
    ]);
  });

  it('sorts by utilization with unknown (not-yet-loaded) gardens LAST, never as 0%', () => {
    const byGarden = {
      1: plants(1, 3), // 10%
      2: plants(2, 6), // 75%
      // rooftop (3): plants not loaded yet → unknown
    };
    const sorted = filterAndSortGardens([backyard, patio, rooftop], byGarden, '', 'utilization');
    expect(sorted.map((g) => g.gardenId)).toEqual([2, 1, 3]);
  });

  it('does not mutate the input array', () => {
    const all = [rooftop, backyard];
    filterAndSortGardens(all, {}, '', 'name');
    expect(all[0]).toBe(rooftop);
  });
});
