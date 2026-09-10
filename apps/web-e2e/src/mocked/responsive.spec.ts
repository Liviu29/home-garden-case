import { expect, test } from '@playwright/test';
import { gardenDto, plantDto, signIn } from '../support/helpers';

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
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);

    await page.getByRole('button', { name: /New garden/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
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
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
  });
});
