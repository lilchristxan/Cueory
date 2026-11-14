import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

/**
 * Task 178: a late GLB from an older show-all request must not undo the
 * student's newer show-only choice. The other bulk files are deliberately
 * aborted so this regression never renders the entire 3D body in CI.
 */
test('show only this wins over a delayed show-all model download', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one real-GLB visibility race per browser engine');
  test.setTimeout(90_000);

  // Start with a test-only fixture to avoid caching any real structure files.
  await page.goto('/preview/anatomy-lab?fixture');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });

  const whole = page.getByRole('group', { name: 'body system' })
    .getByRole('button', { name: 'whole body', exact: true });
  await expect(whole).toBeVisible({ timeout: 15_000 });
  await whole.click();
  const fileNote = page.getByTestId('anatomy-files');
  await expect(fileNote).toContainText('model files loaded: 1 of 11', { timeout: 20_000 });

  const held: Array<() => void> = [];
  let holdVessels = true;
  // The initially loaded skin stays untouched. The delayed vessels file
  // is a real model, not a mock that bypasses scene integration.
  await page.route(/\/models\/anatomy\/[^/]+\.glb(?:\?.*)?$/, async (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/vessels.glb')) {
      if (holdVessels) {
        await new Promise<void>((resolve) => held.push(resolve));
      }
      await route.continue();
    } else {
      // The rest of show-all is irrelevant to the visibility race. Do not
      // render the complete million-triangle scene in a browser test.
      await route.abort();
    }
  });

  try {
    await page.getByRole('button', { name: 'show all', exact: true }).click();
    await expect.poll(() => held.length, { timeout: 20_000 }).toBeGreaterThan(0);

    const structures = page.getByRole('region', { name: 'structures' });
    await page.getByRole('searchbox', { name: 'find a structure' }).fill('skin');
    const skin = structures.getByRole('button', { name: 'skin', exact: true });
    await expect(skin).toBeEnabled();
    await skin.click();
    await page.getByRole('region', { name: 'skin' })
      .getByRole('button', { name: 'show only this' }).click();

    const vesselsLayer = page.getByRole('group', { name: 'layers, skin to bone' })
      .getByRole('button', { name: /^vessels \(/ });
    await expect(vesselsLayer).toHaveAttribute('aria-pressed', 'false');

    // Now finish an older, successful 3D request. It may add geometry, but
    // it must not turn the vessels layer back on or hide the chosen skin.
    holdVessels = false;
    held.splice(0).forEach((resume) => resume());
    await expect(fileNote).toContainText('model files loaded: 2 of 11', { timeout: 20_000 });
    await expect(page.getByTestId('anatomy-layer-loading')).toHaveCount(0, { timeout: 20_000 });
    await expect(vesselsLayer).toHaveAttribute('aria-pressed', 'false');
    await expect(skin).toHaveAttribute('aria-pressed', 'true');
    await expect(skin).toHaveText('skin');
  } finally {
    // An assertion failure must never leave intercepted network requests hung.
    holdVessels = false;
    held.splice(0).forEach((resume) => resume());
  }
});
