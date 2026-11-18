import { expect, test, type Page } from '@playwright/test';

// Printing the daily games. pillo's foil keeps no gradient that fades to clear black (Safari's full-page screenshot
// and PDF export drew that as a solid black triangle), and on paper the shine is left out. Each printed puzzle
// (crossword, sudoku, word path) starts with the cueory logo, centred, above the puzzle.

test.use({ viewport: { width: 816, height: 1056 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
      localStorage.setItem('cueory-game-help-seen', JSON.stringify(['pulse', 'cueword', 'triage', 'suture']));
    } catch { /* optional storage */ }
    window.print = () => {};
  });
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
});

/** Each game has its own page (#816). */
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

const foil = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll('.pillo-pack, .pillo-strip, .pillo-pill')].flatMap((element) => [
    { name: element.className, image: getComputedStyle(element).backgroundImage },
    { name: element.className + '::before', image: getComputedStyle(element, '::before').backgroundImage, shown: getComputedStyle(element, '::before').display },
  ]));

test('pillo foil and pill shine never fade to clear black, and print without the shine', async ({ page }) => {
  await open(page, '/play/pillo');
  await page.getByLabel('your guess', { exact: true }).fill('ab');
  await expect(page.locator('.pillo-pill.pillo-typed').first()).toBeVisible();
  for (const layer of await foil(page)) expect(layer.image, layer.name).not.toContain('rgba(0, 0, 0, 0)');

  await page.emulateMedia({ media: 'print' });
  const printed = await foil(page);
  for (const layer of printed) expect(layer.image, layer.name).not.toContain('rgba(0, 0, 0, 0)');
  const pack = printed.find((layer) => layer.name.includes('pillo-pack') && !layer.name.endsWith('::before'))!;
  expect(pack.image).not.toContain('linear-gradient(135deg');
  for (const layer of printed.filter((layer) => layer.name.includes('pillo-pill') && layer.name.endsWith('::before'))) {
    expect(layer.shown, layer.name).toBe('none');
  }
});

for (const [game, area, path] of [
  ['crossword', '[data-game-print="crossword"]', '/play/crossword'],
  ['sudoku', '.sudoku-section', '/play/sudoku'],
  ['suture', '[data-print-area="suture"]', '/play/word-path'],
] as const) {
  test(`printed ${game} starts with the cueory logo, centred`, async ({ page }) => {
    await open(page, path);
    await page.evaluate((name) => document.documentElement.setAttribute('data-print-game', name), game);
    const logo = page.locator(area).getByTestId('game-print-logo');
    await expect(logo).toBeHidden();
    await page.emulateMedia({ media: 'print' });
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute('alt', 'cueory');
    await expect(logo).toHaveAttribute('src', /\/brand\/v1\/logo-full-light-/);
    expect(await logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    const box = (await logo.boundingBox())!;
    const width = await page.evaluate(() => document.documentElement.clientWidth);
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThanOrEqual(3);
    expect(box.height).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeLessThanOrEqual(56);
    // The logo comes before everything else printed for the game.
    const first = await page.locator(area).evaluate((section) => {
      const shown = [...section.querySelectorAll<HTMLElement>('*')].filter((element) => element.getClientRects().length > 0 && element.getBoundingClientRect().height > 0);
      const top = Math.min(...shown.map((element) => element.getBoundingClientRect().top));
      return shown.filter((element) => element.getBoundingClientRect().top <= top + 0.5).some((element) => element.matches('[data-testid="game-print-logo"]') || element.querySelector('[data-testid="game-print-logo"]'));
    });
    expect(first).toBe(true);
    // Every printed board stays inside the page.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}
