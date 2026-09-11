import { readFileSync } from 'node:fs';
import { expect, test } from '../support/fixtures';
import { gardenDto, plantDto, signIn } from '../support/helpers';

/**
 * PNG export runs on the browser's canvas, which unit tests cannot reach:
 * this proves a real Chromium turns the plan into a real PNG file.
 */
test('the garden plan saves as a PNG, drawn in the browser', async ({ page }) => {
  await page.route('**/api/gardens/6', (r) =>
    r.fulfill({ json: gardenDto({ gardenId: 6, gardenName: 'Export Garden' }) }),
  );
  await page.route('**/api/plants/garden/6', (r) =>
    r.fulfill({ json: [plantDto({ plantId: 1, gardenId: 6, name: 'Lavender', area: 5 })] }),
  );
  await signIn(page);
  await page.goto('/gardens/6');
  const plan = page.locator('section.map-panel');
  await expect(plan.locator('svg.map-svg')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    plan.getByRole('button', { name: 'Save Export Garden garden plan as PNG' }).click(),
  ]);

  expect(download.suggestedFilename()).toBe('export-garden-garden-plan.png');
  const png = readFileSync(await download.path());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  const { width } = await plan
    .locator('svg.map-svg')
    .boundingBox()
    .then((box) => box!);
  expect(png.readUInt32BE(16)).toBe(Math.round(width * 2)); // drawn at 2×
});
