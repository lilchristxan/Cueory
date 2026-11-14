import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

/**
 * Anatomy QA section 3: a student who requests reduced motion must not get
 * OrbitControls' inertial rotation after releasing a drag. Check the rendered
 * canvas at two different times so this covers browser behavior, not just a
 * source-code flag or a static CSS declaration.
 */
test('anatomy camera stops moving after a drag with reduced motion enabled', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one WebGL motion regression per browser engine');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/preview/anatomy-lab?fixture');
  await expect.poll(() => page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches))
    .toBe(true);
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeFocused({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'fixture cube A', exact: true }))
    .toBeEnabled({ timeout: 20_000 });

  const rect = await canvas.boundingBox();
  if (!rect) throw new Error('anatomy canvas must be visible for the reduced-motion check');
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  // Stabilize hover/focus before the first capture. Moving the pointer alone
  // must not be confused with a camera rotation in the comparison below.
  await page.mouse.move(centerX, centerY);
  const beforeDrag = await canvas.screenshot();

  await page.mouse.down();
  await page.mouse.move(centerX + rect.width * 0.24, centerY + rect.height * 0.09, { steps: 6 });
  await page.mouse.up();

  // One frame draws the newly positioned camera, and the next frame confirms
  // the browser has composited it. A pixel change proves the gesture worked.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const afterDrag = await canvas.screenshot();
  expect(afterDrag.equals(beforeDrag), 'the gesture must actually turn the anatomy model').toBe(false);

  // Damping would keep rotating the view after pointerup. Under reduced
  // motion, no later frame should alter the model once the gesture finishes.
  // This deliberate pause observes the post-gesture behavior, not a network wait.
  await page.waitForTimeout(350);
  const afterIdle = await canvas.screenshot();
  expect(afterIdle.equals(afterDrag), 'the model must not coast after pointerup under reduced motion')
    .toBe(true);
});
