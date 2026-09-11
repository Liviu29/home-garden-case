import { defineConfig, devices } from '@playwright/test';

/**
 * Two suites, one confidence model (TESTING-STRATEGY.md):
 *
 * - `integration` (src/integration): runs against the REAL backend with
 *   slow-api (200–2000 ms) and random-errors (10% → 500) enabled — proves the
 *   frontend works with the actual contract under its actual hostility.
 *   Serial within its file (the flows share one SQLite database), generous
 *   timeouts, one flow-level retry to absorb pathological random-error streaks.
 *
 * - `mocked` (src/mocked): network controlled via page.route for the states
 *   the random backend cannot guarantee — persistent 500s, exact delays,
 *   empty responses — plus axe scans, keyboard and mobile smoke.
 *   Deterministic and isolated per test (own routes, own storage), so it runs
 *   fully parallel with tight timeouts and no retries.
 *
 * Synchronization policy: wait for observable behaviour — roles, dialog
 * lifecycle, `waitForResponse`, MutationObserver, animation frames. There are
 * ZERO `waitForTimeout` calls in the suite; the only `setTimeout`s live inside
 * `page.route` handlers, where they SIMULATE the backend's 200–2000 ms latency
 * rather than make a test wait for time to pass.
 */
export default defineConfig({
  testDir: './src',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env['CHROMIUM_PATH']
      ? { launchOptions: { executablePath: process.env['CHROMIUM_PATH'] } }
      : {}),
  },
  projects: [
    {
      name: 'integration',
      testDir: './src/integration',
      fullyParallel: false,
      timeout: 180_000,
      expect: { timeout: 30_000 },
      retries: 1, // the 10%-random-error backend can produce pathological streaks
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mocked',
      testDir: './src/mocked',
      fullyParallel: true,
      timeout: 60_000,
      expect: { timeout: 10_000 },
      retries: 0, // deterministic by construction
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npx nx dev api',
      url: 'http://localhost:3000/docs',
      cwd: '../..',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npx nx dev web',
      url: 'http://localhost:4200',
      cwd: '../..',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
