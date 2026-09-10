import { expect, test } from '@playwright/test';

/**
 * Welcome / profile selection (upgrade brief §52–57): content-shaped skeleton
 * on the profiles GET (no spinner), zero-profile onboarding state, multiple
 * profiles, create-profile POST ghost, immediate synchronous selection, and a
 * mobile smoke. Deterministic via route mocks.
 */

const profile = (userId: number, email: string, first: string | null, last: string | null) => ({
  userId,
  emailAddress: email,
  firstName: first,
  lastName: last,
  age: null,
});

const one = [profile(1, 'liviu@example.com', 'Liviu-Petrut', 'Nita')];
const three = [
  ...one,
  profile(2, 'monica@example.com', 'Monica', 'D'),
  profile(3, 'gardener@example.com', null, null),
];

test.describe('welcome / profile selection', () => {
  test('profiles GET shows geometry-matched gray skeletons — never a spinner — then real cards', async ({
    page,
  }) => {
    await page.route('**/api/users', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.fulfill({ json: one });
    });
    await page.goto('/welcome');

    // Branding + headings are local and render immediately
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    // Content-shaped ghosts in the profile area
    await expect(page.locator('.profile.ghost-card')).toHaveCount(2);
    await expect(page.locator('.create-card.ghost-card')).toBeVisible();
    expect(await page.locator('mat-spinner, mat-progress-spinner, .spinner').count()).toBe(0);

    // Data lands: real card replaces ghosts, same geometry
    await expect(page.getByRole('button', { name: /Liviu-Petrut Nita/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('.ghost-card')).toHaveCount(0);
  });

  test('a slow profiles GET never flashes the zero-profile state first', async ({ page }) => {
    // Regression: the skeleton appears after a short delay, and during that
    // window the profile list is still empty. Rendering the "no profiles yet"
    // onboarding there tells the user something untrue about their account.
    await page.route('**/api/users', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.fulfill({ json: one });
    });

    // A MutationObserver sees EVERY intermediate DOM state, where polling on a
    // timer only samples some of them — so this is both deterministic and a
    // strictly stronger assertion than the sampling loop it replaces.
    await page.addInitScript(() => {
      (window as unknown as { __zeroStateSeen: boolean }).__zeroStateSeen = false;
      const check = (): void => {
        if (document.querySelector('.zero-state')) {
          (window as unknown as { __zeroStateSeen: boolean }).__zeroStateSeen = true;
        }
      };
      new MutationObserver(check).observe(document, { childList: true, subtree: true });
      check();
    });

    await page.goto('/welcome');
    await expect(page.getByRole('button', { name: /Liviu-Petrut Nita/ })).toBeVisible({
      timeout: 10_000,
    });

    const zeroStateEverRendered = await page.evaluate(
      () => (window as unknown as { __zeroStateSeen: boolean }).__zeroStateSeen,
    );
    expect(zeroStateEverRendered).toBe(false);
  });

  test('selecting a profile is synchronous — immediate navigation, no manufactured loading', async ({
    page,
  }) => {
    await page.route('**/api/users', (r) => r.fulfill({ json: one }));
    await page.route('**/api/gardens', (r) => r.fulfill({ json: [] }));
    await page.goto('/welcome');

    await page.getByRole('button', { name: /Liviu-Petrut Nita/ }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: /Good/ })).toBeVisible();
  });

  test('zero profiles renders the designed onboarding state with a clear CTA', async ({ page }) => {
    await page.route('**/api/users', (r) => r.fulfill({ json: [] }));
    await page.goto('/welcome');

    await expect(page.getByRole('heading', { name: 'Welcome to HomeGarden' })).toBeVisible();
    await expect(page.getByText('Your garden journey starts here.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create your profile' })).toBeVisible();
    await expect(page.locator('.profile')).toHaveCount(0); // no awkward blank card
  });

  test('three profiles lay out cleanly and stay keyboard-navigable', async ({ page }) => {
    await page.route('**/api/users', (r) => r.fulfill({ json: three }));
    await page.goto('/welcome');

    await expect(page.locator('.profile')).toHaveCount(3);
    // The nameless profile falls back to its email as the accessible name
    await expect(page.getByRole('button', { name: /gardener@example.com/ })).toBeVisible();

    // Keyboard: tab reaches a profile card and Enter activates it
    await page.route('**/api/gardens', (r) => r.fulfill({ json: [] }));
    await page.getByRole('button', { name: /Liviu-Petrut Nita/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('the create-profile card lines up with the profile cards above it', async ({ page }) => {
    // Regression: the dashed "+" ring was 2.25rem while the avatars are
    // 2.75rem, so the whole name/subtitle column of the last card sat 8px
    // left of the three above — a visible ragged edge in the one panel that
    // is the product's first impression.
    await page.route('**/api/users', (r) => r.fulfill({ json: three }));
    await page.goto('/welcome');
    await expect(page.locator('.profile:not(.ghost-card)')).toHaveCount(3);

    const columnX = async (locator: ReturnType<typeof page.locator>): Promise<number> => {
      const box = await locator.locator('.name').boundingBox();
      return Math.round(box!.x);
    };

    const first = await columnX(page.locator('.profile').first());
    const last = await columnX(page.locator('.profile').last());
    const create = await columnX(page.locator('.create-card'));

    expect(last).toBe(first);
    expect(create, 'create-card text column must match the profile cards').toBe(first);
  });

  test('the scrolling profile list leaves room for the focus ring', async ({ page }) => {
    // Regression: the list is a scroll container (max-height + overflow-y),
    // which also clips horizontally, and --focus-ring is a box-shadow drawn
    // 4px OUTSIDE the card. With the cards flush to the container the ring's
    // left and right sides were sliced off — keyboard users saw a broken box.
    await page.route('**/api/users', (r) => r.fulfill({ json: three }));
    await page.goto('/welcome');
    await expect(page.locator('.profile:not(.ghost-card)')).toHaveCount(3);

    const room = await page.evaluate(() => {
      const list = document.querySelector('.profiles') as HTMLElement;
      const card = document.querySelector('.profile') as HTMLElement;
      const l = list.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      const ring = getComputedStyle(document.documentElement).getPropertyValue('--focus-ring');
      return {
        left: c.left - l.left,
        right: l.right - c.right,
        // widest offset the ring token draws outside the element
        ringPx: Math.max(...[...ring.matchAll(/(\d+)px(?=\s+(?:#|var|rgb))/g)].map((m) => +m[1])),
      };
    });

    expect(room.ringPx).toBeGreaterThan(0);
    expect(room.left, 'left room for the focus ring').toBeGreaterThanOrEqual(room.ringPx);
    expect(room.right, 'right room for the focus ring').toBeGreaterThanOrEqual(room.ringPx);
  });

  test('creating a profile shows a ghost bar on the submit button — no spinner — then signs in', async ({
    page,
  }) => {
    let releasePost: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (releasePost = resolve));
    await page.route('**/api/users', async (route) => {
      if (route.request().method() !== 'POST') {
        return route.fulfill({ json: [] });
      }
      await gate;
      return route.fulfill({ json: profile(9, 'new@example.com', 'New', 'Gardener') });
    });
    await page.route('**/api/gardens', (r) => r.fulfill({ json: [] }));
    await page.goto('/welcome');

    await page.getByRole('button', { name: 'Create your profile' }).click();
    await page.getByLabel('Email address').fill('new@example.com');
    await page.getByLabel('First name').fill('New');
    await page.getByRole('button', { name: /Create & continue/ }).click();

    // In flight: ghost bar, disabled controls, zero spinners
    await expect(page.locator('form .btn-ghost')).toBeVisible();
    expect(await page.locator('mat-spinner, mat-progress-spinner, .spinner').count()).toBe(0);

    releasePost();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test('mobile 375×812 — compact branding, selectable profile, no horizontal overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.route('**/api/users', (r) => r.fulfill({ json: three }));
    await page.goto('/welcome');

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.locator('.profile').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create new profile' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('profile capabilities the API exposes (backend audit)', () => {
  test('a duplicate email (409) offers to continue as the existing profile', async ({ page }) => {
    // Verified against the real API: POST /users with a known address answers
    // 409 {error:"Conflict error", details:["User with email x already exists"]}
    await page.route('**/api/users', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 409,
          json: {
            error: 'Conflict error',
            details: ['User with email liviu@example.com already exists'],
          },
        });
      }
      return route.fulfill({ json: [] });
    });
    await page.route('**/api/users/email/**', (route) => route.fulfill({ json: one[0] }));
    await page.route('**/api/users/1', (route) => route.fulfill({ json: one[0] }));
    await page.route('**/api/gardens', (route) => route.fulfill({ json: [] }));
    await page.goto('/welcome');

    await page.getByRole('button', { name: 'Create your profile' }).click();
    await page.getByLabel('Email address').fill('liviu@example.com');
    await page.getByRole('button', { name: /Create & continue/ }).click();

    // Not a dead end: the 409 becomes an actionable recovery path
    await expect(page.getByText('A profile already uses that email address.')).toBeVisible();
    await page.getByRole('button', { name: /Continue as liviu@example.com/ }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('a session pointing at a deleted profile is signed out on boot', async ({ page }) => {
    // GET /users/{userId} → 404 means the profile really is gone.
    await page.addInitScript(() => {
      localStorage.setItem(
        'itp-home-garden.session',
        JSON.stringify({ userId: 4242, emailAddress: 'ghost@example.com', firstName: 'Ghost' }),
      );
    });
    await page.route('**/api/users/4242', (route) =>
      route.fulfill({
        status: 404,
        json: { error: 'Not found error', details: ['User with ID 4242 not found'] },
      }),
    );
    await page.route('**/api/users', (route) => route.fulfill({ json: one }));
    await page.route('**/api/gardens', (route) => route.fulfill({ json: [] }));

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/welcome/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });

  test('a transient 500 on that check never signs the user out', async ({ page }) => {
    // The API fails 10% of ALL requests at random — that must not end a session.
    await page.addInitScript(() => {
      localStorage.setItem(
        'itp-home-garden.session',
        JSON.stringify({ userId: 7, emailAddress: 'steady@example.com', firstName: 'Steady' }),
      );
    });
    await page.route('**/api/users/7', (route) =>
      route.fulfill({
        status: 500,
        json: { error: 'Internal server error', details: ['Random error thrown'] },
      }),
    );
    await page.route('**/api/gardens', (route) => route.fulfill({ json: [] }));

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /Good/ })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
