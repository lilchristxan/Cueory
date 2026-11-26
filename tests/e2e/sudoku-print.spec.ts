import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';
import { dailySudokuSeed, generateSudoku, type SudokuLevel } from '../../src/islands/sudoku';

/**
 * Printing sudoku for a patient (Christian, 2026-11-25; replaces the Task 641 print). The sheet is a print-only block on
 * /play/sudoku for the level chosen on the page: page 1 the guesser's copy (the grid with its given numbers), page 2 the
 * keeper's copy (how to play, a fold line, the solved grid). "Finished" means that level's puzzle for today. The clock is
 * 1 November 2026. window.print is replaced, so no dialog opens.
 */
const DAY = '2026-11-01';
const puzzle = (level: SudokuLevel) => generateSudoku(dailySudokuSeed(DAY, level), level);
const DAY_KEY = 'cueory-game-stats';
const LEVEL_KEY = 'cueory-sudoku-stats';
const solvedLevel = (level: SudokuLevel) => ({ version: 1, solves: [{ level, day: DAY, seconds: 120 }] });
const dayRecord = (solved: boolean) => ({ version: 1, results: [{ game: 'triage', day: DAY, solved, tries: 0 }] });

/** A browser that finished the given level today (both the day record and the per-level record). */
const finish = (page: Page, level: SudokuLevel = 'easy') => page.addInitScript(([dayKey, levelKey, day, levels]) => {
  localStorage.setItem(dayKey as string, JSON.stringify(day));
  localStorage.setItem(levelKey as string, JSON.stringify(levels));
}, [DAY_KEY, LEVEL_KEY, dayRecord(true), solvedLevel(level)]);
const stored = (page: Page, key: string) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);
const printed = (page: Page) => page.evaluate(() => (window as unknown as { printed: number }).printed);
const sheet = (page: Page) => page.getByTestId('print-sheet');
const keeper = (page: Page) => page.getByTestId('sheet-keeper');
const warning = (page: Page) => page.getByRole('dialog', { name: 'print before you finish?' });
const picker = (page: Page) => page.locator('#game-frame-sudoku-difficulty');
const board = (page: Page) => page.getByTestId('sudoku');
const todayRow = (page: Page) => page.getByTestId('play-status-triage');
// The print island loads after the page, so wait until it says it is listening (data-print-ready) before pressing.
const press = async (page: Page) => {
  await expect(sheet(page)).toHaveAttribute('data-print-ready', 'true');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('cueory:print', { detail: { game: 'sudoku' } })));
};
const ready = async (page: Page) => {
  await expect(sheet(page)).toHaveAttribute('data-print-ready', 'true');
  await expect(page.getByTestId('sheet-sudoku')).toBeAttached();
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
      localStorage.setItem('cueory-game-help-seen', JSON.stringify(['triage']));
    } catch { /* storage blocked */ }
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => { (window as unknown as { printed: number }).printed += 1; };
  });
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
});

test('the sheet is hidden on screen and holds no solved grid in the page', async ({ page }) => {
  await finish(page);
  await page.goto('/play/sudoku');
  await ready(page);
  await expect(sheet(page)).toBeHidden();
  await expect(page.getByTestId('sheet-solved-grid')).toHaveCount(0);
  await expect(keeper(page)).toHaveAttribute('data-keeper', 'locked');
});

test("page 1 is the guesser's copy: the level and the grid with only its given numbers", async ({ page }) => {
  await finish(page);
  await page.goto('/play/sudoku');
  await ready(page);
  await page.emulateMedia({ media: 'print' });
  const one = page.getByTestId('sheet-page-1');
  const easy = puzzle('easy');
  await expect(one.getByTestId('sheet-label')).toHaveText("guesser's copy");
  await expect(one).toContainText('fill each row, column and 3 by 3 box with 1 to 9, with no repeats.');
  await expect(one.getByTestId('sheet-level-line')).toHaveText('sudoku · easy · 40 given numbers');
  await expect(one.locator('.sheet-sudoku-cell')).toHaveCount(81);
  await expect(one.locator('.sheet-sudoku-cell')).toHaveText(easy.puzzle.map((digit) => (digit ? String(digit) : '')));
  await expect(one.locator('.sheet-given')).toHaveCount(40);
  await expect(one).toContainText('cueory.app · page 1 of 2');
});

for (const level of ['medium', 'hard'] as const) {
  test(`the sheet follows the level chosen on the page (${level}) and names it on both pages`, async ({ page }) => {
    await finish(page, level);
    await page.goto('/play/sudoku');
    await ready(page);
    await picker(page).selectOption(level);
    const chosen = puzzle(level);
    await expect(page.getByTestId('sheet-level-line').first()).toHaveText(`sudoku · ${level} · ${chosen.givens} given numbers`);
    await press(page);
    await expect.poll(() => printed(page)).toBe(1);
    await expect(keeper(page)).toHaveAttribute('data-keeper', 'ready');
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('sheet-page-1').getByTestId('sheet-level-line')).toHaveText(`sudoku · ${level} · ${chosen.givens} given numbers`);
    await expect(page.getByTestId('sheet-page-2').getByTestId('sheet-level-line')).toHaveText(`sudoku · ${level} · ${chosen.givens} given numbers`);
    await expect(page.getByTestId('sheet-solved-grid').locator('.sheet-sudoku-cell')).toHaveText(chosen.solution.map(String));
  });
}

test("printing a finished level prints once and fills page 2 with the solved grid", async ({ page }) => {
  await finish(page);
  await page.goto('/play/sudoku');
  await press(page);
  await expect.poll(() => printed(page)).toBe(1);
  await expect(warning(page)).toHaveCount(0);
  await expect(keeper(page)).toHaveAttribute('data-keeper', 'ready');
  await page.emulateMedia({ media: 'print' });
  const two = page.getByTestId('sheet-page-2');
  await expect(two.getByTestId('sheet-label')).toHaveText("keeper's copy");
  await expect(two).toContainText('how to play');
  await expect(two.getByTestId('sheet-fold')).toHaveText('fold to hide answers');
  const easy = puzzle('easy');
  await expect(two.getByTestId('sheet-solved-grid').locator('.sheet-sudoku-cell')).toHaveText(easy.solution.map(String));
  await expect(two.getByTestId('sheet-solved-grid').locator('.sheet-given')).toHaveCount(40);
  expect((await page.getByTestId('sheet-page-2').innerText()).toLowerCase()).not.toContain('candidate');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.getByTestId('sheet-solved-grid')).toHaveCount(0);
  await expect(keeper(page)).toHaveAttribute('data-keeper', 'locked');
  await expect(keeper(page)).toContainText("finish today's sudoku to print the keeper's copy");
});

for (const format of ['A4', 'Letter'] as const) {
  for (const state of ['locked', 'ready'] as const) {
    test(`it prints as exactly two ${format} pages (${state})`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'page.pdf is Chromium only');
      if (state === 'ready') await finish(page);
      await page.goto('/play/sudoku');
      if (state === 'ready') {
        await press(page);
        await expect(keeper(page)).toHaveAttribute('data-keeper', 'ready');
      } else {
        await ready(page);
      }
      await page.emulateMedia({ media: 'print' });
      const pdf = await page.pdf({ format, printBackground: false, preferCSSPageSize: true });
      expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(2);
    });
  }
}

for (const paper of [{ name: 'Letter', width: 816, height: 1056 }, { name: 'A4', width: 794, height: 1123 }]) {
  test(`large print on ${paper.name}: big digits, bold box lines, everything inside the page`, async ({ page }) => {
    await finish(page);
    await page.setViewportSize({ width: paper.width, height: paper.height });
    await page.goto('/play/sudoku');
    await press(page);
    await expect(keeper(page)).toHaveAttribute('data-keeper', 'ready');
    await page.emulateMedia({ media: 'print' });
    const m = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const css = (selector: string, property: string) => parseFloat(getComputedStyle(document.querySelector(selector)!).getPropertyValue(property));
      const one = box('[data-testid="sheet-page-1"]');
      return {
        gridWidth: box('[data-testid="sheet-sudoku"]').width, gridRight: box('[data-testid="sheet-sudoku"]').right, gridBottom: box('[data-testid="sheet-sudoku"]').bottom,
        footOne: box('[data-testid="sheet-page-1"] .sheet-footer').top, pageWidth: one.width,
        digit: css('[data-testid="sheet-sudoku"] .sheet-sudoku-cell', 'font-size'), thin: css('[data-testid="sheet-sudoku"] .sheet-sudoku-cell', 'border-right-width'),
        thick: css('[data-testid="sheet-sudoku"]', 'border-top-width'), solvedBottom: box('[data-testid="sheet-solved-grid"]').bottom,
        footTwo: box('[data-testid="sheet-page-2"] .sheet-footer').top, scrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(m.digit).toBeGreaterThanOrEqual(36 * 96 / 72 - 0.5);
    expect(m.thin).toBeGreaterThanOrEqual(1.5 * 96 / 72 - 0.1);
    expect(m.thick).toBeGreaterThanOrEqual(3 * 96 / 72 - 0.1);
    expect(m.thick).toBeGreaterThan(m.thin);
    expect(m.gridWidth).toBeGreaterThanOrEqual(6.9 * 96);
    expect(m.gridRight).toBeLessThanOrEqual(m.pageWidth);
    expect(m.gridBottom).toBeLessThan(m.footOne);
    expect(m.solvedBottom).toBeLessThan(m.footTwo);
    expect(m.scrollWidth).toBeLessThanOrEqual(m.pageWidth + 1);
  });
}

test('the sheet has no accessibility problems on paper', async ({ page }) => {
  await finish(page);
  await page.goto('/play/sudoku');
  await press(page);
  await expect(keeper(page)).toHaveAttribute('data-keeper', 'ready');
  await page.emulateMedia({ media: 'print' });
  const results = await new AxeBuilder({ page }).include('[data-testid="print-sheet"]').analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test.describe('printing an unfinished level', () => {
  test('warns first, and cancelling changes nothing', async ({ page }) => {
    await page.goto('/play/sudoku');
    await press(page);
    await expect(warning(page)).toBeVisible();
    await expect(warning(page).getByRole('button', { name: 'finish the game first' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(warning(page)).toBeHidden();
    expect(await printed(page)).toBe(0);
    expect(await stored(page, DAY_KEY)).toBeNull();
    await expect(keeper(page)).toHaveAttribute('data-keeper', 'locked');
  });

  test('"print anyway" records the day as not solved, ends the level on screen and prints', async ({ page }) => {
    await page.goto('/play/sudoku');
    await expect(sheet(page)).toHaveAttribute('data-print-ready', 'true');
    await page.getByTestId('game-frame-print').click();
    await warning(page).getByRole('button', { name: 'print anyway' }).click();
    await expect.poll(() => printed(page)).toBe(1);
    expect(await stored(page, DAY_KEY)).toEqual(dayRecord(false));
    expect(await stored(page, LEVEL_KEY)).toBeNull();
    await expect(keeper(page)).toHaveAttribute('data-keeper', 'ready');
    await expect(board(page).getByTestId('sudoku-forfeit-note')).toHaveText('you printed before finishing, so this level counts as not solved today.');
    await expect(board(page).getByRole('button', { name: '1', exact: true })).toBeDisabled();
  });

  test('another level is judged on its own: finished easy still warns on hard, and an earlier day result stays as it was', async ({ page }) => {
    await finish(page, 'easy');
    await page.goto('/play/sudoku');
    await ready(page);
    await picker(page).selectOption('hard');
    await press(page);
    await expect(warning(page)).toBeVisible();
    await warning(page).getByRole('button', { name: 'print anyway' }).click();
    await expect.poll(() => printed(page)).toBe(1);
    // The stored shape of both records is unchanged: the day already holds a result, so it stays; no per-level forfeit is stored.
    expect(await stored(page, DAY_KEY)).toEqual(dayRecord(true));
    expect(await stored(page, LEVEL_KEY)).toEqual(solvedLevel('easy'));
    await expect(board(page).getByTestId('sudoku-forfeit-note')).toBeVisible();
  });

  test('every printed level stays ended: easy, then hard, then back to easy', async ({ page }) => {
    await page.goto('/play/sudoku');
    await ready(page);
    await press(page);
    await warning(page).getByRole('button', { name: 'print anyway' }).click();
    await expect.poll(() => printed(page)).toBe(1);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await picker(page).selectOption('hard');
    await press(page);
    await warning(page).getByRole('button', { name: 'print anyway' }).click();
    await expect.poll(() => printed(page)).toBe(2);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await picker(page).selectOption('easy');
    await expect(board(page).getByTestId('sudoku-forfeit-note')).toBeVisible();
    await expect(board(page).getByRole('button', { name: '1', exact: true })).toBeDisabled();
  });

  test('a paused level that is printed anyway is not left paused, and leaving the page does not pause it again', async ({ page }) => {
    await page.goto('/play/sudoku');
    await ready(page);
    await board(page).getByRole('button', { name: 'pause puzzle' }).click();
    await expect(board(page)).toHaveAttribute('data-paused', 'true');
    await press(page);
    await warning(page).getByRole('button', { name: 'print anyway' }).click();
    await expect.poll(() => printed(page)).toBe(1);
    await expect(board(page)).toHaveAttribute('data-paused', 'false');
    await expect(picker(page)).toBeEnabled();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(board(page)).toHaveAttribute('data-paused', 'false');
    await expect(picker(page)).toBeEnabled();
  });

  test('"finish the game first" just closes the dialog; the level stays playable', async ({ page }) => {
    await page.goto('/play/sudoku');
    await press(page);
    await warning(page).getByRole('button', { name: 'finish the game first' }).click();
    await expect(warning(page)).toBeHidden();
    expect(await printed(page)).toBe(0);
    expect(await stored(page, DAY_KEY)).toBeNull();
    await expect(board(page).getByRole('button', { name: '1', exact: true })).toBeEnabled();
  });

  test('the toolbar printer asks the sheet: a finished level prints at once', async ({ page }) => {
    await finish(page);
    await page.goto('/play/sudoku');
    await expect(sheet(page)).toHaveAttribute('data-print-ready', 'true');
    await page.getByTestId('game-frame-print').click();
    await expect.poll(() => printed(page)).toBe(1);
    await expect(warning(page)).toHaveCount(0);
  });
});

test.describe('from /play', () => {
  test('a finished sudoku offers print for a patient, which opens the game page and prints', async ({ page }) => {
    await finish(page);
    await page.goto('/play');
    await expect(todayRow(page).getByRole('link', { name: 'play sudoku' })).toHaveCount(0);
    await todayRow(page).getByRole('button', { name: 'print for a patient (sudoku)' }).click();
    await expect(page).toHaveURL(/\/play\/sudoku$/);
    await expect.poll(() => printed(page)).toBe(1);
    await expect(page.getByTestId('sheet-solved-grid')).toBeAttached();
  });

  test('an unfinished sudoku shows only play, no print button', async ({ page }) => {
    await page.goto('/play');
    await expect(todayRow(page).getByRole('link', { name: 'play sudoku' })).toBeVisible();
    await expect(todayRow(page).getByRole('button', { name: /print for a patient/ })).toHaveCount(0);
  });
});

test('a press before the print island has loaded is remembered and answered once, when it is ready', async ({ page }) => {
  // Hold the print island's file, so the board and its printer button are up while nothing is listening yet.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let asked = false;
  await page.route('**/_astro/SudokuPrint*.js', async (route) => {
    asked = true;
    await held;
    await route.continue();
  });
  await page.goto('/play/sudoku');
  const button = page.getByTestId('game-frame-print');
  await expect(button).toBeVisible();
  await expect.poll(() => asked).toBe(true);
  await expect(sheet(page)).not.toHaveAttribute('data-print-ready', 'true');
  await button.click();
  await expect(warning(page)).toHaveCount(0);
  release();
  await expect(warning(page)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  expect(await printed(page)).toBe(0);
  await warning(page).getByRole('button', { name: 'finish the game first' }).click();
  await expect(warning(page)).toBeHidden();
  // The remembered press was used up: the dialog does not come back by itself.
  await expect(sheet(page)).toHaveAttribute('data-print-ready', 'true');
  await expect(warning(page)).toHaveCount(0);
});

test('the printed sheet starts with the cueory logo, centred, and the logo is not fetched on screen', async ({ page }) => {
  // Replaces the older whole-page print checks for sudoku (games-print.spec.ts, print-logo-not-requested.spec.ts).
  const requested: string[] = [];
  page.on('request', (request) => { if (/\/brand\/v1\/logo-full-light-960\.png/.test(request.url())) requested.push(request.url()); });
  await page.goto('/play/sudoku');
  await ready(page);
  await page.waitForLoadState('networkidle');
  const sheetLogo = sheet(page).getByTestId('sheet-page-1-brand').locator('img.sheet-wordmark');
  const sheetLogoUrl = await sheetLogo.first().evaluate((image) => (image as HTMLImageElement).currentSrc || (image as HTMLImageElement).src);
  expect(requested.filter((url) => url === sheetLogoUrl)).toEqual([]);
  await page.emulateMedia({ media: 'print' });
  const first = sheet(page).getByTestId('sheet-page-1-brand').locator('img:visible').first();
  await expect(first).toBeVisible();
  await expect.poll(() => first.evaluate((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
  const box = (await first.boundingBox())!;
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThanOrEqual(3);
  expect(box.height).toBeGreaterThanOrEqual(40);
  // Nothing on page 1 is printed above the logo.
  const top = await page.getByTestId('sheet-page-1').evaluate((section) => Math.min(...[...section.querySelectorAll<HTMLElement>('*')]
    .filter((element) => element.getBoundingClientRect().height > 0 && element.getClientRects().length > 0)
    .map((element) => element.getBoundingClientRect().top)));
  expect(Math.abs(box.y - top)).toBeLessThanOrEqual(8);
});

test('switching level while the answers load prints, and forfeits, only the level that was authorised', async ({ page }) => {
  // Hold the answers file so "print anyway" is still preparing when the level is changed on the page.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let asked = false;
  await page.route('**/_astro/SudokuAnswers*.js', async (route) => {
    asked = true;
    await held;
    await route.continue();
  });
  await page.goto('/play/sudoku');
  await ready(page);
  await press(page);
  await warning(page).getByRole('button', { name: 'print anyway' }).click();
  await expect.poll(() => asked).toBe(true);
  expect(await printed(page)).toBe(0);
  await picker(page).selectOption('hard');
  release();
  await expect.poll(() => printed(page)).toBe(1);
  // The sheet and its answers are easy's, the level that was checked and forfeited.
  await expect(keeper(page)).toHaveAttribute('data-keeper', 'ready');
  await expect(page.getByTestId('sheet-level-line').first()).toHaveText('sudoku · easy · 40 given numbers');
  await expect(page.getByTestId('sheet-level-line').nth(1)).toHaveText('sudoku · easy · 40 given numbers');
  // Hard was never authorised: it stays playable and carries no forfeit note. Easy ends when it is chosen again.
  await expect(board(page).getByTestId('sudoku-forfeit-note')).toHaveCount(0);
  await expect(board(page).getByRole('button', { name: '1', exact: true })).toBeEnabled();
  await picker(page).selectOption('easy');
  await expect(board(page).getByTestId('sudoku-forfeit-note')).toBeVisible();
});

test('a forfeit confirmed before the game has loaded still ends that level once it does', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let asked = false;
  await page.route('**/_astro/SudokuGame*.js', async (route) => {
    asked = true;
    await held;
    await route.continue();
  });
  await page.goto('/play/sudoku#print');
  await expect.poll(() => asked).toBe(true);
  await expect(warning(page)).toBeVisible();
  await warning(page).getByRole('button', { name: 'print anyway' }).click();
  await expect.poll(() => printed(page)).toBe(1);
  release();
  await expect(board(page).getByTestId('sudoku-forfeit-note')).toBeVisible();
  await expect(board(page).getByRole('button', { name: '1', exact: true })).toBeDisabled();
});

test('when results cannot be read, the sheet prints but the answers stay locked and the level stays playable', async ({ page }) => {
  await page.addInitScript((key) => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = function (name: string) {
      if (name === key) throw new Error('storage blocked');
      return real.call(this, name);
    };
  }, DAY_KEY);
  await page.goto('/play/sudoku');
  await ready(page);
  await picker(page).selectOption('hard');
  await press(page);
  await expect.poll(() => printed(page)).toBe(1);
  // The fallback sheet is still the level on the page.
  await expect(page.getByTestId('sheet-level-line').first()).toHaveText(/^sudoku · hard · /);
  await expect(warning(page)).toHaveCount(0);
  await expect(keeper(page)).toHaveAttribute('data-keeper', 'locked');
  await expect(page.getByTestId('sheet-solved-grid')).toHaveCount(0);
  await expect(board(page).getByRole('button', { name: '1', exact: true })).toBeEnabled();
});

test('with BOTH the Frame controls and the print island delayed, one press prints exactly once', async ({ page }) => {
  await finish(page);
  let releaseFrame!: () => void;
  let releaseIsland!: () => void;
  const frameHeld = new Promise<void>((resolve) => { releaseFrame = resolve; });
  const islandHeld = new Promise<void>((resolve) => { releaseIsland = resolve; });
  await page.route('**/_astro/GameFrameControls*.js', async (route) => { await frameHeld; await route.continue(); });
  await page.route('**/_astro/SudokuPrint*.js', async (route) => { await islandHeld; await route.continue(); });
  await page.goto('/play/sudoku');
  releaseFrame();
  const button = page.getByTestId('game-frame-print');
  await expect(button).toBeVisible();
  await button.click();
  expect(await printed(page)).toBe(0);
  releaseIsland();
  await expect.poll(() => printed(page)).toBe(1);
  await expect(sheet(page)).toHaveAttribute('data-print-ready', 'true');
  expect(await printed(page)).toBe(1);
});
