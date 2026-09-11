import type { Meta, StoryObj } from '@storybook/angular';
import { EmptyState } from './empty-state';

/** The designed empty, error and not-found states: a heading, a sentence, one way forward. */
const meta: Meta<EmptyState> = {
  title: 'States/EmptyState',
  component: EmptyState,
  render: (args) => ({
    props: args,
    template: `
      <app-empty-state [title]="title" [message]="message" [headingLevel]="headingLevel">
        <button type="button" class="press-feedback">Create a garden</button>
      </app-empty-state>
    `,
  }),
  argTypes: { headingLevel: { control: 'inline-radio', options: [1, 2, 3] } },
};
export default meta;

type Story = StoryObj<EmptyState>;

export const NoGardens: Story = {
  args: {
    title: 'No gardens yet',
    message: 'Create your first garden to start planning beds, plants and humidity targets.',
    headingLevel: 2,
  },
};

export const LoadFailed: Story = {
  args: {
    title: "Couldn't load the overview",
    message: 'The greenhouse network is acting up. Give it another try.',
    headingLevel: 2,
  },
};

export const NotFound: Story = {
  args: {
    title: 'Garden not found',
    message: 'It may have been deleted, or the link is out of date.',
    headingLevel: 1,
  },
};
