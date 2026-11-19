import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { dailySudokuSeed, generateSudoku } from '../../src/islands/sudoku';
import { fixClock } from './clock';

/**
 * Daily games (D-61): pillo (Task 114; its id is still pulse) on /play. The page's clock is set to 1 November 2026, the
 * first day, so today's sample word is "grace" (content/games/pulse/sample-01.json).
 */
// The once-only promo panel (D-59) slides down after 5 seconds and takes keyboard focus, which would interrupt these
// tests part-way, so every page here starts as if it had already been shown (as in pages.spec.ts).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      // The launch-updates pop-up (a modal after 10 seconds) is put away too; signup-popup.spec.ts covers it.
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
      // A returning player: each game's first-visit rules card (#736) is already put away. game-help.spec.ts covers it.
      localStorage.setItem('cueory-game-help-seen', JSON.stringify(['pulse', 'triage', 'cueword', 'suture']));
    } catch {
      // Storage is blocked: the panel never shows then anyway.
    }
  });
});

/*
  While the page scrolls down, the sticky header tucks itself away just above the screen (SiteHeader), and axe counts it
  as covering whatever small buttons happen to sit there, out of sight. So axe runs from the top of the page, once the
  header is back in place, and the result no longer depends on how far a test happened to scroll.
*/
const axe = async (page: Page) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  // On a timeout, say what held the header up (diagnosing a CI-only failure on #831); the wait itself is unchanged.
  await page.waitForFunction(() => (document.querySelector('header')?.getBoundingClientRect().top ?? 0) >= 0, undefined, { timeout: 15_000 })
    .catch(async (error: Error) => {
      const why = await page.evaluate(() => JSON.stringify({
        headerTop: document.querySelector('header')?.getBoundingClientRect().top,
        headerClass: document.querySelector('header')?.className,
        scrollY: window.scrollY,
        bodyStyle: document.body.getAttribute('style'),
        inert: [...document.querySelectorAll('[inert]')].map((element) => element.tagName + '.' + String(element.className).slice(0, 30)),
        dialogs: [...document.querySelectorAll('dialog[open], [data-testid="game-result-dialog"], [data-promo][data-open]')].map((element) => element.tagName + (element.getAttribute('data-testid') ?? '')),
        active: document.activeElement?.tagName + ' ' + (document.activeElement?.getAttribute('aria-label') ?? ''),
      }));
      throw new Error(`${error.message} | page: ${why}`);
    });
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
};
const field = (page: Page) => page.getByLabel('your guess', { exact: true });
const live = (page: Page) => page.getByTestId('pulse-live');

/** Contrast against the composed flat background beneath a rendered result-copy node. */
const renderedContrast = (locator: Locator) => locator.evaluate((element) => {
  const rgba = (value: string) => {
    const match = /rgba?\((\d+(?:\.\d+)?),?\s*(\d+(?:\.\d+)?),?\s*(\d+(?:\.\d+)?)(?:,?\s*([\d.]+))?/.exec(value);
    if (!match) throw new Error(`unreadable color ${value}`);
    return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])] as const;
  };
  let background: [number, number, number] = [255, 255, 255];
  const layers: number[][] = [];
  for (let node: Element | null = element; node; node = node.parentElement) {
    const layer = rgba(getComputedStyle(node).backgroundColor);
    if (layer[3] > 0) layers.push([...layer]);
  }
  for (const [red, green, blue, alpha] of [...layers].reverse()) {
    background = [red * alpha + background[0] * (1 - alpha), green * alpha + background[1] * (1 - alpha), blue * alpha + background[2] * (1 - alpha)];
  }
  const luminance = ([red, green, blue]: readonly number[]) => [red, green, blue].map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
  const [low, high] = [luminance(rgba(getComputedStyle(element).color)), luminance(background)].sort((a, b) => a - b);
  return (high! + 0.05) / (low! + 0.05);
});

test.describe('daily games: pillo (Task 114)', () => {
  test.beforeEach(async ({ page }) => {
    await fixClock(page, new Date('2026-11-01T15:00:00'));
    await page.goto('/play/pillo');
    await expect(page.getByTestId('pulse')).toBeVisible();
  });

  // The guesses left are no longer drawn on the box (Christian's brief); screen readers still hear them.
  const status = (page: Page) => page.getByTestId('pulse-status');

  test('pillo has its own page, with only pillo on it, and passes axe', async ({ page }) => {
    // Each game on its own page (2026-11-17): the hub test below names all four games and says they are samples.
    await expect(page.getByRole('heading', { level: 1, name: 'pillo' })).toBeVisible();
    await expect(status(page)).toHaveText('guess the 5-letter word · 6 of 6 guesses left');
    await expect(status(page)).toHaveClass(/sr-only/);
    await expect(page.getByTestId('pulse-strip')).toHaveCount(0);
    // Six rows of five pockets, the first one ringed for the first letter.
    await expect(page.getByTestId('pulse').locator('.pillo-pack .pillo-pocket')).toHaveCount(30);
    await expect(page.getByTestId('pulse').locator('.pillo-next')).toHaveCount(1);
    for (const other of ['sudoku', 'cueword', 'suture']) await expect(page.getByTestId(other)).toHaveCount(0);
    const results = await axe(page);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('a typed guess is marked by symbol and in words, and the letter keys learn the marks', async ({ page }) => {
    await field(page).fill('crane');
    await page.keyboard.press('Enter');
    await expect(live(page)).toHaveText(
      'c, elsewhere in the word. r, in place. a, in place. n, not in the word. e, in place. 5 guesses left.',
    );
    const row = page.getByRole('listitem', { name: /^guess 1: crane\./ });
    await expect(row).toBeVisible();
    // Every pill carries its symbol, so no mark depends on color.
    await expect(row.locator('.pillo-mark')).toHaveText(['○', '●', '●', '·', '●']);
    await expect(row.locator('.pillo-letter')).toHaveText(['C', 'R', 'A', 'N', 'E']);
    await expect(page.getByRole('button', { name: 'r, in place' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'c, elsewhere in the word' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'n, not in the word' })).toBeVisible();
    await expect(status(page)).toHaveText('guess the 5-letter word · 5 of 6 guesses left');
    // A used guess leaves an empty pocket in the strip.
    // Focus stays in the field for the next guess.
    await expect(field(page)).toBeFocused();
  });

  test('a guess of the wrong length is explained and spends nothing', async ({ page }) => {
    await field(page).fill('grac');
    await page.getByTestId('pulse').getByRole('button', { name: 'enter', exact: true }).click();
    await expect(page.getByTestId('pulse-problem')).toHaveText('the word has 5 letters.');
    await expect(live(page)).toHaveText('the word has 5 letters.');
    await expect(field(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(status(page)).toHaveText('guess the 5-letter word · 6 of 6 guesses left');
    await expect(page.getByRole('list', { name: 'your guesses' }).getByRole('listitem')).toHaveCount(0);
  });

  test('the row being typed shows plain pills and rings the next pocket; there is no cue', async ({ page }) => {
    const pulse = page.getByTestId('pulse');
    await pulse.getByRole('button', { name: 'g', exact: true }).click();
    await pulse.getByRole('button', { name: 'r', exact: true }).click();
    await expect(pulse.locator('.pillo-typed')).toHaveText(['G', 'R']);
    await expect(pulse.locator('.pillo-next')).toHaveCount(1);
    await pulse.getByRole('button', { name: 'delete', exact: true }).click();
    await expect(field(page)).toHaveValue('g');
    await expect(pulse.locator('.pillo-typed')).toHaveCount(1);
    await expect(pulse.getByRole('button', { name: /cue/ })).toHaveCount(0);
  });

  test('with reduced motion, a typed pill does not pop in', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await field(page).fill('g');
    const pill = page.getByTestId('pulse').locator('.pillo-typed').first();
    await expect(pill).toBeVisible();
    expect(await pill.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });

  test('every mark passes axe in the evening palette too', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await field(page).fill('crane');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listitem', { name: /^guess 1: crane\./ })).toBeVisible();
    const results = await axe(page);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('the letter keys alone can solve it, and the result shares as one plain line', async ({ page }) => {
    // The crossword below has letter buttons too, so these stay inside pillo.
    const pulse = page.getByTestId('pulse');
    for (const letter of 'grace') await pulse.getByRole('button', { name: letter, exact: true }).click();
    await expect(field(page)).toHaveValue('grace');
    await pulse.getByRole('button', { name: 'enter', exact: true }).click();
    const resultDialog = page.getByTestId('game-result-dialog');
    await expect(resultDialog.getByRole('button', { name: 'close results' })).toBeFocused();
    await resultDialog.getByRole('button', { name: 'close results' }).click();
    const result = page.getByTestId('pulse-result');
    await expect(result).toBeFocused();
    await expect(result).toContainText('solved.');
    await expect(result).toContainText('cueory pillo, sun 1 nov: solved in 1 of 6');
    await result.getByRole('button', { name: 'copy my result' }).click();
    await expect(result).toContainText('cueory pillo, sun 1 nov: solved in 1 of 6');
    await expect(result.getByText('a new word comes tomorrow.')).toBeVisible();
    await expect(page.getByRole('listitem', { name: /^guess 1: grace\./ }).locator('.pillo-mark')).toHaveText(
      Array(5).fill('●'),
    );
  });

  test('after six guesses the game ends and shows the word', async ({ page }) => {
    for (const word of ['crane', 'plant', 'lemon', 'music', 'pilot', 'coast']) {
      await field(page).fill(word);
      await page.keyboard.press('Enter');
    }
    const result = page.getByTestId('pulse-result');
    await expect(result).toContainText('the word was grace.');
    await expect(result).toContainText('cueory pillo, sun 1 nov: not solved this time');
    await expect(field(page)).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'your guesses' }).getByRole('listitem')).toHaveCount(6);
    await expect(page.getByTestId('pulse-strip').locator('.pillo-strip-pill')).toHaveCount(0);
  });
});

test.describe('daily games: pillo settings and finish screen (Task 719)', () => {
  const close = async (page: Page) => {
    const resultDialog = page.getByTestId('game-result-dialog');
    await expect(resultDialog.getByRole('button', { name: 'close results' })).toBeFocused();
    await resultDialog.getByRole('button', { name: 'close results' }).click();
    // The dialog hands focus back on the next frame; wait for it, so a test's next focus isn't taken back.
    await expect(page.getByTestId('pulse-result')).toBeFocused();
  };

  test.beforeEach(async ({ page }) => {
    await fixClock(page, new Date('2026-11-01T15:00:00'));
    await page.goto('/play/pillo');
    await expect(page.getByTestId('pulse')).toBeVisible();
  });

  test('a word that is not in the list keeps every guess and says so', async ({ page }) => {
    await field(page).fill('zzzzz');
    await field(page).press('Enter');
    await expect(page.getByTestId('pulse-problem')).toHaveText("zzzzz isn't in the word list. it didn't use a guess.");
    await expect(page.getByTestId('pulse-status')).toContainText('6 of 6 guesses left');
  });

  test("the first guess of the day, and only it, tells the page today's round has started", async ({ page }) => {
    await page.evaluate(() => {
      const heard: unknown[] = [];
      (window as unknown as { heard: unknown[] }).heard = heard;
      window.addEventListener('cueory:game-progress', (event) => heard.push((event as CustomEvent).detail));
    });
    const heard = () => page.evaluate(() => (window as unknown as { heard: unknown[] }).heard);
    await field(page).fill('zzzzz');
    await field(page).press('Enter');
    await expect(page.getByTestId('pulse-problem')).toBeVisible();
    expect(await heard()).toEqual([]);
    for (const word of ['crane', 'plant']) {
      await field(page).fill(word);
      await field(page).press('Enter');
    }
    await expect(page.getByRole('list', { name: 'your guesses' }).getByRole('listitem')).toHaveCount(2);
    expect(await heard()).toEqual([{ game: 'pulse', day: '2026-11-01' }]);
  });

  test('hard mode switches only before the first guess, and then holds shown letters', async ({ page }) => {
    // pillo's settings open from the gear at the top left (Christian's brief), in a dialog that holds the shared ones too.
    const gear = page.getByTestId('pulse').getByRole('button', { name: 'pillo settings' });
    const settings = page.getByRole('dialog', { name: 'pillo settings' });
    const hard = settings.getByRole('switch', { name: /hard mode/ });
    await gear.click();
    await hard.click();
    await expect(hard).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await field(page).fill('crane');
    await field(page).press('Enter');
    await gear.click();
    await expect(hard).toHaveAttribute('aria-disabled', 'true');
    // Playwright waits forever for an aria-disabled control to become enabled, so force the click to prove it is ignored.
    await hard.click({ force: true });
    await expect(hard).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await field(page).fill('plant');
    await field(page).press('Enter');
    await expect(page.getByTestId('pulse-problem')).toHaveText('hard mode: the 2nd letter must be r.');
    await expect(page.getByTestId('pulse-status')).toContainText('5 of 6 guesses left');
  });

  test('on-screen keyboard only removes the typing field, and high contrast still passes axe', async ({ page }) => {
    await page.getByTestId('pulse').getByRole('button', { name: 'pillo settings' }).click();
    const settings = page.getByRole('dialog', { name: 'pillo settings' });
    await settings.getByRole('switch', { name: /on-screen keyboard only/ }).click();
    await expect(field(page)).toHaveCount(0);
    // High contrast is the shared switch, in the same dialog.
    await settings.getByRole('checkbox', { name: /high contrast/ }).check();
    await expect(page.getByTestId('pulse')).toHaveClass(/pillo-contrast/);
    await page.keyboard.press('Escape');
    await expect(settings).toHaveCount(0);
    const pulse = page.getByTestId('pulse');
    for (const letter of 'crane') await pulse.getByRole('button', { name: letter, exact: true }).click();
    await pulse.getByRole('button', { name: 'enter', exact: true }).click();
    await expect(page.getByRole('list', { name: 'your guesses' }).getByRole('listitem')).toHaveCount(1);
    const results = await axe(page);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('the finish screen shows the result, stats with today marked, the share line and the next word time', async ({ page }) => {
    // Stats are always kept (2026-11-17): there is no switch to turn on.
    await expect(page.getByTestId('game-stats').getByRole('switch')).toHaveCount(0);
    await field(page).fill('crane');
    await field(page).press('Enter');
    await field(page).fill('grace');
    await field(page).press('Enter');
    await close(page);
    const result = page.getByTestId('pulse-result');
    await expect(result).toContainText('solved.');
    await expect(result).toContainText('cueory pillo, sun 1 nov: solved in 2 of 6');
    const stats = page.getByTestId('pulse-stats');
    for (const [label, value] of [['played', '1'], ['win %', '100'], ['current streak', '1'], ['longest streak', '1']]) {
      await expect(stats.locator('.pillo-stat').filter({ hasText: label })).toContainText(value);
    }
    await expect(stats.getByRole('list', { name: 'guesses it took' }).getByRole('listitem')).toHaveCount(6);
    await expect(page.getByTestId('pulse-today-row')).toContainText('2');
    await expect(page.getByTestId('pulse-today-row')).toContainText('today');
    await expect(page.getByTestId('pulse-next')).toHaveText('next word in 9 h.');
    const results = await axe(page);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('stats are always kept: the finish screen shows them without turning anything on', async ({ page }) => {
    // 2026-11-17: there is no "keep my stats" switch any more.
    await expect(page.getByTestId('game-stats').getByRole('switch')).toHaveCount(0);
    await field(page).fill('grace');
    await field(page).press('Enter');
    await close(page);
    await expect(page.getByTestId('pulse-stats')).not.toContainText('stats are off');
    await expect(page.getByTestId('pulse-stats')).toContainText('played');
    await expect(page.getByTestId('pulse-today-row')).toContainText('today');
  });
});

test.describe('the /play hub (each game on its own page, 2026-11-17)', () => {
  test('names the four games as cards, says the puzzles are samples once, loads no game, and passes axe', async ({ page }) => {
    await fixClock(page, new Date('2026-11-01T15:00:00'));
    await page.goto('/play');
    await expect(page.getByRole('heading', { level: 1, name: 'daily games' })).toBeVisible();
    await expect(page.getByTestId('sample-note')).toHaveText('for now these are sample puzzles with everyday words.');
    for (const [id, name, path] of [['pulse', 'pillo', '/play/pillo'], ['triage', 'sudoku', '/play/sudoku'], ['cueword', 'crossword', '/play/crossword'], ['suture', 'word path', '/play/word-path']]) {
      const card = page.getByTestId(`play-status-${id}`).getByRole('link');
      await expect(card).toContainText(name);
      await expect(card).toHaveAttribute('href', path);
    }
    for (const game of ['pulse', 'sudoku', 'cueword', 'suture']) await expect(page.getByTestId(game)).toHaveCount(0);
    const results = await axe(page);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('daily games on the home page (D-61)', () => {
  test('a calm section after "ways to study" leads to today\'s game', async ({ page }) => {
    await page.goto('/');
    const headings = await page.getByRole('heading', { level: 2 }).allTextContents();
    expect(headings.indexOf('daily games')).toBe(headings.indexOf('ways to study') + 1);
    const link = page.getByTestId('games-link');
    await expect(link).toHaveText("play today's games");
    await expect(link).toHaveAttribute('href', '/play');
    await link.click();
    await expect(page).toHaveURL(/\/play$/);
    await expect(page.getByRole('heading', { level: 1, name: 'daily games' })).toBeVisible();
  });
});

test.describe('daily games on a narrow phone', () => {
  test('at 320 px nothing scrolls sideways, and every letter key and pill stays on screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    // 3 November: the third sample, "blend".
    await fixClock(page, new Date('2026-11-03T15:00:00'));
    await page.goto('/play/pillo');
    // Two wrong guesses: the game goes on, so the letter keys stay on screen too.
    for (const word of ['plane', 'candy']) {
      await field(page).fill(word);
      await page.keyboard.press('Enter');
    }
    await expect(page.getByRole('listitem', { name: /^guess 2: candy\./ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const outside = await page.evaluate(() =>
      [...document.querySelectorAll('.pillo-key, .pillo-pill')]
        .map((el) => el.getBoundingClientRect())
        .filter((box) => box.left < 0 || box.right > window.innerWidth).length,
    );
    expect(outside).toBe(0);
    // The letter keys (a to z, like the crossword's) and the ⌫ / enter row wrap onto extra lines on narrow phones.
    // Check actual touch-target size and non-overlap, not horizontal center order.
    const rows = await page.locator('.pillo-key-row').evaluateAll((rowEls) =>
      rowEls.map((row) => [...row.querySelectorAll('.pillo-key')].map((el) => el.getBoundingClientRect())),
    );
    expect(rows.length).toBe(2);
    const keys = rows.flat();
    for (const key of keys) {
      expect(key.width).toBeGreaterThanOrEqual(44);
      expect(key.height).toBeGreaterThanOrEqual(44);
    }
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i]!;
        const b = keys[j]!;
        const separated = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        expect(separated, `keys ${i} and ${j} should not overlap at 320 px`).toBe(true);
      }
    }
  });

});

test.describe('daily games: sudoku (Task 625)', () => {
  const day = '2026-11-01';
  const daily = generateSudoku(dailySudokuSeed(day, 'easy'), 'easy');
  const open = daily.puzzle.flatMap((value, index) => value === 0 ? [index] : []);
  const game = (page: Page) => page.getByTestId('sudoku');
  const grid = (page: Page) => game(page).getByRole('grid', { name: 'sudoku grid' });
  const cells = (page: Page) => grid(page).getByRole('gridcell');

  test.beforeEach(async ({ page }) => {
    await fixClock(page, new Date('2026-11-01T15:00:00'));
    await page.goto('/play/sudoku');
    await expect(game(page)).toBeVisible();
  });

  test('shows one daily easy puzzle with the approved givens, controls and accessible page', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'sudoku' })).toHaveCount(1);
    await expect(cells(page)).toHaveCount(81);
    await expect(grid(page).getByRole('row')).toHaveCount(9);
    for (const row of await grid(page).getByRole('row').all()) await expect(row.getByRole('gridcell')).toHaveCount(9);
    await expect(grid(page).locator('[data-given="true"]')).toHaveCount(40);
    await expect(game(page).getByRole('button', { name: 'easy' })).toHaveAttribute('aria-pressed', 'true');
    const controls = game(page).locator('.sudoku-icon-button, .sudoku-small-button, .sudoku-number-row button');
    const boxes = await controls.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect()));
    for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(44);
    const results = await axe(page);
    expect(results.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('supports pointer and keyboard entry, roving arrows and all three levels', async ({ page }) => {
    const first = open[0]!;
    const firstCell = cells(page).nth(first);
    await firstCell.click();
    const column = Number(await firstCell.getAttribute('aria-colindex'));
    await page.keyboard.press(column === 9 ? 'ArrowLeft' : 'ArrowRight');
    await expect(grid(page).locator('[aria-selected="true"]')).toBeFocused();

    await firstCell.click();
    const wrong = daily.solution[first] === 1 ? 2 : 1;
    await page.keyboard.press(String(wrong));
    await expect(game(page).locator('.sudoku-errors')).toContainText('error: 1');
    await expect(page.getByTestId('sudoku-live')).toContainText('is not right');

    const second = open[1]!;
    await cells(page).nth(second).click();
    await game(page).getByRole('button', { name: String(daily.solution[second]), exact: true }).click();
    await expect(cells(page).nth(second)).toContainText(String(daily.solution[second]));

    await game(page).getByRole('button', { name: 'medium', exact: true }).click();
    await expect(grid(page).locator('[data-given="true"]')).toHaveCount(32);
    await game(page).getByRole('button', { name: 'hard' }).click();
    await expect(grid(page).locator('[data-given="true"]')).toHaveCount(26);
  });

  test('pause hides every number, givens too, conceals private entries and preserves theme settings', async ({ page }) => {
    const pause = game(page).getByRole('button', { name: 'pause puzzle' });
    await pause.click();
    const before = await game(page).locator('.sudoku-time').innerText();
    await expect(grid(page).locator('[data-given="true"]')).toHaveCount(40);
    for (const index of daily.puzzle.keys()) {
      const cell = cells(page).nth(index);
      await expect(cell).toBeEmpty();
      await expect(cell).toHaveAttribute('aria-label', /, hidden until resumed$/);
      await expect(cell.locator('.sudoku-paused-mark')).toHaveCount(1);
    }
    await expect(game(page).locator('.is-entered, .is-conflict, .is-identical, .sudoku-mark, .sudoku-candidates')).toHaveCount(0);
    await expect(game(page).locator('.sudoku-cell.is-selected, [role="gridcell"][aria-selected="true"]')).toHaveCount(0);
    await expect(game(page).locator('.sudoku-time')).toHaveText(before);
    await game(page).getByRole('button', { name: 'resume puzzle' }).click();

    const trigger = game(page).getByRole('button', { name: /settings/i });
    await trigger.click();
    const dialog = game(page).getByRole('dialog', { name: 'settings' });
    const close = dialog.getByRole('button', { name: 'close settings' });
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('checkbox', { name: 'play sound on solve' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    // Theme rows drive the site's own switch (no second theme system); gameboard settings persist on their own.
    // The dialog is the shared one (#823), so its theme group holds the three theme rows.
    await expect(dialog.getByRole('group', { name: 'theme' }).getByRole('radio')).toHaveCount(3);
    await dialog.getByRole('checkbox', { name: 'start in auto cue mode' }).check();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();

    await page.reload();
    await game(page).getByRole('button', { name: /settings/i }).click();
    await expect(game(page).getByRole('dialog', { name: 'settings' }).getByRole('checkbox', { name: 'start in auto cue mode' })).toBeChecked();
    await page.keyboard.press('Escape');
    const hints = game(page).getByRole('checkbox', { name: /auto cues/i });
    await expect(hints).toHaveAttribute('aria-checked', 'true');
    await hints.click();
    await expect(hints).toHaveAttribute('aria-checked', 'false');
    await expect(game(page).locator('.sudoku-candidates')).toHaveCount(0);
  });

  test('fits the whole Sudoku board on a phone with 44 px number buttons, and print isolates only givens plus cueory.app', async ({ page }) => {
    // D-pending (claude/sudoku-layout): on a 390 px phone the squares shrink to fit (about 32 px, never under the
    // 24 px WCAG 2.2 target minimum) instead of keeping 44 px squares that cut the board off. Number buttons stay 44 px.
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const panel = (await game(page).locator('.sudoku-panel').boundingBox())!;
    const boxes = await cells(page).evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()));
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
      expect(box.left).toBeGreaterThanOrEqual(panel.x - 0.5);
      expect(box.right).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
    }
    const pad = await game(page).locator('.sudoku-number-row button').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()));
    expect(pad).toHaveLength(10);
    for (const box of pad) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    const editable = grid(page).locator('[data-given="false"]').first();
    await editable.click();
    await page.keyboard.press('1');
    await page.evaluate(() => { window.print = () => {}; });
    await game(page).getByRole('button', { name: 'print this puzzle' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-print-game', 'sudoku');
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('pulse')).toBeHidden();
    await expect(game(page).locator('.sudoku-title-row')).toBeHidden();
    await expect(editable.locator('> *')).toBeHidden();
    await expect(grid(page).locator('[data-given="true"]').first()).toBeVisible();
    await expect(game(page).locator('.sudoku-print-footer')).toHaveText('cueory.app');
    await expect(game(page).locator('.sudoku-print-footer')).toBeVisible();

    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('html')).not.toHaveAttribute('data-print-game', /.+/);
  });

  test('solves the puzzle, focuses the result and emits the Worker 2 result hook', async ({ page }) => {
    await page.evaluate(() => {
      window.addEventListener('cueory:sudoku-solved', ((event: CustomEvent) => {
        document.documentElement.dataset.sudokuResult = JSON.stringify(event.detail);
      }) as EventListener, { once: true });
      // #720 (D-pending): a solved daily sudoku now counts in the shared stats record under its id triage.
      const rounds: unknown[] = [];
      (window as unknown as { sudokuRounds: unknown[] }).sudokuRounds = rounds;
      window.addEventListener('cueory:game-result', ((event: CustomEvent) => { rounds.push(event.detail); }) as EventListener);
    });
    for (const index of open) {
      await cells(page).nth(index).click();
      await page.keyboard.press(String(daily.solution[index]));
    }
    const resultDialog = page.getByTestId('game-result-dialog');
    await expect(resultDialog.getByRole('button', { name: 'close results' })).toBeFocused();
    await resultDialog.getByRole('button', { name: 'close results' }).click();
    const result = page.getByTestId('sudoku-result');
    await expect(result).toBeFocused();
    await expect(result).toContainText('solved.');
    await expect(result).toContainText('0 errors');
    for (const copy of await result.locator('p').all()) {
      expect(await renderedContrast(copy), `solved result copy: ${await copy.innerText()}`).toBeGreaterThanOrEqual(4.5);
    }
    const detail = JSON.parse((await page.locator('html').getAttribute('data-sudoku-result'))!);
    expect(detail).toMatchObject({ game: 'sudoku', day, level: 'easy', solved: true, errors: 0 });
    expect(await page.evaluate(() => (window as unknown as { sudokuRounds: unknown[] }).sudokuRounds))
      .toEqual([{ game: 'triage', day, solved: true, tries: 0 }]);
  });
});

test.describe('daily games: crossword levels (Task 627)', () => {
  const board = (page: Page) => page.getByTestId('cueword');

  test.beforeEach(async ({ page }) => {
    await fixClock(page, new Date('2026-11-01T15:00:00'));
    await page.goto('/play/crossword');
    await expect(board(page)).toBeVisible();
  });

  test('starts on the 5 by 5 sample with a cue bar and no side cue list', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'crossword' })).toBeVisible();
    // The level picker is the same pressed-button control as sudoku's (Christian's brief).
    await expect(page.getByTestId('crossword-levels').getByRole('button', { name: 'easy, 5 by 5' })).toHaveAttribute('aria-pressed', 'true');
    // No sample line in the game box (Christian's brief); the /play hub says the puzzles are samples.
    await expect(board(page)).not.toContainText('sample puzzle');
    await expect(board(page)).not.toContainText("today's puzzle is a sample");
    await expect(board(page).getByTestId('cueword-clue')).toContainText('1 across');
    await expect(board(page).getByTestId('cueword-clue')).toContainText('[sample cue]');
    await expect(board(page).getByRole('grid', { name: 'crossword grid' })).toHaveAttribute('aria-rowcount', '5');
    // The cue list is a view the player opens (Task 721); check and reveal sit in their own menus.
    await expect(board(page).getByRole('list')).toHaveCount(0);
    await expect(board(page).getByTestId('crossword-check')).toBeVisible();
    await expect(board(page).getByTestId('crossword-reveal')).toBeVisible();
    const results = await axe(page);
    expect(results.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
  });

  test('switches among 5, 7 and 15 square boards without overflow at 390, 820 or 1440 px', async ({ page }) => {
    for (const width of [390, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [label, size] of [['mid, 7 by 7', '7'], ['hard, 15 by 15', '15'], ['easy, 5 by 5', '5']] as const) {
        await page.getByTestId('crossword-levels').getByRole('button', { name: label }).click();
        await expect(page.getByTestId('crossword-levels').getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
        const grid = board(page).getByRole('grid', { name: 'crossword grid' });
        await expect(grid).toHaveAttribute('aria-rowcount', size);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const cells = grid.locator('.crossword-cell');
        const first = await cells.first().boundingBox();
        expect(first).not.toBeNull();
        expect(first!.width).toBeGreaterThanOrEqual(44);
        expect(first!.x).toBeGreaterThanOrEqual(0);
        // The hard board scrolls within its own region. Its last square must
        // still be reachable without scrolling the document sideways.
        await cells.last().scrollIntoViewIfNeeded();
        const last = await cells.last().boundingBox();
        expect(last).not.toBeNull();
        expect(last!.x).toBeGreaterThanOrEqual(0);
        expect(last!.x + last!.width).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
    }
  });

  test('a filled selected cell passes contrast in Light and Evening', async ({ page }) => {
    const first = board(page).getByRole('grid', { name: 'crossword grid' }).locator('.crossword-cell').first();
    await first.focus();
    await page.keyboard.type('a');
    await first.click();
    for (const theme of ['light', 'dark']) {
      await page.locator('html').evaluate((element, value) => element.setAttribute('data-theme', value), theme);
      const results = await axe(page);
      expect(results.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
    }
  });

  test('tap toggles direction, Tab past the last clue or Escape leaves the grid, and Alt+Arrow changes words', async ({ page }) => {
    const grid = board(page).getByRole('grid', { name: 'crossword grid' });
    const activeCell = grid.locator('button[tabindex="0"]');
    await activeCell.click();
    await expect(board(page).getByTestId('cueword-clue')).toContainText('1 down');

    await activeCell.focus();
    await page.keyboard.press('Alt+ArrowRight');
    await expect(board(page).getByTestId('cueword-clue')).not.toContainText('1 down');
    await expect(grid).toHaveAttribute('aria-keyshortcuts', 'Tab Shift+Tab Space Escape Alt+ArrowLeft Alt+ArrowRight');

    // Tab moves between clues inside the grid (Task 721). On the last clue (5 down) it leaves the grid, to the letters.
    await expect(board(page).getByTestId('cueword-clue')).toContainText('2 down');
    for (let step = 0; step < 3; step++) await page.keyboard.press('Alt+ArrowRight');
    await expect(board(page).getByTestId('cueword-clue')).toContainText('5 down');
    await page.keyboard.press('Tab');
    await expect(board(page).getByRole('group', { name: 'letters' }).getByRole('button').first()).toBeFocused();

    // Escape leaves too, to the erase button.
    await grid.locator('button[tabindex="0"]').focus();
    await page.keyboard.press('Escape');
    await expect(board(page).getByRole('button', { name: 'erase', exact: true })).toBeFocused();
  });

  test('solves the easy sample and exposes the plain solved result', async ({ page }) => {
    const sample = ['.ABC.', 'DEFGH', 'IJKLM', 'NOPQR', '.STU.'];
    for (const [row, letters] of sample.entries()) {
      for (const [column, letter] of [...letters].entries()) {
        if (letter === '.') continue;
        const cell = board(page).getByRole('button', { name: new RegExp('^(?:\\d+, )?row ' + (row + 1) + ', column ' + (column + 1) + ',') });
        await cell.click();
        await page.keyboard.type(letter);
      }
    }
    const resultDialog = page.getByTestId('game-result-dialog');
    await expect(resultDialog.getByRole('button', { name: 'close results' })).toBeFocused();
    await resultDialog.getByRole('button', { name: 'close results' }).click();
    const result = board(page).getByTestId('cueword-result');
    await expect(result).toBeFocused();
    await expect(result).toContainText('solved.');
    await expect(result).toContainText('easy');
  });

  test('print isolates a blank grid, every clue and the cueory.app footer', async ({ page }) => {
    await board(page).getByRole('button', { name: '1, row 1, column 2, 1 across, empty' }).click();
    await page.keyboard.type('a');
    await page.evaluate(() => { window.print = () => undefined; });
    await board(page).getByRole('button', { name: 'print this puzzle' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-print-game', 'crossword');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#pulse-heading')).toBeHidden();
    await expect(page.getByTestId('crossword-levels')).toBeHidden();
    await expect(board(page).locator('.crossword-toolbar')).toHaveCSS('display', 'none');
    await expect(board(page).getByTestId('cueword-clue')).toHaveCSS('display', 'none');
    await expect(board(page).locator('.crossword-entry').first()).toHaveCSS('visibility', 'hidden');
    await expect(board(page).locator('.crossword-print-clues')).toHaveCSS('display', 'grid');
    await expect(board(page).locator('.crossword-print-clues')).toContainText('across');
    await expect(board(page).locator('.crossword-print-clues')).toContainText('down');
    await expect(board(page).locator('.crossword-print-footer')).toBeVisible();
    await expect(board(page).locator('.crossword-print-footer')).toHaveText('cueory.app');
    await expect(page.locator('#word-path-heading')).toBeHidden();
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(page.locator('html')).not.toHaveAttribute('data-print-game');
  });

  test('phone controls remain 44 px and hard mode never scrolls the page sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/play/crossword');
    await page.getByTestId('crossword-levels').getByRole('button', { name: 'hard, 15 by 15' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const hardCell = await board(page).locator('.crossword-cell').first().boundingBox();
    expect(hardCell?.width).toBeGreaterThanOrEqual(44);
    expect(hardCell?.height).toBeGreaterThanOrEqual(44);
    const controls = board(page).locator('.crossword-toolbar button, .crossword-no-print [role="group"] button');
    const boxes = await controls.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect()));
    for (const box of boxes) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(390);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  for (const { width, rootText } of [{ width: 320, rootText: 16 }, { width: 390, rootText: 32 }]) {
    test(`hard board contains scrolling at ${width}px with ${rootText}px text and keeps every square reachable`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate((size) => {
        document.documentElement.style.setProperty('font-size', `${size}px`, 'important');
      }, rootText);
      await page.getByTestId('crossword-levels').getByRole('button', { name: 'hard, 15 by 15' }).click();
      const region = board(page).getByRole('region', { name: 'crossword board scroll area' });
      const grid = region.getByRole('grid', { name: 'crossword grid' });
      await expect(grid).toHaveAttribute('aria-colcount', '15');
      await expect(region).toHaveCSS('overflow-x', 'auto');
      expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
      const noPageOverflow = async () => {
        // One snapshot of the numbers the two checks below use. Only when one of them is about to fail, walk the page
        // for the widest element outside the board and attach it with the snapshot, so the evidence is the failing state
        // (diagnostics only: the assertions are unchanged, and passing checkpoints add no extra layout reads).
        const snapshot = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          innerWidth: window.innerWidth,
          scrollX: window.scrollX,
        }));
        if (snapshot.scrollWidth > snapshot.clientWidth || snapshot.scrollX !== 0) {
          const widest = await page.evaluate(() => {
            const root = document.documentElement;
            const describe = (element: Element) => `${element.tagName.toLowerCase()}.${String(element.className).trim().split(/\s+/).join('.')}`;
            let widestElement: Element | null = null;
            let widestRight = 0;
            for (const element of Array.from(document.body.querySelectorAll('*'))) {
              const right = element.getBoundingClientRect().right;
              if (right > widestRight && !element.closest('.crossword-board') && getComputedStyle(element).display !== 'none') {
                widestRight = right;
                widestElement = element;
              }
            }
            const chain: string[] = [];
            for (let node: Element | null = widestElement; node && node !== root; node = node.parentElement) chain.push(describe(node));
            return { widestRight, widestChain: chain };
          });
          await testInfo.attach('page-width-diagnostics', { body: JSON.stringify({ ...snapshot, ...widest }, null, 2), contentType: 'application/json' });
        }
        expect(snapshot.scrollWidth <= snapshot.clientWidth).toBe(true);
        expect(snapshot.scrollX).toBe(0);
      };
      await noPageOverflow();
      const sizes = await grid.locator('button').evaluateAll((cells) => cells.map((cell) => {
        const box = cell.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }));
      for (const size of sizes) {
        expect(size.width).toBeGreaterThanOrEqual(44);
        expect(size.height).toBeGreaterThanOrEqual(44);
      }

      // The region is its own Tab stop. Native arrow scrolling works there,
      // while arrows on a square retain the game's roving-focus controls.
      await region.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(region).toBeFocused();
      await expect(region).toHaveCSS('outline-style', 'solid');
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await noPageOverflow();
      const first = grid.locator('button').first();
      await first.focus();
      for (let step = 0; step < 12; step++) await page.keyboard.press('ArrowRight');
      const rightEdge = grid.getByRole('button', { name: /^(?:\d+, )?row 1, column 14,/ });
      await expect(rightEdge).toBeFocused();
      await expect(rightEdge).toBeInViewport({ ratio: 1 });
      expect(await region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      await noPageOverflow();

      // Scroll to the final square, then exercise tap/mouse and letter input.
      const last = grid.locator('button').last();
      await last.scrollIntoViewIfNeeded();
      if (testInfo.project.use.hasTouch) await last.tap();
      else await last.click();
      await expect(last).toBeFocused();
      await expect(last).toBeInViewport({ ratio: 1 });
      await page.keyboard.type('z');
      await expect(last).toHaveAttribute('aria-label', /letter Z$/);
      await grid.locator('button[tabindex="0"]').focus();
      await page.keyboard.press('Escape');
      await expect(board(page).getByRole('button', { name: 'erase', exact: true })).toBeFocused();
      await noPageOverflow();
    });
  }

  test('printing a hard board removes scroll containment', async ({ page }) => {
    await page.getByTestId('crossword-levels').getByRole('button', { name: 'hard, 15 by 15' }).click();
    await page.evaluate(() => { window.print = () => undefined; });
    await board(page).getByRole('button', { name: 'print this puzzle' }).click();
    await page.emulateMedia({ media: 'print' });
    const region = board(page).getByRole('region', { name: 'crossword board scroll area' });
    await expect(region).toHaveCSS('overflow-x', 'visible');
    await expect(region).toHaveCSS('transform', 'none');
    await expect(board(page).locator('.crossword-print-clues')).toBeVisible();
    await expect(board(page).locator('.crossword-entry').first()).toHaveCSS('visibility', 'hidden');
  });
});

test.describe('daily games: word path (D-71)', () => {
  // Word path's board format (#722) is tested in full in word-path-board.spec.ts, the older word search in word-path.spec.ts.
  test("today's sample is labeled and themed, and axe passes", async ({ page }) => {
    await fixClock(page, new Date('2026-11-01T15:00:00'));
    await page.goto('/play/word-path');
    await expect(page.getByRole('heading', { level: 1, name: 'word path' })).toBeVisible();
    await expect(page.getByTestId('suture').getByRole('heading', { level: 3, name: 'a calm study break' })).toBeVisible();
    await expect(page.getByTestId('suture')).toContainText('sample puzzle');
    await expect(page.getByTestId('suture').getByRole('gridcell')).toHaveCount(48);
    await expect(page.getByRole('heading', { name: 'coming soon' })).toHaveCount(0);
    const results = await axe(page);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('daily games: private stats (D-76), always kept (2026-11-17)', () => {
  // Christian's decision: no "keep my stats" switch. Stats are always kept in this browser, and "forget" clears them.
  const panel = (page: Page) => page.getByTestId('game-stats');
  const kept = (page: Page) => page.evaluate(() => localStorage.getItem('cueory-game-stats'));
  const pulseStats = (page: Page) =>
    panel(page).getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'pillo', exact: true }) });
  // Today's word on 1 November is "grace", so one guess solves it.
  const solvePulse = async (page: Page) => {
    await field(page).fill('grace');
    await field(page).press('Enter');
    await expect(page.getByTestId('pulse-result')).toContainText('solved.');
    const resultDialog = page.getByTestId('game-result-dialog');
    await expect(resultDialog.getByRole('button', { name: 'close results' })).toBeFocused();
    await resultDialog.getByRole('button', { name: 'close results' }).click();
    // The dialog hands focus back to the result on the next frame (requestAnimationFrame). Wait for it: focusing a
    // control before then loses that focus to the late return, and a key press then goes nowhere (CI on #836).
    await expect(page.getByTestId('pulse-result')).toBeFocused();
  };
  const holdPanel = async (page: Page) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/_astro\/GameStatsPanel\.[^/]+\.js$/, async (route) => {
      await held;
      await route.continue();
    });
    return () => release();
  };

  /** What the page looks like at a failure, for CI (shown only in a failing assertion's message). */
  const state = (page: Page) => page.evaluate(() => JSON.stringify({
    active: (document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '').slice(0, 40) + ' <' + document.activeElement?.tagName + '>',
    inert: [...document.querySelectorAll('[inert]')].map((element) => element.tagName + '.' + String(element.className).slice(0, 30)),
    bodyStyle: document.body.getAttribute('style'),
    // Only panels that are really showing (the promo has role="dialog" even while hidden).
    dialogs: [...document.querySelectorAll('dialog[open], [data-testid="game-result-dialog"], [data-promo][data-open]')].map((element) => element.tagName + (element.getAttribute('data-testid') ?? '')),
    scrollY: window.scrollY,
    headerTop: document.querySelector('header')?.getBoundingClientRect().top,
  }));
  test.beforeEach(async ({ page }) => {
    await fixClock(page, new Date('2026-11-01T15:00:00'));
    await page.goto('/play/pillo');
    await expect(panel(page).getByRole('heading', { name: 'your stats' })).toBeVisible();
  });

  test('there is no switch, nothing is saved before a game is finished, and the panel says stats are kept', async ({ page }) => {
    await expect(panel(page).getByRole('switch')).toHaveCount(0);
    await expect(panel(page).getByTestId('stats-note')).toContainText('kept in this browser, on this device, and never sent to us');
    await expect(panel(page)).toContainText('nothing kept yet.');
    expect(await kept(page)).toBeNull();
    await page.reload();
    expect(await kept(page)).toBeNull();
  });

  test('a finished game is kept at once, stays after a reload, and passes axe', async ({ page }) => {
    await solvePulse(page);
    await expect(pulseStats(page)).toContainText('played 1 day, solved 1.');
    await expect(pulseStats(page)).toContainText('1 guess on 1 day.');
    expect(JSON.parse((await kept(page))!)).toEqual({
      version: 1,
      results: [{ game: 'pulse', day: '2026-11-01', solved: true, tries: 1 }],
    });
    expect((await axe(page)).violations).toEqual([]);

    await page.reload();
    await expect(pulseStats(page)).toContainText('played 1 day, solved 1.');
    // Playing the same day again changes nothing: the first result of the day counts.
    await solvePulse(page);
    await expect(page.getByTestId('stats-live')).toHaveText("pillo: today's first game is already in your stats.");
    await expect(pulseStats(page)).toContainText('played 1 day, solved 1.');
    expect(JSON.parse((await kept(page))!).results).toHaveLength(1);
  });

  test('"forget" and "forget all" delete what was kept, and keyboard focus stays in the panel', async ({ page }) => {
    // Was "forget and turning stats off" (play.spec:790): the switch is gone, so "forget all" takes its place.
    await solvePulse(page);
    await expect(pulseStats(page)).toContainText('played 1 day, solved 1.');

    await panel(page).getByRole('button', { name: 'forget pillo' }).focus();
    const before = await state(page);
    await page.keyboard.press('Enter');
    await expect(pulseStats(page), `before Enter: ${before}`).toContainText('not played yet.');
    await expect(panel(page).getByRole('heading', { name: 'pillo', exact: true })).toBeFocused();
    // Nothing left, so the record is deleted, not written empty (Codex on #831).
    expect(await kept(page)).toBeNull();

    await page.reload();
    await solvePulse(page);
    await expect(pulseStats(page)).toContainText('played 1 day, solved 1.');
    await panel(page).getByRole('button', { name: 'forget all my stats' }).focus();
    await page.keyboard.press('Enter');
    await expect(pulseStats(page)).toContainText('not played yet.');
    await expect(panel(page).getByRole('heading', { name: 'your stats' })).toBeFocused();
    await expect(page.getByTestId('stats-live')).toHaveText('all your stats are forgotten. new games are kept from now on.');
    // Nothing left, so the record is deleted, not written empty (Codex on #831).
    expect(await kept(page)).toBeNull();
  });

  test('"forget all" in one tab holds in another tab that is already open', async ({ page, context }) => {
    await solvePulse(page);
    const other = await context.newPage();
    await fixClock(other, new Date('2026-11-01T15:00:00'));
    await other.goto('/play/pillo');
    await expect(pulseStats(other)).toContainText('played 1 day, solved 1.');

    await other.getByRole('button', { name: 'forget all my stats' }).click();
    // This tab shows it at once.
    await expect(pulseStats(page)).toContainText('not played yet.');
    // Nothing left, so the record is deleted, not written empty (Codex on #831).
    expect(await kept(page)).toBeNull();
    await other.close();
  });

  test('a round waiting for the stats panel to load is dropped when another tab forgets stats', async ({ page, context }) => {
    const release = await holdPanel(page);
    // The held stats-panel script must not hold up the page's load event (WebKit waits for it); the page's own checks below wait.
    await page.goto('/play/pillo', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pulse')).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
    await solvePulse(page);

    // Another tab: finish pillo there (kept at once), then forget all stats.
    const other = await context.newPage();
    await fixClock(other, new Date('2026-11-01T15:00:00'));
    await other.goto('/play/pillo');
    await solvePulse(other);
    await expect(pulseStats(other)).toContainText('played 1 day, solved 1.');
    await other.getByRole('button', { name: 'forget all my stats' }).click();
    await expect(pulseStats(other)).toContainText('not played yet.');
    await other.close();

    // The panel loads, and the forgotten round doesn't come back.
    release();
    await expect(pulseStats(page)).toContainText('not played yet.');
    // Nothing left, so the record is deleted, not written empty (Codex on #831).
    expect(await kept(page)).toBeNull();
  });

  test('a page back from the back/forward cache drops a round it was holding', async ({ page }) => {
    const release = await holdPanel(page);
    // The held stats-panel script must not hold up the page's load event (WebKit waits for it); the page's own checks below wait.
    await page.goto('/play/pillo', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pulse')).toBeVisible();
    await solvePulse(page);
    // As if another tab forgot the stats while this page was away: a cached page hears no one's storage changes.
    await page.evaluate(() => {
      localStorage.setItem('cueory-game-stats', JSON.stringify({ version: 1, results: [] }));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    release();
    await expect(pulseStats(page)).toContainText('not played yet.');
    expect(JSON.parse((await kept(page))!).results).toEqual([]);
  });

  test('a tab that missed the news still reads storage before keeping a game', async ({ page }) => {
    // An earlier day was kept, then another tab forgot everything and this one never heard (a page doesn't hear its
    // own storage changes). The new game is kept on its own: the forgotten day doesn't come back.
    await page.evaluate(() => localStorage.setItem('cueory-game-stats', JSON.stringify({ version: 1, results: [{ game: 'pulse', day: '2026-10-31', solved: true, tries: 2 }] })));
    await page.reload();
    await expect(pulseStats(page)).toContainText('played 1 day, solved 1.');
    await page.evaluate(() => localStorage.removeItem('cueory-game-stats'));
    await solvePulse(page);
    expect(JSON.parse((await kept(page))!).results).toEqual([{ game: 'pulse', day: '2026-11-01', solved: true, tries: 1 }]);
  });

  test('a browser that won\'t store anything keeps nothing and says so', async ({ page }) => {
    await page.addInitScript(() => {
      const getItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key: string) {
        if (key === 'cueory-game-stats') throw new Error('blocked');
        return getItem.call(this, key);
      };
    });
    await page.reload();
    await expect(panel(page)).toContainText("this browser won't keep them (private browsing or blocked site data).");
    await solvePulse(page);
    await expect(page.getByTestId('stats-live')).toHaveText("this browser won't keep stats, so this game wasn't kept.");
    await expect(page.getByTestId('pulse-stats')).toContainText("this browser won't keep stats");
  });

  test('anything older than 400 days is deleted when daily games open', async ({ page }) => {
    const recent = { game: 'triage', day: '2026-10-30', solved: true, tries: 0 };
    await page.evaluate(
      (results) => localStorage.setItem('cueory-game-stats', JSON.stringify({ version: 1, results })),
      [{ game: 'pulse', day: '2025-09-27', solved: true, tries: 3 }, recent],
    );
    // The hub's stats list every game (each game's own page lists only that game).
    await page.goto('/play');
    await expect(pulseStats(page)).toContainText('not played yet.');
    await expect(
      // #720 (D-pending): triage results show under sudoku, the game that now keeps them.
      panel(page).getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'sudoku', exact: true }) }),
    ).toContainText('played 1 day, solved 1.');
    // Deleted from this browser, not only hidden.
    expect(JSON.parse((await kept(page))!).results).toEqual([recent]);
  });

  test('a round finished before the stats panel has loaded still counts', async ({ page }) => {
    const release = await holdPanel(page);
    // The held stats-panel script must not hold up the page's load event (WebKit waits for it); the page's own checks below wait.
    await page.goto('/play/pillo', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pulse')).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
    await solvePulse(page);

    release();
    await expect(pulseStats(page)).toContainText('played 1 day, solved 1.');
    expect(JSON.parse((await kept(page))!).results).toEqual([
      { game: 'pulse', day: '2026-11-01', solved: true, tries: 1 },
    ]);
  });

  test('at 320 px the panel fits, and its buttons are at least 44 px tall', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await solvePulse(page);
    await expect(pulseStats(page)).toContainText('played 1 day, solved 1.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const buttons = await panel(page).getByRole('button').all();
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
  });
});

test.describe('daily games without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the hub still links every game, and each game page says its game needs JavaScript', async ({ page }) => {
    await page.goto('/play');
    // Playwright's text matching skips <noscript>, so this uses CSS.
    await expect(page.locator('noscript p')).toHaveText([
      "to add cueory to your home screen, use your browser's menu. daily games need JavaScript.",
    ]);
    await expect(page.getByTestId('sample-note')).toBeVisible();
    await expect(page.getByTestId('play-links').getByRole('link')).toHaveText(['pillo', 'sudoku', 'crossword', 'word path']);
    for (const [path, name] of [['/play/pillo', 'pillo'], ['/play/sudoku', 'sudoku'], ['/play/crossword', 'crossword'], ['/play/word-path', 'word path']]) {
      await page.goto(path);
      // Every game opens the shared settings from its own gear (sudoku too, #823), so no page has a separate button.
      await expect(page.locator('noscript p')).toHaveText([
        `${name} needs JavaScript.`,
        'game results and sharing need JavaScript.',
      ]);
    }
  });
});
