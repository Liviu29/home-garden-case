import { expect, test } from '@playwright/test';
import { gardenDto, plantDto, signIn } from '../support/helpers';

/**
 * The two Highcharts views (ADR-008), driven through what users and assistive
 * technology get: the accessibility module turns every bubble and column into
 * a labelled graphic, so the tests find them by role and name — the same way
 * a screen reader does.
 */
test.describe('portfolio map (dashboard)', () => {
  test('plots each planted garden and opens the one whose bubble is chosen', async ({ page }) => {
    await signIn(page);
    const rooftop = gardenDto({ gardenId: 1, gardenName: 'Rooftop', totalSurfaceArea: 10 });
    await page.route('**/api/gardens', (route) =>
      route.fulfill({
        json: [
          rooftop,
          gardenDto({ gardenId: 2, gardenName: 'Orchard', totalSurfaceArea: 40 }),
          gardenDto({ gardenId: 3, gardenName: 'New bed', totalSurfaceArea: 8 }),
        ],
      }),
    );
    await page.route('**/api/gardens/1', (route) => route.fulfill({ json: rooftop }));
    await page.route('**/api/plants/garden/1', (route) =>
      route.fulfill({ json: [plantDto({ plantId: 1, gardenId: 1, name: 'Lavender', area: 9.5 })] }),
    );
    await page.route('**/api/plants/garden/2', (route) =>
      route.fulfill({ json: [plantDto({ plantId: 2, gardenId: 2, name: 'Apple', area: 12 })] }),
    );
    await page.route('**/api/plants/garden/3', (route) => route.fulfill({ json: [] }));
    await page.goto('/dashboard');

    await page.getByRole('heading', { name: 'Portfolio map' }).scrollIntoViewIfNeeded();
    await expect(page.locator('app-chart .highcharts-root')).toBeVisible();

    // Two planted gardens, two bubbles; the empty bed has nothing to plot.
    const rooftopBubble = page.getByRole('img', { name: /^Rooftop: 95% full/ });
    await expect(rooftopBubble).toBeVisible();
    await expect(page.getByRole('img', { name: /^Orchard: 30% full/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /^New bed/ })).toHaveCount(0);

    await rooftopBubble.click();
    await expect(page).toHaveURL(/\/gardens\/1$/);
    await expect(page.getByRole('heading', { name: 'Rooftop' })).toBeVisible();
  });
});

test.describe('humidity profile (garden detail)', () => {
  test('draws one column per plant and finds the chosen plant on the plan', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/gardens/6', (route) =>
      route.fulfill({
        json: gardenDto({
          gardenId: 6,
          gardenName: 'Balcony',
          totalSurfaceArea: 12,
          targetHumidityLevel: 35,
        }),
      }),
    );
    await page.route('**/api/plants/garden/6', (route) =>
      route.fulfill({
        json: [
          {
            ...plantDto({ plantId: 1, gardenId: 6, name: 'Boston Fern', area: 2 }),
            idealHumidityLevel: 80,
          },
          {
            ...plantDto({ plantId: 2, gardenId: 6, name: 'Aloe Vera', area: 1.5 }),
            idealHumidityLevel: 25,
          },
        ],
      }),
    );
    await page.goto('/gardens/6');

    await page.getByRole('heading', { name: 'Humidity profile' }).scrollIntoViewIfNeeded();
    const fern = page.getByRole('img', {
      name: /^Boston Fern: wants 80% humidity, 45 points above the 35% target/,
    });
    await expect(fern).toBeVisible();
    await expect(page.getByRole('img', { name: /^Aloe Vera: wants 25% humidity/ })).toBeVisible();

    await fern.click();

    const bed = page
      .getByRole('region', { name: 'Garden plan' })
      .getByRole('button', { name: /Boston Fern/ });
    await expect(bed).toHaveAttribute('aria-pressed', 'true');
  });
});
