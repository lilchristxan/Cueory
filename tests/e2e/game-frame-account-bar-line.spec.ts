import { expect, test } from '@playwright/test';
import { markGameRulesSeen } from './clock';

// The sidebar's copper account button is one slim line (Christian, 2026-11-25): at phone, tablet and desktop sizes, in
// Light and Evening, whatever wording is shown, its height is one line box plus its own padding and border, never two.
test.beforeEach(async ({ page }) => {
  await markGameRulesSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem('cueory-promo-seen', String(Date.now()));
    localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the game page's account button is a single line, at least 44 px tall, with no sideways scroll (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/play/wordpill');
    const link = page.getByTestId('game-frame-account-bar').getByRole('link');
    await expect(link).toBeVisible();
    const m = await link.evaluate((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const lineHeight = Number.parseFloat(style.lineHeight);
      const chrome = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((sum, key) => sum + Number.parseFloat(style[key as 'paddingTop']), 0);
      return { height: rect.height, oneLine: lineHeight + chrome, overflows: node.scrollWidth > node.clientWidth, parentWidth: node.parentElement!.getBoundingClientRect().width, width: rect.width, fontSize: Number.parseFloat(style.fontSize) };
    });
    expect(m.height).toBeLessThanOrEqual(m.oneLine + 1);
    expect(m.height).toBeGreaterThanOrEqual(44);
    expect(m.fontSize).toBeGreaterThanOrEqual(14);
    expect(m.overflows).toBe(false);
    expect(m.width).toBeLessThanOrEqual(m.parentWidth);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test(`the hub's account button is a single line too (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/play');
    const link = page.getByTestId('play-account-bar').getByRole('link');
    await expect(link).toBeVisible();
    const height = (await link.boundingBox())!.height;
    const oneLine = await link.evaluate((node) => {
      const style = getComputedStyle(node);
      return Number.parseFloat(style.lineHeight) + ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((sum, key) => sum + Number.parseFloat(style[key as 'paddingTop']), 0);
    });
    expect(height).toBeLessThanOrEqual(oneLine + 1);
  });
}
