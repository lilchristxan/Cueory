import { expect, test, type Page } from '@playwright/test';

// Phones in portrait, with normal and larger text: pillo's three keyboard rows (10, 9 and 9 keys, with ⌫ and enter)
// never wrap onto a second line. Each key stays at least 30 px wide and 44 px tall, every key is on screen and the
// page never scrolls sideways. The crossword's check and reveal buttons share one row wherever the pair fits.

async function open(page: Page, width: number, rootText: string) {
  await page.setViewportSize({ width, height: 800 });
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* optional storage */ }
  });
  await page.goto('/play');
  await page.evaluate((size) => document.documentElement.style.setProperty('font-size', size, 'important'), rootText);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveCSS('font-size', rootText);
}

for (const width of [320, 390, 430]) {
  for (const rootText of ['16px', '20px', '32px']) {
    test(`pillo keyboard rows stay on one line at ${width} px with ${rootText} root text`, async ({ page }) => {
      await open(page, width, rootText);
      const rows = await page.locator('.pillo-key-row').evaluateAll((rowElements) =>
        rowElements.map((row) => [...row.querySelectorAll('.pillo-key')].map((key) => key.getBoundingClientRect().toJSON() as DOMRect)));
      expect(rows.map((row) => row.length)).toEqual([10, 9, 9]);
      for (const [index, row] of rows.entries()) {
        const tops = new Set(row.map((key) => Math.round(key.top)));
        expect(tops.size, `row ${index + 1} is one line`).toBe(1);
        for (const key of row) {
          expect(key.width).toBeGreaterThanOrEqual(30);
          expect(key.height).toBeGreaterThanOrEqual(44);
          expect(key.left).toBeGreaterThanOrEqual(0);
          expect(key.right).toBeLessThanOrEqual(width);
        }
      }
      // Each key's letter fits inside it.
      expect(await page.locator('.pillo-key').evaluateAll((keys) => keys.filter((key) => key.scrollWidth > key.clientWidth + 1).length)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }
}

for (const [width, rootText] of [[320, '16px'], [320, '20px'], [390, '16px'], [390, '20px'], [430, '20px']] as const) {
  test(`crossword check and reveal share a row at ${width} px with ${rootText} root text`, async ({ page }) => {
    await open(page, width, rootText);
    const game = page.getByTestId('cueword');
    const check = (await game.getByTestId('crossword-check').locator('summary').boundingBox())!;
    const reveal = (await game.getByTestId('crossword-reveal').locator('summary').boundingBox())!;
    expect(Math.abs(check.y - reveal.y)).toBeLessThan(1);
  });
}
