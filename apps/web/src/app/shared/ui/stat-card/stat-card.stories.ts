import type { Meta, StoryObj } from '@storybook/angular';
import { StatCard } from './stat-card';

/** A dashboard KPI tile: value, label, context line, optional progress strip. */
const meta: Meta<StatCard> = {
  title: 'Dashboard/StatCard',
  component: StatCard,
  decorators: [
    (story) => ({ ...story(), styles: [':host { display: block; max-width: 18rem; }'] }),
  ],
};
export default meta;

type Story = StoryObj<StatCard>;

export const Plain: Story = {
  args: { value: 6, label: 'Gardens', context: '3 healthy · 3 need attention' },
};

export const WithProgress: Story = {
  args: {
    value: 72,
    suffix: '%',
    label: 'Utilization',
    context: '52.4 m² still available',
    progress: 0.72,
  },
};

export const ProgressWarning: Story = {
  args: {
    value: 94,
    suffix: '%',
    label: 'Utilization',
    context: '1.2 m² still available',
    progress: 0.94,
    progressWarn: true,
  },
};

/** While the plants arrive the number is a ghost, never a partial total. */
export const ValuePending: Story = {
  args: { value: 0, label: 'Plants growing', context: 'across 6 gardens', valuePending: true },
};
