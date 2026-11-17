import { expect, test, type Page } from '@playwright/test';

/**
 * "forget sudoku" and "forget all my stats" clear both stores sudoku keeps (Codex on #831): the shared results
 * (cueory-game-stats) and its per-level solve times (cueory-sudoku-stats). The controls stay while either store holds
 * something, and a deletion the browser refuses is reported as it is. Seeded storage, on the /play hub (all games).
 */
const today = '2026-11-01';
const solve = { level: 'easy', day: today, seconds: 120 };
const panel = (page: Page) => page.getByTestId('game-stats');
const sudokuRow = (page: Page) => panel(page).getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'sudoku', exact: true }) });
const stored = (page: Page, key: string) => page.evaluate((name) => localStorage.getItem(name), key);

async function open(page: Page, records: { shared?: unknown[]; sudoku?: unknown[] }, refuseSudokuDelete = false) {
  await page.clock.setFixedTime(new Date(`${today}T15:00:00`));
  await page.addInitScript(({ records, refuseSudokuDelete }) => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      if (records.shared) localStorage.setItem('cueory-game-stats', JSON.stringify({ version: 1, results: records.shared }));
      if (records.sudoku) localStorage.setItem('cueory-sudoku-stats', JSON.stringify({ version: 1, solves: records.sudoku }));
    } catch { /* optional storage */ }
    if (refuseSudokuDelete) {
      const removeItem = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (key: string) {
        if (key === 'cueory-sudoku-stats') throw new Error('refused');
        return removeItem.call(this, key);
      };
    }
  }, { records, refuseSudokuDelete });
  await page.goto('/play');
  await expect(panel(page).getByRole('heading', { name: 'your stats' })).toBeVisible();
}

test('"forget sudoku" clears its shared results and its per-level solve times', async ({ page }) => {
  await open(page, { shared: [{ game: 'triage', day: today, solved: true, tries: 0 }], sudoku: [solve] });
  await sudokuRow(page).getByRole('button', { name: 'forget sudoku' }).click();
  await expect(sudokuRow(page)).toContainText('not played yet.');
  expect(JSON.parse((await stored(page, 'cueory-game-stats'))!).results).toEqual([]);
  expect(await stored(page, 'cueory-sudoku-stats')).toBeNull();
});

test('with only per-level solve times kept, "forget sudoku" and "forget all" are still offered and clear them', async ({ page }) => {
  await open(page, { sudoku: [solve] });
  await expect(panel(page).getByRole('button', { name: 'forget all my stats' })).toBeVisible();
  await expect(sudokuRow(page).getByRole('button', { name: 'forget sudoku' })).toBeVisible();
  await panel(page).getByRole('button', { name: 'forget all my stats' }).click();
  expect(await stored(page, 'cueory-sudoku-stats')).toBeNull();
  await expect(panel(page).getByRole('button', { name: 'forget all my stats' })).toHaveCount(0);
  await expect(page.getByTestId('stats-live')).toHaveText('all your stats are forgotten. new games are kept from now on.');
});

test('"forget all" clears both stores', async ({ page }) => {
  await open(page, { shared: [{ game: 'pulse', day: today, solved: true, tries: 2 }], sudoku: [solve] });
  await panel(page).getByRole('button', { name: 'forget all my stats' }).click();
  expect(JSON.parse((await stored(page, 'cueory-game-stats'))!).results).toEqual([]);
  expect(await stored(page, 'cueory-sudoku-stats')).toBeNull();
});

test('a refused deletion of the solve times is reported as it is, and the controls stay', async ({ page }) => {
  await open(page, { shared: [{ game: 'triage', day: today, solved: true, tries: 0 }], sudoku: [solve] }, true);
  await sudokuRow(page).getByRole('button', { name: 'forget sudoku' }).click();
  await expect(page.getByTestId('stats-live')).toHaveText(
    "sudoku results forgotten, but this browser didn't let us delete its solve times. clearing this site's data in your browser removes them.",
  );
  expect(await stored(page, 'cueory-sudoku-stats')).not.toBeNull();
  // The solve times are still there, so the way to forget them is still offered.
  await expect(panel(page).getByRole('button', { name: 'forget all my stats' })).toBeVisible();
  await panel(page).getByRole('button', { name: 'forget all my stats' }).click();
  await expect(page.getByTestId('stats-live')).toHaveText(
    "your results are forgotten, but this browser didn't let us delete sudoku's solve times. clearing this site's data in your browser removes them.",
  );
});
