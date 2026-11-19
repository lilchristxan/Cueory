import { expect, test } from '@playwright/test';

// The print-only logo is not requested on screen (Firefox aborted the hidden request and the console sweep counted
// it), and it still loads and shows when the page is printed.
for (const path of ['/play/sudoku', '/play/crossword', '/play/word-path']) {
  test(`${path}: the print logo is not requested on screen and loads for print`, async ({ page }) => {
    const requested: string[] = [];
    const failed: string[] = [];
    page.on('request', (request) => { if (request.url().includes('logo-full-light-') && request.url().includes('?print')) requested.push(request.url()); });
    page.on('requestfailed', (request) => failed.push(request.url()));
    await page.goto(path, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');
    expect(requested).toEqual([]);
    expect(failed.filter((url) => url.includes('?print'))).toEqual([]);
    const logo = page.getByTestId('game-print-logo').first();
    await page.evaluate(() => document.documentElement.setAttribute('data-print-game', location.pathname.split('/').pop()!));
    await page.emulateMedia({ media: 'print' });
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  });
}
