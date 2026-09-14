import { Plant } from '../../../core/api/models';

/** What the screens show for a plant type; the value sent to the API stays its own. */
export const PLANT_TYPE_LABEL: Readonly<Record<Plant['plantType'], string>> = {
  vegetable: $localize`vegetable`,
  fruit: $localize`fruit`,
  flower: $localize`flower`,
};
