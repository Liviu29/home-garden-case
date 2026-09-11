import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { ToastStore } from '../../../core/errors/toast-store';
import { ToastHost } from './toast-host';

/** A ToastStore that already holds the given toasts (errors stay until dismissed). */
const withToasts = (fill: (store: ToastStore) => void) =>
  applicationConfig({
    providers: [
      {
        provide: ToastStore,
        useFactory: () => {
          const store = new ToastStore();
          fill(store);
          return store;
        },
      },
    ],
  });

/** The toast queue, bottom-centre: every mutation confirms; technical errors offer a way on. */
const meta: Meta<ToastHost> = {
  title: 'Feedback/ToastHost',
  component: ToastHost,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<ToastHost>;

export const Success: Story = {
  decorators: [withToasts((s) => s.success('Garden “Back Garden” created.'))],
};

export const Undo: Story = {
  decorators: [
    withToasts((s) => s.success('“Tomato” removed.', { label: 'Undo', run: () => undefined })),
  ],
};

export const ErrorWithRetry: Story = {
  decorators: [
    withToasts((s) =>
      s.error('Couldn’t delete “Back Garden”.', { label: 'Try again', run: () => undefined }),
    ),
  ],
};

export const Stacked: Story = {
  decorators: [
    withToasts((s) => {
      s.info('Showing cached gardens — refresh failed.');
      s.error('Something unexpected happened. Please try again.');
    }),
  ],
};
