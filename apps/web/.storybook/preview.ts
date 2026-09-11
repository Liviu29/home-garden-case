// Components use $localize; the app gets it from the development build's
// polyfills, which the Storybook builder does not read.
import '@angular/localize/init';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { applicationConfig, type Decorator, type Preview } from '@storybook/angular';

/** The app's light and dark themes: the same `data-theme` switch ThemeStore sets. */
const withTheme: Decorator = (story, context) => {
  document.documentElement.dataset['theme'] =
    context.globals['theme'] === 'dark' ? 'dark' : 'light';
  return story();
};

const preview: Preview = {
  decorators: [applicationConfig({ providers: [provideAnimationsAsync()] }), withTheme],
  globalTypes: {
    theme: {
      description: 'Colour theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light' },
  parameters: {
    layout: 'padded',
    // axe runs on every story; a violation is an error, not a note.
    a11y: { test: 'error' },
  },
};

export default preview;
