import { WATERING_ZONE_ORDER } from '../../../domain/garden-planner/garden-planner';
import {
  WATERING_ZONE_LABEL,
  WATERING_ZONE_LEGEND,
  WATERING_ZONE_RANGE,
} from './watering-zone-labels';

describe('watering zone labels', () => {
  it('name every zone the domain defines, in the domain’s order', () => {
    expect(WATERING_ZONE_LEGEND.map((z) => z.zone)).toEqual([...WATERING_ZONE_ORDER]);
    for (const { zone, label, range } of WATERING_ZONE_LEGEND) {
      expect(label).toBe(WATERING_ZONE_LABEL[zone]);
      expect(range).toBe(WATERING_ZONE_RANGE[zone]);
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
