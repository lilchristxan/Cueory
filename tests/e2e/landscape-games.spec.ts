import { expect, test, type Page } from '@playwright/test';

// A phone turned sideways (844 × 390): every game board on its own page and every game dialog fits without sideways scroll,
// and the word path letter board fits the screen's height so a path can be dragged without scrolling.

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ page }) => {
  // Each game picks today's sample from the visitor's own date, so a test without a fixed day plays whichever sample
  // the runner's date lands on: on some days word path's older word search (a taller grid) instead of the 6 by 8 board.
  // 1 November 2026 is a board day. The promo is marked seen after the clock, so by the same date the page uses.
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional storage */ }
  });
});

// Each game is on its own page (2026-11-17).
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

async function pageSideways(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

const boards = [
  ['pillo', '[data-testid="pulse"]', '/play/pillo'],
  ['sudoku', '.sudoku-board', '/play/sudoku'],
  ['crossword', '.crossword-board', '/play/crossword'],
  ['word path', '.wordpath-board', '/play/word-path'],
] as const;

for (const [name, selector, path] of boards) {
  test(`${name} board fits the width of a sideways phone`, async ({ page }) => {
    await open(page, path);
    const board = page.locator(selector).first();
    await board.scrollIntoViewIfNeeded();
    const box = (await board.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(844);
    expect(await pageSideways(page)).toBeLessThanOrEqual(0);
  });
}

test('word path letters fit the screen height with squares of at least 44px', async ({ page }) => {
  await open(page, '/play/word-path');
  // The board you drag paths on (#722), not the older tap-first-and-last word search.
  await expect(page.getByTestId('suture')).toHaveAttribute('data-format', 'path');
  const board = page.locator('.wordpath-board').first();
  const box = (await board.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(390);
  const square = (await board.locator('button[data-path]').first().boundingBox())!;
  expect(square.width).toBeGreaterThanOrEqual(44);
  expect(square.height).toBeGreaterThanOrEqual(44);
});

test('game dialogs fit a sideways phone without sideways scroll', async ({ page }) => {
  const check = async (card: string) => {
    const sideways = await page.locator(card).evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(sideways).toBeLessThanOrEqual(1);
    const box = (await page.locator(card).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(844);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(390);
    expect(await pageSideways(page)).toBeLessThanOrEqual(0);
  };

  await open(page, '/play/sudoku');
  // Sudoku's gear opens the shared settings dialog with its own settings in it (#823).
  await page.getByTestId('sudoku-section').getByRole('button', { name: 'sudoku settings' }).click();
  await check('.game-settings');
  await page.getByRole('dialog', { name: 'sudoku settings' }).getByRole('button', { name: 'close settings' }).click();

  for (const [game, gameName] of [['pulse', 'pillo'], ['triage', 'sudoku'], ['cueword', 'crossword'], ['suture', 'piccline']]) {
    await page.evaluate(({ game, gameName }) => {
      window.dispatchEvent(new CustomEvent('cueory:game-result-card', {
        detail: {
          game,
          name: gameName,
          date: 'nov 11, 2026',
          level: 'easy',
          result: 'solved',
          summary: 'sample result for a layout check.',
          stats: [{ label: 'time', value: '4:12' }, { label: 'hints', value: '0' }, { label: 'streak', value: '2' }],
          path: '/play',
        },
      }));
    }, { game, gameName });
    await check('[data-testid="game-result-dialog"]');
    await page.getByTestId('game-result-dialog').getByRole('button', { name: 'close results' }).click();
    await expect(page.getByTestId('game-result-dialog')).toHaveCount(0);
  }
});
