import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

/**
 * Word path's board format (#722, docs/GAMES-PARITY.md). The clock is set to 1 November 2026, so today's puzzle is the
 * first sample, "a calm study break" (content/games/suture/sample-01.json): a 6 by 8 board where every letter belongs to
 * one answer, and the thread (the special answer) runs from the top edge to the bottom edge. The tests read the paths
 * from that file.
 */
type Cell = [number, number];
const sample = JSON.parse(readFileSync(new URL('../../content/games/suture/sample-01.json', import.meta.url), 'utf8')) as {
  clue: string;
  grid: string[];
  words: { answer: string; path: Cell[]; special?: boolean }[];
  extras: string[];
};
const total = sample.words.length;
const thread = sample.words.find((word) => word.special)!;
const themes = sample.words.filter((word) => !word.special);

/** One way to trace a word on the board (each letter touching the last, no cell twice). */
function trace(word: string): Cell[] {
  const go = (path: Cell[]): Cell[] | null => {
    if (path.length === word.length) return path;
    const options: Cell[] = path.length === 0
      ? sample.grid.flatMap((row, r) => [...row].map((_, c): Cell => [r, c]))
      : [-1, 0, 1].flatMap((dr) => [-1, 0, 1].map((dc): Cell => [path.at(-1)![0] + dr, path.at(-1)![1] + dc]));
    for (const [r, c] of options) {
      if (sample.grid[r]?.[c] !== word[path.length] || path.some(([pr, pc]) => pr === r && pc === c)) continue;
      const found = go([...path, [r, c]]);
      if (found) return found;
    }
    return null;
  };
  return go([])!;
}

const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
const game = (page: Page) => page.getByTestId('suture');
const cell = (page: Page, [row, col]: Cell) => game(page).locator(`button[data-cell="${row},${col}"]`);
const live = (page: Page) => page.getByTestId('suture-live');
const submitButton = (page: Page) => game(page).getByRole('button', { name: 'submit' });
const tapWord = async (page: Page, path: Cell[]) => {
  for (const at of path) await cell(page, at).click();
};
const tapAndSubmit = async (page: Page, path: Cell[]) => {
  await tapWord(page, path);
  await submitButton(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* storage blocked: no panel */ }
    const heard: unknown[] = [];
    (window as unknown as { progress: unknown[] }).progress = heard;
    window.addEventListener('cueory:game-progress', (event) => heard.push((event as CustomEvent).detail));
  });
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
  await page.goto('/play/word-path');
  await expect(game(page)).toBeVisible();
});

test.describe('word path: board format (#722)', () => {
  test('the clue is the title, on a 6 by 8 board, with submit, clear and cue buttons', async ({ page }) => {
    await expect(game(page)).toHaveAttribute('data-format', 'path');
    const cue = game(page).getByRole('heading', { level: 3, name: sample.clue });
    await expect(cue).toBeVisible();
    const cueBox = (await cue.boundingBox())!;
    const gearBox = (await game(page).getByTestId('game-settings-button').boundingBox())!;
    expect(cueBox.y + cueBox.height).toBeLessThanOrEqual(gearBox.y);
    await expect(game(page).locator('.wordpath-missing-pill')).toHaveCount(total);
    await expect(game(page)).toContainText(`find all ${total} answers. one of them, the thread, names the theme`);
    await expect(game(page)).toContainText('sample puzzle');
    await expect(game(page).getByRole('row')).toHaveCount(8);
    await expect(game(page).getByRole('gridcell')).toHaveCount(48);
    await expect(page.getByTestId('suture-count')).toHaveText(`0 of ${total} words found · teal line: the word you are tracing`);
    for (const name of ['submit', 'clear']) await expect(game(page).getByRole('button', { name })).toBeDisabled();
    await expect(game(page).getByRole('button', { name: 'cue' })).toBeEnabled();
  });

  test('tap letters then submit: a theme word gets its own state, a dot symbol and a spoken label', async ({ page }) => {
    const word = themes[0]!;
    await tapWord(page, word.path);
    await expect(page.getByTestId('suture-picked')).toHaveText(word.answer.toLowerCase());
    await expect(game(page).locator('.wordpath-active-pill')).toContainText('…');
    await expect(game(page).locator('.wordpath-missing-pill')).toHaveCount(total - 1);
    await expect(game(page).locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(word.path.length);
    await submitButton(page).click();
    await expect(live(page)).toHaveText(`theme word: ${word.answer.toLowerCase()}, 1 of ${total}.`);
    await expect(cell(page, word.path[0]!)).toHaveAttribute('data-look', 'theme');
    await expect(cell(page, word.path[0]!).locator('svg[data-mark="theme"]')).toHaveCount(1);
    await expect(cell(page, word.path[0]!)).toHaveAccessibleName(new RegExp(`theme word: ${word.answer.toLowerCase()}$`));
    const found = page.getByRole('list', { name: 'answers found' }).getByRole('listitem');
    await expect(found).toHaveCount(1);
    await expect(found.first()).toContainText('(theme word)');
    await expect(page.getByTestId('suture-count')).toHaveText(`1 of ${total} words found · teal line: the word you are tracing`);
    await expect(found.first()).toHaveClass(/wordpath-found-pill/);
    await expect(found.first()).toContainText('✓');
    await expect(game(page).locator('.wordpath-active-pill')).toHaveCount(0);
    await expect(game(page).locator('.wordpath-missing-pill')).toHaveCount(total - 1);
  });

  test('tapping the last letter again submits; the thread gets a second state and a diamond symbol', async ({ page }) => {
    await tapWord(page, thread.path);
    await cell(page, thread.path.at(-1)!).click();
    await expect(live(page)).toHaveText(`the thread: ${thread.answer.toLowerCase()}, 1 of ${total}.`);
    for (const at of thread.path) await expect(cell(page, at)).toHaveAttribute('data-look', 'special');
    await expect(cell(page, thread.path[0]!).locator('svg[data-mark="thread"]')).toHaveCount(1);
    await expect(cell(page, thread.path[0]!)).toHaveAccessibleName(new RegExp(`the thread: ${thread.answer.toLowerCase()}$`));
    await expect(page.getByRole('list', { name: 'answers found' })).toContainText('(the thread)');
  });

  test('dragging across the letters finds a word when the pointer lifts', async ({ page }) => {
    const word = themes[1]!;
    // The mouse moves to points on the screen without scrolling, so bring the board into view first.
    await game(page).getByRole('grid').scrollIntoViewIfNeeded();
    const centers = [];
    for (const at of word.path) {
      const box = (await cell(page, at).boundingBox())!;
      centers.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }
    await page.mouse.move(centers[0]!.x, centers[0]!.y);
    await page.mouse.down();
    for (const point of centers.slice(1)) await page.mouse.move(point.x, point.y, { steps: 6 });
    await page.mouse.up();
    await expect(live(page)).toHaveText(`theme word: ${word.answer.toLowerCase()}, 1 of ${total}.`);
    await expect(cell(page, word.path[0]!)).toHaveAttribute('data-look', 'theme');
    // The click that ends a drag doesn't start a new word.
    await expect(page.getByTestId('suture-picked')).toHaveText('');
  });

  test('the keyboard picks letters: arrows move, enter adds, enter on the last letter submits, backspace and escape undo', async ({ page }) => {
    let at: Cell = [0, 0];
    const moveTo = async (target: Cell) => {
      while (at[0] !== target[0]) { await page.keyboard.press(at[0] < target[0] ? 'ArrowDown' : 'ArrowUp'); at = [at[0] + (at[0] < target[0] ? 1 : -1), at[1]]; }
      while (at[1] !== target[1]) { await page.keyboard.press(at[1] < target[1] ? 'ArrowRight' : 'ArrowLeft'); at = [at[0], at[1] + (at[1] < target[1] ? 1 : -1)]; }
      await expect(cell(page, target)).toBeFocused();
    };
    await cell(page, [0, 0]).focus();
    const word = themes[2]!;
    for (const step of word.path) { await moveTo(step); await page.keyboard.press('Enter'); }
    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('suture-picked')).toHaveText(word.answer.slice(0, -1).toLowerCase());
    await moveTo(word.path.at(-1)!);
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect(live(page)).toHaveText(`theme word: ${word.answer.toLowerCase()}, 1 of ${total}.`);
    const open = themes[3]!;
    await moveTo(open.path[0]!);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(live(page)).toHaveText('pick cleared.');
    await expect(page.getByTestId('suture-picked')).toHaveText('');
  });

  test('the clear button clears; short and unknown words say so in words', async ({ page }) => {
    const word = themes[0]!;
    await tapWord(page, word.path.slice(0, 2));
    await game(page).getByRole('button', { name: 'clear' }).click();
    await expect(live(page)).toHaveText('pick cleared.');
    await tapAndSubmit(page, word.path.slice(0, 2));
    await expect(live(page)).toHaveText('words have at least 4 letters.');
    // An answer's first four letters: on the board, but not a word in this puzzle.
    const part = word.path.slice(0, 4);
    const letters = part.map(([r, c]) => sample.grid[r]![c]).join('');
    expect([...sample.extras, ...sample.words.map((item) => item.answer)]).not.toContain(letters);
    await tapAndSubmit(page, part);
    await expect(live(page)).toHaveText('not a word on this board.');
    await expect(page.getByTestId('suture-count')).toHaveText(`0 of ${total} words found · teal line: the word you are tracing`);
  });

  test('every 3 other words earn a cue; a cue marks an answer, a second cue numbers its letters', async ({ page }) => {
    const hintButton = game(page).getByRole('button', { name: /^cue/ });
    await hintButton.click();
    await expect(live(page)).toHaveText('no cue yet. find 3 more words that are not theme words.');
    const extras = sample.extras.slice(0, 6);
    for (const [i, word] of extras.slice(0, 3).entries()) {
      await tapAndSubmit(page, trace(word));
      await expect(live(page)).toHaveText(i === 2
        ? `${word.toLowerCase()} is a word, not a theme word. you earned a cue.`
        : `${word.toLowerCase()} is a word, not a theme word. ${2 - i} more for a cue.`);
    }
    await expect(page.getByTestId('suture-hint-progress')).toHaveText('1 cue ready.');
    await expect(hintButton).toHaveText('cue (1)');
    await hintButton.click();
    const hinted = game(page).locator('button[data-look="hinted"]');
    await expect(hinted).toHaveCount(themes[0]!.path.length);
    await expect(cell(page, themes[0]!.path[0]!)).toHaveAccessibleName(/, cue$/);
    for (const word of extras.slice(3)) await tapAndSubmit(page, trace(word));
    await hintButton.click();
    await expect(live(page)).toHaveText('cue: the marked letters are now numbered in order.');
    await expect(cell(page, themes[0]!.path[0]!)).toHaveAccessibleName(/, cue, letter 1$/);
    await expect(cell(page, themes[0]!.path[1]!)).toContainText('2');
    const selected = themes[0]!.path[2]!;
    await cell(page, selected).click();
    await expect(cell(page, selected)).toHaveAttribute('data-look', 'picked');
    await expect(cell(page, selected)).toHaveAccessibleName(/picked, letter 1 of the word, cue, letter 3$/);
    await expect(cell(page, selected).locator('.wordpath-step')).toHaveText('3');
    await expect(cell(page, themes[0]!.path[0]!).locator('.wordpath-step')).toHaveText('1');
  });

  test('finishing the board: result, plain share line, stats with cues and the thread first, one progress event', async ({ page }) => {
    // Stats are always kept (2026-11-17): there is no switch to turn on.
    await expect(page.getByTestId('game-stats').getByRole('switch')).toHaveCount(0);
    await tapAndSubmit(page, thread.path);
    for (const word of themes) await tapAndSubmit(page, word.path);
    await expect(live(page)).toHaveText(new RegExp(`${total} of ${total}\\. board complete\\.$`));
    const resultDialog = page.getByTestId('game-result-dialog');
    await resultDialog.getByRole('button', { name: 'close results' }).click();
    const result = page.getByTestId('suture-result');
    await expect(result).toBeFocused();
    await expect(result).toContainText(`cueory piccline, sun 1 nov: found ${total} of ${total} answers, the thread 1st, 0 cues.`);
    const kept = JSON.parse((await page.evaluate(() => localStorage.getItem('cueory-game-stats')))!);
    expect(kept.results).toContainEqual({ game: 'suture', day: '2026-11-01', solved: true, tries: 0, hints: 0, specialFirst: true });
    await expect(page.getByTestId('word-path-stats')).toHaveText(
      'completed 1, solve rate 100%. streak: 1 day, longest 1 day. the thread found first: 1. solved without cues: 1.',
    );
    expect(await page.evaluate(() => (window as unknown as { progress: unknown[] }).progress)).toEqual([{ game: 'suture', day: '2026-11-01' }]);
  });

  for (const width of [320, 390, 1440]) {
    test(`the board fits ${width} px with square letters, 44 px buttons and no sideways scrolling`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      // The letters take every touch (no swipe scrolling on them), so the whole board must fit on the screen.
      expect((await game(page).getByRole('grid').boundingBox())!.height).toBeLessThan(800);
      const boxes = await game(page).getByRole('button').evaluateAll((els) =>
        els.filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => ({ letter: el.hasAttribute('data-cell'), box: el.getBoundingClientRect().toJSON() as DOMRect })));
      for (const { letter, box } of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        if (letter) expect(Math.abs(box.width - box.height)).toBeLessThan(1);
      }
      if (width === 1440) {
        const first = cell(page, [0, 0]);
        expect(await first.evaluate((letter) => (letter as HTMLButtonElement).offsetWidth)).toBe(62);
        expect(await first.locator('.wordpath-dot').evaluate((dot) => (dot as HTMLElement).offsetWidth)).toBe(52);
      }
    });
  }

  // The board is centred in its panel on a short landscape phone (568 × 320) and when enlarged text makes it wider than
  // the panel (320 px wide with a 32 px root font): the gap on each side matches within a pixel.
  for (const [label, width, height, root] of [['a short landscape phone', 568, 320, null], ['enlarged text at 320 px', 320, 700, 32]] as const) {
    test(`the board is centred in its panel on ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      if (root) await page.evaluate((px) => document.documentElement.style.setProperty('font-size', `${px}px`, 'important'), root);
      const panel = (await page.locator('.wordpath-panel').boundingBox())!;
      const board = (await game(page).locator('.wordpath-board').boundingBox())!;
      const left = board.x - panel.x;
      const right = panel.x + panel.width - (board.x + board.width);
      expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    });
  }

  for (const [label, width, height] of [['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]] as const) {
    test(`axe passes at ${label} size, with a picked word, a theme word and the thread found`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      let results = await axe(page);
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      await tapAndSubmit(page, thread.path);
      await tapAndSubmit(page, themes[0]!.path);
      await tapWord(page, themes[1]!.path.slice(0, 2));
      results = await axe(page);
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }
});
