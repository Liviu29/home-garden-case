import type { Meta, StoryObj } from '@storybook/angular';
import { ValuePresets } from './value-presets';

/** One-tap values for a form field; the chip matching the current value is marked. */
const meta: Meta<ValuePresets> = {
  title: 'Forms/ValuePresets',
  component: ValuePresets,
};
export default meta;

type Story = StoryObj<ValuePresets>;

const HUMIDITY = [
  { label: 'Dry', value: 40, description: '40%' },
  { label: 'Balanced', value: 60, description: '60%', recommended: true },
  { label: 'Humid', value: 80, description: '80%' },
];

export const Humidity: Story = { args: { label: 'Target humidity', options: HUMIDITY, value: 60 } };

export const NothingSelected: Story = {
  args: { label: 'Target humidity', options: HUMIDITY, value: 55 },
};

export const Sizes: Story = {
  args: {
    label: 'Surface area',
    options: [
      { label: 'Balcony', value: 4, description: '4 m²' },
      { label: 'Raised bed', value: 8, description: '8 m²' },
      { label: 'Back garden', value: 25, description: '25 m²', recommended: true },
    ],
    value: null,
  },
};
