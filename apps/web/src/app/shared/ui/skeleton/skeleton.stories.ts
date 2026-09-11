import type { Meta, StoryObj } from '@storybook/angular';
import { Skeleton } from './skeleton';
import { SkeletonGroup } from './skeleton-group';

/**
 * The one loading surface (ASYNC-UX.md): gray, content-shaped, no spinners.
 * The ghost appears after a short delay, so a fast answer never flashes it.
 */
const meta: Meta<Skeleton> = {
  title: 'States/Skeleton',
  component: Skeleton,
  argTypes: {
    variant: { control: 'inline-radio', options: ['line', 'title', 'circle', 'rect'] },
  },
};
export default meta;

type Story = StoryObj<Skeleton>;

export const Line: Story = { args: { variant: 'line', w: '14rem', h: '0.8rem' } };
export const Title: Story = { args: { variant: 'title', w: '10rem', h: '1.6rem' } };
export const Circle: Story = { args: { variant: 'circle', w: '2.5rem', h: '2.5rem' } };
export const Rect: Story = { args: { variant: 'rect', w: '100%', h: '6rem' } };

/** A card-shaped ghost group, announced once to assistive tech. */
export const Group: StoryObj<SkeletonGroup> = {
  render: () => ({
    moduleMetadata: { imports: [SkeletonGroup, Skeleton] },
    template: `
      <app-skeleton-group [loading]="true" label="Loading your gardens">
        <div ghost style="display: grid; gap: 0.5rem; max-width: 18rem">
          <app-skeleton variant="title" w="60%" h="1.4rem" />
          <app-skeleton variant="line" w="90%" h="0.8rem" />
          <app-skeleton variant="rect" h="0.5rem" />
        </div>
      </app-skeleton-group>
    `,
  }),
};
