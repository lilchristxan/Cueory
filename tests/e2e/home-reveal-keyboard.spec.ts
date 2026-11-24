import { expect, test } from '@playwright/test';

/**
 * Keyboard access on the home page: sections wait at opacity 0 until scrolled into view.
 * Tabbing into a waiting section reveals it instantly (no motion) so the focused element is
 * visible and inside the viewport at 390 px.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch {
      // The home page remains usable when storage is blocked.
    }
  });
});

test('tab into the launch-updates email box reveals it and keeps it inside the viewport at 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'load' });

  const section = page.locator('#signup [data-reveal-section]');
  await expect(section).toHaveAttribute('data-reveal', 'waiting');

  const email = page.locator('input#signup-email');
  await expect(email).toBeAttached();

  let focused = false;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    if (await email.evaluate((el) => el === document.activeElement)) {
      focused = true;
      break;
    }
  }
  expect(focused, 'keyboard focus reached input#signup-email').toBe(true);

  await expect(section).toHaveAttribute('data-reveal', 'instant');
  await expect(email).toBeVisible();
  await expect(email).toBeInViewport();

  const box = await email.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
});
