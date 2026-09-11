import { test as base, expect } from '@playwright/test';

export { expect };
export type { Page } from '@playwright/test';

/**
 * The mocked project's `test`. Every API request must be answered by a route
 * the test registered itself: anything else gets a 501 and fails the test when
 * it ends. Without this, a mocked test that forgot a route would quietly read
 * whatever a real backend happened to hold — and pass or fail on that.
 */
export const test = base.extend<{ unmockedApiGuard: void }>({
  unmockedApiGuard: [
    async ({ page }, use) => {
      const unmocked: string[] = [];
      // Registered before the test's own routes, so it only sees what they leave unhandled.
      await page.route(
        (url) => url.pathname.startsWith('/api/'),
        (route) => {
          const request = route.request();
          unmocked.push(`${request.method()} ${new URL(request.url()).pathname}`);
          return route.fulfill({ status: 501, json: { error: 'Not mocked in this test' } });
        },
      );
      await use();
      expect(unmocked, 'API requests this test did not mock').toEqual([]);
    },
    { auto: true },
  ],
});
