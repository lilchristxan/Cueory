import { expect, test, type Page } from '@playwright/test';
import { dailySudokuSeed, generateSudoku } from '../../src/islands/sudoku';
import { markPanelsSeen } from './clock';

/**
 * vialo, sudoku and crossword autosave every move on this device, like piccline (docs/GAMES-PARITY.md): a reload brings
 * the board back, a finished game stays finished that day, and a new day starts fresh. The clock is 1 November 2026, so
 * today's vialo word is the first sample, "grace" (content/games/pulse/sample-01.json), and the crossword is the first
 * easy sample (the same one crossword-parity.spec.ts fills).
 */
const DAY = '2026-11-01';
const open = async (page: Page, path: string, day = DAY) => {
  await page.clock.setFixedTime(new Date(`${day}T15:00:00`));
  await markPanelsSeen(page);
  await page.goto(path);
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-game-help-seen', JSON.stringify(['vialo', 'triage', 'cueword'])); } catch { /* storage blocked */ }
  });
});

test.describe('vialo autosave', () => {
  const guess = async (page: Page, word: string) => {
    await page.getByRole('textbox', { name: 'your guess' }).fill(word);
    await page.getByRole('button', { name: 'enter', exact: true }).click();
  };

  test('a reload mid-game keeps the guesses, and a finished game stays finished with the same result', async ({ page }) => {
    await open(page, '/play/vialo');
    await expect(page.getByTestId('vialo')).toBeVisible();
    await guess(page, 'crane');
    await guess(page, 'pilot');
    await expect(page.getByRole('list', { name: 'your guesses' }).getByRole('listitem')).toHaveCount(2);
    await page.reload();
    const rows = page.getByRole('list', { name: 'your guesses' }).getByRole('listitem');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAttribute('aria-label', /guess 1: crane/);
    await expect(rows.nth(1)).toHaveAttribute('aria-label', /guess 2: pilot/);
    await expect(page.getByTestId('vialo-result')).toHaveCount(0);
    await expect(page.getByTestId('vialo-status')).toContainText('4 of 6 guesses left');

    await guess(page, 'grace');
    await expect(page.getByTestId('vialo-result')).toContainText('solved.');
    await page.reload();
    await expect(page.getByTestId('vialo-result')).toContainText('solved.');
    await expect(page.getByTestId('vialo-result')).toContainText('3/6');
    await expect(page.getByTestId('vialo-today-row')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'your guess' })).toHaveCount(0);
    // Only the words are kept, and only for the day.
    expect(await page.evaluate(() => localStorage.getItem('cueory-vialo-save'))).toContain('"day":"2026-11-01"');

    await open(page, '/play/vialo', '2026-11-02');
    await expect(page.getByRole('textbox', { name: 'your guess' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'your guesses' }).getByRole('listitem')).toHaveCount(0);
  });
});

test.describe('sudoku autosave', () => {
  const daily = generateSudoku(dailySudokuSeed(DAY, 'easy'), 'easy');
  const empty = daily.puzzle.flatMap((digit, index) => (digit === 0 ? [index] : []));
  const cells = (page: Page) => page.getByTestId('sudoku').getByRole('grid', { name: 'sudoku grid' }).getByRole('gridcell');

  test('a reload mid-game keeps numbers, cues and errors, and a finished board stays finished', async ({ page }) => {
    await open(page, '/play/sudoku');
    await expect(cells(page)).toHaveCount(81);
    await cells(page).nth(empty[0]!).click();
    await page.keyboard.press(String(daily.solution[empty[0]!]));
    await cells(page).nth(empty[1]!).click();
    await page.getByTestId('sudoku-mode').getByRole('button', { name: /^Pencil/ }).click();
    await cells(page).nth(empty[1]!).click();
    await page.keyboard.press('3');
    await page.keyboard.press('5');
    await expect(cells(page).nth(empty[1]!)).toHaveAttribute('aria-label', /empty, pencil marks 3, 5/);
    await page.reload();
    await expect(cells(page)).toHaveCount(81);
    await expect(cells(page).nth(empty[0]!)).toHaveAttribute('aria-label', new RegExp(`, ${daily.solution[empty[0]!]}`));
    await expect(cells(page).nth(empty[1]!)).toHaveAttribute('aria-label', /empty, pencil marks 3, 5/);
    await expect(page.getByTestId('sudoku-result')).toHaveCount(0);

    // Pencil mode is not saved, so the board is in normal mode; finish it.
    for (const index of empty.slice(1)) {
      await cells(page).nth(index).click();
      await page.keyboard.press(String(daily.solution[index]));
    }
    await expect(page.getByTestId('sudoku-result')).toBeVisible();
    await page.getByTestId('game-result-dialog').getByRole('button', { name: 'close results' }).click();
    await page.reload();
    await expect(cells(page)).toHaveCount(81);
    await expect(page.getByTestId('sudoku-result')).toBeVisible();
    await expect(page.getByTestId('game-result-dialog')).toHaveCount(0);
    for (const index of empty) await expect(cells(page).nth(index)).toHaveAttribute('aria-label', new RegExp(`, ${daily.solution[index]}`));

    await open(page, '/play/sudoku', '2026-11-02');
    await expect(cells(page)).toHaveCount(81);
    await expect(page.getByTestId('sudoku-result')).toHaveCount(0);
  });
});

test.describe('crossword autosave', () => {
  const SAMPLE = ['.ABC.', 'DEFGH', 'IJKLM', 'NOPQR', '.STU.'];
  const board = (page: Page) => page.getByTestId('cueword');
  const square = (page: Page, row: number, column: number) =>
    board(page).getByRole('button', { name: new RegExp('^(?:\\d+, )?row ' + row + ', column ' + column + ',') });

  test('a reload mid-game keeps the letters, and a finished board stays finished', async ({ page }) => {
    await open(page, '/play/crossword');
    await expect(board(page)).toBeVisible();
    await square(page, 2, 1).click();
    await page.keyboard.type('d');
    await square(page, 2, 2).click();
    await page.keyboard.type('e');
    await page.reload();
    await expect(board(page)).toBeVisible();
    await expect(square(page, 2, 1)).toHaveAttribute('aria-label', /letter D$/);
    await expect(square(page, 2, 2)).toHaveAttribute('aria-label', /letter E$/);
    await expect(square(page, 2, 3)).toHaveAttribute('aria-label', /empty$/);
    await expect(board(page).getByTestId('crossword-badge')).toHaveCount(0);

    for (const [row, letters] of SAMPLE.entries()) {
      for (const [column, letter] of [...letters].entries()) {
        if (letter === '.') continue;
        await square(page, row + 1, column + 1).click();
        await page.keyboard.type(letter);
      }
    }
    await expect(board(page).getByTestId('crossword-badge')).toHaveText(/solved without help/);
    await page.getByTestId('game-result-dialog').getByRole('button', { name: 'close results' }).click();
    await page.reload();
    await expect(board(page)).toBeVisible();
    await expect(board(page).getByTestId('crossword-badge')).toHaveText(/solved without help/);
    await expect(page.getByTestId('game-result-dialog')).toHaveCount(0);

    await open(page, '/play/crossword', '2026-11-02');
    await expect(board(page)).toBeVisible();
    await expect(board(page).getByTestId('crossword-badge')).toHaveCount(0);
  });
});

// "Forget" must really forget (Codex on #1197): the saved board is deleted, and the page leaving or reloading must not
// write it back.
test.describe('forgetting stats forgets the saved board', () => {
  test('vialo: another tab forgets, and the reload starts a fresh board', async ({ page, context }) => {
    await open(page, '/play/vialo');
    await page.getByRole('textbox', { name: 'your guess' }).fill('crane');
    await page.getByRole('button', { name: 'enter', exact: true }).click();
    await expect(page.getByRole('list', { name: 'your guesses' }).getByRole('listitem')).toHaveCount(1);
    // Another tab forgets (the stats panel removes the key): the open game must not bring it back.
    const other = await context.newPage();
    await other.goto('/play/piccline');
    await other.evaluate(() => localStorage.removeItem('cueory-vialo-save'));
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'your guess' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'your guesses' }).getByRole('listitem')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('cueory-vialo-save'))).toBeNull();
    await other.close();
  });

  test('sudoku: "forget all my stats" deletes the saved board and a reload does not write it back', async ({ page }) => {
    const daily = generateSudoku(dailySudokuSeed(DAY, 'easy'), 'easy');
    const empty = daily.puzzle.flatMap((digit, index) => (digit === 0 ? [index] : []));
    const cells = page.getByTestId('sudoku').getByRole('grid', { name: 'sudoku grid' }).getByRole('gridcell');
    await open(page, '/play/sudoku');
    await expect(cells).toHaveCount(81);
    await cells.nth(empty[0]!).click();
    await page.keyboard.press(String(daily.solution[empty[0]!]));
    await expect.poll(() => page.evaluate(() => localStorage.getItem('cueory-sudoku-save'))).not.toBeNull();
    await page.getByTestId('game-frame-gear').click();
    const settings = page.getByRole('dialog', { name: 'sudoku settings' });
    await settings.getByRole('button', { name: 'forget all my stats' }).click();
    await settings.getByRole('button', { name: 'yes, forget all my stats' }).click();
    expect(await page.evaluate(() => localStorage.getItem('cueory-sudoku-save'))).toBeNull();
    await page.reload();
    await expect(cells).toHaveCount(81);
    expect(await page.evaluate(() => localStorage.getItem('cueory-sudoku-save'))).toBeNull();
    await expect(cells.nth(empty[0]!)).toHaveAttribute('aria-label', /empty$/);
  });

  test('crossword: a board forgotten in another tab is not written back by the open tab on reload', async ({ page, context }) => {
    await open(page, '/play/crossword');
    const square = (row: number, column: number) => page.getByTestId('cueword').getByRole('button', { name: new RegExp('^(?:\\d+, )?row ' + row + ', column ' + column + ',') });
    await square(2, 1).click();
    await page.keyboard.type('d');
    await expect(square(2, 1)).toHaveAttribute('aria-label', /letter D$/);
    const other = await context.newPage();
    await other.goto('/play/vialo');
    await other.evaluate(() => localStorage.removeItem('cueory-crossword-save'));
    await other.close();
    await page.reload();
    await expect(page.getByTestId('cueword')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('cueory-crossword-save'))).toBeNull();
    await expect(square(2, 1)).toHaveAttribute('aria-label', /empty$/);
  });
});

// Saves are written only by a player's own move (Codex rounds on #1197): an untouched tab never writes or deletes.
test.describe('untouched tabs never write or delete a save', () => {
  test('opening and leaving each game without a move performs no write or delete on a save key', async ({ page }) => {
    await page.addInitScript(() => {
      const calls: string[] = [];
      (window as unknown as { saveCalls: string[] }).saveCalls = calls;
      for (const name of ['setItem', 'removeItem'] as const) {
        const real = Storage.prototype[name];
        Storage.prototype[name] = function (this: Storage, key: string, ...rest: string[]) {
          if (/^cueory-.*-save$/.test(key)) calls.push(`${name} ${key}`);
          return (real as (...args: string[]) => void).call(this, key, ...rest);
        } as typeof real;
      }
    });
    for (const path of ['/play/vialo', '/play/sudoku', '/play/crossword']) {
      await open(page, path);
      await page.waitForTimeout(1500);
      await page.reload();
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => (window as unknown as { saveCalls: string[] }).saveCalls)).toEqual([]);
    }
  });

  test('sudoku: an untouched second tab closing leaves the finished save intact', async ({ page, context }) => {
    const daily = generateSudoku(dailySudokuSeed(DAY, 'easy'), 'easy');
    const empty = daily.puzzle.flatMap((digit, index) => (digit === 0 ? [index] : []));
    const cellsOf = (p: Page) => p.getByTestId('sudoku').getByRole('grid', { name: 'sudoku grid' }).getByRole('gridcell');
    await open(page, '/play/sudoku');
    const second = await context.newPage();
    await open(second, '/play/sudoku');
    await expect(cellsOf(second)).toHaveCount(81);
    await expect(cellsOf(page)).toHaveCount(81);
    for (const index of empty) {
      await cellsOf(page).nth(index).click();
      await page.keyboard.press(String(daily.solution[index]));
    }
    await expect(page.getByTestId('sudoku-result')).toBeVisible();
    await second.reload();
    await second.close();
    await page.getByTestId('game-result-dialog').getByRole('button', { name: 'close results' }).click();
    await page.reload();
    await expect(cellsOf(page)).toHaveCount(81);
    await expect(page.getByTestId('sudoku-result')).toBeVisible();
  });

  test('crossword: an untouched second tab closing leaves the finished save intact', async ({ page, context }) => {
    const SAMPLE = ['.ABC.', 'DEFGH', 'IJKLM', 'NOPQR', '.STU.'];
    const squareOf = (p: Page, row: number, column: number) =>
      p.getByTestId('cueword').getByRole('button', { name: new RegExp('^(?:\\d+, )?row ' + row + ', column ' + column + ',') });
    await open(page, '/play/crossword');
    const second = await context.newPage();
    await open(second, '/play/crossword');
    await expect(squareOf(second, 2, 1)).toBeVisible();
    for (const [row, letters] of SAMPLE.entries()) {
      for (const [column, letter] of [...letters].entries()) {
        if (letter === '.') continue;
        await squareOf(page, row + 1, column + 1).click();
        await page.keyboard.type(letter);
      }
    }
    await expect(page.getByTestId('cueword').getByTestId('crossword-badge')).toHaveText(/solved without help/);
    await second.reload();
    await second.close();
    await page.getByTestId('game-result-dialog').getByRole('button', { name: 'close results' }).click();
    await page.reload();
    await expect(page.getByTestId('cueword').getByTestId('crossword-badge')).toHaveText(/solved without help/);
  });
});
