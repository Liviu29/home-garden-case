import type { Meta, StoryObj } from '@storybook/angular';
import { StatusBadge } from './status-badge';

/** Text and colour together: the tone is never the only signal. */
const meta: Meta<StatusBadge & { text: string }> = {
  title: 'Status/StatusBadge',
  component: StatusBadge,
  render: (args) => ({
    props: args,
    template: `<app-status-badge [tone]="tone">{{ text }}</app-status-badge>`,
  }),
  argTypes: {
    tone: { control: 'inline-radio', options: ['success', 'neutral', 'warning', 'critical'] },
  },
};
export default meta;

type Story = StoryObj<StatusBadge & { text: string }>;

export const Healthy: Story = { args: { tone: 'success', text: 'Healthy' } };
export const NoPlantsYet: Story = { args: { tone: 'neutral', text: 'No plants yet' } };
export const AlmostFull: Story = { args: { tone: 'warning', text: 'Almost full' } };
export const Full: Story = { args: { tone: 'critical', text: 'Full' } };
