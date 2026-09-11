import { expect, test } from '../support/fixtures';
import { GARDEN_LIST, PLANT_LIST, gardenDto, plantDto, signIn } from '../support/helpers';

/**
 * Undo after a delete (ASYNC-UX.md). The API has no restore, so Undo creates
 * the entity again; these tests check what is sent back and that the screen
 * shows it again, with the server's new ids.
 */

const toast = (page: import('../support/fixtures').Page, text: string) =>
  page.locator('app-toast-host .toast', { hasText: text });

test.describe('Undo after a delete', () => {
  test('a removed plant comes back from the toast, with the same fields', async ({ page }) => {
    await page.route('**/api/gardens/6', (r) =>
      r.fulfill({ json: gardenDto({ gardenId: 6, gardenName: 'Undo Garden' }) }),
    );
    let plants = [plantDto({ plantId: 1, gardenId: 6, name: 'Lavender', area: 5 })];
    await page.route('**/api/plants/garden/6', (r) => r.fulfill({ json: plants }));
    await page.route('**/api/plants/1', (r) => {
      plants = [];
      return r.fulfill({ status: 204, body: '' });
    });
    let sentBack: unknown;
    await page.route(PLANT_LIST, (r) => {
      sentBack = r.request().postDataJSON();
      const back = plantDto({ plantId: 7, gardenId: 6, name: 'Lavender', area: 5 });
      plants = [back];
      return r.fulfill({ status: 201, json: back });
    });
    await signIn(page);
    await page.goto('/gardens/6');
    await expect(page.getByRole('cell', { name: /Lavender/ })).toBeVisible();

    await page
      .getByRole('row', { name: /Lavender/ })
      .getByRole('button', { name: 'Plant actions' })
      .click();
    await page.getByRole('menuitem', { name: 'Remove' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByRole('cell', { name: /Lavender/ })).toHaveCount(0);

    await toast(page, '“Lavender” removed.').getByRole('button', { name: 'Undo' }).click();

    await expect(page.getByRole('cell', { name: /Lavender/ })).toBeVisible();
    await expect(toast(page, '“Lavender” is back.')).toBeVisible();
    expect(sentBack).toEqual({
      plantName: 'Lavender',
      species: 'Species test',
      plantType: 'vegetable',
      plantationDate: '2026-04-01T00:00:00.000Z',
      surfaceAreaRequired: 5,
      idealHumidityLevel: 60,
      gardenId: 6,
    });
  });

  test('a deleted garden comes back with its plants', async ({ page }) => {
    let gardens = [gardenDto({ gardenId: 6, gardenName: 'Undo Garden' })];
    let plants = [
      plantDto({ plantId: 1, gardenId: 6, name: 'Lavender', area: 5 }),
      plantDto({ plantId: 2, gardenId: 6, name: 'Thyme', area: 2 }),
    ];
    const replanted: { gardenId: number }[] = [];
    await page.route(GARDEN_LIST, (r) => {
      if (r.request().method() !== 'POST') {
        return r.fulfill({ json: gardens });
      }
      const back = gardenDto({ gardenId: 16, gardenName: r.request().postDataJSON().gardenName });
      gardens = [back];
      return r.fulfill({ status: 201, json: back });
    });
    await page.route('**/api/gardens/6', (r) => {
      gardens = [];
      plants = []; // the server deletes a garden's plants with it
      return r.fulfill({ status: 204, body: '' });
    });
    await page.route(PLANT_LIST, (r) => {
      if (r.request().method() !== 'POST') {
        return r.fulfill({ json: plants });
      }
      const body = r.request().postDataJSON();
      replanted.push(body);
      const back = { ...body, plantId: 100 + replanted.length, createdAt: '', updatedAt: '' };
      plants = [...plants, back];
      return r.fulfill({ status: 201, json: back });
    });
    await page.route('**/api/plants/garden/*', (r) => {
      const gardenId = Number(new URL(r.request().url()).pathname.split('/').pop());
      return r.fulfill({ json: plants.filter((p) => p.gardenId === gardenId) });
    });
    await signIn(page);
    await page.goto('/gardens');
    const card = page.getByTestId('garden-card').filter({ hasText: 'Undo Garden' });
    await expect(card).toContainText('2 plants');

    await card.getByRole('button', { name: 'Garden actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(card).toHaveCount(0);

    await toast(page, 'deleted').getByRole('button', { name: 'Undo' }).click();

    await expect(card).toBeVisible();
    await expect(card).toContainText('2 plants');
    await expect(toast(page, 'Garden “Undo Garden” is back.')).toBeVisible();
    expect(replanted.map((p) => p.gardenId)).toEqual([16, 16]);
  });
});
