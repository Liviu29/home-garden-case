import type { Meta, StoryObj } from '@storybook/angular';
import { Garden, Plant } from '../../../core/api/models';
import { CapacityStatusChip } from './capacity-status';

const garden: Garden = {
  gardenId: 1,
  gardenName: 'Back Garden',
  totalSurfaceArea: 20,
  targetHumidityLevel: 55,
  locationDescription: null,
  latitude: null,
  longitude: null,
  createdAt: '',
  updatedAt: '',
};

/** One bed taking `area` of the garden's 20 m². */
const bed = (area: number): Plant => ({
  plantId: 1,
  plantName: 'Tomato',
  species: 'Solanum lycopersicum',
  plantType: 'vegetable',
  plantationDate: '2026-04-01T00:00:00.000Z',
  surfaceAreaRequired: area,
  idealHumidityLevel: 60,
  gardenId: 1,
  createdAt: '',
  updatedAt: '',
});

/** A garden's capacity status on the shared badge — the thresholds the dashboard uses. */
const meta: Meta<CapacityStatusChip> = {
  title: 'Capacity/CapacityStatus',
  component: CapacityStatusChip,
  args: { garden },
};
export default meta;

type Story = StoryObj<CapacityStatusChip>;

/** 40% in use. */
export const Healthy: Story = { args: { plants: [bed(8)] } };
/** 75% in use. */
export const Approaching: Story = { args: { plants: [bed(15)] } };
/** 95% in use: the dashboard asks for attention from 90%. */
export const AlmostFull: Story = { args: { plants: [bed(19)] } };
/** Every m² in use: the next plant is refused. */
export const Full: Story = { args: { plants: [bed(20)] } };
