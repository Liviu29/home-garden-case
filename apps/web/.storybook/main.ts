import type { StorybookConfig } from '@storybook/angular';

/**
 * Storybook for the shared UI kit (src/app/shared/ui): one story file per
 * component, each state the app really uses. The a11y add-on runs axe on
 * every story; `npm run storybook:a11y` fails on any violation.
 */
const config: StorybookConfig = {
  stories: ['../src/app/shared/ui/**/*.stories.ts'],
  addons: ['@storybook/addon-a11y'],
  framework: { name: '@storybook/angular', options: {} },
  core: { disableTelemetry: true },
};

export default config;
