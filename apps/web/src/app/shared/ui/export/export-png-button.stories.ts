import type { Meta, StoryObj } from '@storybook/angular';
import { ExportPngButton } from './export-png-button';

/** "Save as PNG" for the SVG inside a target element — a chart or the garden planner. */
const meta: Meta<ExportPngButton> = {
  title: 'Actions/ExportPngButton',
  component: ExportPngButton,
};
export default meta;

type Story = StoryObj<ExportPngButton>;

/** The button saves the drawing above it, drawn in the browser. */
export const WithADrawing: Story = {
  render: () => ({
    template: `
      <figure #drawing style="margin: 0 0 0.5rem">
        <svg viewBox="0 0 120 60" width="240" height="120" role="img" aria-label="Two beds in a garden">
          <rect x="4" y="4" width="112" height="52" rx="6" fill="#dfe8d3" stroke="#5f7f45" />
          <rect x="12" y="12" width="44" height="36" rx="4" fill="#9cc47a" />
          <rect x="64" y="12" width="44" height="36" rx="4" fill="#e3b86a" />
        </svg>
      </figure>
      <app-export-png-button [target]="drawing" [title]="'Garden plan'" />`,
  }),
};
