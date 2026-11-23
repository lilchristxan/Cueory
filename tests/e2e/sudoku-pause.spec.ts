import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dailySudokuSeed, generateSudoku } from '../../src/islands/sudoku';
import { markPanelsSeen } from './clock';

// Fix the browser timezone, not just the runner's clock, so the daily seed always matches Nov 1.
test.use({ timezoneId: 'America/Phoenix' });

const puzzle = generateSudoku(dailySudokuSeed('2026-11-01', 'easy'), 'easy').puzzle;
const given = puzzle.findIndex((value) => value !== 0);
const empty = puzzle.findIndex((value) => value === 0);
const marked = puzzle.findIndex((value, index) => value === 0 && index !== empty);
const game = (page: Page) => page.getByTestId('sudoku');
const cells = (page: Page) => game(page).getByRole('gridcell');

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-01T15:00:00-07:00') });
  await markPanelsSeen(page);
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional */ }
  });
});
for (const [size, width, height] of [['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`sudoku pause at ${size} in ${scheme} theme`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/play/sudoku');
      await expect(cells(page)).toHaveCount(81);
      // The help text must describe the same privacy behavior as the paused board.
      const how = page.getByTestId('game-frame-help-button');
      await how.click();
      // The "?" opens the rules in a dialog (#736); Escape closes it and gives focus back to the "?".
      const rules = page.getByRole('dialog', { name: 'how to play sudoku' });
      await expect(rules)
        .toContainText('pause hides every number, the original ones too, until you press play. leaving the page pauses it for you.');
      await page.keyboard.press('Escape');
      await expect(rules).toBeHidden();
      await cells(page).nth(empty).click();
      await page.keyboard.press('1');
      await cells(page).nth(marked).click();
      await page.keyboard.press('x');
      await expect(cells(page).nth(empty)).toHaveText('1');
      await expect(cells(page).nth(marked)).toHaveText('x');
      const savedEntry = await cells(page).nth(empty).getAttribute('aria-label');
      const savedMark = await cells(page).nth(marked).getAttribute('aria-label');

      await page.clock.runFor(2000);
      const pause = game(page).getByRole('button', { name: 'pause puzzle' });
      await pause.focus();
      await expect(pause).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(game(page).getByTestId('sudoku-live')).toHaveText('puzzle paused. every number is hidden until you press play.');
      // Every square is hidden while paused, the given numbers too, and shows the same quiet mark.
      await expect(cells(page).nth(given)).toBeEmpty();
      await expect(cells(page).nth(given)).toHaveAttribute('aria-label', /hidden until resumed$/);
      await expect(game(page).locator('[data-given="true"]')).toHaveCount(40);
      await expect(game(page).locator('.sudoku-paused-mark')).toHaveCount(81);
      for (const index of [empty, marked]) {
        await expect(cells(page).nth(index)).toBeEmpty();
        await expect(cells(page).nth(index)).toHaveAttribute('aria-label', /hidden until resumed/);
      }
      await expect(game(page).locator('.is-entered, .is-conflict, .is-identical, .sudoku-mark, .sudoku-candidates')).toHaveCount(0);
      const labels = await cells(page).evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label') ?? ''));
      expect(labels.some((label) => /paused/i.test(label))).toBe(false);
      const time = await game(page).locator('.sudoku-time strong').textContent();
      await page.clock.runFor(10000);
      await expect(game(page).locator('.sudoku-time strong')).toHaveText(time ?? '');

      await game(page).getByRole('button', { name: 'resume puzzle' }).click();
      await expect(game(page).getByTestId('sudoku-live')).toHaveText('puzzle resumed.');
      await expect(cells(page).nth(empty)).toHaveText('1');
      await expect(cells(page).nth(marked)).toHaveText('x');
      await expect(cells(page).nth(given)).toHaveText(String(puzzle[given]));
      await expect(game(page).locator('.sudoku-paused-mark')).toHaveCount(0);
      await expect(cells(page).nth(empty)).toHaveAttribute('aria-label', savedEntry!);
      await expect(cells(page).nth(marked)).toHaveAttribute('aria-label', savedMark!);
      await page.clock.runFor(2000);
      await expect(game(page).locator('.sudoku-time strong')).not.toHaveText(time ?? '');
      const box = await game(page).getByRole('button', { name: 'pause puzzle' }).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => (document.querySelector('header')?.getBoundingClientRect().top ?? 0) >= 0);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }
}


test('paused keypad and keyboard cannot change entries, marks, errors, or the live message', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/play/sudoku');
  await expect(cells(page)).toHaveCount(81);

  await cells(page).nth(empty).click();
  await page.keyboard.press('1');
  await expect(cells(page).nth(empty)).toHaveText('1');
  const errorsBefore = await game(page).locator('.sudoku-errors').innerText();

  await game(page).getByRole('button', { name: 'pause puzzle' }).click();
  await expect(game(page).locator('.sudoku-number-row button')).toHaveCount(10);
  for (const button of await game(page).locator('.sudoku-number-row button').all()) {
    await expect(button).toBeDisabled();
  }
  await expect(game(page).getByTestId('sudoku-live')).toHaveText('puzzle paused. every number is hidden until you press play.');
  await expect(game(page).locator('[aria-live="polite"]')).toHaveCount(1);
  // A pause cannot silently reset the board or change the hint setting.
  const hintsControl = game(page).getByRole('checkbox', { name: /auto cues/i });
  await expect(hintsControl).toBeDisabled();
  const hintsBefore = await hintsControl.getAttribute('aria-checked');
  const difficulty = page.getByTestId('game-frame-sudoku-difficulty');
  await expect(difficulty).toBeDisabled();
  await expect(difficulty).toHaveValue('easy');
  await expect(hintsControl).toHaveAttribute('aria-checked', hintsBefore!);
  // Pausing conceals the current selection, and tapping another cell cannot replace it.
  await expect(game(page).locator('.sudoku-cell.is-selected')).toHaveCount(0);
  await expect(game(page).locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(0);
  await cells(page).nth(empty).click();
  await page.keyboard.press('9');
  await cells(page).nth(marked).click();
  await page.keyboard.press('x');
  await expect(cells(page).nth(empty)).toBeEmpty();
  await expect(cells(page).nth(marked)).toBeEmpty();
  await expect(game(page).locator('.sudoku-errors')).toHaveText(errorsBefore);
  await expect(game(page).getByTestId('sudoku-live')).toHaveText('puzzle paused. every number is hidden until you press play.');

  await game(page).getByRole('button', { name: 'resume puzzle' }).click();
  await expect(hintsControl).toBeEnabled();
  await expect(difficulty).toBeEnabled();
  await expect(difficulty).toHaveValue('easy');
  await expect(hintsControl).toHaveAttribute('aria-checked', hintsBefore!);
  await expect(cells(page).nth(empty)).toHaveAttribute('aria-selected', 'true');
  await expect(cells(page).nth(marked)).toHaveAttribute('aria-selected', 'false');
  await expect(cells(page).nth(empty)).toHaveText('1');
  await expect(cells(page).nth(marked)).toBeEmpty();
  await expect(game(page).locator('.sudoku-errors')).toHaveText(errorsBefore);
  await expect(game(page).getByTestId('sudoku-live')).toHaveText('puzzle resumed.');
});
