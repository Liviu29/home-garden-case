import type { Meta, StoryObj } from '@storybook/angular';
import { PageHeader } from './page-header';

/** A page's title, one-line subtitle and primary action. */
const meta: Meta<PageHeader> = {
  title: 'Layout/PageHeader',
  component: PageHeader,
  render: (args) => ({
    props: args,
    template: `
      <app-page-header [title]="title" [subtitle]="subtitle">
        <button type="button" class="press-feedback">＋ New garden</button>
      </app-page-header>
    `,
  }),
};
export default meta;

type Story = StoryObj<PageHeader>;

export const Gardens: Story = {
  args: { title: 'Gardens', subtitle: 'Every plot linked to your account, at a glance.' },
};

export const TitleOnly: Story = { args: { title: 'Dashboard', subtitle: '' } };
