import type { PlantPlot } from '../../../../domain/garden-map-layout/garden-map-layout';
import { buildPlanRows } from './plan-rows';

const plot = (plantId: number, label: string, x: number, y: number, w = 2, h = 2): PlantPlot => ({
  plantId,
  label,
  plantType: 'vegetable',
  requiredArea: w * h,
  share: (w * h) / 20,
  x,
  y,
  w,
  h,
});

describe('buildPlanRows (the plan in words)', () => {
  it('reads top to bottom, then left to right — to the centimetre, so float noise cannot reorder', () => {
    const rows = buildPlanRows(
      [plot(1, 'Right', 4, 0.000001), plot(2, 'Left', 0, 0), plot(3, 'Below', 0, 3)],
      () => undefined,
      60,
      {},
    );
    expect(rows.map((r) => r.name)).toEqual(['Left', 'Right', 'Below']);
  });

  it('names each bed’s neighbours (the beds close enough to share a watering pass)', () => {
    const rows = buildPlanRows(
      [plot(1, 'Tomato', 0, 0), plot(2, 'Basil', 2.1, 0), plot(3, 'Far', 9, 9)],
      () => undefined,
      60,
      {},
    );
    expect(rows.find((r) => r.name === 'Tomato')?.neighbours).toEqual(['Basil']);
    expect(rows.find((r) => r.name === 'Far')?.neighbours).toEqual([]);
  });

  it('the watering zone comes from the plant’s own humidity, else the garden’s target', () => {
    const rows = buildPlanRows(
      [plot(1, 'Cactus', 0, 0), plot(2, 'Fern', 5, 5), plot(3, 'Unknown', 9, 9)],
      (id) => ({ 1: 20, 2: 85 })[id],
      55,
      {},
    );
    const zone = (name: string) => rows.find((r) => r.name === name)?.zone;
    expect(zone('Cactus')).not.toBe(zone('Fern'));
    expect(zone('Unknown')).toBe(
      buildPlanRows([plot(4, 'Target', 0, 0)], () => 55, 55, {}).find(Boolean)?.zone,
    );
  });

  it('says which beds the gardener placed, with their size and position', () => {
    const [row] = buildPlanRows([plot(1, 'Tomato', 1.5, 2, 3, 1)], () => undefined, 60, {
      1: { x: 1.5, y: 2 },
    });
    expect(row).toMatchObject({
      plantId: 1,
      name: 'Tomato',
      x: 1.5,
      y: 2,
      width: 3,
      depth: 1,
      area: 3,
      placed: true,
    });
    expect(buildPlanRows([plot(1, 'Tomato', 0, 0)], () => undefined, 60, {})[0].placed).toBe(false);
  });
});
