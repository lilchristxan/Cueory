import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

/**
 * QA §3: reduced-motion mode must not keep an OrbitControls damping
 * animation running after a pointer gesture finishes. The count is sampled
 * after the final event, so single-request redraws do not fail this test.
 */
test('reduced motion stops anatomy camera frames after a completed drag', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one reduced-motion 3D regression per browser engine');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const state = window as Window & {
      __anatomyCountFrames?: boolean;
      __anatomyFrameRequests?: number;
    };
    state.__anatomyCountFrames = false;
    state.__anatomyFrameRequests = 0;
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      if (state.__anatomyCountFrames) state.__anatomyFrameRequests = (state.__anatomyFrameRequests ?? 0) + 1;
      return original(callback);
    };
  });

  await page.goto('/preview/anatomy-lab?fixture');
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.getByRole('button', { name: 'fixture cube A', exact: true }))
    .toBeEnabled({ timeout: 20_000 });
  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds!.x + bounds!.width / 2;
  const y = bounds!.y + bounds!.height / 2;
  await page.evaluate(() => {
    const state = window as Window & { __anatomyCountFrames?: boolean; __anatomyFrameRequests?: number };
    state.__anatomyFrameRequests = 0;
    state.__anatomyCountFrames = true;
  });
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + Math.min(90, bounds!.width / 4), y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(90);
  const activeFrames = await page.evaluate(() =>
    (window as Window & { __anatomyFrameRequests?: number }).__anatomyFrameRequests ?? 0);
  expect(activeFrames, 'the camera gesture must request a render').toBeGreaterThan(0);

  // Damping would keep requesting frames for hundreds of milliseconds after
  // release. With reduced motion the scene becomes idle after its last frame.
  await page.evaluate(() => {
    (window as Window & { __anatomyFrameRequests?: number }).__anatomyFrameRequests = 0;
  });
  await page.waitForTimeout(180);
  const tailFrames = await page.evaluate(() => {
    const state = window as Window & { __anatomyCountFrames?: boolean; __anatomyFrameRequests?: number };
    state.__anatomyCountFrames = false;
    return state.__anatomyFrameRequests ?? 0;
  });
  expect(tailFrames, 'reduced-motion mode must not keep animating after drag').toBeLessThanOrEqual(2);
  const longAnimations = await page.locator('main').evaluate((root) =>
    root.getAnimations({ subtree: true }).filter((animation) =>
      animation.playState === 'running' && Number(animation.effect?.getComputedTiming().duration ?? 0) > 10,
    ).length,
  );
  expect(longAnimations, 'no long-running CSS or Web Animations under reduced motion').toBe(0);
});
