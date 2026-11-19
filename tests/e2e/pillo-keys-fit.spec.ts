import { expect, test, type Page } from '@playwright/test';

// pillo's on-screen keys follow the approved QWERTY order, with action keys in the third logical row. On phones in
// portrait, with normal and larger text, no row runs past the screen or its group, every key is at least 44 px tall
// and 24 px wide (WCAG 2.2's minimum target), no two keys overlap and the page never scrolls sideways. With 16 px text
// the key tops form exactly three rows at 320, 390 and 430 px, as drawn (PR #887 review, 2026-11-19; D-pending for
// Christian, since the keys are narrower than 44 px). With larger text a key never squeezes its letter, so a logical row
// may wrap onto more lines: at 20 px text every row wraps at 320 px, the first and third rows wrap at 390 px, and all
// three stay whole at 430 px; at 32 px text every row wraps. The three logical rows always stay separate and in order.
// The crossword's check and reveal buttons share one row wherever the pair fits.

async function open(page: Page, width: number, rootText: string, path: string) {
  await page.setViewportSize({ width, height: 800 });
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional storage */ }
  });
  // Each game has its own page (#816).
  await page.goto(path);
  await page.evaluate((size) => document.documentElement.style.setProperty('font-size', size, 'important'), rootText);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveCSS('font-size', rootText);
}

for (const width of [320, 390, 430]) {
  for (const rootText of ['16px', '20px', '32px']) {
    test(`pillo keys fit at ${width} px with ${rootText} root text`, async ({ page }) => {
      await open(page, width, rootText, '/play/pillo');
      const group = page.getByTestId('pulse').getByRole('group', { name: 'letters' });
      const letters = await group.getByRole('button').evaluateAll((keys) => keys.map((key) => key.textContent?.trim()));
      const normalized = letters.map((text) => text?.replace(/[●○·]/g, '').trim());
      expect(normalized).toEqual([..."qwertyuiopasdfghjkl⌫zxcvbnm", 'enter']);

      const area = (await group.boundingBox())!;
      const keys = await group.getByRole('button').evaluateAll((list) => list.map((key) => key.getBoundingClientRect().toJSON() as DOMRect));
      for (const key of keys) {
        expect(key.width).toBeGreaterThanOrEqual(24);
        expect(key.height).toBeGreaterThanOrEqual(44);
        expect(key.left).toBeGreaterThanOrEqual(Math.max(0, area.x) - 0.5);
        expect(key.right).toBeLessThanOrEqual(Math.min(width, area.x + area.width) + 0.5);
      }
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          const a = keys[i]!;
          const b = keys[j]!;
          expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `keys ${i} and ${j} overlap`).toBe(true);
        }
      }
      // No row scrolls or spills sideways, and each key's letter fits inside it.
      expect(await group.locator('.pillo-key-row').evaluateAll((rows) => rows.filter((row) => row.scrollWidth > row.clientWidth + 1).length)).toBe(0);
      expect(await group.locator('.pillo-key').evaluateAll((list) => list.filter((key) => key.scrollWidth > key.clientWidth + 1).length)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      // With 16 px text the key tops form exactly three rows. Larger text may wrap a logical row, never merge two.
      if (rootText === '16px') expect(new Set(keys.map((key) => Math.round(key.top))).size).toBe(3);
      const logical = await group.locator('.pillo-key-row').evaluateAll((rows) =>
        rows.map((row) => [...row.querySelectorAll('.pillo-key')].map((key) => key.getBoundingClientRect().toJSON() as DOMRect)),
      );
      expect(logical).toHaveLength(3);
      for (let i = 1; i < logical.length; i++) {
        const above = Math.max(...logical[i - 1]!.map((key) => key.bottom));
        expect(Math.min(...logical[i]!.map((key) => key.top)), `row ${i + 1} starts below row ${i}`).toBeGreaterThanOrEqual(above - 0.5);
      }
    });
  }
}

test('pillo keyboard keeps each logical row on one physical line at desktop width', async ({ page }) => {
  await open(page, 1440, '16px', '/play/pillo');
  const rows = await page.getByTestId('pulse').getByRole('group', { name: 'letters' }).locator('.pillo-key-row').evaluateAll((els) =>
    els.map((row) => [...row.querySelectorAll('.pillo-key')].map((key) => key.getBoundingClientRect())),
  );
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(new Set(row.map((key) => key.top)).size).toBe(1);
    expect(row.every((key) => key.width >= 44 && key.height >= 44)).toBe(true);
  }
});

for (const [width, rootText] of [[320, '16px'], [320, '20px'], [390, '16px'], [390, '20px'], [430, '20px']] as const) {
  test(`crossword check and reveal share a row at ${width} px with ${rootText} root text`, async ({ page }) => {
    await open(page, width, rootText, '/play/crossword');
    const game = page.getByTestId('cueword');
    const check = (await game.getByTestId('crossword-check').locator('summary').boundingBox())!;
    const reveal = (await game.getByTestId('crossword-reveal').locator('summary').boundingBox())!;
    expect(Math.abs(check.y - reveal.y)).toBeLessThan(1);
  });
}
