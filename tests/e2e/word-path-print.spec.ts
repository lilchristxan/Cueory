import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

/**
 * Printing word path for a patient (Task 641). The clock is set to 6 November 2026, so today's puzzle is the older
 * word search sample (content/games/suture/sample-06.json); word-path-board.spec.ts prints a board. window.print is replaced before the click, so no dialog opens.
 */
type Cell = [number, number];
const sample = JSON.parse(readFileSync(new URL('../../content/games/suture/sample-06.json', import.meta.url), 'utf8')) as {
  words: { answer: string; path: Cell[] }[];
};

const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
const game = (page: Page) => page.getByTestId('suture');
const printButton = (page: Page) => game(page).getByRole('button', { name: 'print', exact: true });
const cell = (page: Page, [row, col]: Cell) => game(page).locator(`button[data-cell="${row},${col}"]`);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* storage blocked: no panel */ }
    // A returning player: the first-visit rules card (#736) is already put away, so the letters follow the print button.
    try { localStorage.setItem('cueory-game-help-seen', JSON.stringify(['suture'])); } catch { /* storage blocked */ }
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => { (window as unknown as { printed: number }).printed += 1; };
  });
  await page.clock.setFixedTime(new Date('2026-11-06T15:00:00'));
  await markPanelsSeen(page);
  await page.goto('/play/word-path');
  await expect(game(page)).toBeVisible();
});

const printed = (page: Page) => page.evaluate(() => (window as unknown as { printed: number }).printed);

test.describe('piccline: print for a patient (Task 641)', () => {
  test('a round print button, at least 44 × 44, at the top right of the board, below the Frame\'s gear and "?"', async ({ page }) => {
    await expect(printButton(page)).toBeVisible();
    const box = (await printButton(page).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(printButton(page)).toHaveCSS('border-top-left-radius', /^(?:[2-9]\d|\d{3,})(?:\.\d+)?px$/);
    // The gear and "?" are the Frame's pair in the play area's corner; print stays at the board's top right edge, under them.
    const area = (await game(page).boundingBox())!;
    const help = (await page.getByTestId('game-frame-help-button').boundingBox())!;
    expect(box.x + box.width).toBeGreaterThan(area.x + area.width - 2);
    expect(box.y).toBeGreaterThanOrEqual(help.y + help.height);
    // The print-only word list and footer stay off screen.
    await expect(page.getByTestId('suture-print-words')).toBeHidden();
    await expect(page.getByTestId('suture-print-foot')).toBeHidden();
  });

  test('the keyboard reaches the print button, and enter prints', async ({ page }) => {
    // The Frame's gear and "?" come first, then the board's own row with print. So shift+tab from the first letter lands on print.
    await cell(page, [0, 0]).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(printButton(page)).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await printed(page)).toBe(1);
    await expect(page.locator('html')).toHaveAttribute('data-print-game', 'suture');
  });

  test('on paper: only the grid, the words to find and cueory.app, with nothing found shown', async ({ page }) => {
    // Print must still fit its paper-width grid if a reader has enlarged root text.
    await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
    // Find one word first, so the printed copy has to hide it.
    const first = sample.words[0]!;
    await cell(page, first.path[0]!).click();
    await cell(page, first.path.at(-1)!).click();
    await expect(page.getByTestId('suture-count')).toHaveText(`1 of ${sample.words.length} found`);

    await printButton(page).click();
    expect(await printed(page)).toBe(1);
    await page.emulateMedia({ media: 'print' });

    for (const selector of ['body > header', 'body > footer', 'body > [data-testid="building-notice"]']) {
      await expect(page.locator(selector)).toBeHidden();
    }
    await expect(printButton(page)).toBeHidden();
    await expect(page.getByTestId('suture-words')).toBeHidden();
    await expect(page.getByTestId('suture-count')).toBeHidden();
    await expect(page.getByTestId('suture-live')).toBeHidden();
    await expect(game(page).getByText('tap a word\'s first letter')).toBeHidden();
    // The rest of the page (the back link, the page title, the settings and the stats panel) is left out.
    await expect(page.getByRole('link', { name: 'all games' })).toBeHidden();
    await expect(page.locator('#word-path-heading')).toBeHidden();
    await expect(page.getByTestId('play-settings')).toBeHidden();
    await expect(page.getByTestId('game-stats')).toBeHidden();

    await expect(game(page).getByRole('grid')).toBeVisible();
    const words = page.getByTestId('suture-print-words');
    await expect(words).toBeVisible();
    await expect(words).toContainText('words to find');
    await expect(words.getByRole('listitem')).toHaveText(sample.words.map((word) => word.answer));
    await expect(words.locator('s')).toHaveCount(0);
    await expect(page.getByTestId('suture-print-foot')).toHaveText('cueory.app');

    // Black on white, and the found word's letters look like every other letter.
    await expect(game(page)).toHaveCSS('color', 'rgb(0, 0, 0)');
    await expect(page.locator('body')).toHaveCSS('background-image', 'none');
    const found = cell(page, first.path[0]!);
    await expect(found).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(found).toHaveCSS('color', 'rgb(0, 0, 0)');

    // The grid fits the width of a letter or A4 page inside its margins (16 cm, about 605 px at 96 per inch).
    const board = (await game(page).getByRole('grid').boundingBox())!;
    expect(board.width).toBeLessThanOrEqual(606);
    const finalCell = (await game(page).getByRole('row').first().getByRole('gridcell').last().boundingBox())!;
    expect(finalCell.x + finalCell.width).toBeLessThanOrEqual(board.x + board.width + 0.5);
  });

  test('a plain print without the button still prints the game clean', async ({ page }) => {
    await page.emulateMedia({ media: 'print' });
    await expect(printButton(page)).toBeHidden();
    await expect(page.getByTestId('suture-words')).toBeHidden();
    await expect(page.getByTestId('suture-print-words')).toBeVisible();
    // Without the button's mark, the rest of the page prints as before.
    // (each game on its own page, 2026-11-17: the page's title is the game's name)
    await expect(page.getByRole('heading', { level: 1, name: 'piccline' })).toBeVisible();
  });

  test('axe passes with the print button', async ({ page }) => {
    await printButton(page).scrollIntoViewIfNeeded();
    const results = await axe(page);
    expect(results.violations).toEqual([]);
  });
});

// Printing from the print button lays the page out at the paper's width, or on a phone at the screen's width. Either
// way the printed board is centred on the page with all four of its borders inside it, for both board formats.
test.describe('word path: the printed board is centred inside the page', () => {
  for (const [format, day] of [['word search', '2026-11-06T15:00:00'], ['6 × 8 board', '2026-11-01T15:00:00']] as const) {
    for (const width of [390, 816]) {
      test(`${format} at a ${width} px layout`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1056 });
        await page.clock.setFixedTime(new Date(day));
        await markPanelsSeen(page);
        await page.reload();
        await expect(game(page)).toBeVisible();
        await printButton(page).click();
        await page.emulateMedia({ media: 'print' });
        const board = (await game(page).locator('.wordpath-board').boundingBox())!;
        const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(board.x).toBeGreaterThanOrEqual(0);
        expect(board.x + board.width).toBeLessThanOrEqual(pageWidth);
        expect(Math.abs(board.x + board.width / 2 - pageWidth / 2)).toBeLessThanOrEqual(3);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      });
    }
  }
});
