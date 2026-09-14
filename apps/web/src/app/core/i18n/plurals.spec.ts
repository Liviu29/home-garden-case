import { bedsCount, plantedGardensCount, plantsCount, pointsCount } from './plurals';

describe('counts inside sentences built in code', () => {
  it('says exactly one in the singular', () => {
    expect(pointsCount(1)).toBe('1 point');
    expect(plantsCount(1)).toBe('1 plant');
    expect(bedsCount(1)).toBe('1 bed');
    expect(plantedGardensCount(1)).toBe('1 planted garden');
  });

  it('says none and many in the plural', () => {
    expect(pointsCount(0)).toBe('0 points');
    expect(plantsCount(12)).toBe('12 plants');
    expect(bedsCount(3)).toBe('3 beds');
    expect(plantedGardensCount(0)).toBe('0 planted gardens');
  });
});
