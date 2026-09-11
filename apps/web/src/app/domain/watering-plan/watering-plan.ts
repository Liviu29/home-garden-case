import { Garden, Plant } from '../../core/api/models';
import {
  WATERING_ZONES,
  WateringZone,
  plantingDay,
  wateringZone,
} from '../garden-planner/garden-planner';

/**
 * Watering plan: which beds need water today.
 *
 * A rule of thumb built from data the app already has, not a moisture
 * reading. A plant's watering zone (from its ideal humidity) sets how often
 * it is watered, and its planting date sets the rhythm, so the plan is the
 * same on every device and needs no stored "last watered" state. A plant
 * still establishing its roots is watered every day.
 */

/** Days between waterings for an established plant. */
export const WATERING_INTERVAL_DAYS: Readonly<Record<WateringZone, number>> = {
  humid: 1,
  balanced: 2,
  dry: 4,
};

/** A plant younger than this many days is watered daily. */
export const ESTABLISHING_DAYS = 14;

/** The rhythm's anchor for a plant whose planting date cannot be read. */
const UNKNOWN_PLANTING_DAY = '1970-01-01';

const DAY_MS = 86_400_000;

/** The user's local calendar day as 'YYYY-MM-DD'. */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole days from one 'YYYY-MM-DD' to another; negative when `to` comes first. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

type WateredPlant = Pick<Plant, 'plantationDate' | 'idealHumidityLevel'>;

/** Days since planting; negative for a plant that is not in the ground yet. */
function ageInDays(plant: WateredPlant, today: string): number {
  return daysBetween(plantingDay(plant.plantationDate) ?? UNKNOWN_PLANTING_DAY, today);
}

/** Planted, and still young enough to be watered every day. */
export function isEstablishing(plant: WateredPlant, today: string): boolean {
  const age = ageInDays(plant, today);
  return age >= 0 && age < ESTABLISHING_DAYS;
}

/**
 * Days until the plant next needs water; 0 means today. A plant that is not
 * in the ground yet is first watered on its planting day. An unreadable date
 * still gets a rhythm, so a real bed is never left out of the plan.
 */
export function daysUntilWatering(plant: WateredPlant, today: string): number {
  const age = ageInDays(plant, today);
  if (age < 0) {
    return -age;
  }
  if (age < ESTABLISHING_DAYS) {
    return 0;
  }
  const interval = WATERING_INTERVAL_DAYS[wateringZone(plant.idealHumidityLevel)];
  const sinceLast = age % interval;
  return sinceLast === 0 ? 0 : interval - sinceLast;
}

export interface ZoneWatering {
  readonly zone: WateringZone;
  readonly label: string;
  readonly plants: number;
  /** m² of beds to water in this zone. */
  readonly area: number;
}

export interface WateringPlan {
  /** Zones with something to water today, dry → humid. */
  readonly dueToday: readonly ZoneWatering[];
  readonly plantsDue: number;
  /** m² to water today. */
  readonly areaDue: number;
  /** Of the plants due, how many are due because they are newly planted. */
  readonly establishing: number;
  /** Days until the next watering (0 = today); null for a garden without plants. */
  readonly nextInDays: number | null;
}

/** One garden's watering for `today` ('YYYY-MM-DD', the user's local day). */
export function wateringPlan(
  plants: readonly (WateredPlant & Pick<Plant, 'surfaceAreaRequired'>)[],
  today: string,
): WateringPlan {
  const due = plants.filter((p) => daysUntilWatering(p, today) === 0);
  const areaOf = (list: readonly Pick<Plant, 'surfaceAreaRequired'>[]) =>
    list.reduce((sum, p) => sum + p.surfaceAreaRequired, 0);

  const dueToday = WATERING_ZONES.map(({ zone, label }) => {
    const members = due.filter((p) => wateringZone(p.idealHumidityLevel) === zone);
    return { zone, label, plants: members.length, area: areaOf(members) };
  }).filter((z) => z.plants > 0);

  return {
    dueToday,
    plantsDue: due.length,
    areaDue: areaOf(due),
    establishing: due.filter((p) => isEstablishing(p, today)).length,
    nextInDays:
      plants.length === 0 ? null : Math.min(...plants.map((p) => daysUntilWatering(p, today))),
  };
}

export interface GardenWatering {
  readonly garden: Garden;
  readonly plan: WateringPlan;
}

export interface WateringRound {
  /** Gardens with something to water today, most area first. */
  readonly due: readonly GardenWatering[];
  /** Planted gardens with nothing due today, soonest first. */
  readonly later: readonly GardenWatering[];
  readonly plantsDue: number;
}

/**
 * Today's round across gardens. A garden without plants — or whose plants
 * have not arrived — is in neither list.
 */
export function wateringRound(
  gardens: readonly Garden[],
  plantsByGarden: Readonly<Record<number, readonly Plant[]>>,
  today: string,
): WateringRound {
  const rows = gardens.map((garden) => ({
    garden,
    plan: wateringPlan(plantsByGarden[garden.gardenId] ?? [], today),
  }));
  const due = rows
    .filter((r) => r.plan.plantsDue > 0)
    .sort((a, b) => b.plan.areaDue - a.plan.areaDue);
  const later = rows
    .filter((r) => r.plan.plantsDue === 0 && r.plan.nextInDays !== null)
    .sort((a, b) => (a.plan.nextInDays as number) - (b.plan.nextInDays as number));
  return { due, later, plantsDue: due.reduce((sum, r) => sum + r.plan.plantsDue, 0) };
}
