import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

/**
 * Printing piccline for a patient (Christian, 2026-11-25; replaces the Task 641 print button). The sheet is a print-only
 * block on /play/piccline: page 1 the guesser's copy (the cue, the board, the words to find), page 2 the keeper's copy
 * (how to play, a fold line, the answers' paths on the board). The clock is 1 November 2026, when piccline's board is
 * content/games/suture/sample-01.json. window.print is replaced, so no dialog opens.
 */
type Cell = [number, number];
const sample = JSON.parse(readFileSync(new URL('../../content/games/suture/sample-01.json', import.meta.url), 'utf8')) as {
  clue: string;
  grid: string[];
  words: { answer: string; path: Cell[]; special?: boolean }[];
};
const alphabetical = sample.words.map((word) => word.answer).sort((a, b) => a.localeCompare(b));
const STATS_KEY = 'cueory-game-stats';
const FINISHED = { version: 1, results: [{ game: 'suture', day: '2026-11-01', solved: true, tries: 0 }] };
const finish = (page: Page) => page.addInitScript(([key, value]) => localStorage.setItem(key as string, JSON.stringify(value)), [STATS_KEY, FINISHED]);
const stored = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), STATS_KEY);
const printed = (page: Page) => page.evaluate(() => (window as unknown as { printed: number }).printed);
const sheet = (page: Page) => page.getByTestId('print-sheet');
const keeper = (page: Page) => page.getByTestId('sheet-keeper');
const warning = (page: Page) => page.getByRole('dialog', { name: 'print before you finish?' });
const game = (page: Page) => page.getByTestId('suture');
const todayRow = (page: Page) => page.getByTestId('play-status-suture');
// The print island loads after the page, so wait until it says it is listening (data-print-ready) before pressing.
const press = async (page: Page) => {
  await expect(sheet(page)).toHaveAttribute('data-print-ready', 'true');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('cueory:print', { detail: { game: 'piccline' } })));
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
      // A returning player: the first-visit rules card is already put away.
      localStorage.setItem('cueory-game-help-seen', JSON.stringify(['suture']));
    } catch { /* storage blocked */ }
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => { (window as unknown as { printed: number }).printed += 1; };
  });
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
});

test('the sheet is hidden on screen and holds no answer path in the page', async ({ page }) => {
  await finish(page);
  await page.goto('/play/piccline');
  await expect(sheet(page)).toHaveAttribute('data-print-ready', 'true');
  await expect(sheet(page)).toBeHidden();
  await expect(page.getByTestId('sheet-path')).toHaveCount(0);
  await expect(page.getByTestId('sheet-answers')).toHaveCount(0);
  await expect(keeper(page)).toHaveAttribute('data-keeper', 'locked');
});

test("page 1 is the guesser's copy: the cue, the board and the words to find, and no paths", async ({ page }) => {
  await finish(page);
  await page.goto('/play/piccline');
  await expect(sheet(page)).toHaveAttribute('data-print-ready', 'true');
  await page.emulateMedia({ media: 'print' });
  const one = page.getByTestId('sheet-page-1');
  await expect(one.getByTestId('sheet-label')).toHaveText("guesser's copy");
  await expect(one).toContainText('find each word on the board. draw a line through its letters and tick it off.');
  await expect(one.getByTestId('sheet-clue')).toHaveText(`today's cue: ${sample.clue}`);
  await expect(one.getByTestId('sheet-grid').locator('.sheet-grid-letter')).toHaveText(sample.grid.join('').split(''));
  await expect(one).toContainText(`${sample.words.length} words to find`);
  await expect(one.getByTestId('sheet-words').getByRole('listitem')).toHaveText(alphabetical.map((word) => word.toUpperCase()));
  await expect(one.locator('.sheet-box')).toHaveCount(sample.words.length);
  await expect(one).toContainText('cueory.app · page 1 of 2');
  await expect(page.getByTestId('sheet-path')).toHaveCount(0);
  await expect(page.getByTestId('suture')).toBeHidden();
});

test("printing a finished board prints once and fills page 2 with the paths and the answers", async ({ page }) => {
  await finish(page);
  await page.goto('/play/piccline');
  await press(page);
  await expect.poll(() => printed(page)).toBe(1);
  await expect(warning(page)).toHaveCount(0);
  await expect(keeper(page)).toHaveAttribute('data-keeper', 'ready');
  await page.emulateMedia({ media: 'print' });
  const two = page.getByTestId('sheet-page-2');
  await expect(two.getByTestId('sheet-label')).toHaveText("keeper's copy");
  await expect(two).toContainText('how to play');
  await expect(two.getByRole('listitem').filter({ hasText: 'two players.' })).toHaveCount(1);
  await expect(two.getByTestId('sheet-fold')).toHaveText('fold to hide answers');
  await expect(two.getByTestId('sheet-path')).toHaveCount(sample.words.length);
  await expect(two.getByTestId('sheet-start')).toHaveCount(sample.words.length);
  await expect(two.getByTestId('sheet-answer-list').getByRole('listitem')).toHaveCount(sample.words.length);
  for (const [position, answer] of alphabetical.entries()) {
    await expect(two.getByTestId('sheet-answer-list').getByRole('listitem').nth(position)).toContainText(answer.toLowerCase());
  }
  const thread = sample.words.find((word) => word.special)!;
  await expect(two.getByTestId('sheet-answer-list').getByRole('listitem').filter({ hasText: 'the thread' })).toContainText(thread.answer.toLowerCase());
  await expect(two.locator('.sheet-path-thread')).toHaveCount(1);
  // After the print the answers leave the page again.
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.getByTestId('sheet-path')).toHaveCount(0);
  await expect(keeper(page)).toHaveAttribute('data-keeper', 'locked');
  await expect(keeper(page)).toContainText("finish today's piccline to print the keeper's copy");
});

for (const format of ['A4', 'Letter'] as const) {
  for (const state of ['locked', 'ready'] as const) {
    test(`it prints as exactly two ${format} pages (${state})`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'page.pdf is Chromium only');
      if (state === 'ready') await finish(page);
      await page.goto('/play/piccline');
      if (state === 'ready') {
        await press(page);
        await expect(keeper(page)).toHaveAttribute('data-keeper', 'ready');
      } else {
        await expect(sheet(page)).toHaveAttribute('data-print-ready', 'true');
      }
      await page.emulateMedia({ media: 'print' });
      const pdf = await page.pdf({ format, printBackground: false, preferCSSPageSize: true });
      expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(2);
    });
  }
}

for (const paper of [{ name: 'Letter', width: 816, height: 1056 }, { name: 'A4', width: 794, height: 1123 }]) {
  test(`large print on ${paper.name}: big letters, outlines of 1.5 pt or more, and everything inside the page`, async ({ page }) => {
    await finish(page);
    await page.setViewportSize({ width: paper.width, height: paper.height });
    await page.goto('/play/piccline');
    await press(page);
    await expect(keeper(page)).toHaveAttribute('data-keeper', 'ready');
    await page.emulateMedia({ media: 'print' });
    const m = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const px = (selector: string, property: string) => parseFloat(getComputedStyle(document.querySelector(selector)!).getPropertyValue(property));
      const one = document.querySelector('[data-testid="sheet-page-1"]')!.getBoundingClientRect();
      const two = document.querySelector('[data-testid="sheet-page-2"]')!;
      const answers = document.querySelector('[data-testid="sheet-answer-grid"]')!.getBoundingClientRect();
      const footOne = document.querySelector('[data-testid="sheet-page-1"] .sheet-footer')!.getBoundingClientRect();
      const footTwo = two.querySelector('.sheet-footer')!.getBoundingClientRect();
      const grid = box('[data-testid="sheet-grid"]');
      return {
        gridWidth: grid.width, gridBottom: grid.bottom, gridRight: grid.right, footOne: footOne.top, pageWidth: one.width,
        letter: px('[data-testid="sheet-grid"] .sheet-grid-letter', 'font-size'), word: px('.sheet-list-word', 'font-size'),
        circle: px('[data-testid="sheet-grid"] .sheet-grid-letter', 'border-top-width'), boxLine: px('.sheet-box', 'border-top-width'),
        path: px('.sheet-path', 'stroke-width'), answersBottom: answers.bottom, footTwo: footTwo.top, scrollWidth: document.documentElement.scrollWidth,
        list: box('[data-testid="sheet-words"]').right,
      };
    });
    expect(m.letter).toBeGreaterThanOrEqual(28 * 96 / 72 - 0.5);
    expect(m.word).toBeGreaterThanOrEqual(18 * 96 / 72 - 0.5);
    expect(m.circle).toBeGreaterThanOrEqual(1.5 * 96 / 72 - 0.1);
    expect(m.boxLine).toBeGreaterThanOrEqual(1.5 * 96 / 72 - 0.1);
    expect(m.path).toBeGreaterThanOrEqual(1.5 * 96 / 72);
    // Page 1's board is big: at least 4.75 in wide, inside the margins, above the footer. The words sit inside the page.
    expect(m.gridWidth).toBeGreaterThanOrEqual(4.75 * 96);
    expect(m.gridRight).toBeLessThanOrEqual(m.pageWidth);
    expect(m.list).toBeLessThanOrEqual(m.pageWidth - 0.45 * 96);
    expect(m.gridBottom).toBeLessThan(m.footOne);
    expect(m.answersBottom).toBeLessThan(m.footTwo);
    expect(m.scrollWidth).toBeLessThanOrEqual(m.pageWidth + 1);
  });
}

test('the sheet has no accessibility problems on paper', async ({ page }) => {
  await finish(page);
  await page.goto('/play/piccline');
  await press(page);
  await expect(keeper(page)).toHaveAttribute('data-keeper', 'ready');
  await page.emulateMedia({ media: 'print' });
  const results = await new AxeBuilder({ page }).include('[data-testid="print-sheet"]').analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test.describe('printing an unfinished board', () => {
  test('warns first, and cancelling changes nothing', async ({ page }) => {
    await page.goto('/play/piccline');
    await press(page);
    await expect(warning(page)).toBeVisible();
    await expect(warning(page)).toContainText("the printed copy shows today's answers.");
    await expect(warning(page).getByRole('button', { name: 'finish the game first' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(warning(page)).toBeHidden();
    expect(await printed(page)).toBe(0);
    expect(await stored(page)).toBeNull();
    await expect(keeper(page)).toHaveAttribute('data-keeper', 'locked');
  });

  test('the printer button opens the warning; "print anyway" records not solved, ends the board and prints', async ({ page }) => {
    await page.goto('/play/piccline');
    await expect(sheet(page)).toHaveAttribute('data-print-ready', 'true');
    await game(page).getByTestId('suture-print').click();
    await expect(warning(page)).toBeVisible();
    await warning(page).getByRole('button', { name: 'print anyway' }).click();
    await expect.poll(() => printed(page)).toBe(1);
    expect(await stored(page)).toEqual({ version: 1, results: [{ game: 'piccline', day: '2026-11-01', solved: false, tries: 0 }] });
    await expect(keeper(page)).toHaveAttribute('data-keeper', 'ready');
    await expect(game(page).getByTestId('suture-forfeit-note')).toHaveText('you printed before finishing, so today counts as not solved.');
    await expect(game(page).locator('button[data-cell]').first()).toBeDisabled();
    await expect(game(page).getByTestId('suture-submit')).toBeDisabled();
  });

  test('"finish the game first" just closes the dialog; the board stays playable', async ({ page }) => {
    await page.goto('/play/piccline');
    await press(page);
    await warning(page).getByRole('button', { name: 'finish the game first' }).click();
    await expect(warning(page)).toBeHidden();
    expect(await printed(page)).toBe(0);
    expect(await stored(page)).toBeNull();
    await expect(game(page).locator('button[data-cell]').first()).toBeEnabled();
  });

  test('a finished board prints at once from the printer button', async ({ page }) => {
    await finish(page);
    await page.goto('/play/piccline');
    await expect(sheet(page)).toHaveAttribute('data-print-ready', 'true');
    await game(page).getByTestId('suture-print').click();
    await expect.poll(() => printed(page)).toBe(1);
    await expect(warning(page)).toHaveCount(0);
  });
});

test('the older word path route has no print button', async ({ page }) => {
  await page.goto('/play/word-path');
  await expect(game(page)).toBeVisible();
  await expect(game(page).getByTestId('suture-print')).toHaveCount(0);
  await expect(page.getByTestId('print-sheet')).toHaveCount(0);
});

test.describe('from /play', () => {
  test('a finished board offers print for a patient, which opens the game page and prints', async ({ page }) => {
    await finish(page);
    await page.goto('/play');
    await expect(todayRow(page).getByRole('link', { name: 'play piccline' })).toHaveCount(0);
    await todayRow(page).getByRole('button', { name: 'print for a patient (piccline)' }).click();
    await expect(page).toHaveURL(/\/play\/piccline$/);
    await expect.poll(() => printed(page)).toBe(1);
    await expect(page.getByTestId('sheet-answer-list')).toBeAttached();
  });

  test('an unfinished board shows only play, no print button', async ({ page }) => {
    await page.goto('/play');
    await expect(todayRow(page).getByRole('link', { name: 'play piccline' })).toBeVisible();
    await expect(todayRow(page).getByRole('button', { name: /print for a patient/ })).toHaveCount(0);
  });
});
