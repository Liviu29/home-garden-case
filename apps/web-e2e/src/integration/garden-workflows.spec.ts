import { expect, test } from '@playwright/test';
import {
  addPlant,
  awaitDialogSettled,
  createGarden,
  openDetail,
  signIn,
  uniqueName,
} from '../support/helpers';

/**
 * Integration flows against the REAL backend (slow-api + random-errors on):
 * these prove the frontend works with the actual API contract under its
 * actual hostility. Deterministic failure/slow/empty scenarios live in the
 * mocked project instead.
 */

test.describe('garden lifecycle (real API)', () => {
  test('Flow 1 — create garden → open detail → add plant → capacity reflects it', async ({
    page,
  }) => {
    const name = uniqueName('E2E Garden');
    await signIn(page);
    await page.goto('/gardens');
    await expect(page.getByRole('heading', { name: 'Gardens' })).toBeVisible();

    await createGarden(page, name, '12');
    await openDetail(page, name);

    await page.getByRole('button', { name: /Add plant/ }).click();
    await awaitDialogSettled(page, 'Search the plant catalog');
    await page.getByLabel('Plant name').fill('E2E Fern');
    await page.getByLabel('Species').fill('Dryopteris');
    await page.getByLabel('Surface area required (m²)').fill('7.5');

    // The live breakdown explains the rule before saving
    await expect(page.getByText('Garden fit')).toBeVisible();
    await expect(page.getByText('4.5 m²').first()).toBeVisible(); // 12 − 7.5

    await page.getByRole('button', { name: 'Add plant', exact: true }).click();
    await expect(page.getByRole('cell', { name: /E2E Fern/ })).toBeVisible();
    await expect(page.locator('.header-stat', { hasText: 'm² used' })).toContainText('7.5');
    await expect(page.locator('.header-stat', { hasText: 'm² free' })).toContainText('4.5');

    // The Garden Map digital twin reflects the real contract too: the new
    // plant appears as a focusable plot on the deferred map (ADR-007).
    await page.getByRole('heading', { name: 'Garden plan' }).scrollIntoViewIfNeeded();
    const map = page.getByRole('region', { name: 'Garden plan' });
    await expect(map.getByRole('button', { name: /E2E Fern/ })).toBeVisible();
    await expect(map.locator('.map-hud').getByText('4.5 m²')).toBeVisible(); // free, from domain math
  });

  test('Flow 2 — an oversized plant is blocked client-side with a clear message', async ({
    page,
  }) => {
    const name = uniqueName('E2E Small Garden');
    await signIn(page);
    await page.goto('/gardens');
    await expect(page.getByRole('heading', { name: 'Gardens' })).toBeVisible();

    await createGarden(page, name, '12');
    await openDetail(page, name);

    await page.getByRole('button', { name: /Add plant/ }).click();
    await awaitDialogSettled(page, 'Search the plant catalog');
    await page.getByLabel('Plant name').fill('E2E Pumpkin');
    await page.getByLabel('Species').fill('Cucurbita maxima');
    await page.getByLabel('Surface area required (m²)').fill('99');

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('99 m²');
    await expect(alert).toContainText('available in this garden');
    await expect(page.getByRole('button', { name: 'Add plant', exact: true })).toBeDisabled();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('cell', { name: /E2E Pumpkin/ })).toHaveCount(0);
  });

  test('Flow 3 — editing a plant does not double-count its own area', async ({ page }) => {
    const name = uniqueName('E2E Edit Garden');
    await signIn(page);
    await page.goto('/gardens');
    await createGarden(page, name, '12');
    await openDetail(page, name);
    await addPlant(page, { name: 'E2E Basil', species: 'Ocimum', area: '7.5' });

    // Grow the plant to EXACTLY the garden total: legal only if its current
    // 7.5 m² is excluded from the check (the classic double-count bug).
    await page
      .getByRole('row', { name: /E2E Basil/ })
      .getByRole('button', { name: 'Plant actions' })
      .click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await awaitDialogSettled(page, 'Plant name');
    await page.getByLabel('Surface area required (m²)').fill('12');
    await expect(page.getByRole('alert')).toHaveCount(0); // no overcrowd warning
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await expect(page.locator('.header-stat', { hasText: 'm² used' })).toContainText('12');
    await expect(page.locator('.header-stat', { hasText: 'm² free' })).toContainText('0');
  });

  test('Flows 4+5 — delete plant (cancel, then confirm) and delete garden', async ({ page }) => {
    const name = uniqueName('E2E Delete Garden');
    await signIn(page);
    await page.goto('/gardens');
    await createGarden(page, name, '10');
    await openDetail(page, name);
    await addPlant(page, { name: 'E2E Mint', species: 'Mentha', area: '4' });
    const detailUrl = page.url();

    // Cancel path leaves data intact
    await page
      .getByRole('row', { name: /E2E Mint/ })
      .getByRole('button', { name: 'Plant actions' })
      .click();
    await page.getByRole('menuitem', { name: 'Remove' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('cell', { name: /E2E Mint/ })).toBeVisible();

    // Confirm path removes and recalculates
    await page
      .getByRole('row', { name: /E2E Mint/ })
      .getByRole('button', { name: 'Plant actions' })
      .click();
    // Scope to the confirm dialog: the map inspector also shows a "Remove"
    // button when a plant is selected (new plants auto-select on the plan).
    await page.getByRole('menuitem', { name: 'Remove' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByRole('cell', { name: /E2E Mint/ })).toHaveCount(0);
    await expect(page.locator('.header-stat', { hasText: 'm² free' })).toContainText('10');

    // Delete the garden from the grid, then its deep link is a designed 404
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Gardens' })
      .click();
    const card = page.locator('article.card', { hasText: name });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Garden actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(card).toHaveCount(0);

    await page.goto(detailUrl);
    await expect(page.getByText('Garden not found')).toBeVisible();
  });

  test('Flow 6 — form validation: required fields, negative surface, humidity slider', async ({
    page,
  }) => {
    const name = uniqueName('E2E Validation Garden');
    await signIn(page);
    await page.goto('/gardens');
    await createGarden(page, name, '10');
    await openDetail(page, name);

    await page.getByRole('button', { name: /Add plant/ }).click();
    await awaitDialogSettled(page, 'Search the plant catalog');
    // Empty submit: blocked with visible required errors, no dialog close
    await page.getByRole('button', { name: 'Add plant', exact: true }).click();
    await expect(page.getByText('Plant name is required')).toBeVisible();
    await expect(page.getByText('Species is required')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);

    // Negative surface area rejected
    await page.getByLabel('Surface area required (m²)').fill('-5');
    await expect(page.getByText("Surface area can't be negative")).toBeVisible();

    // Humidity slider is keyboard-operable within 0–100
    const slider = page.getByRole('slider');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveValue('51'); // native range input: 50 → 51
    await page.keyboard.press('Escape');
  });

  test('a malformed garden id shows the designed not-found state', async ({ page }) => {
    await signIn(page);
    await page.goto('/gardens/not-a-number');
    await expect(page.getByText('Garden not found')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to gardens' })).toBeVisible();
  });
});
