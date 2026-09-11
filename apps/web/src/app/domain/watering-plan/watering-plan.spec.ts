import { Garden, Plant } from '../../core/api/models';
import {
  ESTABLISHING_DAYS,
  daysBetween,
  daysUntilWatering,
  isEstablishing,
  localDay,
  wateringPlan,
  wateringRound,
} from './watering-plan';

const TODAY = '2026-09-11';

/** A plant planted on `day` ('YYYY-MM-DD') with the given ideal humidity. */
const bed = (day: string, humidity: number, area = 1) => ({
  plantationDate: `${day}T00:00:00.000Z`,
  idealHumidityLevel: humidity,
  surfaceAreaRequired: area,
});

const HUMID = 80;
const BALANCED = 60;
const DRY = 40;

describe('watering plan (a rule of thumb from zone and planting date)', () => {
  describe('calendar days', () => {
    it('formats the local day with padding', () => {
      expect(localDay(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    });

    it('counts whole days, backwards too', () => {
      expect(daysBetween('2026-09-01', TODAY)).toBe(10);
      expect(daysBetween(TODAY, '2026-09-01')).toBe(-10);
      expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // across a DST switch
    });
  });

  describe('when a plant needs water', () => {
    it('an established humid bed is watered every day', () => {
      expect(daysUntilWatering(bed('2026-05-01', HUMID), TODAY)).toBe(0);
    });

    it('an established balanced bed every 2 days, counted from its planting day', () => {
      expect(daysUntilWatering(bed('2026-08-02', BALANCED), TODAY)).toBe(0); // 40 days
      expect(daysUntilWatering(bed('2026-08-01', BALANCED), TODAY)).toBe(1); // 41 days
    });

    it('an established dry bed every 4 days', () => {
      expect(daysUntilWatering(bed('2026-08-02', DRY), TODAY)).toBe(0); // 40 days
      expect(daysUntilWatering(bed('2026-08-01', DRY), TODAY)).toBe(3); // 41 days
      expect(daysUntilWatering(bed('2026-07-31', DRY), TODAY)).toBe(2); // 42 days
    });

    it(`a plant younger than ${ESTABLISHING_DAYS} days is watered daily, whatever its zone`, () => {
      expect(daysUntilWatering(bed(TODAY, DRY), TODAY)).toBe(0);
      expect(daysUntilWatering(bed('2026-08-29', DRY), TODAY)).toBe(0); // 13 days
      expect(isEstablishing(bed('2026-08-29', DRY), TODAY)).toBe(true);
      expect(isEstablishing(bed('2026-08-28', DRY), TODAY)).toBe(false); // 14 days
    });

    it('a plant not in the ground yet is first watered on its planting day', () => {
      expect(daysUntilWatering(bed('2026-09-15', HUMID), TODAY)).toBe(4);
      expect(isEstablishing(bed('2026-09-15', HUMID), TODAY)).toBe(false);
    });

    it('an unreadable planting date still gets a rhythm — the bed is never left out', () => {
      const unknown = { plantationDate: 'not a date', idealHumidityLevel: DRY };
      expect(daysUntilWatering(unknown, TODAY)).toBeGreaterThanOrEqual(0);
      expect(daysUntilWatering(unknown, TODAY)).toBeLessThan(4);
      expect(daysUntilWatering({ ...unknown, idealHumidityLevel: HUMID }, TODAY)).toBe(0);
    });
  });

  describe("a garden's plan", () => {
    it('groups what is due by zone, dry to humid, with counts and area', () => {
      const plan = wateringPlan(
        [
          bed('2026-05-01', HUMID, 2),
          bed('2026-05-01', HUMID, 1.5),
          bed('2026-08-02', DRY, 3),
          bed('2026-08-01', BALANCED, 4), // due tomorrow
          bed('2026-09-10', BALANCED, 0.5), // newly planted
        ],
        TODAY,
      );

      expect(plan.dueToday).toEqual([
        { zone: 'dry', label: 'Dry', plants: 1, area: 3 },
        { zone: 'balanced', label: 'Balanced', plants: 1, area: 0.5 },
        { zone: 'humid', label: 'Humid', plants: 2, area: 3.5 },
      ]);
      expect(plan.plantsDue).toBe(4);
      expect(plan.areaDue).toBe(7);
      expect(plan.establishing).toBe(1);
      expect(plan.nextInDays).toBe(0);
    });

    it('with nothing due today, says when the next watering is', () => {
      const plan = wateringPlan([bed('2026-08-01', DRY), bed('2026-08-01', BALANCED)], TODAY);
      expect(plan.dueToday).toEqual([]);
      expect(plan.plantsDue).toBe(0);
      expect(plan.areaDue).toBe(0);
      expect(plan.nextInDays).toBe(1);
    });

    it('a garden without plants has no plan', () => {
      expect(wateringPlan([], TODAY)).toEqual({
        dueToday: [],
        plantsDue: 0,
        areaDue: 0,
        establishing: 0,
        nextInDays: null,
      });
    });
  });

  describe('the round across gardens', () => {
    const garden = (id: number): Garden => ({
      gardenId: id,
      gardenName: `Garden ${id}`,
      totalSurfaceArea: 10,
      targetHumidityLevel: 50,
      locationDescription: null,
      latitude: null,
      longitude: null,
      createdAt: '',
      updatedAt: '',
    });
    const plant = (gardenId: number, day: string, humidity: number, area: number): Plant => ({
      plantId: gardenId * 10,
      plantName: 'p',
      species: 's',
      plantType: 'flower',
      gardenId,
      createdAt: '',
      updatedAt: '',
      ...bed(day, humidity, area),
    });

    it('due gardens by area, the rest by when they are next; unplanted gardens in neither', () => {
      const round = wateringRound(
        [garden(1), garden(2), garden(3), garden(4), garden(5), garden(6)],
        {
          1: [plant(1, '2026-05-01', HUMID, 1)], // due, 1 m²
          2: [plant(2, '2026-05-01', HUMID, 3)], // due, 3 m²
          3: [plant(3, '2026-08-01', DRY, 1)], // in 3 days
          4: [plant(4, '2026-08-01', BALANCED, 1)], // tomorrow
          5: [], // no plants
          // 6: its plants have not arrived
        },
        TODAY,
      );

      expect(round.due.map((r) => r.garden.gardenId)).toEqual([2, 1]);
      expect(round.later.map((r) => r.garden.gardenId)).toEqual([4, 3]);
      expect(round.plantsDue).toBe(2);
    });
  });
});
