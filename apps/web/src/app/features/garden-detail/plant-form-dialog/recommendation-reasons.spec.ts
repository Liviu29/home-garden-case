import { reasonText } from './recommendation-reasons';

describe('recommendation reasons, in words', () => {
  it('says each reason with its numbers', () => {
    expect(reasonText({ kind: 'humidity-close', humidity: 45, target: 45 })).toBe(
      'Close humidity match (45% vs 45% target)',
    );
    expect(reasonText({ kind: 'humidity-near', delta: 12 })).toBe(
      'Reasonable humidity match (±12%)',
    );
    expect(reasonText({ kind: 'humidity-off', humidity: 45, delta: 35 })).toBe(
      'Prefers 45% humidity — 35% off your target',
    );
    expect(reasonText({ kind: 'fits', available: 10 })).toBe('Fits the 10 m² still free');
    expect(reasonText({ kind: 'too-big', area: 1, available: 0.5 })).toBe(
      'Needs 1 m² — only 0.5 m² free',
    );
    expect(reasonText({ kind: 'already-planted' })).toBe('Already growing in this garden');
  });
});
