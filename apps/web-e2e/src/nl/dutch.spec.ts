import { expect, test } from '../support/fixtures';
import { GARDEN_LIST, gardenDto, routePlants, signIn } from '../support/helpers';

/**
 * The Dutch build (ADR-010): the same app compiled in Dutch, on a development
 * server of its own (playwright.config.ts, project `nl`). Not a translation
 * review — the catalog check does that — but proof that the second build
 * boots, speaks Dutch from the first paint, and formats numbers its way.
 */
test.describe('the Dutch build', () => {
  test('boots in Dutch: the document language, the welcome, the skip link', async ({ page }) => {
    await page.route('**/api/users', (route) => route.fulfill({ json: [] }));
    await page.goto('/welcome');

    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    await expect(page.getByRole('heading', { name: 'Welkom bij HomeGarden' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Maak je profiel aan' })).toBeVisible();
    // The skip link is the page's first focusable element, shown on keyboard focus.
    await expect(page.getByRole('link', { name: 'Naar de inhoud' })).toBeAttached();
  });

  test('the shell and a garden card: Dutch words, Dutch numbers', async ({ page }) => {
    await signIn(page);
    await page.route(GARDEN_LIST, (route) =>
      route.fulfill({
        json: [gardenDto({ gardenId: 1, gardenName: 'Achtertuin', totalSurfaceArea: 12.5 })],
      }),
    );
    await routePlants(page, []);
    await page.goto('/gardens');

    const primary = page.getByRole('navigation', { name: 'Hoofdnavigatie' });
    await expect(primary.getByRole('link', { name: 'Tuinen' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tuinen', level: 1 })).toBeVisible();

    const card = page.getByTestId('garden-card').filter({ hasText: 'Achtertuin' });
    await expect(card).toContainText('0 / 12,5 m²'); // the decimal comma of nl
  });
});
