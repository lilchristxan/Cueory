import { expect, test } from '@playwright/test';

/**
 * The 3D canvas must keep touch gestures on the model even if inline styles
 * are unavailable under the site's strict content security policy.
 * The ?fixture route uses synthetic shapes, not released anatomy models.
 */
test('anatomy canvas keeps touch-action from its stylesheet, not only inline styles', async ({ page }) => {
  await page.goto('/preview/anatomy-lab?fixture');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect(canvas).toHaveClass(/(?:^|\s)touch-none(?:\s|$)/);

  // OrbitControls may also set canvas.style.touchAction at runtime.
  // Remove that inline declaration to prove the authored CSS still works.
  await canvas.evaluate((element) => {
    (element as HTMLCanvasElement).style.removeProperty('touch-action');
  });
  await expect(canvas).toHaveCSS('touch-action', 'none');
});
