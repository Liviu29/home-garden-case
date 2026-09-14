import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  applicationConfig,
  componentWrapperDecorator,
  type Meta,
  type StoryObj,
} from '@storybook/angular';
import { ConfirmDialog, ConfirmDialogData } from './confirm-dialog';

/** The dialog's content, rendered in place; ConfirmService opens it in an overlay. */
const withData = (data: ConfirmDialogData) =>
  applicationConfig({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close: () => undefined } },
    ],
  });

/** Destructive actions always confirm; non-destructive ones never do. */
const meta: Meta<ConfirmDialog> = {
  title: 'Feedback/ConfirmDialog',
  component: ConfirmDialog,
  decorators: [
    componentWrapperDecorator(
      (story) => `
        <div style="max-width: 28rem; padding: 0.5rem 0; border-radius: 28px;
                    background: var(--surface-1); box-shadow: 0 8px 24px rgb(0 0 0 / 0.16)">
          ${story}
        </div>`,
    ),
  ],
};
export default meta;

type Story = StoryObj<ConfirmDialog>;

export const Destructive: Story = {
  decorators: [
    withData({
      title: 'Delete “Back Garden”?',
      message: 'Its 6 plants are deleted with it. The toast right after offers to bring it back.',
      confirmLabel: 'Delete garden',
      destructive: true,
    }),
  ],
};

export const Neutral: Story = {
  decorators: [
    withData({
      title: 'Sign out?',
      message: 'Your gardens stay. Sign back in from the welcome screen.',
      confirmLabel: 'Sign out',
      destructive: false,
    }),
  ],
};
