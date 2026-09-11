import { expect, test } from '../support/fixtures';
import {
  awaitDialogSettled,
  expectNoSpinner,
  GARDEN_LIST,
  gardenDto,
  PLANT_LIST,
  plantDto,
  signIn,
} from '../support/helpers';

/**
 * ASYNC-UX.md contract: every mutation (POST/PUT/DELETE) shows a gray
 * skeleton/ghost in place — never a spinner. Each test delays the mutation
 * deterministically, asserts the ghost, then asserts the resolved state.
 */

const garden = gardenDto({ gardenId: 6, gardenName: 'Ghost Garden', totalSurfaceArea: 20 });
const basePlants = [plantDto({ plantId: 1, gardenId: 6, name: 'Lavender', area: 5 })];

/** Signs in and opens the seeded "Ghost Garden" detail with its one plant. */
async function openGhostGarden(page: import('../support/fixtures').Page): Promise<void> {
  await signIn(page);
  await page.goto('/gardens/6');
  await expect(page.getByRole('cell', { name: /Lavender/ })).toBeVisible();
}

test.describe('plant mutations render ghosts (ASYNC-UX)', () => {
  test('delayed plant POST: ghost row + ghost map bed, then the real plant grows in', async ({
    page,
  }) => {
    await page.route('**/api/gardens/6', (r) => r.fulfill({ json: garden }));
    let plants = [...basePlants];
    await page.route('**/api/plants/garden/6', (r) => r.fulfill({ json: plants }));
    await page.route(PLANT_LIST, async (r) => {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const created = plantDto({ plantId: 9, gardenId: 6, name: 'New Basil', area: 2 });
      plants = [...plants, created];
      await r.fulfill({ status: 201, json: created });
    });
    await openGhostGarden(page);
    await page.getByRole('heading', { name: 'Garden plan' }).scrollIntoViewIfNeeded();

    await page.getByRole('button', { name: /Add plant/ }).click();
    await awaitDialogSettled(page, 'Search the plant catalog');
    await page.getByLabel('Plant name').fill('New Basil');
    await page.getByLabel('Species').fill('Ocimum');
    await page.getByLabel('Surface area required (m²)').fill('2');
    await page.getByRole('button', { name: 'Add plant', exact: true }).click();

    // In flight: creation ghosts, no spinner anywhere
    await expect(page.locator('tr.ghost-row')).toBeVisible(); // table placeholder
    await expect(page.locator('.ghost-bed')).toBeVisible(); // map placeholder bed
    await expectNoSpinner(page);

    // Resolved: ghosts gone, the real plant is in the table and on the map
    await expect(page.getByRole('cell', { name: /New Basil/ })).toBeVisible();
    await expect(page.locator('tr.ghost-row')).toHaveCount(0);
    await expect(page.locator('.ghost-bed')).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Garden plan' }).getByRole('button', { name: /New Basil/ }),
    ).toBeVisible();
  });

  test('delayed plant PUT: the row and map bed gray out, then resolve updated', async ({
    page,
  }) => {
    await page.route('**/api/gardens/6', (r) => r.fulfill({ json: garden }));
    let plants = [...basePlants];
    await page.route('**/api/plants/garden/6', (r) => r.fulfill({ json: plants }));
    await page.route('**/api/plants/1', async (r) => {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const updated = { ...basePlants[0], surfaceAreaRequired: 6 };
      plants = [updated];
      await r.fulfill({ json: updated });
    });
    await openGhostGarden(page);
    await page.getByRole('heading', { name: 'Garden plan' }).scrollIntoViewIfNeeded();

    await page
      .getByRole('row', { name: /Lavender/ })
      .getByRole('button', { name: 'Plant actions' })
      .click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await awaitDialogSettled(page, 'Plant name');
    await page.getByLabel('Surface area required (m²)').fill('6');
    await page.getByRole('button', { name: 'Save changes' }).click();

    // In flight: the affected row is a ghost; the map bed is a gray ghost
    await expect(page.locator('tr.ghost-row')).toBeVisible();
    await expect(page.locator('g.plot.mutating')).toHaveCount(1);
    await expectNoSpinner(page);

    // Resolved: updated value in the row, ghost gone
    await expect(page.getByRole('cell', { name: '6 m²' })).toBeVisible();
    await expect(page.locator('tr.ghost-row')).toHaveCount(0);
    await expect(page.locator('g.plot.mutating')).toHaveCount(0);
  });

  test('delayed plant DELETE: ghost until confirmation, then it leaves table and map', async ({
    page,
  }) => {
    await page.route('**/api/gardens/6', (r) => r.fulfill({ json: garden }));
    let plants = [...basePlants];
    await page.route('**/api/plants/garden/6', (r) => r.fulfill({ json: plants }));
    await page.route('**/api/plants/1', async (r) => {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      plants = [];
      await r.fulfill({ status: 204, body: '' });
    });
    await openGhostGarden(page);
    await page.getByRole('heading', { name: 'Garden plan' }).scrollIntoViewIfNeeded();

    await page
      .getByRole('row', { name: /Lavender/ })
      .getByRole('button', { name: 'Plant actions' })
      .click();
    await page.getByRole('menuitem', { name: 'Remove' }).click();
    // Dialog-scoped: the map inspector shows its own "Remove" when a plant is selected.
    await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();

    // In flight: ghost-confirmed — still present, grayed, inert
    await expect(page.locator('tr.ghost-row')).toBeVisible();
    await expect(page.locator('g.plot.mutating')).toHaveCount(1);
    await expectNoSpinner(page);

    // Confirmed: gone from table and map
    await expect(page.getByRole('cell', { name: /Lavender/ })).toHaveCount(0);
    await expect(page.locator('g.plot')).toHaveCount(0);
  });
});

test.describe('failed mutations resolve back into content (ASYNC-UX)', () => {
  test('a DELETE that keeps failing: ghost while retried, then the plant is back with a retry', async ({
    page,
  }) => {
    await page.route('**/api/gardens/6', (r) => r.fulfill({ json: garden }));
    await page.route('**/api/plants/garden/6', (r) => r.fulfill({ json: basePlants }));
    let deletes = 0;
    await page.route('**/api/plants/1', async (r) => {
      deletes++;
      await new Promise((resolve) => setTimeout(resolve, 600));
      await r.fulfill({
        status: 500,
        json: { error: 'Internal server error', details: ['Random error thrown'] },
      });
    });
    await openGhostGarden(page);
    await page.getByRole('heading', { name: 'Garden plan' }).scrollIntoViewIfNeeded();

    await page
      .getByRole('row', { name: /Lavender/ })
      .getByRole('button', { name: 'Plant actions' })
      .click();
    await page.getByRole('menuitem', { name: 'Remove' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();

    // In flight (transparently retried): the localized ghost, nothing else
    await expect(page.locator('tr.ghost-row')).toBeVisible();
    await expectNoSpinner(page);

    // Resolved back: the real row returns, no ghost is left behind, and the
    // failure is explained with a way forward
    await expect(page.getByRole('cell', { name: /Lavender/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('tr.ghost-row')).toHaveCount(0);
    await expect(page.locator('g.plot.mutating')).toHaveCount(0);
    await expect(page.getByText("Couldn't remove", { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(deletes).toBeGreaterThan(1); // transient failures were retried before giving up
  });
});

test.describe('garden mutations render ghosts (ASYNC-UX)', () => {
  test('delayed garden POST: a ghost card shimmers in the grid, then becomes the card', async ({
    page,
  }) => {
    await signIn(page);
    let gardens: unknown[] = [];
    await page.route(GARDEN_LIST, async (r) => {
      if (r.request().method() === 'POST') {
        await new Promise((resolve) => setTimeout(resolve, 1800));
        const created = gardenDto({ gardenId: 42, gardenName: 'Ghosted Garden' });
        gardens = [created];
        await r.fulfill({ status: 201, json: created });
        return;
      }
      await r.fulfill({ json: gardens });
    });
    await page.route('**/api/plants/garden/*', (r) => r.fulfill({ json: [] }));
    await page.goto('/gardens');

    await page.getByRole('button', { name: 'Create your first garden' }).click();
    await awaitDialogSettled(page, 'Garden name');
    await page.getByLabel('Garden name').fill('Ghosted Garden');
    await page.getByRole('dialog').locator('button[type="submit"]').click();

    // In flight: a ghost garden card shimmers in the grid; zero spinners.
    // (While the modal is open the CDK correctly aria-hides the background,
    // so this is asserted structurally — SR users hear the submit button's
    // own "Creating garden" status inside the dialog.)
    await expect(page.locator('[aria-label="Creating garden"]')).toBeVisible();
    await expectNoSpinner(page);

    // Resolved: the real card replaces the ghost
    await expect(
      page.getByTestId('garden-card').filter({ hasText: 'Ghosted Garden' }),
    ).toBeVisible();
    await expect(page.locator('[aria-label="Creating garden"]')).toHaveCount(0);
  });

  test('delayed garden DELETE: the card grays out in place, then leaves the grid', async ({
    page,
  }) => {
    await signIn(page);
    let gardens: unknown[] = [gardenDto({ gardenId: 6, gardenName: 'Doomed Garden' })];
    await page.route(GARDEN_LIST, (r) => r.fulfill({ json: gardens }));
    await page.route('**/api/gardens/6', async (r) => {
      if (r.request().method() === 'DELETE') {
        await new Promise((resolve) => setTimeout(resolve, 1800));
        gardens = [];
        await r.fulfill({ status: 204, body: '' });
        return;
      }
      await r.fulfill({ json: gardens[0] });
    });
    await page.route('**/api/plants/garden/*', (r) => r.fulfill({ json: [] }));
    await page.goto('/gardens');

    const card = page.getByTestId('garden-card').filter({ hasText: 'Doomed Garden' });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Garden actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    // In flight: same card, gray mutation ghost, inert — no spinner
    await expect(card).toHaveClass(/mutation-ghost/);
    await expect(card).toHaveAttribute('aria-busy', 'true');
    await expectNoSpinner(page);

    // Confirmed: removed
    await expect(card).toHaveCount(0);
  });

  test('delayed garden PUT: detail header ghosts locally while the rest stays live', async ({
    page,
  }) => {
    await signIn(page);
    const original = gardenDto({ gardenId: 6, gardenName: 'Rename Me', totalSurfaceArea: 20 });
    let current = original;
    await page.route('**/api/gardens/6', async (r) => {
      if (r.request().method() === 'PUT') {
        await new Promise((resolve) => setTimeout(resolve, 1800));
        current = { ...original, gardenName: 'Renamed Garden' };
        await r.fulfill({ json: current });
        return;
      }
      await r.fulfill({ json: current });
    });
    await page.route(GARDEN_LIST, (r) => r.fulfill({ json: [current] }));
    await page.route('**/api/plants/garden/6', (r) => r.fulfill({ json: basePlants }));
    await page.goto('/gardens/6');
    await expect(page.getByRole('heading', { name: 'Rename Me' })).toBeVisible();

    await page.getByRole('button', { name: 'Garden actions' }).click();
    await page.getByRole('menuitem', { name: 'Edit garden' }).click();
    await awaitDialogSettled(page, 'Garden name');
    await page.getByLabel('Garden name').fill('Renamed Garden');
    await page.getByRole('dialog').locator('button[type="submit"]').click();

    // In flight: the header alone is a localized ghost; the table stays live
    await expect(page.locator('header.detail-header')).toHaveClass(/mutation-ghost/);
    await expect(page.getByRole('cell', { name: /Lavender/ })).toBeVisible();
    await expectNoSpinner(page);

    // Resolved
    await expect(page.getByRole('heading', { name: 'Renamed Garden' })).toBeVisible();
    await expect(page.locator('header.detail-header')).not.toHaveClass(/mutation-ghost/);
  });
});
