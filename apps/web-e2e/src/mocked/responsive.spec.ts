import { expect, test } from '@playwright/test';
import { documentOverflow, gardenDto, plantDto, signIn } from '../support/helpers';

/** Mobile-viewport smoke (representative coverage, not a matrix). */
test.describe('mobile 375×812', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('gardens grid renders, dialog opens, no horizontal overflow', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/gardens', (route) =>
      route.fulfill({
        json: [
          gardenDto({ gardenId: 1, gardenName: 'Mobile Garden with a fairly long name' }),
          gardenDto({ gardenId: 2, gardenName: 'Second' }),
        ],
      }),
    );
    await page.route('**/api/plants/garden/*', (route) => route.fulfill({ json: [] }));
    await page.goto('/gardens');

    await expect(page.locator('article.card').first()).toBeVisible();
    expect(await documentOverflow(page)).toBe(0);

    await page.getByRole('button', { name: /New garden/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await documentOverflow(page)).toBe(0);
    await page.keyboard.press('Escape');
  });

  test('garden detail with the Garden Map stacks cleanly, no horizontal overflow', async ({
    page,
  }) => {
    await signIn(page);
    await page.route('**/api/gardens/1', (route) =>
      route.fulfill({ json: gardenDto({ gardenId: 1, gardenName: 'Mobile Twin' }) }),
    );
    await page.route('**/api/plants/garden/1', (route) =>
      route.fulfill({
        json: [
          plantDto({ plantId: 1, gardenId: 1, name: 'Tomato', area: 6 }),
          plantDto({ plantId: 2, gardenId: 1, name: 'Basil', area: 2 }),
        ],
      }),
    );
    await page.goto('/gardens/1');
    await page.getByRole('heading', { name: 'Garden plan' }).scrollIntoViewIfNeeded();

    const map = page.getByRole('region', { name: 'Garden plan' });
    await expect(map.getByRole('button', { name: /Tomato/ })).toBeVisible();
    // Inspector stacks below the stage at this width; nothing leaks sideways.
    expect(await documentOverflow(page)).toBe(0);
  });
});

/**
 * Hostile-content responsive matrix.
 *
 * The smoke tests above use names that contain spaces, so the browser can
 * always find a wrap opportunity and no flex item is ever pushed to its
 * intrinsic minimum width. That is the failure mode real data produces
 * (plot codes, generated names, long species binomials), so this suite feeds
 * every text slot an unbreakable token and asserts the document itself never
 * scrolls sideways.
 */
const UNBREAKABLE_GARDEN = 'Voortuinmoestuinkas-Zuidwestzijde-Hoofdperceel-2026-Herfstplanting';
const UNBREAKABLE_PLANT = 'Roma-VF-Determinate-Paste-Tomato-Greenhouse-Row-14-Batch-88291';
const UNBREAKABLE_SPECIES = 'Solanum-lycopersicum-var-cerasiforme-cultivar-Sungold-F1-Hybrid';

const VIEWPORTS = [
  { name: '375 (mobile)', width: 375, height: 812 },
  { name: '768 (tablet portrait)', width: 768, height: 1024 },
  { name: '1024 (tablet landscape)', width: 1024, height: 768 },
  { name: '1440 (laptop)', width: 1440, height: 900 },
  { name: '1920 (desktop)', width: 1920, height: 1080 },
] as const;

/**
 * Count descendants that render outside their own card.
 *
 * Document-level overflow alone is not a sufficient guard: a card in the left
 * grid column can spill ~180px past its own border and still sit inside the
 * page gutter, so `scrollWidth` stays clean while the layout is visibly
 * broken. This asserts containment at the component boundary, which is where
 * the defect actually lives.
 */
async function cardContentEscapes(
  page: import('@playwright/test').Page,
  selector: string,
): Promise<number> {
  return page.evaluate((sel) => {
    let escapes = 0;
    for (const card of document.querySelectorAll(sel)) {
      const bounds = card.getBoundingClientRect();
      for (const el of card.querySelectorAll('*')) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.right > bounds.right + 1) escapes += 1;
      }
    }
    return escapes;
  }, selector);
}

/** Worst-case payload: unbreakable names, full capacity, extreme humidity. */
async function routeHostileFixture(page: import('@playwright/test').Page): Promise<void> {
  const gardens = [
    gardenDto({
      gardenId: 1,
      gardenName: UNBREAKABLE_GARDEN,
      totalSurfaceArea: 12,
      targetHumidityLevel: 100,
    }),
    gardenDto({ gardenId: 2, gardenName: 'Second', totalSurfaceArea: 240, targetHumidityLevel: 0 }),
  ];
  const plants = [
    {
      ...plantDto({ plantId: 1, gardenId: 1, name: UNBREAKABLE_PLANT, area: 12 }),
      species: UNBREAKABLE_SPECIES,
      idealHumidityLevel: 100,
    },
  ];
  await page.route('**/api/gardens', (route) => route.fulfill({ json: gardens }));
  await page.route('**/api/gardens/1', (route) => route.fulfill({ json: gardens[0] }));
  await page.route('**/api/plants/garden/1', (route) => route.fulfill({ json: plants }));
  await page.route('**/api/plants/garden/2', (route) => route.fulfill({ json: [] }));
}

for (const viewport of VIEWPORTS) {
  test.describe(`hostile content @ ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('dashboard does not overflow horizontally', async ({ page }) => {
      await signIn(page);
      await routeHostileFixture(page);
      await page.goto('/dashboard');

      await expect(page.getByRole('heading', { name: 'Garden health' })).toBeVisible();
      await expect(page.locator('.health-card').first()).toBeVisible();
      // Wait for the plant fan-out to settle: capacity text is the last thing in.
      await expect(page.locator('.health-meta').first()).toBeVisible();
      expect(await documentOverflow(page)).toBe(0);
      expect(await cardContentEscapes(page, '.health-card')).toBe(0);
      expect(await cardContentEscapes(page, '.attention-card')).toBe(0);
    });

    test('gardens grid does not overflow horizontally', async ({ page }) => {
      await signIn(page);
      await routeHostileFixture(page);
      await page.goto('/gardens');

      await expect(page.locator('article.card').first()).toBeVisible();
      expect(await documentOverflow(page)).toBe(0);
      expect(await cardContentEscapes(page, 'article.card')).toBe(0);
    });

    test('garden detail does not overflow horizontally', async ({ page }) => {
      await signIn(page);
      await routeHostileFixture(page);
      await page.goto('/gardens/1');

      await expect(page.getByRole('heading', { name: UNBREAKABLE_GARDEN })).toBeVisible();
      await expect(page.getByRole('cell', { name: new RegExp(UNBREAKABLE_PLANT) })).toBeVisible();
      expect(await documentOverflow(page)).toBe(0);
    });
  });
}
