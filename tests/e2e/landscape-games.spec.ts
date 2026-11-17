import { expect, test, type Page } from '@playwright/test';

// A phone turned sideways (844 × 390): every game board on /play and every game dialog fits without sideways scroll,
// and the word path letter board fits the screen's height so a path can be dragged without scrolling.

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* optional storage */ }
  });
  await page.goto('/play');
  await page.waitForLoadState('networkidle');
});

async function pageSideways(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

const boards = [
  ['pillo', '[data-testid="pulse"]'],
  ['sudoku', '.sudoku-board'],
  ['crossword', '.crossword-board'],
  ['word path', '.wordpath-board'],
] as const;

for (const [name, selector] of boards) {
  test(`${name} board fits the width of a sideways phone`, async ({ page }) => {
    const board = page.locator(selector).first();
    await board.scrollIntoViewIfNeeded();
    const box = (await board.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(844);
    expect(await pageSideways(page)).toBeLessThanOrEqual(0);
  });
}

test('word path letters fit the screen height with squares of at least 44px', async ({ page }) => {
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

  await page.getByTestId('game-settings-button').click();
  await check('.game-settings');
  await page.getByRole('dialog', { name: 'game settings' }).getByRole('button', { name: 'close settings' }).click();

  await page.getByTestId('sudoku-section').getByRole('button', { name: 'settings' }).click();
  await check('.sudoku-settings');
  await page.getByRole('dialog', { name: 'settings', exact: true }).getByRole('button', { name: 'close settings' }).click();

  for (const [game, gameName] of [['pulse', 'pillo'], ['triage', 'sudoku'], ['cueword', 'crossword'], ['suture', 'word path']]) {
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
