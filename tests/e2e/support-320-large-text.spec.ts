import { expect, test } from '@playwright/test';

// /support at 320px wide with 32px root text: the page never scrolls sideways and the "support our mission" button
// stays inside the screen, its words wrapping inside it.

test.use({ viewport: { width: 320, height: 700 } });

test('support fits 320px with 32px text', async ({ page }) => {
  await page.goto('/support');
  await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveCSS('font-size', '32px');

  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  const buttons = page.locator('main .glass-button');
  for (const button of await buttons.all()) {
    if (!(await button.isVisible())) continue;
    const box = (await button.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const textInside = await button.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const outer = element.getBoundingClientRect();
      return [...range.getClientRects()].every((rect) => rect.left >= outer.left - 0.5 && rect.right <= outer.right + 0.5);
    });
    expect(textInside).toBe(true);
  }
});
