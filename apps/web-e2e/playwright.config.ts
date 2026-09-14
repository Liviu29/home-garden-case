import { defineConfig, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
 *   fully parallel with tight timeouts and no retries. A shared fixture fails
 *   any mocked test that makes an API request it did not mock.
 *
 * - `nl` (src/nl): the Dutch build, on a development server of its own —
 *   the second build boots, speaks Dutch from the first paint, formats
 *   numbers its way.
 *
 * - `webkit`: a cross-engine smoke of the mocked screens on Safari's engine.
 *   Opt-in locally (`E2E_WEBKIT=1`, after `npx playwright install webkit`);
 *   always on in CI.
 *
 * The suite starts its own stack — a built API and a dev server — on ports of
 * its own, with a fresh SQLite file per run: integration tests never write into
 * the database you develop against, and never see what an earlier run left.
 *
 * Synchronization policy: wait for observable behaviour — roles, dialog
 * lifecycle, `waitForResponse`, MutationObserver, animation frames. There are
 * ZERO `waitForTimeout` calls in the suite; the only `setTimeout`s live inside
 * `page.route` handlers, where they SIMULATE the backend's 200–2000 ms latency
 * rather than make a test wait for time to pass.
 */
const API_PORT = Number(process.env['E2E_API_PORT'] ?? 3310);
const WEB_PORT = Number(process.env['E2E_WEB_PORT'] ?? 4310);
const NL_PORT = Number(process.env['E2E_NL_PORT'] ?? 4311);

const dbDir = join(tmpdir(), 'home-garden-e2e');
mkdirSync(dbDir, { recursive: true });
const DB_PATH = join(dbDir, `run-${Date.now()}.sqlite`);

const chromium = {
  ...devices['Desktop Chrome'],
  ...(process.env['CHROMIUM_PATH']
    ? { launchOptions: { executablePath: process.env['CHROMIUM_PATH'] } }
    : {}),
};
const withWebkit = Boolean(process.env['CI'] || process.env['E2E_WEBKIT']);

export default defineConfig({
  testDir: './src',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'integration',
      testDir: './src/integration',
      fullyParallel: false,
      timeout: 180_000,
      expect: { timeout: 30_000 },
      retries: 1, // the 10%-random-error backend can produce pathological streaks
      use: chromium,
    },
    {
      name: 'mocked',
      testDir: './src/mocked',
      fullyParallel: true,
      timeout: 60_000,
      expect: { timeout: 10_000 },
      retries: 0, // deterministic by construction
      use: chromium,
    },
    {
      name: 'nl',
      testDir: './src/nl',
      fullyParallel: true,
      timeout: 60_000,
      expect: { timeout: 10_000 },
      retries: 0,
      use: { ...chromium, baseURL: `http://localhost:${NL_PORT}` },
    },
    ...(withWebkit
      ? [
          {
            name: 'webkit',
            testDir: './src/mocked',
            testMatch: [
              'welcome.spec.ts',
              'dashboard.spec.ts',
              'charts.spec.ts',
              'async-states.spec.ts',
              'request-ownership.spec.ts',
            ],
            fullyParallel: true,
            timeout: 60_000,
            expect: { timeout: 10_000 },
            retries: 0,
            use: { ...devices['Desktop Safari'] },
          },
        ]
      : []),
  ],
  webServer: [
    {
      // A built API rather than the watch-mode dev target: nothing rebuilds
      // under the suite's feet, and a dev API on :3000 is left alone.
      command: 'npx nx build api --configuration=development && node apps/api/dist/main.js',
      url: `http://localhost:${API_PORT}/docs`,
      cwd: '../..',
      env: { PORT: String(API_PORT), HOST: 'localhost', DB_PATH },
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
    {
      // No dependency pre-bundling: Vite would otherwise discover a lazily
      // imported dependency at runtime, re-optimise and reload the page under
      // a test — a chunk fetch then fails once per fresh cache.
      command: `npx nx dev web --port=${WEB_PORT} --proxy-config=proxy.e2e.conf.mjs --prebundle=false`,
      url: `http://localhost:${WEB_PORT}`,
      cwd: '../..',
      env: { E2E_API_PORT: String(API_PORT) },
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
    {
      // The same app compiled in Dutch: the development server serves one
      // language at `/` (ADR-010), so the Dutch build gets a server of its own.
      command: `npx nx serve-nl web --port=${NL_PORT} --proxy-config=proxy.e2e.conf.mjs --prebundle=false`,
      url: `http://localhost:${NL_PORT}`,
      cwd: '../..',
      env: { E2E_API_PORT: String(API_PORT) },
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
  ],
});
