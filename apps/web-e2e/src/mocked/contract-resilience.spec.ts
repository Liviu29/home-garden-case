import { expect, test } from '@playwright/test';
import { gardenDto, plantDto, signIn } from '../support/helpers';

/**
 * Contract-driven resilience (BACKEND-API-AUDIT). Every scenario here mirrors a
 * behaviour verified against the real API:
 *
 * - the API delays every response 200–2000 ms  → overlapping loads are normal
 * - it answers 10 % of ALL requests with a 500 → transient ≠ "not found"
 * - `GET /gardens/{missing}` → 404, while `GET /plants/garden/{missing}` → 400
 * - capacity is enforced on POST/PUT /plants with a 400 ValidationError
 */

const gardenOne = gardenDto({ gardenId: 1, gardenName: 'Slow Garden', totalSurfaceArea: 20 });
const gardenTwo = gardenDto({ gardenId: 2, gardenName: 'Fast Garden', totalSurfaceArea: 30 });

test.describe('slow-API navigation safety', () => {
  test('re-entering a garden while a slow load is pending shows only that garden', async ({
    page,
  }) => {
    await signIn(page);
    await page.route('**/api/gardens', (route) => route.fulfill({ json: [gardenOne, gardenTwo] }));
    await page.route('**/api/gardens/1', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.fulfill({ json: gardenOne });
    });
    await page.route('**/api/gardens/2', (route) => route.fulfill({ json: gardenTwo }));
    await page.route('**/api/plants/garden/1', (route) =>
      route.fulfill({ json: [plantDto({ plantId: 11, gardenId: 1, name: 'Slowpoke', area: 5 })] }),
    );
    await page.route('**/api/plants/garden/2', (route) =>
      route.fulfill({ json: [plantDto({ plantId: 22, gardenId: 2, name: 'Speedy', area: 3 })] }),
    );

    // Enter the slow garden from the list (client-side routing), then leave
    // again before it resolves — the classic 200–2000 ms API pattern.
    await page.goto('/gardens');
    await page
      .locator('article.card', { hasText: 'Slow Garden' })
      .getByRole('link')
      .first()
      .click();
    await page.getByRole('link', { name: 'Gardens' }).first().click();
    await page
      .locator('article.card', { hasText: 'Fast Garden' })
      .getByRole('link')
      .first()
      .click();

    await expect(page.getByRole('heading', { name: 'Fast Garden' })).toBeVisible();
    // Let the abandoned garden-1 response land: it must never appear here.
    await page.waitForTimeout(3000);
    await expect(page.getByRole('heading', { name: 'Fast Garden' })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Slowpoke/ })).toHaveCount(0);
  });
});

test.describe('404 vs transient 500 (the API fails 10% of requests at random)', () => {
  test('a real 404 shows the not-found state', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/gardens/9', (route) =>
      route.fulfill({
        status: 404,
        json: { error: 'Not found error', details: ['Garden with ID 9 not found'] },
      }),
    );
    // The real backend answers 400 here for a missing garden (audit limitation #1)
    await page.route('**/api/plants/garden/9', (route) =>
      route.fulfill({
        status: 400,
        json: { error: 'Validation error', details: ['Garden with ID 9 not found'] },
      }),
    );
    await page.goto('/gardens/9');

    await expect(page.getByText('Garden not found')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to gardens' })).toBeVisible();
  });

  test('a transient 500 offers a retry and does NOT claim the garden is gone', async ({ page }) => {
    await signIn(page);
    // The retry interceptor absorbs transient 5xx (3 retries, ADR-004), so the
    // error state only appears once the whole budget is spent — exhaust it.
    let attempt = 0;
    await page.route('**/api/gardens/1', async (route) => {
      attempt += 1;
      if (attempt <= 4) {
        // Mirrors the random-errors plugin body exactly
        return route.fulfill({
          status: 500,
          json: { error: 'Internal server error', details: ['Random error thrown'] },
        });
      }
      return route.fulfill({ json: gardenOne });
    });
    await page.route('**/api/plants/garden/1', (route) => route.fulfill({ json: [] }));
    await page.goto('/gardens/1');

    await expect(page.getByText("Couldn't load this garden")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Garden not found')).toHaveCount(0);
    expect(await page.locator('mat-spinner, mat-progress-spinner, .spinner').count()).toBe(0);

    // Retry re-issues the request and the garden appears
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Slow Garden' })).toBeVisible();
  });
});

test.describe('server-authoritative capacity verdict', () => {
  test('a 400 capacity rejection renders inline with the backend wording', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/gardens/1', (route) => route.fulfill({ json: gardenOne }));
    await page.route('**/api/plants/garden/1', (route) => route.fulfill({ json: [] }));
    // Client-side pre-validation would normally block this, so we prove the
    // SERVER verdict path: the garden looks empty to the client, the API says no.
    await page.route('**/api/plants', (route) =>
      route.fulfill({
        status: 400,
        json: {
          error: 'Validation error',
          details: [
            "Cannot add plant: total surface area required (25m²) would exceed garden's total surface area (20m²)",
          ],
        },
      }),
    );
    await page.goto('/gardens/1');

    await page.getByRole('button', { name: /Add plant/ }).click();
    await expect(page.getByLabel('Search the plant catalog')).toBeFocused();
    await page.getByLabel('Plant name').fill('Contract Pumpkin');
    await page.getByLabel('Species').fill('Cucurbita');
    await page.getByRole('button', { name: 'Add plant', exact: true }).click();

    // Server message shown in context, dialog stays open, no raw JSON
    await expect(page.getByText(/would exceed garden's total surface area/)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
  });
});
