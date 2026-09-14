import {
  WATERING_ZONE_ORDER,
  type WateringZone,
} from '../../../domain/garden-planner/garden-planner';

/**
 * What the screens call each watering zone. The zones themselves — and which
 * humidity falls in which — are the domain's (`wateringZone`); their names
 * are the UI's, so the domain stays free of text and the words live once.
 */
export const WATERING_ZONE_LABEL: Readonly<Record<WateringZone, string>> = {
  dry: $localize`Dry`,
  balanced: $localize`Balanced`,
  humid: $localize`Humid`,
};

/** The humidity band each zone covers, as a legend shows it. */
export const WATERING_ZONE_RANGE: Readonly<Record<WateringZone, string>> = {
  dry: $localize`under 50%`,
  balanced: $localize`50–69%`,
  humid: $localize`70% and up`,
};

/** The legend, dry → humid. */
export const WATERING_ZONE_LEGEND: readonly {
  readonly zone: WateringZone;
  readonly label: string;
  readonly range: string;
}[] = WATERING_ZONE_ORDER.map((zone) => ({
  zone,
  label: WATERING_ZONE_LABEL[zone],
  range: WATERING_ZONE_RANGE[zone],
}));
