import { moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';
import { Plant } from '../../../core/api/models';
import { PlantArtworkDefs } from './plant-artwork-defs';
import { PlantThumb } from './plant-thumb';

type ThumbPlant = Pick<Plant, 'plantId' | 'plantName' | 'species' | 'plantType'>;

const plants: readonly ThumbPlant[] = [
  { plantId: 1, plantName: 'Tomato', species: 'Solanum lycopersicum', plantType: 'vegetable' },
  { plantId: 2, plantName: 'Strawberry', species: 'Fragaria × ananassa', plantType: 'fruit' },
  { plantId: 3, plantName: 'Rose', species: 'Rosa', plantType: 'flower' },
  { plantId: 4, plantName: 'Lettuce', species: 'Lactuca sativa', plantType: 'vegetable' },
  { plantId: 5, plantName: 'Lavender', species: 'Lavandula angustifolia', plantType: 'flower' },
  // No keyword matches: the artwork falls back to the plant's type.
  { plantId: 6, plantName: 'Mystery bed', species: 'Planta ignota', plantType: 'fruit' },
];

/**
 * The botanical artwork the planner draws, as the plants table and the
 * inspector show it. The symbols are defined once per page
 * (PlantArtworkDefs) and referenced by every thumbnail.
 */
const meta: Meta<PlantThumb> = {
  title: 'Plants/PlantThumb',
  component: PlantThumb,
  decorators: [moduleMetadata({ imports: [PlantArtworkDefs] })],
};
export default meta;

type Story = StoryObj<PlantThumb>;

export const Single: Story = {
  args: { plant: plants[0] },
  render: (args) => ({
    props: args,
    template: `<app-plant-artwork-defs /><app-plant-thumb [plant]="plant" />`,
  }),
};

export const Gallery: Story = {
  render: () => ({
    props: { plants },
    template: `
      <app-plant-artwork-defs />
      <ul style="display: flex; flex-wrap: wrap; gap: 1rem; list-style: none; margin: 0; padding: 0">
        @for (plant of plants; track plant.plantId) {
          <li style="display: grid; justify-items: center; gap: 0.25rem; --thumb-size: 3rem">
            <app-plant-thumb [plant]="plant" />
            <span>{{ plant.plantName }}</span>
          </li>
        }
      </ul>`,
  }),
};
