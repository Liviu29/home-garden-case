import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { gardenDto, plantDto, signIn } from '../support/helpers';

/**
 * Automated WCAG scan + keyboard behaviour smoke.
 * Scans run on data-loaded states; serious/critical violations fail.
 */

async function mockHappyData(page: Page): Promise<void> {
  // Scan settled UI, not mid-animation opacity blends (axe computes blended
  // colors); the app's motion system collapses under reduced motion anyway.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/gardens', (route) =>
    route.fulfill({
      json: [
        gardenDto({ gardenId: 1, gardenName: 'Axe Garden', totalSurfaceArea: 20 }),
        gardenDto({ gardenId: 2, gardenName: 'Second Garden', totalSurfaceArea: 8 }),
      ],
    }),
  );
  await page.route('**/api/gardens/1', (route) =>
    route.fulfill({ json: gardenDto({ gardenId: 1, gardenName: 'Axe Garden' }) }),
  );
  await page.route('**/api/plants/garden/*', (route) =>
    route.fulfill({
      json: [
        plantDto({ plantId: 1, gardenId: 1, name: 'Tomato', area: 6 }),
        plantDto({ plantId: 2, gardenId: 1, name: 'Basil', area: 2 }),
      ],
    }),
  );
}

async function expectNoSeriousViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    serious,
    `${context}: ${serious.map((v) => `${v.id} (${v.impact}): ${v.help}`).join('; ')}`,
  ).toEqual([]);
}

test.describe('axe scans (serious/critical must be zero)', () => {
  test('dashboard — light and dark themes', async ({ page }) => {
    await signIn(page);
    await mockHappyData(page);
    await page.goto('/dashboard');
    await expect(page.locator('.health-card').first()).toBeVisible();
    // Hydrate the deferred portfolio map so the scan covers the chart too.
    await page.getByRole('heading', { name: 'Portfolio map' }).scrollIntoViewIfNeeded();
    await expect(page.locator('app-chart .highcharts-root')).toBeVisible();
    await expectNoSeriousViolations(page, 'dashboard/light');

    await page.getByRole('button', { name: /Switch to dark theme/ }).click();
    await expectNoSeriousViolations(page, 'dashboard/dark');
  });

  test('gardens grid', async ({ page }) => {
    await signIn(page);
    await mockHappyData(page);
    await page.goto('/gardens');
    await expect(page.locator('article.card').first()).toBeVisible();
    await expectNoSeriousViolations(page, 'gardens');
  });

  test('garden detail with plants — including the rendered Garden Map', async ({ page }) => {
    await signIn(page);
    await mockHappyData(page);
    await page.goto('/gardens/1');
    await expect(page.getByRole('cell', { name: /Tomato/ })).toBeVisible();
    // Hydrate the deferred map so the scan covers the digital twin too.
    await page.getByRole('heading', { name: 'Garden plan' }).scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('region', { name: 'Garden plan' }).getByRole('button', { name: /Tomato/ }),
    ).toBeVisible();
    // …and the humidity profile below it.
    await page.getByRole('heading', { name: 'Humidity profile' }).scrollIntoViewIfNeeded();
    await expect(page.locator('app-chart .highcharts-root')).toBeVisible();
    await expectNoSeriousViolations(page, 'garden-detail');
  });
});

test.describe('keyboard behaviour', () => {
  test('plant dialog: focus moves in, Escape closes and returns focus to the trigger', async ({
    page,
  }) => {
    await signIn(page);
    await mockHappyData(page);
    await page.goto('/gardens/1');

    const trigger = page.getByRole('button', { name: /Add plant/ });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Focus moves into the dialog (autofocus lands on the first field —
    // now the catalog search — asserted as behaviour with a real wait)
    await expect(page.getByLabel('Search the plant catalog')).toBeFocused();

    // Tab reaches form fields without leaving the dialog
    await page.keyboard.press('Tab');
    const stillInDialog = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('mat-dialog-container')),
    );
    expect(stillInDialog).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused(); // CDK restores focus to the trigger
  });

  test('inverted surfaces (toast, skip link) stay readable in BOTH themes', async ({ page }) => {
    // Regression: the toast painted `background: var(--text-1)` with
    // `color: var(--text-on-dark)`. The dark theme flips --text-1 to near-white
    // while --text-on-dark stays near-white, so every toast rendered as
    // invisible text on a white pill. Axe never caught it — no toast is on
    // screen during a page scan.
    const relativeLuminance = ([r, g, b]: number[]): number => {
      const f = (c: number): number => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const contrast = (a: string, b: string): number => {
      const parse = (c: string): number[] =>
        (c.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
      const [l1, l2] = [relativeLuminance(parse(a)), relativeLuminance(parse(b))].sort(
        (x, y) => y - x,
      );
      return (l1 + 0.05) / (l2 + 0.05);
    };

    await signIn(page);
    await mockHappyData(page);
    await page.goto('/gardens/1');
    // Both surfaces paint the same token pair (--surface-inverse behind
    // --text-on-inverse). A toast is on screen only briefly, so the pair is
    // measured directly, through a probe element, in each theme.

    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((t) => {
        localStorage.setItem('itp-home-garden.theme', t);
        document.documentElement.setAttribute('data-theme', t);
      }, theme);

      const measured = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.background = 'var(--surface-inverse)';
        probe.style.color = 'var(--text-on-inverse)';
        document.body.appendChild(probe);
        const cs = getComputedStyle(probe);
        const out = { bg: cs.backgroundColor, fg: cs.color };
        probe.remove();
        return out;
      });

      expect(
        contrast(measured.bg, measured.fg),
        `inverted surface contrast in ${theme} theme`,
      ).toBeGreaterThan(4.5);
    }
  });

  test('garden map plots are keyboard-operable: focus + Enter selects', async ({ page }) => {
    await signIn(page);
    await mockHappyData(page);
    await page.goto('/gardens/1');
    await page.getByRole('heading', { name: 'Garden plan' }).scrollIntoViewIfNeeded();

    const map = page.getByRole('region', { name: 'Garden plan' });
    const plot = map.getByRole('button', { name: /Basil/ });
    await plot.focus();
    await page.keyboard.press('Enter');

    await expect(plot).toHaveAttribute('aria-pressed', 'true');
    await expect(
      map
        .getByRole('complementary', { name: 'Plant inspector' })
        .getByRole('heading', { name: 'Basil' }),
    ).toBeVisible();
  });
});
