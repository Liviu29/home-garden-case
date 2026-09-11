import { expect, test } from '@playwright/test';
import { gardenDto, plantDto, signIn } from '../support/helpers';

/**
 * Request-ownership contract.
 *
 * Against a backend that adds 200–2000 ms to every response and fails 10 % of
 * them, an avoidable request is both latency and a one-in-ten chance of an
 * error the UI has to absorb. So the number of requests per screen is a
 * behaviour worth asserting, not an implementation detail.
 *
 * The contract, per cache key:
 *   cold (no cache entry)      → exactly 1 request
 *   fresh cache (< TTL)        → 0 requests
 *   stale cache (> TTL)        → 1 background revalidation (by design, not a duplicate)
 *
 * Exactly one owner starts each fetch: `GardensStore` owns `/gardens`,
 * `PlantsIndexStore` owns `/plants/garden/:id` for list/dashboard screens, and
 * `GardenDetailStore` owns the detail screen's reads.
 */
const gardens = [1, 2, 3].map((id) => gardenDto({ gardenId: id, gardenName: `Garden ${id}` }));

test.describe('request ownership: one owner, one request', () => {
  test('a full session issues exactly one request per resource, and none on warm navigation', async ({
    page,
  }) => {
    const calls: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api')) calls.push(`${request.method()} ${pathname}`);
    });

    await signIn(page);
    await page.route('**/api/gardens', (route) => route.fulfill({ json: gardens }));
    for (const id of [1, 2, 3]) {
      await page.route(`**/api/gardens/${id}`, (route) => route.fulfill({ json: gardens[id - 1] }));
      await page.route(`**/api/plants/garden/${id}`, (route) =>
        route.fulfill({
          json: [plantDto({ plantId: id * 10, gardenId: id, name: `Plant ${id}`, area: 5 })],
        }),
      );
    }

    // ── Cold load of the dashboard: gardens once, then one fan-out per garden.
    await page.goto('/dashboard');
    await expect(page.locator('.health-meta').first()).toBeVisible();
    await expect.poll(() => calls.filter((c) => c === 'GET /api/plants/garden/3').length).toBe(1);

    const countOf = (call: string): number => calls.filter((c) => c === call).length;
    expect(countOf('GET /api/gardens')).toBe(1);
    for (const id of [1, 2, 3]) {
      expect(countOf(`GET /api/plants/garden/${id}`)).toBe(1);
    }

    // ── Client-side navigation with a fresh cache: no network at all.
    const beforeNavigation = calls.length;
    await page.getByRole('link', { name: 'Gardens' }).first().click();
    await expect(page.locator('article.card').first()).toBeVisible();
    await page.getByRole('link', { name: 'Dashboard' }).first().click();
    await expect(page.locator('.health-meta').first()).toBeVisible();

    expect(calls.slice(beforeNavigation)).toEqual([]);
  });
});
