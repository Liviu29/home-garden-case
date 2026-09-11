import { expect, test } from '../support/fixtures';
import {
  documentOverflow,
  expectNoSpinner,
  GARDEN_LIST,
  gardenDto,
  plantDto,
  routePlants,
  signIn,
} from '../support/helpers';

/**
 * Control-center dashboard: content-shaped skeleton on
 * the initial GET (no spinner, ever), attention/health card navigation, and a
 * mobile smoke. Deterministic via route mocks.
 */

const gardens = [
  gardenDto({ gardenId: 1, gardenName: 'Back Garden', totalSurfaceArea: 20 }),
  gardenDto({
    gardenId: 2,
    gardenName: 'Herb Corner',
    totalSurfaceArea: 20,
    targetHumidityLevel: 55,
  }),
];

async function mockPlants(page: import('../support/fixtures').Page): Promise<void> {
  await routePlants(page, [
    plantDto({ plantId: 11, gardenId: 1, name: 'Sunflower row', area: 12 }),
    plantDto({ plantId: 12, gardenId: 1, name: 'Zucchini', area: 7.5 }),
    plantDto({ plantId: 21, gardenId: 2, name: 'Basil', area: 1 }),
  ]);
}

test.describe('dashboard control center', () => {
  test('initial GET shows a content-shaped gray skeleton — never a spinner — then the real layout', async ({
    page,
  }) => {
    await signIn(page);
    await mockPlants(page);
    await page.route(GARDEN_LIST, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.fulfill({ json: gardens });
    });
    await page.goto('/dashboard');

    // The hero renders immediately (greeting is session-local)…
    await expect(page.getByRole('heading', { name: /Good/ })).toBeVisible();
    // …and the data regions are content-shaped ghosts, not spinners.
    await expect(page.locator('.dash-skeleton')).toBeVisible();
    await expect(page.locator('.kpi-ghost')).toHaveCount(4);
    await expect(page.locator('.attention-ghost').first()).toBeVisible();
    await expect(page.locator('.health-ghost').first()).toBeVisible();
    await expectNoSpinner(page);

    // Data lands: skeleton is replaced by the real sections, zero layout jumps
    await expect(page.getByTestId('health-card').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.dash-skeleton')).toHaveCount(0);
    await expect(page.getByText('m² of growing space')).toBeVisible();
    await expect(page.getByText('Utilization')).toBeVisible();
  });

  test('attention card and health card both navigate to the garden', async ({ page }) => {
    await signIn(page);
    await mockPlants(page);
    await page.route(GARDEN_LIST, (r) => r.fulfill({ json: gardens }));
    await page.route('**/api/gardens/1', (r) => r.fulfill({ json: gardens[0] }));
    await page.route('**/api/gardens/2', (r) => r.fulfill({ json: gardens[1] }));
    await page.goto('/dashboard');

    // Back Garden is 19.5/20 → attention card, sorted first, real link semantics
    const attention = page.getByTestId('attention-card').filter({ hasText: 'Back Garden' });
    await expect(attention).toContainText('98% capacity');
    await attention.click();
    await expect(page.getByRole('heading', { name: 'Back Garden' })).toBeVisible();

    await page.goBack();
    const health = page.getByTestId('health-card').filter({ hasText: 'Herb Corner' });
    await expect(health).toContainText('Healthy capacity');
    await health.click();
    await expect(page.getByRole('heading', { name: 'Herb Corner' })).toBeVisible();
  });

  test('a healthy portfolio shows the positive attention state, not an absence', async ({
    page,
  }) => {
    await signIn(page);
    await page.route(GARDEN_LIST, (r) =>
      r.fulfill({ json: [gardenDto({ gardenId: 2, gardenName: 'Calm Garden' })] }),
    );
    await page.route('**/api/plants/garden/2', (r) =>
      r.fulfill({ json: [plantDto({ plantId: 21, gardenId: 2, name: 'Basil', area: 1 })] }),
    );
    await page.goto('/dashboard');

    await expect(page.getByText('Everything looks healthy')).toBeVisible();
    await expect(page.getByTestId('attention-card')).toHaveCount(0);
  });

  test('mobile 375×812 smoke — hero, KPIs and cards stack with no horizontal overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page);
    await mockPlants(page);
    await page.route(GARDEN_LIST, (r) => r.fulfill({ json: gardens }));
    await page.goto('/dashboard');

    await expect(page.getByTestId('health-card').first()).toBeVisible();
    expect(await documentOverflow(page)).toBe(0);
  });
});
