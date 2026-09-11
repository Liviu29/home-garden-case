import type { Meta, StoryObj } from '@storybook/angular';
import { CapacityBar } from './capacity-bar';

/** Used m² against the garden's total; the colour follows the capacity status. */
const meta: Meta<CapacityBar> = {
  title: 'Capacity/CapacityBar',
  component: CapacityBar,
  decorators: [
    (story) => ({ ...story(), styles: [':host { display: block; max-width: 22rem; }'] }),
  ],
  argTypes: {
    used: { control: { type: 'range', min: 0, max: 24, step: 0.5 } },
  },
};
export default meta;

type Story = StoryObj<CapacityBar>;

export const Healthy: Story = { args: { used: 7.5, total: 20 } };
export const AlmostFull: Story = { args: { used: 18.6, total: 20 } };
export const Full: Story = { args: { used: 20, total: 20 } };
export const Empty: Story = { args: { used: 0, total: 12 } };
export const WithoutLabel: Story = { args: { used: 9, total: 20, showLabel: false } };
