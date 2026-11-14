import { expect, test, type Page } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

/**
 * Whole-body network regressions use the existing checked-in draft BodyParts3D
 * files. No model is released by running these tests.
 */
async function openWholeBody(page: Page) {
  await page.goto('/preview/anatomy-lab');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });
  const whole = page.getByRole('group', { name: 'body system' })
    .getByRole('button', { name: 'whole body', exact: true });
  await expect(whole).toBeVisible({ timeout: 15_000 });
  await whole.click();
  const files = page.getByTestId('anatomy-files');
  await expect(files).toContainText('model files loaded: 1 of 11', { timeout: 20_000 });
  return files;
}

const structures = (page: Page) => page.getByRole('region', { name: 'structures' });
const layerButtons = (page: Page) => page.getByRole('group', { name: 'layers, skin to bone' });

test.describe('whole-body network and layer QA', () => {
  test('a fetched GLB with a missing fixture mesh says not in this model', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one missing-mesh wording check per browser engine');
    await page.route('**/preview/anatomy-fixture/fixture.glb', async (route) => {
      const response = await route.fetch();
      const patched = Buffer.from(await response.body());
      const jsonLength = patched.readUInt32LE(12);
      const json = patched.toString('utf8', 20, 20 + jsonLength);
      // Change both node and mesh IDs, without touching geometry or the GLB
      // chunk lengths. This is a synthetic test shape, not source anatomy.
      expect((json.match(/"FIX005"/g) ?? []).length).toBe(2);
      const withoutLastShape = json.replaceAll('"FIX005"', '"OFF005"');
      expect(Buffer.byteLength(withoutLastShape)).toBe(jsonLength);
      patched.write(withoutLastShape, 20, jsonLength, 'utf8');
      await route.fulfill({ response, body: patched });
    });

    await page.goto('/preview/anatomy-lab?fixture');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(structures(page).getByRole('button', { name: 'fixture cube A', exact: true }))
      .toBeEnabled({ timeout: 20_000 });
    const missing = structures(page).getByRole('button', { name: 'fixture slab E (not in this model)', exact: true });
    await expect(missing).toBeDisabled();
    await expect(structures(page).getByRole('button', { name: 'fixture slab E (not loaded yet)', exact: true }))
      .toHaveCount(0);
  });

  test('a delayed show-all download cannot override a newer show-only choice', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one real-GLB show-all race per browser engine');
    const files = await openWholeBody(page);
    await page.getByLabel('find a structure').fill('skin');
    await structures(page).getByRole('button', { name: 'skin', exact: true }).click();
    const skinCard = page.getByRole('region', { name: 'skin' });
    await expect(skinCard.getByRole('button', { name: 'show only this' })).toBeVisible();

    const releases: Array<() => void> = [];
    const requests: string[] = [];
    // Do not decode the entire 1.3m-triangle body in routine browser CI.
    // Let only the delayed muscle model succeed, and fail unrelated GLBs.
    // This still checks the actual show-all code path and a late successful
    // layer completion after the student's newer visibility choice.
    await page.route(/\/models\/anatomy\/[^/]+\.glb(?:\?|$)/, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      requests.push(pathname);
      if (!pathname.endsWith('/muscle.glb')) {
        await route.abort('failed');
        return;
      }
      await new Promise<void>((resolve) => releases.push(resolve));
      await route.continue();
    });
    try {
      await page.getByRole('button', { name: 'show all', exact: true }).click();
      await expect.poll(() => releases.length, { timeout: 20_000 }).toBe(1);
      await skinCard.getByRole('button', { name: 'show only this' }).click();
      await expect(layerButtons(page).getByRole('button', { name: /^muscle \(/ }))
        .toHaveAttribute('aria-pressed', 'false');
    } finally {
      releases.splice(0).forEach((release) => release());
    }
    await expect(files).toContainText('model files loaded: 2 of 11', { timeout: 20_000 });
    await expect(layerButtons(page).getByRole('button', { name: /^muscle \(/ }))
      .toHaveAttribute('aria-pressed', 'false');
    await expect(structures(page).getByRole('button', { name: 'skin', exact: true }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(requests.some((path) => path.endsWith('/muscle.glb'))).toBe(true);
  });

  test('a partially failed layer keeps its successful shared GLB and retries only the failed file', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one real-GLB failure and retry per browser engine');
    const files = await openWholeBody(page);
    let heartRequests = 0;
    let vesselRequests = 0;
    await page.route('**/models/anatomy/heart.glb', (route) => {
      heartRequests++;
      return route.continue();
    });
    await page.route('**/models/anatomy/vessels.glb', (route) => {
      vesselRequests++;
      if (vesselRequests === 1) {
        return route.fulfill({ status: 503, contentType: 'text/plain', body: 'temporarily unavailable' });
      }
      return route.continue();
    });

    await layerButtons(page).getByRole('button', { name: /^vessels \(/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Could not load vessels.' }))
      .toBeVisible({ timeout: 20_000 });
    await expect(files).toContainText('model files loaded: 2 of 11', { timeout: 20_000 });

    // heart.glb succeeded even though vessels.glb failed. Its label must remain
    // usable, but the unfinished layer must not be presented as fully loaded.
    await page.getByLabel('find a structure').fill('heart');
    await expect(structures(page).getByRole('button', { name: 'heart (hidden)', exact: true })).toBeEnabled();
    await expect(page.getByTestId('anatomy-missing-count')).toHaveCount(0);

    await page.getByRole('button', { name: 'try vessels again' }).click();
    await expect(files).toContainText('model files loaded: 3 of 11', { timeout: 20_000 });
    await expect(page.getByRole('alert').filter({ hasText: 'Could not load vessels.' })).toHaveCount(0);
    await expect(structures(page).getByRole('button', { name: 'heart (hidden)', exact: true })).toBeEnabled();
    expect(heartRequests, 'the successful shared GLB is reused on retry').toBe(1);
    expect(vesselRequests, 'only the failed GLB is fetched again').toBe(2);
  });

  test('a mixed-file organs layer fetches each missing GLB without refetching shared heart', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one real mixed-file layer check per browser engine');
    const files = await openWholeBody(page);
    const requested: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/models/anatomy/') && path.endsWith('.glb')) {
        requested.push(path.split('/').pop()!);
      }
    });

    await layerButtons(page).getByRole('button', { name: /^vessels \(/ }).click();
    await expect(files).toContainText('model files loaded: 3 of 11', { timeout: 20_000 });
    expect([...requested].sort()).toEqual(['heart.glb', 'vessels.glb']);

    await page.getByLabel('find a structure').fill('heart');
    await expect(structures(page).getByRole('button', { name: 'heart (hidden)', exact: true })).toBeEnabled();
    await structures(page).getByRole('button', { name: 'show heart', exact: true }).click();
    const organs = layerButtons(page).getByRole('button', { name: /^organs \(/ });
    await expect(organs).toHaveAttribute('aria-pressed', 'true');

    // The visible heart is shared with vessels, but it cannot make lungs,
    // kidneys and digestive GLBs count as downloaded.
    await organs.click();
    await expect(files).toContainText('model files loaded: 6 of 11', { timeout: 20_000 });
    expect([...requested].sort()).toEqual([
      'digestive.glb', 'heart.glb', 'kidneys.glb', 'lungs.glb', 'vessels.glb',
    ]);
    await expect(page.getByTestId('anatomy-missing-count')).toHaveCount(0);
    await expect(organs).toHaveAttribute('aria-pressed', 'true');
    await expect(structures(page).getByRole('button', { name: 'hide heart', exact: true })).toBeVisible();
  });

  test('a newer show-only choice survives a delayed layer download', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one real-GLB visibility race per browser engine');
    const files = await openWholeBody(page);
    const search = page.getByLabel('find a structure');
    await search.fill('skin');
    await structures(page).getByRole('button', { name: 'skin', exact: true }).click();
    const skinCard = page.getByRole('region', { name: 'skin' });
    await expect(skinCard.getByRole('button', { name: 'show only this' })).toBeVisible();

    const releases: Array<() => void> = [];
    await page.route('**/models/anatomy/vessels.glb', async (route) => {
      await new Promise<void>((resolve) => releases.push(resolve));
      await route.continue();
    });
    try {
      const vessels = layerButtons(page).getByRole('button', { name: /^vessels \(/ });
      await vessels.click();
      await expect.poll(() => releases.length, { timeout: 20_000 }).toBe(1);
      await skinCard.getByRole('button', { name: 'show only this' }).click();
      await expect(vessels).toHaveAttribute('aria-pressed', 'false');
    } finally {
      // Never hold a GLB request after an assertion failure.
      releases.splice(0).forEach((release) => release());
    }

    await expect(files).toContainText('model files loaded: 3 of 11', { timeout: 20_000 });
    await expect(layerButtons(page).getByRole('button', { name: /^vessels \(/ }))
      .toHaveAttribute('aria-pressed', 'false');
    await expect(skinCard).toBeVisible();
    await search.fill('heart');
    await expect(structures(page).getByRole('button', { name: 'heart (hidden)', exact: true })).toBeEnabled();
  });
});
