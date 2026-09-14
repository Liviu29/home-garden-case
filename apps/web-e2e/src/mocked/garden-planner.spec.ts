import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../support/fixtures';
import { awaitDialogSettled, gardenDto, plantDto, signIn } from '../support/helpers';

/**
 * Planner coverage: plant discovery, no-scroll
 * dialog, drag positioning with local persistence, fullscreen, layers.
 */

const garden = gardenDto({
  gardenId: 6,
  gardenName: 'Planner Garden',
  totalSurfaceArea: 30,
  targetHumidityLevel: 50,
});
const plants = [
  plantDto({ plantId: 1, gardenId: 6, name: 'Lavender', area: 5 }),
  plantDto({ plantId: 2, gardenId: 6, name: 'Basil', area: 2 }),
];

async function openPlan(page: import('../support/fixtures').Page): Promise<void> {
  await signIn(page);
  await page.route('**/api/gardens/6', (r) => r.fulfill({ json: garden }));
  await page.route('**/api/plants/garden/6', (r) => r.fulfill({ json: plants }));
  await page.goto('/gardens/6');
  await page.getByRole('heading', { name: 'Garden plan' }).scrollIntoViewIfNeeded();
  await expect(
    page.getByRole('region', { name: 'Garden plan' }).getByRole('button', { name: /Lavender/ }),
  ).toBeVisible();
}

test.describe('the plan as a list', () => {
  test('a text version of the plan: every bed, choosable, accessible, and Escape closes it', async ({
    page,
  }) => {
    await openPlan(page);
    const plan = page.getByRole('region', { name: 'Garden plan' });

    await plan.getByRole('button', { name: 'Show the plan as a list' }).click();
    const list = plan.getByRole('region', { name: 'Plan as a list' });
    await expect(list).toBeVisible();
    await expect(list.getByRole('row')).toHaveCount(3); // header + two beds
    await expect(list.getByRole('rowheader', { name: /Lavender/ })).toBeVisible();

    const axe = await new AxeBuilder({ page }).include('app-map-plan-list').analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
      [],
    );

    await list.getByRole('button', { name: 'Basil' }).click();
    await expect(
      plan
        .getByRole('complementary', { name: 'Plant inspector' })
        .getByRole('heading', { name: 'Basil' }),
    ).toBeVisible();
    await expect(plan.getByRole('button', { name: /^Basil,/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
  });
});

test.describe('plant discovery dialog', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('recommendations render, a pick prefills, custom stays possible — and the dialog never scrolls at 1440×900', async ({
    page,
  }) => {
    await openPlan(page);
    await page.getByRole('button', { name: /Add plant/ }).click();
    await awaitDialogSettled(page, 'Search the plant catalog');

    // Recommended cards for THIS garden, with artwork and a truthful fit line
    await expect(page.getByText('Recommended for your garden')).toBeVisible();
    // Cards are real buttons inside a labelled group (a listitem role on a
    // <button> would erase its button semantics for assistive tech).
    const catalog = page.getByRole('group', { name: 'Recommended for your garden' });
    const cards = catalog.getByRole('button');
    expect(await cards.count()).toBeGreaterThanOrEqual(4);

    // Desktop acceptance: no internal vertical scrolling (small tolerance)
    const scroll = await page
      .locator('mat-dialog-content')
      .evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(scroll).toBeLessThanOrEqual(8);
    const box = await page.getByRole('dialog').boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(900);

    // Search → pick → prefill (values stay editable)
    await page.getByLabel('Search the plant catalog').fill('tomato');
    await catalog.getByRole('button', { name: /^Tomato,/ }).click();
    await expect(page.getByLabel('Plant name')).toHaveValue('Tomato');
    await expect(page.getByLabel('Species')).toHaveValue('Solanum lycopersicum');
    await expect(page.getByLabel('Surface area required (m²)')).toHaveValue('0.8');

    // Custom plants remain first-class: just overtype
    await page.getByLabel('Plant name').fill('My Own Cultivar');
    await expect(page.getByLabel('Plant name')).toHaveValue('My Own Cultivar');
    await page.keyboard.press('Escape');
  });
});

test.describe('drag positioning (visual layout only)', () => {
  // Tall viewport: with the area-honest treemap, beds near the bottom of the
  // used region can sit below a 720px fold, where mouse events cannot reach.
  test.use({ viewport: { width: 1440, height: 900 } });

  test('dragging a bed moves it, survives reload, and Reset layout restores auto-arrangement', async ({
    page,
  }) => {
    await openPlan(page);
    const map = page.getByRole('region', { name: 'Garden plan' });
    const plot = map.getByRole('button', { name: /Lavender/ });

    const before = (await plot.boundingBox())!;
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 140, before.y + before.height / 2 + 60, {
      steps: 8,
    });
    await page.mouse.up();

    await expect
      .poll(async () => Math.abs((await plot.boundingBox())!.x - before.x))
      .toBeGreaterThan(60); // it moved
    const after = (await plot.boundingBox())!;

    // Capacity math is untouched by placement — the HUD numbers stand
    await expect(map.locator('.map-hud').getByText('23 m²')).toBeVisible(); // free

    // Local persistence: reload restores the custom position
    await page.reload();
    await page.getByRole('heading', { name: 'Garden plan' }).scrollIntoViewIfNeeded();
    const reloaded = (await map.getByRole('button', { name: /Lavender/ }).boundingBox())!;
    expect(Math.abs(reloaded.x - after.x)).toBeLessThan(24);

    // Reset layout → confirm → deterministic auto-layout returns
    await map.getByRole('button', { name: 'Reset layout to automatic arrangement' }).click();
    await page.getByRole('button', { name: 'Reset layout', exact: true }).click();
    await expect
      .poll(async () =>
        Math.abs((await map.getByRole('button', { name: /Lavender/ }).boundingBox())!.x - before.x),
      )
      .toBeLessThan(24);
  });

  test('undo returns the bed to its previous spot', async ({ page }) => {
    await openPlan(page);
    const map = page.getByRole('region', { name: 'Garden plan' });
    const plot = map.getByRole('button', { name: /Basil/ });
    // The stage takes the world's aspect ratio, so its height follows the
    // panel width — scroll the bed into view rather than assuming it sits
    // above the fold at any particular viewport.
    await plot.scrollIntoViewIfNeeded();
    // Let the one-shot grow-in settle so geometry measurements are stable.
    await expect
      .poll(async () => (await plot.boundingBox())!.x, { timeout: 3000 })
      .toBeGreaterThan(0);

    const before = (await plot.boundingBox())!;
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 120, before.y + before.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
    await expect
      .poll(async () => Math.abs((await plot.boundingBox())!.x - before.x))
      .toBeGreaterThan(50);

    await map.getByRole('button', { name: 'Undo layout move' }).click();
    // Zoneless renders on the next frame — poll, don't read synchronously.
    await expect
      .poll(async () => Math.abs((await plot.boundingBox())!.x - before.x))
      .toBeLessThan(24);
  });
});

test.describe('fullscreen planner + layers', () => {
  test('Expand fills the viewport, layers toggle the scene, Escape exits', async ({ page }) => {
    await openPlan(page);
    const map = page.getByRole('region', { name: 'Garden plan' });
    const stage = map.locator('.map-stage');
    const embedded = (await stage.boundingBox())!;

    await map.getByRole('button', { name: 'Expand planner' }).click();
    // Fullscreen pins the panel to the viewport: the stage grows materially
    // in HEIGHT (the embedded card is height-capped; width was already near
    // full-bleed once the shell widened to 80rem). Zoneless renders on the
    // next frame — poll, don't read synchronously (a read right after the
    // click measured the embedded 448px in 4 of 5 repeated runs).
    await expect
      .poll(async () => (await stage.boundingBox())!.height)
      .toBeGreaterThan(embedded.height * 1.25);
    const stageBox = (await stage.boundingBox())!;
    expect(stageBox.width).toBeGreaterThanOrEqual(embedded.width);
    // Fullscreen behaves like a dialog: it opened on its search field, and
    // focus is trapped inside (the CDK's anchors are live while it is).
    await expect(page.getByRole('searchbox', { name: 'Find a plant on the plan' })).toBeFocused();
    await expect(page.locator('.cdk-focus-trap-anchor[tabindex="0"]')).toHaveCount(2);
    // Escape from the search field leaves fullscreen and hands focus back to
    // the opener; Expand brings it back for the rest of the tour.
    await page.keyboard.press('Escape');
    await expect(map.getByRole('button', { name: 'Expand planner' })).toBeFocused();
    await map.getByRole('button', { name: 'Expand planner' }).click();
    await expect(page.locator('.cdk-focus-trap-anchor[tabindex="0"]')).toHaveCount(2);

    // Layers: hiding labels removes the name plates from the scene
    await map.getByRole('button', { name: 'Toggle layers menu' }).click();
    await expect(map.locator('g.plot-label').first()).toBeVisible();
    await page.getByRole('checkbox', { name: 'Plant labels' }).uncheck();
    await expect(map.locator('g.plot-label').first()).toBeHidden(); // CSS layer toggle
    await page.getByRole('checkbox', { name: 'Plant labels' }).check();

    // Humidity layer renders preference halos (vs target — not a sensor)
    await page.getByRole('checkbox', { name: 'Humidity preference' }).check();
    await expect(map.getByText('Preference vs target — not a measurement')).toBeVisible();
    expect(await map.locator('.humidity-pref').count()).toBe(plants.length);

    // Escape closes the layers panel first, then exits fullscreen — pressed
    // with focus still INSIDE the layers panel (on the checkbox): the cascade
    // is bound on the map shell, not just the SVG, so keyboard users can
    // always escape the popover.
    await page.keyboard.press('Escape'); // closes layers panel
    await expect(map.locator('.layers-panel')).toHaveCount(0);
    await page.keyboard.press('Escape'); // exits fullscreen
    await expect(map.getByRole('button', { name: 'Expand planner' })).toBeVisible();
    // …and focus is back on the control that opened it; the trap is dormant.
    await expect(map.getByRole('button', { name: 'Expand planner' })).toBeFocused();
    await expect(page.locator('.cdk-focus-trap-anchor[tabindex="0"]')).toHaveCount(0);
    const backBox = (await stage.boundingBox())!;
    expect(backBox.width).toBeLessThan(stageBox.width);
  });
});
