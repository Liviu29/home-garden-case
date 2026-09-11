import { Page, expect, test } from '@playwright/test';
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
 *   in flight or just fetched  → reused, never re-requested (hover-prefetch)
 *
 * Exactly one owner starts each fetch: `GardensStore` owns `/gardens`,
 * `PlantsIndexStore` owns `/plants/garden/:id` for list/dashboard screens, and
 * `GardenDetailStore` owns the detail screen's reads.
 */
const gardens = [1, 2, 3].map((id) => gardenDto({ gardenId: id, gardenName: `Garden ${id}` }));

/** Records every API call as "METHOD /api/path", in order. */
function recordApiCalls(page: Page): { calls: string[]; countOf: (call: string) => number } {
  const calls: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api')) calls.push(`${request.method()} ${pathname}`);
  });
  return { calls, countOf: (call) => calls.filter((c) => c === call).length };
}

async function routeThreeGardens(page: Page): Promise<void> {
  await page.route('**/api/gardens', (route) => route.fulfill({ json: gardens }));
  for (const id of [1, 2, 3]) {
    await page.route(`**/api/gardens/${id}`, (route) => route.fulfill({ json: gardens[id - 1] }));
    await page.route(`**/api/plants/garden/${id}`, (route) =>
      route.fulfill({
        json: [plantDto({ plantId: id * 10, gardenId: id, name: `Plant ${id}`, area: 5 })],
      }),
    );
  }
}

test.describe('request ownership: one owner, one request', () => {
  test('a full session issues exactly one request per resource, and none on warm navigation', async ({
    page,
  }) => {
    const { calls, countOf } = recordApiCalls(page);
    await signIn(page);
    await routeThreeGardens(page);

    // ── Cold load of the dashboard: gardens once, then one fan-out per garden.
    await page.goto('/dashboard');
    await expect(page.locator('.health-meta').first()).toBeVisible();
    await expect.poll(() => countOf('GET /api/plants/garden/3')).toBe(1);

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

  test('hover-prefetch starts the detail read, and the click that follows adds no request', async ({
    page,
  }) => {
    const { countOf } = recordApiCalls(page);
    await signIn(page);
    await routeThreeGardens(page);
    await page.goto('/gardens');

    const card = page.locator('article.card', { hasText: 'Garden 1' });
    await expect(card).toBeVisible();

    // The hover alone must start the detail read …
    const prefetch = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/gardens/1');
    await card.hover();
    await prefetch;

    // … and the navigation must reuse it instead of fetching again.
    await card.getByRole('link').first().click();
    await expect(page.getByRole('heading', { name: 'Garden 1', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Plant 1/ })).toBeVisible();
    expect(countOf('GET /api/gardens/1')).toBe(1);
    expect(countOf('GET /api/plants/garden/1')).toBe(1);
  });
});
