import { expect, test, type Page } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

/**
 * The whole-body tests use the checked-in, draft-only BodyParts3D models.
 * They exercise real mixed-file layers and real GLB integration, not just
 * the single-file synthetic fixture. No draft is approved by these tests.
 */
async function openWholeBody(page: Page): Promise<void> {
  await page.goto('/preview/anatomy-lab');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  // The canvas appears before the opening scene has finished preparing.
  await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });
  const whole = page.getByRole('group', { name: 'body system' })
    .getByRole('button', { name: 'whole body', exact: true });
  await expect(whole).toBeVisible({ timeout: 15_000 });
  await whole.click();
  await expect(page.getByTestId('anatomy-files'))
    .toContainText('model files loaded: 1 of 11', { timeout: 20_000 });
}

const structures = (page: Page) => page.getByRole('region', { name: 'structures' });

test.describe('anatomy whole-body network races', () => {
  test('a partly failed mixed-file layer keeps its completed GLB and retries only the failed GLB', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one real-model network regression per browser engine');
    await openWholeBody(page);

    let heartRequests = 0;
    let vesselsRequests = 0;
    await page.route('**/models/anatomy/heart.glb', async (route) => {
      heartRequests++;
      await route.continue();
    });
    await page.route('**/models/anatomy/vessels.glb', async (route) => {
      vesselsRequests++;
      if (vesselsRequests === 1) await route.abort('failed');
      else await route.continue();
    });

    const vessels = page.getByRole('group', { name: 'layers, skin to bone' })
      .getByRole('button', { name: /^vessels \(/ });
    await vessels.press('Enter');

    // The vessels layer requests two files. Heart is shared with organs and
    // must be integrated even though the vessels model failed.
    const files = page.getByTestId('anatomy-files');
    await expect(files).toContainText('model files loaded: 2 of 11', { timeout: 20_000 });
    await expect(page.getByRole('alert').filter({ hasText: 'Could not load vessels.' }))
      .toBeVisible({ timeout: 20_000 });
    await page.getByLabel('find a structure').fill('heart');
    await expect(structures(page).getByRole('button', { name: 'heart (hidden)', exact: true }))
      .toBeEnabled();
    expect(heartRequests).toBe(1);
    expect(vesselsRequests).toBe(1);

    await page.getByRole('button', { name: 'try vessels again' }).press('Enter');
    await expect(files).toContainText('model files loaded: 3 of 11', { timeout: 20_000 });
    await expect(page.getByRole('alert').filter({ hasText: 'Could not load vessels.' }))
      .toHaveCount(0);

    // A retry cannot discard or re-fetch the heart that was already decoded.
    expect(heartRequests).toBe(1);
    expect(vesselsRequests).toBe(2);
    // The retry finishes the layer reveal: the previously hidden heart is now
    // visible, without another heart request or a second decoded GLB.
    await expect(structures(page).getByRole('button', { name: 'heart', exact: true }))
      .toBeEnabled();
    await expect(page.getByRole('group', { name: 'layers, skin to bone' })
      .getByRole('button', { name: /^vessels \\(/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a late successful show-all GLB cannot override a newer show-only choice', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one real-model visibility race per browser engine');
    await openWholeBody(page);
    const files = page.getByTestId('anatomy-files');

    // Skin is the only initially fetched layer. Select it before requesting
    // deeper layers so the name card stays available during the download.
    await page.getByLabel('find a structure').fill('skin');
    const skin = structures(page).getByRole('button', { name: 'skin', exact: true });
    await expect(skin).toBeEnabled();
    await skin.click();
    const skinCard = page.getByRole('region', { name: 'skin' });
    await expect(skinCard.getByRole('button', { name: 'show only this' })).toBeVisible();

    const heldMuscle: Array<() => void> = [];
    let muscleRequests = 0;
    // Only allow a single delayed muscle GLB to complete. Abort the other
    // show-all requests to avoid rendering the full 1.3m-triangle scene in CI.
    // This must test a successful stale download, not just a failed request.
    await page.route(/\/models\/anatomy\/[^/]+\.glb(?:\?|$)/, async (route) => {
      if (/\/muscle\.glb(?:\?|$)/.test(route.request().url())) {
        muscleRequests++;
        await new Promise<void>((resolve) => { heldMuscle.push(resolve); });
        await route.continue();
      } else {
        await route.abort('failed');
      }
    });

    try {
      await page.getByRole('button', { name: 'show all', exact: true }).click();
      await expect.poll(() => heldMuscle.length, { timeout: 20_000 }).toBe(1);

      // This later explicit action owns visibility even when the older
      // show-all request has already downloaded, decoded or queued files.
      await skinCard.getByRole('button', { name: 'show only this' }).click();
      await expect(skin).toHaveAttribute('aria-pressed', 'true');
    } finally {
      // Always release the delayed network request, including on failure.
      heldMuscle.splice(0).forEach((release) => release());
    }

    await expect(files).toContainText('model files loaded: 2 of 11', { timeout: 20_000 });
    await page.getByLabel('find a structure').fill('diaphragm');
    await expect(structures(page).getByRole('button', { name: 'diaphragm (hidden)', exact: true }))
      .toBeEnabled({ timeout: 20_000 });
    await expect(page.getByRole('group', { name: 'layers, skin to bone' })
      .getByRole('button', { name: /^muscle \(/ })).toHaveAttribute('aria-pressed', 'false');
    expect(muscleRequests).toBe(1);
  });
});
