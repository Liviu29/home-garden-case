import type { PlantPlot } from '../../../../domain/garden-map-layout/garden-map-layout';
import { findNeighbours, wateringZone } from '../../../../domain/garden-planner/garden-planner';
import type { LayoutPositions } from '../../../../state/garden-layout/garden-layout-repository';
import { WATERING_ZONE_LABEL } from '../../../../shared/ui/watering-zone/watering-zone-labels';
import type { PlanRow } from './map-plan-list';

/** Compared to the centimetre: layout maths leaves float noise that would
 * otherwise list a bed at "0 m down" after one at "0 m down" further right. */
const cm = (value: number): number => Math.round(value * 100);

/**
 * Every bed of an arrangement in words — position, size, watering zone and
 * the beds next to it (the same distance the clash check uses) — in reading
 * order, top to bottom, then left to right.
 */
export function buildPlanRows(
  plots: readonly PlantPlot[],
  humidityOf: (plantId: number) => number | undefined,
  targetHumidity: number,
  positions: LayoutPositions,
): readonly PlanRow[] {
  const neighbours = findNeighbours(plots);
  const names = new Map(plots.map((p) => [p.plantId, p.label]));
  return [...plots]
    .sort((a, b) => cm(a.y) - cm(b.y) || cm(a.x) - cm(b.x))
    .map((p) => ({
      plantId: p.plantId,
      name: p.label,
      x: p.x,
      y: p.y,
      width: p.w,
      depth: p.h,
      area: p.requiredArea,
      zone: WATERING_ZONE_LABEL[wateringZone(humidityOf(p.plantId) ?? targetHumidity)],
      placed: positions[p.plantId] !== undefined,
      neighbours: (neighbours.get(p.plantId) ?? []).map((id) => names.get(id) as string),
    }));
}
