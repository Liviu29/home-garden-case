import { expect, test } from '@playwright/test';
import { awaitDialogSettled, gardenDto, signIn } from '../support/helpers';

/**
 * Deterministic UI-state flows (network controlled via page.route):
 * the real backend fails *randomly*, so guaranteed error/slow/empty states
 * can only be tested here. Real-contract confidence lives in the
 * integration project.
 */

test.describe('empty states (Flow 7)', () => {
  test('zero gardens shows the designed empty state with a create CTA', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/gardens', (route) => route.fulfill({ json: [] }));
    await page.goto('/gardens');

    await expect(page.getByText('No gardens yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create your first garden' })).toBeVisible();
  });

  test('a garden without plants shows the designed empty plants state', async ({ page }) => {
    await signIn(page);
    await page.route('**/api/gardens/5', (route) =>
      route.fulfill({ json: gardenDto({ gardenId: 5, gardenName: 'Bare Garden' }) }),
    );
    await page.route('**/api/plants/garden/5', (route) => route.fulfill({ json: [] }));
    await page.goto('/gardens/5');

    await expect(page.getByRole('heading', { name: 'Bare Garden' })).toBeVisible();
    await expect(page.getByText('Nothing planted yet')).toBeVisible();
    // The gauge stays honest with no data (REM-008)
    await expect(page.getByText('no plants yet').first()).toBeVisible();
  });
});

test.describe('API failure and recovery (Flow 8)', () => {
  test('persistent 500 shows the designed error state; retry recovers', async ({ page }) => {
    await signIn(page);
    let healthy = false;
    await page.route('**/api/gardens', (route) =>
      healthy
        ? route.fulfill({ json: [gardenDto({ gardenId: 1, gardenName: 'Recovered Garden' })] })
        : route.fulfill({ status: 500, json: { error: 'Random error thrown' } }),
    );
    await page.goto('/gardens');

    // Retry interceptor exhausts its budget (4 attempts), then the error state renders
    await expect(page.getByText("Couldn't load your gardens")).toBeVisible({ timeout: 45_000 });

    healthy = true;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('article.card', { hasText: 'Recovered Garden' })).toBeVisible();
  });
});

test.describe('slow reads render skeletons (Flow 9)', () => {
  test('skeleton appears during a delayed read, content replaces it, layout stays stable', async ({
    page,
  }) => {
    await signIn(page);
    await page.route('**/api/gardens', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.fulfill({ json: [gardenDto({ gardenId: 1, gardenName: 'Slow Garden' })] });
    });
    await page.route('**/api/plants/garden/*', (route) => route.fulfill({ json: [] }));
    await page.goto('/gardens');

    // Accessible skeleton state while the read is in flight
    const loading = page.getByRole('status');
    await expect(loading).toBeVisible();
    await expect(loading).toContainText('Loading');

    // Content replaces the ghosts; loading state is gone
    await expect(page.locator('article.card', { hasText: 'Slow Garden' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);

    // Layout stability: no horizontal overflow before or after the swap
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test('skeleton does not remain after an error — the error state replaces it', async ({
    page,
  }) => {
    await signIn(page);
    await page.route('**/api/gardens', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({ status: 500, json: { error: 'Random error thrown' } });
    });
    await page.goto('/gardens');

    await expect(page.getByRole('status')).toBeVisible(); // ghosts first
    await expect(page.getByText("Couldn't load your gardens")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('status')).toHaveCount(0); // never both at once
  });
});

test.describe('mutation pending state (Flow 10)', () => {
  test('a slow save shows pending feedback and prevents duplicate submission', async ({ page }) => {
    await signIn(page);
    let postCount = 0;
    await page.route('**/api/gardens', async (route) => {
      if (route.request().method() === 'POST') {
        postCount++;
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await route.fulfill({
          status: 201,
          json: gardenDto({ gardenId: 42, gardenName: 'Pending Garden', totalSurfaceArea: 9 }),
        });
        return;
      }
      await route.fulfill({ json: [] });
    });
    await page.goto('/gardens');
    await expect(page.getByText('No gardens yet')).toBeVisible();

    await page.getByRole('button', { name: 'Create your first garden' }).click();
    await awaitDialogSettled(page, 'Garden name');
    await page.getByLabel('Garden name').fill('Pending Garden');
    const dialog = page.getByRole('dialog');
    const submit = dialog.locator('button[type="submit"]');
    await submit.click();

    // Pending feedback is a gray ghost bar — never a spinner, never bare text
    await expect(submit).toBeDisabled();
    await expect(submit.locator('.btn-ghost')).toBeVisible();
    expect(
      await page.locator('mat-spinner, mat-progress-spinner, .mat-mdc-progress-spinner').count(),
    ).toBe(0);
    await submit.click({ force: true }); // hammering the disabled button
    await submit.click({ force: true });

    await expect(page.getByRole('dialog')).toHaveCount(0); // success closes it
    await expect(page.locator('article.card', { hasText: 'Pending Garden' })).toBeVisible();
    await expect(page.getByText('created', { exact: false })).toBeVisible(); // success toast
    expect(postCount).toBe(1); // duplicate submissions never reached the network
  });
});
