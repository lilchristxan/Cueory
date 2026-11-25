import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { dailySudokuSeed, generateSudoku } from '../../src/islands/sudoku';
import { markPanelsSeen } from './clock';

// Christian: a number-pad digit that is already on the board nine times dims, is announced as "all placed", and does nothing.

const daily = generateSudoku(dailySudokuSeed('2026-11-01', 'easy'), 'easy');
const game = (page: Page) => page.getByTestId('sudoku');
const cells = (page: Page) => game(page).getByRole('grid', { name: 'sudoku grid' }).getByRole('gridcell');
const open = (digit: number) => daily.puzzle.flatMap((given, index) => (!given && daily.solution[index] === digit ? [index] : []));
const target = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((digit) => open(digit).length > 1)!;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); localStorage.setItem('cueory-game-help-seen', JSON.stringify(['triage'])); } catch { /* optional */ }
  });
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
});

for (const [size, width, height] of [['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`a finished digit dims, is announced and does nothing: ${size} / ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/play/sudoku');
      await expect(cells(page)).toHaveCount(81);
      const pad = game(page).locator('.sudoku-number-row');
      const key = pad.getByRole('button', { name: new RegExp(`^${target}(, all placed)?$`) });
      const spots = open(target);
      const before = (await key.boundingBox())!;

      // Every spot but the last: the digit is still available.
      for (const index of spots.slice(0, -1)) { await cells(page).nth(index).click(); await page.keyboard.press(String(target)); }
      await expect(key).not.toHaveAttribute('aria-disabled', 'true');
      expect(await key.getAttribute('aria-label')).toBeNull();

      // The ninth one placed: the key is unavailable, announced, and the same size.
      const last = spots[spots.length - 1]!;
      await cells(page).nth(last).click();
      await key.click();
      await expect(cells(page).nth(last)).toHaveText(String(target));
      await expect(game(page).getByRole('button', { name: `${target}, all placed`, exact: true })).toHaveAttribute('aria-disabled', 'true');
      const after = (await key.boundingBox())!;
      expect([after.x, after.y, after.width, after.height]).toEqual([before.x, before.y, before.width, before.height]);
      expect(after.width).toBeGreaterThanOrEqual(44);
      expect(after.height).toBeGreaterThanOrEqual(44);
      await expect(key).toHaveCSS('border-top-style', 'dashed');
      await expect(key).toHaveCSS('text-decoration-line', 'line-through');
      await key.focus();
      await expect(key).toBeFocused();

      // Pressing it, or typing it, in an empty square does nothing and says so.
      const spare = daily.puzzle.findIndex((given, index) => !given && daily.solution[index] !== target && index !== last);
      await cells(page).nth(spare).click();
      await key.click({ force: true });
      await expect(cells(page).nth(spare)).toBeEmpty();
      await expect(game(page).getByTestId('sudoku-live')).toHaveText(`${target} is all placed.`);
      await cells(page).nth(spare).focus();
      await page.keyboard.press(String(target));
      await expect(cells(page).nth(spare)).toBeEmpty();

      // Pencil mode: the same digit is unavailable there too.
      await page.keyboard.press('p');
      await key.click({ force: true });
      await expect(cells(page).nth(spare)).toBeEmpty();
      await page.keyboard.press('p');

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);

      // Erasing one of them brings the digit back; undo does too.
      await cells(page).nth(last).click();
      await page.keyboard.press('Backspace');
      await expect(key).not.toHaveAttribute('aria-disabled', 'true');
      await expect(game(page).getByRole('button', { name: String(target), exact: true })).toBeVisible();
      await game(page).getByRole('button', { name: 'Undo' }).click();
      await expect(key).toHaveAttribute('aria-disabled', 'true');
      await game(page).getByRole('button', { name: 'Undo' }).click();
      await expect(key).not.toHaveAttribute('aria-disabled', 'true');
    });
  }
}
