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

// Christian, 2026-11-27: on every game page the copper bar's own centre sits on the middle of the screen's height in
// the desktop side panel, and the tagline under the game's name is lower case.
for (const path of ['/play/wordpill', '/play/pillo', '/play/piccline', '/play/crossword', '/play/sudoku', '/play/tachyyy', '/play/hello-cards']) {
  test(`${path}: the copper bar is on the screen's midline and the tagline is lower case`, async ({ page }) => {
    for (const height of [800, 900, 1100]) {
      await page.setViewportSize({ width: 1440, height });
      await page.goto(path);
      const link = page.getByTestId('game-frame-account-bar').getByRole('link');
      await expect(link).toBeVisible();
      const box = (await link.boundingBox())!;
      expect(Math.abs(box.y + box.height / 2 - height / 2)).toBeLessThanOrEqual(1);
      const tagline = page.locator('.game-frame-tagline');
      const tag = (await tagline.boundingBox())!;
      expect(tag.y + tag.height, 'the tagline ends above the copper bar').toBeLessThanOrEqual(box.y);
      const text = (await tagline.textContent())!.trim();
      expect(text).toBe(text.toLowerCase());
    }
  });
}

// On a desktop window too short for the bar to clear the tagline it stays in the flow, under the tagline.
test('on a short desktop window the copper bar stays under the tagline', async ({ page }) => {
  for (const height of [704, 760, 799]) {
    await page.setViewportSize({ width: 1440, height });
    await page.goto('/play/wordpill');
    const link = page.getByTestId('game-frame-account-bar').getByRole('link');
    await expect(link).toBeVisible();
    const box = (await link.boundingBox())!;
    const tag = (await page.locator('.game-frame-tagline').boundingBox())!;
    expect(tag.y + tag.height).toBeLessThanOrEqual(box.y);
  }
});
