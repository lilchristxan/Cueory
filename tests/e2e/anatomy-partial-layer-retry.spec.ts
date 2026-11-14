import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

/**
 * Anatomy QA section 2: a partially failed whole-body layer must retain any
 * successful GLB and retry only the failed file. This uses actual draft
 * model files on the locked draft-enabled test build, never fixture anatomy.
 */
test('a failed layer keeps its successful GLB and retries only the failed file', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one model-network regression per browser engine');

  await page.goto('/preview/anatomy-lab');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });

  const wholeBody = page.getByRole('group', { name: 'body system' })
    .getByRole('button', { name: 'whole body', exact: true });
  await expect(wholeBody).toBeVisible({ timeout: 15_000 });

  // Install interception after the first system has finished loading, to
  // count only this whole-body layer's file requests.
  let heartRequests = 0;
  let vesselRequests = 0;
  await page.route('**/models/anatomy/heart.glb', async (route) => {
    heartRequests++;
    await route.continue();
  });
  await page.route('**/models/anatomy/vessels.glb', async (route) => {
    vesselRequests++;
    if (vesselRequests === 1) {
      await route.fulfill({ status: 503, contentType: 'text/plain', body: 'temporary test failure' });
    } else {
      await route.continue();
    }
  });

  await wholeBody.click();
  const files = page.getByTestId('anatomy-files');
  await expect(files).toContainText('model files loaded: 1 of 11', { timeout: 20_000 });

  const vessels = page.getByRole('group', { name: 'layers, skin to bone' })
    .getByRole('button', { name: /^vessels \\(/ });
  await vessels.press('Enter');

  // The heart GLB succeeds even though vessels.glb failed in the same layer.
  const error = page.getByRole('alert').filter({ hasText: 'Could not load vessels.' });
  await expect(error).toBeVisible({ timeout: 20_000 });
  await expect(files).toContainText('model files loaded: 2 of 11', { timeout: 20_000 });
  await page.getByLabel('find a structure').fill('heart');
  const heart = page.getByRole('region', { name: 'structures' })
    .getByRole('button', { name: 'heart (hidden)', exact: true });
  await expect(heart).toBeEnabled({ timeout: 20_000 });
  expect(heartRequests, 'the successful GLB was requested once').toBe(1);
  expect(vesselRequests, 'the failed GLB was attempted once').toBe(1);

  // Retry from the visible and keyboard-operable error control.
  const retry = page.getByRole('button', { name: 'try vessels again' });
  await expect(retry).toBeVisible();
  await retry.press('Enter');
  await expect(files).toContainText('model files loaded: 3 of 11', { timeout: 20_000 });
  await expect(error).toHaveCount(0);
  await expect(heart).toBeEnabled();
  expect(heartRequests, 'retry must reuse the successful heart GLB').toBe(1);
  expect(vesselRequests, 'retry must fetch the failed vessels GLB exactly once more').toBe(2);
});
