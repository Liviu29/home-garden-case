import { Garden, Plant } from '../../../core/api/models';
import { computeGardenMapLayout } from '../../../domain/garden-map-layout/garden-map-layout';
import {
  buildPlotViews,
  dimensionsFor,
  emptyZonesFor,
  frameContent,
  freeHintFor,
  ghostBedFor,
  sameBox,
  sameSize,
} from './garden-map-view';

const garden: Garden = {
  gardenId: 1,
  gardenName: 'Sunny Backyard',
  totalSurfaceArea: 20,
  targetHumidityLevel: 60,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
};

const plant = (plantId: number, area: number, plantName: string, humidity = 55): Plant => ({
  plantId,
  plantName,
  species: 'Species',
  plantType: 'vegetable',
  plantationDate: '2026-04-01T00:00:00.000Z',
  surfaceAreaRequired: area,
  idealHumidityLevel: humidity,
  gardenId: 1,
  createdAt: '',
  updatedAt: '',
});

/** The Garden Map's pure view model — geometry the SVG template draws, no Angular. */
describe('garden map view model', () => {
  describe('the camera frame', () => {
    it('is the garden itself until the stage has been measured', () => {
      expect(frameContent({ width: 8, height: 5 }, null)).toEqual({
        width: 8,
        height: 5,
        x: 0,
        y: 0,
      });
    });

    it("takes the stage's shape and keeps the garden inside it, clear of the control bands", () => {
      const box = frameContent({ width: 8, height: 5 }, { width: 800, height: 500 });

      expect(box.width / box.height).toBeCloseTo(800 / 500, 9);
      expect(box.x).toBeLessThan(0);
      expect(box.y).toBeLessThan(0);
      expect(box.x + box.width).toBeGreaterThan(8);
      expect(box.y + box.height).toBeGreaterThan(5);
    });

    it('compares sizes and boxes by value, so an unchanged frame does not recompute', () => {
      expect(sameSize(null, null)).toBe(true);
      expect(sameSize({ width: 1, height: 2 }, { width: 1, height: 2 })).toBe(true);
      expect(sameSize({ width: 1, height: 2 }, null)).toBe(false);
      expect(
        sameBox({ width: 1, height: 2, x: 0, y: 0 }, { width: 1, height: 2, x: 0, y: 0 }),
      ).toBe(true);
      expect(
        sameBox({ width: 1, height: 2, x: 0, y: 0 }, { width: 1, height: 2, x: 0, y: 1 }),
      ).toBe(false);
    });
  });

  describe('beds', () => {
    it('shortens a name that does not fit its bed, and keeps the full name for the label text', () => {
      const name = 'An extraordinarily long cultivar name for a tiny bed';
      const plants = [plant(1, 0.5, name)];

      const [view] = buildPlotViews(computeGardenMapLayout(garden, plants), plants, garden);

      expect(view.label.endsWith('…')).toBe(true);
      expect(view.label.length).toBeLessThan(name.length);
      expect(view.fullLabel).toBe(name);
      expect(view.aria.startsWith(name)).toBe(true);
    });

    it('sets the soil inside the wooden frame', () => {
      const plants = [plant(1, 5, 'Boxwood')];
      const [view] = buildPlotViews(computeGardenMapLayout(garden, plants), plants, garden);

      expect(view.soil.x).toBeGreaterThan(view.x);
      expect(view.soil.y).toBeGreaterThan(view.y);
      expect(view.soil.x + view.soil.w).toBeLessThan(view.x + view.w);
      expect(view.soil.y + view.soil.h).toBeLessThan(view.y + view.h);
    });

    it('still draws a bed whose plant is missing from the list, in the garden-target zone', () => {
      const layout = computeGardenMapLayout(garden, [plant(1, 4, 'Basil', 85)]);

      const [view] = buildPlotViews(layout, [], garden);

      expect(view.humidityDelta).toBe(0);
      expect(view.zone).toBe('balanced'); // the garden's own 60% target
      expect(view.veg.length).toBeGreaterThan(0);
    });

    it('measures the bed in hand for its dimension lines', () => {
      const plants = [plant(1, 6, 'Tomato')];
      const [view] = buildPlotViews(computeGardenMapLayout(garden, plants), plants, garden);

      const d = dimensionsFor(view, 5.6);

      expect([d.w, d.h]).toEqual([view.w, view.h]);
      expect(d.w * d.h).toBeCloseTo(6, 9);
      expect(d.left.transform).toContain('rotate(-90');
    });
  });

  describe('the free-soil annotation', () => {
    const surface = { width: 10, height: 6 };

    it('writes along a wide open spot', () => {
      expect(freeHintFor(surface, { x: 0, y: 0, w: 6, h: 2 }).kind).toBe('label');
    });

    it('turns to run along a tall, narrow one', () => {
      expect(freeHintFor(surface, { x: 0, y: 0, w: 0.6, h: 5 }).kind).toBe('label-vertical');
    });

    it('becomes a small marker where no label fits, so even a sliver is visible', () => {
      const hint = freeHintFor(surface, { x: 1, y: 1, w: 0.3, h: 0.3 });
      expect(hint).toEqual({ kind: 'marker', cx: 1.15, cy: 1.15, fs: expect.any(Number) });
      expect(hint.fs).toBeGreaterThan(0);
    });

    it('marks three planting zones across the open ground of an empty garden', () => {
      const zones = emptyZonesFor({ x: 0, y: 0, w: 8, h: 4 });
      expect(zones.map((z) => z.cx)).toEqual([8 * 0.24, 8 * 0.5, 8 * 0.76]);
      expect(zones.every((z) => z.cy === 2 && z.r > 0)).toBe(true);
    });
  });

  describe('the creation ghost', () => {
    it('keeps the requested area and sits low in the garden when there is no open spot', () => {
      const ghost = ghostBedFor(4, { width: 10, height: 6 }, null);

      expect(ghost.w * ghost.h).toBeCloseTo(4, 9);
      expect(ghost.x + ghost.w / 2).toBeCloseTo(5, 9);
      expect(ghost.y + ghost.h / 2).toBeCloseTo(6 * 0.72, 9);
    });

    it('shrinks to fit a small open spot, centred in it', () => {
      const ghost = ghostBedFor(4, { width: 10, height: 6 }, { x: 0, y: 0, w: 2, h: 1 });

      expect(ghost.w).toBeLessThanOrEqual(1.8 + 1e-9);
      expect(ghost.h).toBeLessThanOrEqual(0.9 + 1e-9);
      expect(ghost.x + ghost.w / 2).toBeCloseTo(1, 9);
      expect(ghost.y + ghost.h / 2).toBeCloseTo(0.5, 9);
    });
  });
});
