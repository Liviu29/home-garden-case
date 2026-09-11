import { expect, test } from '../support/fixtures';
import { gardenDto, plantDto, signIn } from '../support/helpers';

/**
 * Interactive Garden Map (ADR-007) — deterministic flows. The map is SVG with
 * real focusable plot nodes, so every assertion here is a plain DOM/role
 * assertion; nothing pokes at rendering internals.
 */

const garden = gardenDto({
  gardenId: 6,
  gardenName: 'Twin Garden',
  totalSurfaceArea: 20,
  targetHumidityLevel: 62,
});

const plants = [
  plantDto({ plantId: 1, gardenId: 6, name: 'Lavender', area: 5 }),
  plantDto({ plantId: 2, gardenId: 6, name: 'Basil', area: 2 }),
  plantDto({ plantId: 3, gardenId: 6, name: 'Tomato', area: 4 }),
];

async function mockGarden(
  page: import('../support/fixtures').Page,
  opts: { plants: unknown[]; delayPlantsMs?: number },
): Promise<void> {
  await page.route('**/api/gardens/6', (route) => route.fulfill({ json: garden }));
  await page.route('**/api/plants/garden/6', async (route) => {
    if (opts.delayPlantsMs) {
      await new Promise((resolve) => setTimeout(resolve, opts.delayPlantsMs));
    }
    await route.fulfill({ json: opts.plants });
  });
}

async function openMap(page: import('../support/fixtures').Page): Promise<void> {
  await page.goto('/gardens/6');
  // The map ships in a deferred chunk triggered on viewport — bring it in.
  await page.getByRole('heading', { name: 'Garden plan' }).scrollIntoViewIfNeeded();
}

test.describe('populated garden (map Test 1)', () => {
  test('map renders plants, capacity HUD, and selection drives the inspector', async ({ page }) => {
    await signIn(page);
    await mockGarden(page, { plants });
    await openMap(page);

    const map = page.getByRole('region', { name: 'Garden plan' });
    await expect(map).toBeVisible();

    // Capacity + humidity from domain math, in the HUD
    const hud = map.locator('.map-hud');
    await expect(hud.getByText('55%')).toBeVisible(); // 11 of 20 used
    await expect(hud.getByText('9 m²')).toBeVisible(); // free
    await expect(hud.getByText('62%')).toBeVisible(); // target humidity

    // Each plant is a real focusable node on the map
    for (const name of ['Lavender', 'Basil', 'Tomato']) {
      await expect(map.getByRole('button', { name: new RegExp(name) })).toBeVisible();
    }

    // Selecting a plot opens the inspector with the right plant
    await map.getByRole('button', { name: /Basil/ }).click();
    const inspector = map.getByRole('complementary', { name: 'Plant inspector' });
    await expect(inspector.getByRole('heading', { name: 'Basil' })).toBeVisible();
    await expect(inspector.getByText('10% of garden')).toBeVisible(); // 2 of 20
    await expect(inspector.getByRole('button', { name: 'Edit' })).toBeVisible();
  });
});

test.describe('area honesty at 98%', () => {
  test('a 98% garden reads 98% on the HUD and its free space renders as its own cell', async ({
    page,
  }) => {
    await signIn(page);
    // 19.5 of 20 m² used — the treemap must fill the surface accordingly
    await mockGarden(page, {
      plants: [
        plantDto({ plantId: 1, gardenId: 6, name: 'Sunflower', area: 5 }),
        plantDto({ plantId: 2, gardenId: 6, name: 'Strawberry', area: 4 }),
        plantDto({ plantId: 3, gardenId: 6, name: 'Zucchini', area: 4 }),
        plantDto({ plantId: 4, gardenId: 6, name: 'Lavender', area: 3 }),
        plantDto({ plantId: 5, gardenId: 6, name: 'Tomato', area: 3.5 }),
      ],
    });
    await openMap(page);

    const map = page.getByRole('region', { name: 'Garden plan' });
    const hud = map.locator('.map-hud');
    await expect(hud.getByText('98%')).toBeVisible();
    await expect(hud.getByText('0.5 m²')).toBeVisible();

    // The free capacity is drawn, not implied: the tilled cell exists and
    // states its exact area (a treemap cell of its own, it has room for the
    // label; only a cell too small for it falls back to a "+" marker).
    await expect(map.locator('.free-band')).toBeVisible();
    await expect(map.locator('text.free-label')).toHaveText(/Available · 0\.5 m²/);

    // And the plant cells cover the surface: every plant renders as a plot
    for (const name of ['Sunflower', 'Strawberry', 'Zucchini', 'Lavender', 'Tomato']) {
      await expect(map.getByRole('button', { name: new RegExp(name) })).toBeVisible();
    }
  });
});

test.describe('empty garden (map Test 2)', () => {
  test('the surface renders with a designed invitation and planting CTA', async ({ page }) => {
    await signIn(page);
    await mockGarden(page, { plants: [] });
    await openMap(page);

    const map = page.getByRole('region', { name: 'Garden plan' });
    await expect(map.getByText('Your garden has space to grow.')).toBeVisible();
    await expect(map.getByRole('button', { name: 'Plant your garden' })).toBeVisible();

    // The CTA opens the same add-plant dialog as the table's actions
    await map.getByRole('button', { name: 'Plant your garden' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Plant name')).toBeVisible();
  });
});

test.describe('delayed load (map Test 3)', () => {
  test('the map ghost shows while plants load, then the twin replaces it', async ({ page }) => {
    await signIn(page);
    await mockGarden(page, { plants, delayPlantsMs: 2500 });
    await page.goto('/gardens/6');
    await page.getByRole('heading', { name: 'Garden plan' }).scrollIntoViewIfNeeded();

    // Skeleton state (shared ghost architecture): visible and labeled
    const ghost = page.getByRole('status', { name: 'Loading garden map' });
    await expect(ghost).toBeVisible();

    // Twin replaces the ghost — never both at once
    const map = page.getByRole('region', { name: 'Garden plan' });
    await expect(map.getByRole('button', { name: /Lavender/ })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading garden map' })).toHaveCount(0);
  });
});

test.describe('viewport controls (map Test 4)', () => {
  test('the plan fills its stage, and no stroke scales with the map', async ({ page }) => {
    // Two bugs this locks down, both invisible to a DOM-only assertion:
    //
    // 1. Letterboxing. The world is drawn at a fixed 1.6 aspect; when the
    //    stage was a shorter box, `preserveAspectRatio="meet"` pinned the
    //    garden to ~46% of the width and padded it with dead lawn.
    // 2. Scaling strokes. A stroke-width without `vector-effect:
    //    non-scaling-stroke` is in MAP UNITS, and the world is ~5.7 units
    //    wide — the name-plate's "0.5px" border rendered 69px thick at fit
    //    and ten times that zoomed in.
    await signIn(page);
    await mockGarden(page, { plants });
    await openMap(page);

    const map = page.getByRole('region', { name: 'Garden plan' });
    await expect(map).toBeVisible();
    await map.getByRole('button', { name: /Lavender/ }).click();

    const geometry = await page.evaluate(() => {
      const svg = document.querySelector('.map-panel svg[viewBox]') as SVGSVGElement;
      const rect = svg.getBoundingClientRect();
      const [, , vw, vh] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
      const scale = rect.width / vw;

      let widestStrokePx = 0;
      for (const el of svg.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        const declared = parseFloat(cs.strokeWidth);
        if (!declared || cs.stroke === 'none') continue;
        const px =
          cs.getPropertyValue('vector-effect') === 'non-scaling-stroke'
            ? declared
            : declared * scale;
        widestStrokePx = Math.max(widestStrokePx, px);
      }

      return { stageRatio: rect.width / rect.height, viewBoxRatio: vw / vh, widestStrokePx };
    });

    // The visible rect must have the stage's shape, or `meet` letterboxes it.
    expect(Math.abs(geometry.viewBoxRatio - geometry.stageRatio)).toBeLessThan(0.05);
    // Nothing in a garden plan is legitimately a 10px-thick line.
    expect(geometry.widestStrokePx).toBeLessThan(10);
  });

  test('zoom in/out updates the level; Fit returns to 100%; Reset clears selection', async ({
    page,
  }) => {
    await signIn(page);
    await mockGarden(page, { plants });
    await openMap(page);

    const map = page.getByRole('region', { name: 'Garden plan' });
    const toolbar = map.getByRole('toolbar', { name: 'Map view controls' });
    await expect(toolbar.getByText('100%')).toBeVisible();
    // Fit is no longer the floor — the camera can step back to 50%
    await toolbar.getByRole('button', { name: 'Zoom out' }).click();
    await expect(toolbar.getByText('71%')).toBeVisible();
    await toolbar.getByRole('button', { name: 'Zoom out' }).click();
    await expect(toolbar.getByText('51%')).toBeVisible();
    await toolbar.getByRole('button', { name: 'Zoom out' }).click();
    await expect(toolbar.getByText('50%')).toBeVisible(); // clamped at MIN_ZOOM
    await expect(toolbar.getByRole('button', { name: 'Zoom out' })).toBeDisabled();

    await toolbar.getByRole('button', { name: 'Fit garden' }).click();
    await expect(toolbar.getByText('100%')).toBeVisible();
    await toolbar.getByRole('button', { name: 'Zoom in' }).click();
    await expect(toolbar.getByText('140%')).toBeVisible();
    await toolbar.getByRole('button', { name: 'Zoom in' }).click();
    await expect(toolbar.getByText('196%')).toBeVisible();

    await toolbar.getByRole('button', { name: 'Fit garden' }).click();
    await expect(toolbar.getByText('100%')).toBeVisible();

    // Reset also clears the selection
    await map.getByRole('button', { name: /Lavender/ }).click();
    const inspector = map.getByRole('complementary', { name: 'Plant inspector' });
    await expect(inspector.getByRole('heading', { name: 'Lavender' })).toBeVisible();
    await toolbar.getByRole('button', { name: 'Reset view and selection' }).click();
    await expect(inspector.getByText('Select a plant on the map')).toBeVisible();
  });
});
