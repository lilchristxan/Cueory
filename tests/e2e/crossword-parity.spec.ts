/**
 * Crossword parity (Task 721, docs/GAMES-PARITY.md): pen and pencil, check and reveal with a first-use warning,
 * Autocheck, the keyboard model, cursor and display settings, pause, the clue list, the "something's not right yet"
 * message, the help badge and the streak. Uses the easy November sample, as play.spec.ts does.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const SAMPLE = ['.ABC.', 'DEFGH', 'IJKLM', 'NOPQR', '.STU.'];
const board = (page: Page) => page.getByTestId('cueword');
const grid = (page: Page) => board(page).getByRole('grid', { name: 'crossword grid' });
const square = (page: Page, row: number, column: number) =>
  board(page).getByRole('button', { name: new RegExp('^row ' + row + ', column ' + column + ',') });
const clueBar = (page: Page) => board(page).getByTestId('cueword-clue');
const axe = async (page: Page) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
};
const noSidewaysScroll = async (page: Page) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.evaluate(() => window.scrollX)).toBe(0);
};

/** Types the sample answer, one square at a time; `wrong` swaps the last square's letter. */
async function fill(page: Page, wrong?: string) {
  for (const [row, letters] of SAMPLE.entries()) {
    for (const [column, letter] of [...letters].entries()) {
      if (letter === '.') continue;
      const last = row === SAMPLE.length - 1 && column === 3;
      await square(page, row + 1, column + 1).click();
      await page.keyboard.type(last && wrong ? wrong : letter);
    }
  }
}

async function useHelp(page: Page, kind: 'check' | 'reveal', scope: 'square' | 'word' | 'puzzle') {
  await board(page).getByTestId('crossword-' + kind).locator('summary').click();
  await board(page).getByRole('button', { name: kind + ' ' + scope, exact: true }).click();
}

async function closeResultDialog(page: Page) {
  const dialog = page.getByTestId('game-result-dialog');
  await expect(dialog.getByRole('button', { name: 'close results' })).toBeFocused();
  await dialog.getByRole('button', { name: 'close results' }).click();
}

test.describe('crossword parity (Task 721)', () => {
  test.beforeEach(async ({ page }) => {
    // The once-only promo panel (D-59) opens after 5 seconds and takes focus and clicks; its own spec covers it (as in play.spec.ts).
    await page.addInitScript(() => {
      try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* storage blocked: no promo then */ }
    });
    await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
    await page.goto('/play/crossword');
    await expect(board(page)).toBeVisible();
  });

  test('pencil letters are marked tentative by name and shape, not color alone', async ({ page }) => {
    await board(page).getByRole('button', { name: 'pencil', exact: true }).click();
    await expect(board(page).getByRole('button', { name: 'pencil', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await square(page, 2, 1).click();
    await page.keyboard.type('d');
    const pencilled = square(page, 2, 1);
    await expect(pencilled).toHaveAttribute('aria-label', /letter D, pencil$/);
    await expect(pencilled).toHaveClass(/crossword-cell-pencil/);
    expect(await pencilled.evaluate((element) => getComputedStyle(element, '::after').borderTopStyle)).toBe('dashed');
    await board(page).getByRole('button', { name: 'pen', exact: true }).click();
    await square(page, 2, 1).click();
    await page.keyboard.type('d');
    await expect(square(page, 2, 1)).toHaveAttribute('aria-label', /letter D$/);
  });

  test('warns before the first check, then checks a square, a word and the puzzle', async ({ page }) => {
    await square(page, 2, 1).click();
    await page.keyboard.type('x');
    await square(page, 2, 1).click();
    await useHelp(page, 'check', 'square');
    const warning = board(page).getByRole('alertdialog', { name: 'use check square?' });
    await expect(warning).toContainText("won't extend your streak");
    await expect(warning.getByRole('button', { name: 'yes, check' })).toBeFocused();
    await warning.getByRole('button', { name: 'cancel' }).click();
    await expect(warning).toHaveCount(0);
    await expect(square(page, 2, 1)).not.toHaveAttribute('aria-label', /marked wrong/);

    await useHelp(page, 'check', 'square');
    await board(page).getByRole('button', { name: 'yes, check' }).click();
    await expect(square(page, 2, 1)).toHaveAttribute('aria-label', /letter X, marked wrong$/);
    await expect(square(page, 2, 1)).toHaveClass(/crossword-cell-wrong/);
    await expect(board(page).getByTestId('crossword-live')).toHaveText('1 letter is marked wrong.');

    // No second warning.
    await useHelp(page, 'check', 'puzzle');
    await expect(board(page).getByRole('alertdialog')).toHaveCount(0);
    const results = await axe(page);
    expect(results.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
  });

  test('reveal marks squares, locks them, and a helped solve gets the "solved with help" badge', async ({ page }) => {
    await square(page, 1, 2).click();
    await useHelp(page, 'reveal', 'square');
    await board(page).getByRole('button', { name: 'yes, reveal' }).click();
    await expect(square(page, 1, 2)).toHaveAttribute('aria-label', /letter A, revealed$/);
    await square(page, 1, 2).click();
    await page.keyboard.type('z');
    await expect(square(page, 1, 2)).toHaveAttribute('aria-label', /letter A, revealed$/);

    await useHelp(page, 'reveal', 'puzzle');
    await closeResultDialog(page);
    const badge = board(page).getByTestId('crossword-badge');
    await expect(badge).toHaveText(/solved with help/);
    await expect(badge).toHaveAttribute('data-badge', 'helped');
    await expect(board(page).getByTestId('crossword-streak-note')).toContainText("doesn't extend your streak");
  });

  test('an unassisted solve gets the "solved without help" badge and starts the crossword streak', async ({ page }) => {
    await page.getByTestId('game-stats').getByRole('switch', { name: 'keep my stats' }).click();
    await fill(page);
    await closeResultDialog(page);
    await expect(board(page).getByTestId('crossword-badge')).toHaveText(/solved without help/);
    await expect(board(page).getByTestId('crossword-streak-note')).toContainText('extends your streak');
    await expect(page.getByTestId('crossword-streak')).toHaveText('streak: 1 day solved without help.');
    const kept = JSON.parse((await page.evaluate(() => localStorage.getItem('cueory-game-stats')))!);
    expect(kept.results).toContainEqual({ game: 'cueword', day: '2026-11-01', solved: true, tries: 0, streak: true });
  });

  test('a full grid with a wrong letter says something is not right yet', async ({ page }) => {
    await fill(page, 'X');
    await expect(board(page).getByTestId('cueword-not-right')).toContainText("something's not right yet");
    await expect(board(page).getByTestId('cueword-result')).toHaveCount(0);
    await square(page, 5, 4).click();
    await page.keyboard.type('u');
    await expect(board(page).getByTestId('cueword-not-right')).toHaveCount(0);
  });

  test('keyboard: Space and opposite arrows switch direction, Tab and Shift+Tab change clue and leave the grid at either end, Backspace deletes', async ({ page }) => {
    const active = grid(page).locator('button[tabindex="0"]');
    await active.focus();
    await expect(clueBar(page)).toContainText('1 across');
    await page.keyboard.press('Space');
    await expect(clueBar(page)).toContainText('1 down');
    await page.keyboard.press('ArrowRight');
    await expect(clueBar(page)).toContainText('1 across');
    await expect(active).toHaveAttribute('aria-label', /^row 1, column 2,/);
    await page.keyboard.press('ArrowRight');
    await expect(grid(page).locator('button[tabindex="0"]')).toHaveAttribute('aria-label', /^row 1, column 3,/);

    await page.keyboard.press('Tab');
    await expect(clueBar(page)).toContainText('4 across');
    await expect(grid(page).locator('button[tabindex="0"]')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(clueBar(page)).toContainText('1 across');

    await page.keyboard.type('a');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await expect(square(page, 1, 2)).toHaveAttribute('aria-label', /empty$/);

    // No keyboard trap: Tab walks the 10 clues in order, and Tab on the last one (5 down) leaves the grid forwards.
    await expect(clueBar(page)).toContainText('1 across');
    for (let step = 1; step < 10; step++) await page.keyboard.press('Tab');
    await expect(clueBar(page)).toContainText('5 down');
    await page.keyboard.press('Tab');
    await expect(board(page).getByRole('group', { name: 'letters' }).getByRole('button').first()).toBeFocused();
    // Shift+Tab comes back to the same square, walks back, and on the first clue (1 across) leaves the grid backwards.
    await page.keyboard.press('Shift+Tab');
    await expect(grid(page).locator('button[tabindex="0"]')).toBeFocused();
    await expect(clueBar(page)).toContainText('5 down');
    for (let step = 1; step < 10; step++) await page.keyboard.press('Shift+Tab');
    await expect(clueBar(page)).toContainText('1 across');
    await page.keyboard.press('Shift+Tab');
    await expect(board(page).getByRole('button', { name: 'pause puzzle' })).toBeFocused();
    // Escape leaves too, to the erase button.
    await grid(page).locator('button[tabindex="0"]').focus();
    await page.keyboard.press('Escape');
    await expect(board(page).getByRole('button', { name: 'erase', exact: true })).toBeFocused();
  });

  test('settings hide the timer, change the clue size, and are remembered in this browser', async ({ page }) => {
    await expect(board(page).getByTestId('crossword-time')).toBeVisible();
    await board(page).getByRole('group', { name: 'entry mode' }).waitFor();
    // The crossword's settings open from the gear at the top left (Christian's brief), with the shared ones.
    await board(page).getByRole('button', { name: 'crossword settings' }).click();
    const settings = page.getByRole('dialog', { name: 'crossword settings' }).getByTestId('crossword-settings');
    await settings.getByRole('checkbox', { name: 'show the timer' }).uncheck();
    await expect(board(page).getByTestId('crossword-time')).toHaveCount(0);
    await settings.getByRole('radio', { name: 'large' }).check();
    await expect(board(page)).toHaveAttribute('data-clue-size', 'large');
    const small = await clueBar(page).evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    await settings.getByRole('radio', { name: 'small' }).check();
    expect(await clueBar(page).evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeLessThan(small);
    const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('cueory-crossword-settings')))!);
    expect(saved).toMatchObject({ showTimer: false, clueSize: 'small' });
    await page.reload();
    await expect(board(page)).toHaveAttribute('data-clue-size', 'small');
    await expect(board(page).getByTestId('crossword-time')).toHaveCount(0);
  });

  test('autocheck marks letters as they are typed', async ({ page }) => {
    await board(page).getByRole('button', { name: 'crossword settings' }).click();
    await page.getByRole('dialog', { name: 'crossword settings' }).getByRole('checkbox', { name: /^autocheck/ }).check();
    // Close the dialog first: it holds the page behind it inert.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('crossword-settings')).toHaveCount(0);
    await square(page, 2, 1).click();
    await page.keyboard.type('q');
    await expect(square(page, 2, 1)).toHaveAttribute('aria-label', /letter Q, marked wrong$/);
  });

  test('pause hides the letters and stops input until resume', async ({ page }) => {
    await square(page, 2, 1).click();
    await page.keyboard.type('d');
    await board(page).getByRole('button', { name: 'pause puzzle' }).click();
    await expect(board(page).getByTestId('crossword-paused')).toBeVisible();
    await expect(grid(page)).toHaveCount(0);
    await expect(board(page).getByRole('button', { name: 'resume', exact: true })).toBeFocused();
    await board(page).getByRole('button', { name: 'resume', exact: true }).click();
    await expect(square(page, 2, 1)).toHaveAttribute('aria-label', /letter D$/);
  });

  test('the clue list view selects a clue by tap and marks the current clue with more than color', async ({ page }) => {
    await board(page).getByRole('button', { name: 'show clue list' }).click();
    const list = board(page).getByTestId('crossword-clue-list');
    await expect(list.getByRole('region', { name: 'across clues' })).toBeVisible();
    await expect(list.locator('[aria-current="true"]')).toContainText('▸');
    await list.getByRole('region', { name: 'down clues' }).getByRole('button').first().click();
    await expect(clueBar(page)).toContainText('down');
    await expect(grid(page).locator('button[tabindex="0"]')).toBeFocused();
    const results = await axe(page);
    expect(results.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
  });

  test('sends the daily status progress event once, on the first entry', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { heard: unknown[] }).heard = [];
      window.addEventListener('cueory:game-progress', (event) => (window as unknown as { heard: unknown[] }).heard.push((event as CustomEvent).detail));
    });
    await square(page, 2, 1).click();
    await page.keyboard.type('dd');
    expect(await page.evaluate(() => (window as unknown as { heard: unknown[] }).heard)).toEqual([{ game: 'cueword', day: '2026-11-01' }]);
  });

  // The same width and text-size pairs as play.spec.ts's hard-board test: 320 px at 16 px text, 390 px at 32 px text.
  for (const { width, rootText } of [{ width: 320, rootText: 16 }, { width: 390, rootText: 32 }]) {
    test(`toolbar, menus, warning and clue list fit at ${width}px with ${rootText}px text, with no sideways page scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate((size) => document.documentElement.style.setProperty('font-size', `${size}px`, 'important'), rootText);
      await noSidewaysScroll(page);
      const inView = async () => {
        const boxes = await board(page).locator('.crossword-toolbar :is(button, summary), .crossword-warning button, .crossword-clue-item')
          .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect()).filter((box) => box.width > 0));
        for (const box of boxes) {
          expect(box.left).toBeGreaterThanOrEqual(0);
          expect(box.right).toBeLessThanOrEqual(width);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      };
      await inView();
      await useHelp(page, 'check', 'word');
      await expect(board(page).getByTestId('crossword-warning')).toBeVisible();
      await inView();
      await noSidewaysScroll(page);
      await board(page).getByRole('button', { name: 'cancel' }).click();
      await board(page).getByRole('button', { name: 'show clue list' }).click();
      await inView();
      await noSidewaysScroll(page);
      await page.getByTestId('crossword-levels').locator('label', { hasText: 'hard' }).click();
      await board(page).getByRole('button', { name: 'show clue list' }).click();
      await inView();
      await noSidewaysScroll(page);
    });
  }
});
