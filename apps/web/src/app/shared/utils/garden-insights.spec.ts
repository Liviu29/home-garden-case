import { Garden, Plant } from '../../core/api/models';
import {
  averageHumidity,
  freeSurfaceArea,
  gardenAttention,
  humidityDelta,
  occupancyRatio,
  remainingCapacity,
  usedSurfaceArea,
  wouldOvercrowd,
} from './garden-insights';

const garden = (overrides: Partial<Garden> = {}): Garden => ({
  gardenId: 1,
  gardenName: 'Test',
  totalSurfaceArea: 20,
  targetHumidityLevel: 50,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

const plant = (overrides: Partial<Plant> = {}): Plant => ({
  plantId: 1,
  plantName: 'Tomato',
  species: 'Solanum',
  plantType: 'vegetable',
  plantationDate: '2026-04-01T00:00:00.000Z',
  surfaceAreaRequired: 5,
  idealHumidityLevel: 60,
  gardenId: 1,
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

describe('garden insights (mirrors plant.service.ts server rules)', () => {
  describe('surface math', () => {
    it('sums used area and derives free area', () => {
      const plants = [
        plant({ surfaceAreaRequired: 5 }),
        plant({ plantId: 2, surfaceAreaRequired: 7.5 }),
      ];
      expect(usedSurfaceArea(plants)).toBe(12.5);
      expect(freeSurfaceArea(garden(), plants)).toBe(7.5);
      expect(occupancyRatio(garden(), plants)).toBeCloseTo(0.625);
    });

    it('free area never goes negative and zero-area gardens do not divide by zero', () => {
      const plants = [plant({ surfaceAreaRequired: 25 })];
      expect(freeSurfaceArea(garden(), plants)).toBe(0);
      expect(occupancyRatio(garden({ totalSurfaceArea: 0 }), plants)).toBe(0);
    });
  });

  describe('overcrowding mirror (same comparison as the server)', () => {
    const plants = [plant({ plantId: 1, surfaceAreaRequired: 12 })];

    it('accepts a plant that exactly fills the garden (strict > on the server)', () => {
      expect(wouldOvercrowd(garden(), plants, 8)).toBe(false);
    });

    it('rejects a plant that exceeds capacity', () => {
      expect(wouldOvercrowd(garden(), plants, 8.1)).toBe(true);
    });

    it('excludes the plant itself when editing (server update semantics)', () => {
      // Editing plant 1 from 12 up to 20 fits: its old area does not count against it.
      expect(wouldOvercrowd(garden(), plants, 20, 1)).toBe(false);
      expect(wouldOvercrowd(garden(), plants, 20.5, 1)).toBe(true);
      expect(remainingCapacity(garden(), plants, 1)).toBe(20);
      expect(remainingCapacity(garden(), plants)).toBe(8);
    });
  });

  describe('humidity insights', () => {
    it('averages plant humidity and reports drift vs the garden target', () => {
      const plants = [
        plant({ idealHumidityLevel: 60 }),
        plant({ plantId: 2, idealHumidityLevel: 80 }),
      ];
      expect(averageHumidity(plants)).toBe(70);
      expect(humidityDelta(garden(), plants)).toBe(20);
    });

    it('an empty garden has no humidity signal (not zero — unknown)', () => {
      expect(averageHumidity([])).toBeNull();
      expect(humidityDelta(garden(), [])).toBeNull();
    });
  });

  describe('attention thresholds (dashboard)', () => {
    it('flags near-capacity gardens at >= 90%', () => {
      expect(gardenAttention(garden(), [plant({ surfaceAreaRequired: 18 })]).nearCapacity).toBe(
        true,
      );
      expect(gardenAttention(garden(), [plant({ surfaceAreaRequired: 17.9 })]).nearCapacity).toBe(
        false,
      );
    });

    it('flags humidity drift beyond 15 points in either direction', () => {
      expect(gardenAttention(garden(), [plant({ idealHumidityLevel: 66 })]).humidityDrift).toBe(
        true,
      );
      expect(gardenAttention(garden(), [plant({ idealHumidityLevel: 34 })]).humidityDrift).toBe(
        true,
      );
      expect(gardenAttention(garden(), [plant({ idealHumidityLevel: 64 })]).humidityDrift).toBe(
        false,
      );
    });
  });
});
