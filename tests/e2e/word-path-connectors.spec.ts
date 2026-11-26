import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

/**
 * Word path's 6 × 8 board (sample-01, 1 November 2026): straight lines join the letters of the word being picked and
 * of every found answer, from the edge of one circle to the edge of the next; picked letters show no order numbers; a
 * drag draws a line on to the finger and never scrolls the page. (Printing has its own spec: word-path-print.spec.ts.)
 */
type Cell = [number, number];
const sample = JSON.parse(readFileSync(new URL('../../content/games/suture/sample-01.json', import.meta.url), 'utf8')) as {
  words: { answer: string; path: Cell[]; special?: boolean }[];
};
const theme = sample.words.find((word) => !word.special)!;
const other = sample.words.find((word) => !word.special && word !== theme)!;
const game = (page: Page) => page.getByTestId('suture');
const cell = (page: Page, [row, col]: Cell) => game(page).locator(`button[data-cell="${row},${col}"]`);
const lines = (page: Page, kind: string) => game(page).locator(`[data-testid="suture-lines"] line[data-kind="${kind}"]`);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
      localStorage.setItem('cueory-game-help-seen', JSON.stringify(['suture']));
    } catch { /* optional storage */ }
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => { (window as unknown as { printed: number }).printed += 1; };
  });
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
  await page.goto('/play/word-path');
  await expect(game(page)).toBeVisible();
});

/** Each line starts on one circle's edge and ends on the next one's, within a pixel. */
async function edgeToEdge(page: Page, kind: string, path: Cell[]) {
  const ends = await lines(page, kind).evaluateAll((list) => list.map((line) => {
    const svg = (line as SVGLineElement).ownerSVGElement!.getBoundingClientRect();
    const x = (name: string) => Number(line.getAttribute(name));
    return { x1: svg.left + x('x1'), y1: svg.top + x('y1'), x2: svg.left + x('x2'), y2: svg.top + x('y2') };
  }));
  expect(ends).toHaveLength(path.length - 1);
  for (const [i, end] of ends.entries()) {
    const circle = async (at: Cell) => {
      const box = (await cell(page, at).locator('.wordpath-dot').boundingBox())!;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, r: box.width / 2 };
    };
    const a = await circle(path[i]!);
    const b = await circle(path[i + 1]!);
    expect(Math.abs(Math.hypot(end.x1 - a.x, end.y1 - a.y) - a.r)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.hypot(end.x2 - b.x, end.y2 - b.y) - b.r)).toBeLessThanOrEqual(1);
    expect(Math.hypot(end.x2 - end.x1, end.y2 - end.y1)).toBeGreaterThan(2);
  }
}

test('picked letters are joined edge to edge, with no order numbers', async ({ page }) => {
  const picked = other.path.slice(0, 3);
  for (const at of picked) await cell(page, at).click();
  await edgeToEdge(page, 'picked', picked);
  const activeLine = lines(page, 'picked').first();
  await expect(activeLine).toHaveCSS('stroke-width', '14px');
  const teal = await cell(page, picked[0]!).locator('.wordpath-dot').evaluate((dot) => getComputedStyle(dot).backgroundColor);
  await expect(activeLine).toHaveCSS('stroke', teal);
  await expect(game(page).locator('.wordpath-step')).toHaveCount(0);
  // The order is still spoken.
  await expect(cell(page, picked[1]!)).toHaveAttribute('aria-label', /letter 2 of the word/);
  await game(page).getByRole('button', { name: 'clear' }).click();
  await expect(lines(page, 'picked')).toHaveCount(0);
});

test('a found answer keeps its joining line', async ({ page }) => {
  for (const at of theme.path) await cell(page, at).click();
  await game(page).getByRole('button', { name: 'submit' }).click();
  await expect(cell(page, theme.path[0]!)).toHaveAttribute('data-look', 'theme');
  await edgeToEdge(page, 'theme', theme.path);
  const foundLine = lines(page, 'theme').first();
  await expect(foundLine).toHaveCSS('stroke-width', '18px');
  const tan = await cell(page, theme.path[0]!).locator('.wordpath-dot').evaluate((dot) => getComputedStyle(dot).backgroundColor);
  await expect(foundLine).toHaveCSS('stroke', tan);
  await expect(game(page).locator('.wordpath-found-pill')).toHaveCSS('background-color', tan);
});

test('a drag draws a line on to the finger and the board never scrolls the page', async ({ page }) => {
  await expect(game(page).locator('.wordpath-board')).toHaveCSS('touch-action', 'none');
  const board = game(page).locator('.wordpath-board');
  await board.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const first = (await cell(page, other.path[0]!).boundingBox())!;
  const second = (await cell(page, other.path[1]!).boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  // Halfway to the next letter: no letter is added yet, but a line follows the pointer.
  await page.mouse.move((first.x + second.x) / 2 + first.width / 2, (first.y + second.y) / 2 + first.height / 2, { steps: 4 });
  await expect(lines(page, 'picked')).toHaveCount(1);
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 4 });
  await expect(cell(page, other.path[1]!)).toHaveAttribute('data-look', 'picked');
  await page.mouse.up();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`a selected letter is readable on the teal fill (${scheme === 'light' ? 'Light' : 'Evening'}), at least 4.5:1`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.reload();
    await cell(page, other.path[0]!).click();
    await expect(cell(page, other.path[0]!)).toHaveAttribute('data-look', 'picked');
    const colours = await cell(page, other.path[0]!).evaluate((button) => {
      const dot = button.querySelector('.wordpath-dot') as HTMLElement;
      const text = button as HTMLElement;
      return { bg: getComputedStyle(dot).backgroundColor, fg: getComputedStyle(text).color };
    });
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const [x, y, z] = [r!, g!, b!].map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * x! + 0.7152 * y! + 0.0722 * z!;
    };
    const [a, b] = [lum(rgb(colours.bg)), lum(rgb(colours.fg))];
    expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
}
