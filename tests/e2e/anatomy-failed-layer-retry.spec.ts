import { expect, test } from '@playwright/test';

/**
 * Task 178 release QA: a whole-body layer can span multiple GLBs. A failed file
 * must not hide another file that finished, and retry must not download that
 * successful file a second time. Uses only the checked-in draft source models.
 */
test('a failed layer keeps its successful GLB and retries only the missing file', async ({ page }) => {
  test.setTimeout(90_000);

  // Begin with the code-made fixture, so no real layer file has been cached
  // by the first system before network interception begins.
  await page.goto('/preview/anatomy-lab?fixture');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });

  const whole = page.getByRole('group', { name: 'body system' })
    .getByRole('button', { name: 'whole body', exact: true });
  await expect(whole).toBeVisible({ timeout: 15_000 });
  await whole.click();

  const loaded = page.getByTestId('anatomy-files');
  await expect(loaded).toContainText('model files loaded: 1 of 11', { timeout: 20_000 });

  let vesselsRequests = 0;
  let heartRequests = 0;
  // Vessels needs vessels.glb AND heart.glb, even though heart is also an organ.
  // Fail just the first vessels request, while heart.glb must finish normally.
  await page.route('**/models/anatomy/vessels.glb', async (route) => {
    vesselsRequests++;
    if (vesselsRequests === 1) {
      await route.fulfill({ status: 503, contentType: 'text/plain', body: 'temporary test failure' });
    } else {
      await route.continue();
    }
  });
  await page.route('**/models/anatomy/heart.glb', async (route) => {
    heartRequests++;
    await route.continue();
  });

  const layers = page.getByRole('group', { name: 'layers, skin to bone' });
  const vessels = layers.getByRole('button', { name: /^vessels \(/ });
  await vessels.click();

  // The layer failed, but the heart file completed and is still available
  // in the searchable catalog. No page refresh is needed to recover.
  await expect(page.getByRole('alert')).toContainText('Could not load vessels', { timeout: 20_000 });
  await expect(loaded).toContainText('model files loaded: 2 of 11', { timeout: 20_000 });
  await page.getByRole('searchbox', { name: 'find a structure' }).fill('heart');
  const structures = page.getByRole('region', { name: 'structures' });
  await expect(structures.getByRole('button', { name: 'heart (hidden)', exact: true }))
    .toBeEnabled();
  expect(vesselsRequests).toBe(1);
  expect(heartRequests).toBe(1);

  await page.getByRole('button', { name: 'try vessels again' }).click();
  await expect(loaded).toContainText('model files loaded: 3 of 11', { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'try vessels again' })).toHaveCount(0);
  await expect(structures.getByRole('button', { name: 'heart', exact: true }))
    .toBeEnabled();
  expect(vesselsRequests).toBe(2);
  expect(heartRequests).toBe(1);
});
