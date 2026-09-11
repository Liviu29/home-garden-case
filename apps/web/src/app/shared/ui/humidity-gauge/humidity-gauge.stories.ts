import type { Meta, StoryObj } from '@storybook/angular';
import { HumidityGauge } from './humidity-gauge';

/** The plants' average humidity on a half dial, with the garden's target marked. */
const meta: Meta<HumidityGauge> = {
  title: 'Humidity/HumidityGauge',
  component: HumidityGauge,
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 100 } },
    target: { control: { type: 'range', min: 0, max: 100 } },
  },
};
export default meta;

type Story = StoryObj<HumidityGauge>;

export const OnTarget: Story = { args: { value: 61, target: 60 } };
export const TooDry: Story = { args: { value: 38, target: 65 } };
export const TooHumid: Story = { args: { value: 84, target: 55 } };
/** A garden without plants has no average: the dial says so. */
export const NoPlants: Story = { args: { value: null, target: 50 } };
