import { expect, test } from '@playwright/test';

// The print-only logo is not requested on screen (Firefox aborted the hidden request and the console sweep counted
// it), and under print its background resolves to the logo and the request succeeds.
for (const path of ['/play/sudoku', '/play/crossword', '/play/word-path']) {
  test(`${path}: the print logo is not requested on screen and loads for print`, async ({ page }) => {
    const requested: string[] = [];
    const failed: string[] = [];
    page.on('request', (request) => { if (/logo-full-light-.*\?print/.test(request.url())) requested.push(request.url()); });
    page.on('requestfailed', (request) => failed.push(request.url()));
    await page.goto(path, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');
    expect(requested).toEqual([]);
    expect(failed.filter((url) => url.includes('?print'))).toEqual([]);
    const logo = page.getByTestId('game-print-logo').first();
    await page.evaluate(() => document.documentElement.setAttribute('data-print-game', location.pathname.split('/').pop()!));
    const response = page.waitForResponse((r) => /\/brand\/v1\/logo-full-light-960\.png\?print$/.test(r.url()));
    await page.emulateMedia({ media: 'print' });
    await expect(logo).toBeVisible();
    await expect(logo).toHaveCSS('background-image', /logo-full-light-960\.png\?print/);
    expect((await response).status()).toBe(200);
  });
}
