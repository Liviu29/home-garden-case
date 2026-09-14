import type {
  PlantRecommendation,
  RecommendationReason,
} from '../../../domain/plant-recommendation/plant-recommendation';

/** One reason, as the catalog card says it. */
export function reasonText(reason: RecommendationReason): string {
  switch (reason.kind) {
    case 'humidity-close':
      return $localize`Close humidity match (${reason.humidity}:humidity:% vs ${reason.target}:target:% target)`;
    case 'humidity-near':
      return $localize`Reasonable humidity match (±${reason.delta}:delta:%)`;
    case 'humidity-off':
      return $localize`Prefers ${reason.humidity}:humidity:% humidity — ${reason.delta}:delta:% off your target`;
    case 'fits':
      return $localize`Fits the ${reason.available}:available: m² still free`;
    case 'too-big':
      return $localize`Needs ${reason.area}:area: m² — only ${reason.available}:available: m² free`;
    case 'already-planted':
      return $localize`Already growing in this garden`;
  }
}

/** Every reason behind a recommendation, in the order the score weighs them. */
export function reasonsText(rec: PlantRecommendation): readonly string[] {
  return rec.reasons.map(reasonText);
}
