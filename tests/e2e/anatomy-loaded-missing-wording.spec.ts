import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

/** Only a completed owner GLB can prove that an official structure's mesh is absent. */
test('whole-body catalog distinguishes an unfetched structure from a fully loaded missing mesh', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one real-model missing-state regression per browser engine');
  test.setTimeout(60_000);
  await page.goto('/preview/anatomy-lab');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.locator('canvas')).toBeFocused({ timeout: 20_000 });
  await page.getByRole('group', { name: 'body system' })
    .getByRole('button', { name: 'whole body', exact: true }).click();
  const files = page.getByTestId('anatomy-files');
  await expect(files).toContainText('model files loaded: 1 of 11', { timeout: 20_000 });
  await page.getByLabel('find a structure').fill('heart');
  const list = page.getByRole('region', { name: 'structures' });
  await expect(list.getByRole('button', { name: 'heart (not loaded yet)', exact: true }))
    .toBeDisabled();

  // Substitute one valid, *different* official draft GLB at the network
  // boundary. It decodes successfully, but cannot contain the heart's source
  // ID. This is test-only misrouting; production files and manifests stay intact.
  const replacement = fileURLToPath(new URL('../../public/models/anatomy/vessels.glb', import.meta.url));
  let heartRequests = 0;
  await page.route('**/models/anatomy/heart.glb', async (route) => {
    heartRequests++;
    await route.fulfill({ path: replacement, contentType: 'model/gltf-binary' });
  });
  await page.getByRole('group', { name: 'layers, skin to bone' })
    .getByRole('button', { name: /^vessels \(/ }).click();
  await expect(files).toContainText('model files loaded: 3 of 11', { timeout: 20_000 });
  await expect(list.getByRole('button', { name: 'heart (not in this model)', exact: true }))
    .toBeDisabled({ timeout: 20_000 });
  await expect(list.getByRole('button', { name: 'heart (not loaded yet)', exact: true }))
    .toHaveCount(0);
  expect(heartRequests).toBe(1);
  await expect(page.getByRole('alert').filter({ hasText: 'could not load' })).toHaveCount(0);
});
