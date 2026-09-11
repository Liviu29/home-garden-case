import { Page, expect } from '@playwright/test';

/** Unique per test invocation (retries re-import the module in a new worker). */
export const uniqueName = (prefix: string): string =>
  `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

/** The synthetic profile every suite runs as. */
export const E2E_PROFILE = {
  userId: 999,
  emailAddress: 'e2e@example.com',
  firstName: 'E2E',
  lastName: 'Runner',
  age: null,
} as const;

/**
 * Establish a profile session without driving the onboarding UI every time.
 *
 * The app revalidates the persisted session against `GET /users/{userId}` on
 * boot and signs out on a 404 (a profile really can vanish — the backend audit
 * added this). Our synthetic profile does not exist server-side, so that single
 * lookup is stubbed here. Every other request is up to the test: the real API
 * in the integration project, the test's own routes in the mocked project
 * (which fails on any request left unrouted — see `fixtures.ts`). The
 * revalidation behaviour itself is covered in `welcome.spec.ts`.
 */
export async function signIn(page: Page): Promise<void> {
  await page.route(`**/api/users/${E2E_PROFILE.userId}`, (route) =>
    route.fulfill({ json: { ...E2E_PROFILE, createdAt: '', updatedAt: '' } }),
  );
  await page.addInitScript((profile) => {
    localStorage.setItem('itp-home-garden.session', JSON.stringify(profile));
  }, E2E_PROFILE);
}

/**
 * Wait until a just-opened Material dialog has finished grabbing focus.
 *
 * The CDK moves initial focus AFTER the open animation. Filling before that
 * lets the focus steal land between Playwright's focus() and its text
 * insertion, so the text ends up in the autofocused field instead (this was
 * the cause of intermittent failures in dialog flows — not the 10% API).
 */
export async function awaitDialogSettled(page: Page, firstFieldLabel: string): Promise<void> {
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel(firstFieldLabel)).toBeFocused();
}

/** Create a garden through the UI and wait until it is fully committed. */
export async function createGarden(page: Page, name: string, area: string): Promise<void> {
  await page.getByRole('button', { name: /New garden/ }).click();
  await awaitDialogSettled(page, 'Garden name');
  await page.getByLabel('Garden name').fill(name);
  await page.getByLabel('Total surface area (m²)').fill(area);
  await page.getByRole('button', { name: 'Create garden' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); // closes only on success
  await expect(page.getByTestId('garden-card').filter({ hasText: name })).toBeVisible();
}

/** Open a garden's detail from the gardens grid. */
export async function openDetail(page: Page, name: string): Promise<void> {
  await page.getByTestId('garden-card').filter({ hasText: name }).getByRole('link').first().click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

/** Add a plant through the detail screen's dialog. */
export async function addPlant(
  page: Page,
  plant: { name: string; species: string; area: string },
): Promise<void> {
  await page.getByRole('button', { name: /Add plant/ }).click();
  await awaitDialogSettled(page, 'Search the plant catalog');
  await page.getByLabel('Plant name').fill(plant.name);
  await page.getByLabel('Species').fill(plant.species);
  await page.getByLabel('Surface area required (m²)').fill(plant.area);
  await page.getByRole('button', { name: 'Add plant', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: new RegExp(plant.name) })).toBeVisible();
}

// ── Shared UI contracts ─────────────────────────────────────────────────────

/** Every spinner the app could render. The async-UX contract allows none. */
export const SPINNER_SELECTOR =
  'mat-spinner, mat-progress-spinner, .mat-mdc-progress-spinner, .spinner';

/**
 * A snapshot on purpose: a retrying `toHaveCount(0)` would wait for a spinner
 * to disappear and then pass. This fails if one is on screen at this moment.
 */
export async function expectNoSpinner(page: Page): Promise<void> {
  expect(await page.locator(SPINNER_SELECTOR).count(), 'a spinner is on screen').toBe(0);
}

/** How far the document scrolls sideways, in px. It must be 0 at every width. */
export async function documentOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

// ── Mock payload builders (DTO shapes mirror apps/api zod schemas) ───────────

export interface GardenDtoSeed {
  gardenId: number;
  gardenName: string;
  totalSurfaceArea?: number;
  targetHumidityLevel?: number;
}

export function gardenDto(seed: GardenDtoSeed) {
  return {
    gardenId: seed.gardenId,
    gardenName: seed.gardenName,
    totalSurfaceArea: seed.totalSurfaceArea ?? 20,
    targetHumidityLevel: seed.targetHumidityLevel ?? 50,
    locationDescription: null,
    latitude: null,
    longitude: null,
    createdAt: '2026-04-01 00:00:00',
    updatedAt: '2026-04-01 00:00:00',
  };
}

/**
 * Serve a fixed set of plants for both reads the app makes: `GET /plants`
 * (one request for every garden on the grid and the dashboard) and
 * `GET /plants/garden/{id}` (the detail screen, or a single garden). Anything
 * that is not a GET falls through to routes the test registers itself.
 */
export async function routePlants(
  page: Page,
  plants: readonly { gardenId: number }[],
): Promise<void> {
  await page.route('**/api/plants', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: plants }) : route.fallback(),
  );
  await page.route('**/api/plants/garden/*', (route) => {
    const gardenId = Number(new URL(route.request().url()).pathname.split('/').pop());
    return route.fulfill({ json: plants.filter((p) => p.gardenId === gardenId) });
  });
}

export function plantDto(seed: { plantId: number; gardenId: number; name: string; area: number }) {
  return {
    plantId: seed.plantId,
    plantName: seed.name,
    species: 'Species test',
    plantType: 'vegetable' as const,
    plantationDate: '2026-04-01T00:00:00.000Z',
    surfaceAreaRequired: seed.area,
    idealHumidityLevel: 60,
    gardenId: seed.gardenId,
    createdAt: '2026-04-01 00:00:00',
    updatedAt: '2026-04-01 00:00:00',
  };
}
