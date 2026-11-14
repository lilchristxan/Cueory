import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

/**
 * QA #662: a mixed-file layer must keep a successfully decoded GLB when its
 * sibling fails, and a retry must request only the failed GLB. Use real
 * draft-preview models, not the one-file fixture, so the browser exercises
 * the actual whole-body per-layer mapping.
 */
test('a partly failed vessel layer retains heart and retries only the missing file', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one multi-file recovery regression per browser engine');

  await page.goto('/preview/anatomy-lab');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  // The canvas appears before the viewer is ready; wait for its focus before
  // switching to the whole-body model assembled by the open viewer.
  await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });
  const whole = page.getByRole('group', { name: 'body system' })
    .getByRole('button', { name: 'whole body', exact: true });
  await expect(whole).toBeVisible({ timeout: 15_000 });
  await whole.click();

  const files = page.getByTestId('anatomy-files');
  await expect(files).toContainText('model files loaded: 1 of 11', { timeout: 20_000 });

  let heartRequests = 0;
  let vesselRequests = 0;
  const releaseFailure: Array<() => void> = [];
  await page.route(/\/models\/anatomy\/(?:heart|vessels)\.glb(?:\?|$)/, async (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop();
    if (file === 'heart.glb') {
      heartRequests++;
      await route.continue();
      return;
    }
    vesselRequests++;
    if (vesselRequests === 1) {
      // Hold the failure until heart.glb has finished, proving that the
      // successful sibling is usable before and after the failure.
      await new Promise<void>((resolve) => releaseFailure.push(resolve));
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  const layers = page.getByRole('group', { name: 'layers, skin to bone' });
  const vessels = layers.getByRole('button', { name: /^vessels \(/ });
  const structures = page.getByRole('region', { name: 'structures' });
  await vessels.press('Enter');
  try {
    await expect.poll(() => releaseFailure.length, { timeout: 20_000 }).toBe(1);
    await expect(files).toContainText('model files loaded: 2 of 11', { timeout: 20_000 });
    await page.getByLabel('find a structure').fill('heart');
    await expect(structures.getByRole('button', { name: 'heart (hidden)', exact: true }))
      .toBeEnabled({ timeout: 20_000 });
  } finally {
    // A failed assertion must not leave a model request suspended.
    releaseFailure.splice(0).forEach((release) => release());
  }

  await expect(page.getByRole('alert').filter({ hasText: 'Could not load vessels.' }))
    .toBeVisible({ timeout: 20_000 });
  await expect(files).toContainText('model files loaded: 2 of 11');
  expect(heartRequests).toBe(1);
  expect(vesselRequests).toBe(1);

  await page.getByRole('button', { name: 'try vessels again' }).press('Enter');
  await expect(files).toContainText('model files loaded: 3 of 11', { timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'try vessels again' })).toHaveCount(0);
  expect(heartRequests).toBe(1);
  expect(vesselRequests).toBe(2);
  await expect(page.getByTestId('anatomy-missing-count')).toHaveCount(0);

  // The heart was supplied by the vessels layer. It must not make the organs
  // layer look complete: other model files are still missing.
  await structures.getByRole('button', { name: 'show heart', exact: true }).press('Enter');
  const organs = layers.getByRole('button', { name: /^organs \(/ });
  await expect(organs).toHaveAttribute('aria-pressed', 'true');
  const organRequests: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/models/anatomy/') && path.endsWith('.glb')) {
      organRequests.push(path.split('/').pop()!);
    }
  });
  await organs.press('Enter');
  await expect(files).toContainText('model files loaded: 6 of 11', { timeout: 20_000 });
  // Only the three previously missing organ files should be downloaded.
  expect(organRequests).toHaveLength(3);
  expect(new Set(organRequests).size).toBe(3);
  expect(organRequests).not.toContain('heart.glb');
  expect(organRequests).not.toContain('vessels.glb');
  expect(organRequests).not.toContain('skin.glb');
  expect(heartRequests).toBe(1);
  expect(vesselRequests).toBe(2);
});
