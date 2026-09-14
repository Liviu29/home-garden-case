/**
 * Counts inside sentences built in code. Templates use ICU plurals; a
 * `$localize` message cannot hold one, so the singular is a message of its own
 * and the sentence takes the phrase as a placeholder.
 */
export const pointsCount = (count: number): string =>
  count === 1 ? $localize`1 point` : $localize`${count}:count: points`;

export const plantsCount = (count: number): string =>
  count === 1 ? $localize`1 plant` : $localize`${count}:count: plants`;

export const bedsCount = (count: number): string =>
  count === 1 ? $localize`1 bed` : $localize`${count}:count: beds`;

export const plantedGardensCount = (count: number): string =>
  count === 1 ? $localize`1 planted garden` : $localize`${count}:count: planted gardens`;
