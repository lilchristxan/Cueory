/** Sudoku parity (#720): Pencil mode, Shift, auto candidates, undo, hint, clear cell, check puzzle and per-level stats. */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dailySudokuSeed, generateSudoku } from '../../src/islands/sudoku';
import { markPanelsSeen } from './clock';

const daily = generateSudoku(dailySudokuSeed('2026-11-01', 'easy'), 'easy');
const open = daily.puzzle.flatMap((digit, index) => (digit === 0 ? [index] : []));
const game = (page: Page) => page.getByTestId('sudoku');
const cells = (page: Page) => game(page).getByRole('grid', { name: 'sudoku grid' }).getByRole('gridcell');
const live = (page: Page) => game(page).getByTestId('sudoku-live');
const wrongDigit = (index: number) => (daily.solution[index] === 9 ? 1 : daily.solution[index]! + 1);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional */ }
  });
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
});

for (const [size, width, height] of [['phone', 390, 844], ['desktop', 1440, 900]] as const) {
  test(`sudoku modes, undo, clear and check by keyboard and tap: ${size}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/play/sudoku');
    await expect(cells(page)).toHaveCount(81);
    const mode = game(page).getByTestId('sudoku-mode');

    // Space switches to Pencil mode; numbers then add small pencil marks.
    await cells(page).nth(open[0]!).click();
    await page.keyboard.press('Space');
    const pencil = mode.getByRole('button', { name: /pencil/i });
    await expect(pencil).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('3');
    await page.keyboard.press('5');
    await expect(cells(page).nth(open[0]!)).toHaveAttribute('aria-label', /empty, pencil marks 3, 5/);
    await expect(cells(page).nth(open[0]!)).toHaveClass(/has-candidates/);

    // Holding Shift flips back to normal for that moment only.
    await page.keyboard.down('Shift');
    await expect(pencil).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.up('Shift');
    await expect(pencil).toHaveAttribute('aria-pressed', 'true');

    // Tap back to normal and enter a wrong number: it is marked wrong with a slash and the word "wrong".
    await pencil.click();
    await cells(page).nth(open[1]!).click();
    await page.keyboard.press('p');
    await expect(pencil).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('p');
    await expect(pencil).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press(String(wrongDigit(open[1]!)));
    await expect(cells(page).nth(open[1]!)).toHaveClass(/is-wrong/);
    await expect(cells(page).nth(open[1]!)).toHaveAttribute('aria-label', /, wrong/);
    await expect(cells(page).nth(open[1]!).locator('.sudoku-wrong-mark')).toHaveCount(1);

    // Undo takes it back; Ctrl+Z works too.
    await game(page).getByRole('button', { name: 'undo' }).click();
    await expect(cells(page).nth(open[1]!)).toHaveAttribute('aria-label', /, empty$/);
    await expect(live(page)).toHaveText('last move undone.');
    await cells(page).nth(open[1]!).click();
    await page.keyboard.press(String(daily.solution[open[1]!]));
    await page.keyboard.press('Control+z');
    await expect(cells(page).nth(open[1]!)).toHaveAttribute('aria-label', /, empty$/);

    // Clear cell by button and by Backspace.
    await page.keyboard.press(String(daily.solution[open[1]!]));
    await page.getByTestId('game-frame-gear').click();
    await page.getByRole('dialog', { name: 'sudoku settings' }).getByRole('button', { name: 'clear cell' }).click();
    await expect(cells(page).nth(open[1]!)).toHaveAttribute('aria-label', /, empty$/);
    await cells(page).nth(open[0]!).click();
    await page.keyboard.press('Backspace');
    await expect(cells(page).nth(open[0]!)).toHaveAttribute('aria-label', /, empty$/);

    // Hint is the established automatic-pencil-mark cue: it keeps entries, history and result accounting unchanged.
    await cells(page).nth(open[0]!).click();
    await game(page).getByRole('button', { name: 'hint' }).click();
    await expect(game(page).getByRole('button', { name: 'hint' })).toHaveAttribute('aria-pressed', 'true');
    await expect(cells(page).nth(open[0]!)).toHaveAttribute('aria-label', /empty, pencil marks/);
    await expect(live(page)).toContainText('auto pencil marks on');
    await game(page).getByRole('button', { name: 'hint' }).click();
    await expect(game(page).getByRole('button', { name: 'hint' })).toHaveAttribute('aria-pressed', 'false');
    await expect(cells(page).nth(open[0]!)).toHaveAttribute('aria-label', /, empty$/);

    // Check puzzle with live checking off: a wrong entry is marked only after the check.
    await page.getByTestId('game-frame-gear').click();
    await page.getByRole('checkbox', { name: 'check guesses when entered' }).uncheck();
    await page.getByRole('button', { name: 'close settings' }).click();
    await expect(page.getByRole('dialog', { name: 'sudoku settings' })).toHaveCount(0);
    await cells(page).nth(open[2]!).click();
    await page.keyboard.press(String(wrongDigit(open[2]!)));
    await expect(cells(page).nth(open[2]!)).not.toHaveClass(/is-wrong/);
    await page.getByTestId('game-frame-gear').click();
    await page.getByRole('dialog', { name: 'sudoku settings' }).getByRole('button', { name: 'check puzzle' }).click();
    await expect(cells(page).nth(open[2]!)).toHaveClass(/is-wrong/);
    await expect(live(page)).toContainText('1 square is wrong');

    // Auto pencil marks fill every empty square.
    await game(page).getByRole('button', { name: 'hint' }).click();
    await expect(cells(page).nth(open[3]!)).toHaveAttribute('aria-label', /empty, pencil marks/);

    for (const box of await game(page).locator('.sudoku-tools button').evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().toJSON()))) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('[data-testid="sudoku"]').analyze()).violations).toEqual([]);
  });
}

test('sudoku stats are always kept (no switch), show each level, and "forget all" clears them', async ({ page }) => {
  await page.goto('/play/sudoku');
  await expect(cells(page)).toHaveCount(81);
  // Stats are always kept (2026-11-17): no switch, and the stats view shows the table straight away.
  await expect(page.getByRole('switch', { name: /keep my stats/ })).toHaveCount(0);
  await page.getByTestId('game-frame-gear').click();
  const initialSettings = page.getByRole('dialog', { name: 'sudoku settings' });
  await expect(initialSettings.getByTestId('sudoku-stats')).toBeVisible();
  await page.keyboard.press('Escape');

  // The first move of the day tells /play's daily status that sudoku is in progress.
  await page.evaluate(() => {
    const seen: unknown[] = [];
    (window as unknown as { seenProgress: unknown[] }).seenProgress = seen;
    window.addEventListener('cueory:game-progress', (event) => seen.push((event as CustomEvent).detail));
  });
  for (const index of open) {
    await cells(page).nth(index).click();
    await page.keyboard.press(String(daily.solution[index]));
  }
  await expect(game(page).getByTestId('sudoku-result')).toBeVisible();
  // The finished-game dialog is modal (the page behind it is inert and cannot scroll), so close it first.
  await expect(page.getByTestId('share-dialog')).toBeFocused();
  await page.getByTestId('share-dialog-close').click();
  await expect(live(page)).toContainText('added to your sudoku stats.');
  expect(await page.evaluate(() => (window as unknown as { seenProgress: unknown[] }).seenProgress)).toEqual([{ game: 'triage', day: '2026-11-01' }]);
  // The shared stats record counts the solve too, and the framed page keeps its persistence island mounted.
  expect(await page.evaluate(() => localStorage.getItem('cueory-game-stats'))).toContain('"game":"triage"');
  expect(await page.evaluate(() => localStorage.getItem('cueory-sudoku-stats'))).toContain('"level":"easy"');

  await page.getByTestId('game-frame-gear').click();
  const settings = page.getByRole('dialog', { name: 'sudoku settings' });
  const easy = settings.getByTestId('sudoku-stats').getByRole('row', { name: /^easy/ });
  await expect(easy).toContainText('1');
  await expect(easy).toContainText('1 day');

  // "forget all my stats" deletes the sudoku record too.
  await settings.getByRole('button', { name: 'forget all my stats' }).click();
  await settings.getByRole('button', { name: 'yes, forget all my stats' }).click();
  expect(await page.evaluate(() => localStorage.getItem('cueory-sudoku-stats'))).toBeNull();
});
