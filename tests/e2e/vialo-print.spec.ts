import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { markPanelsSeen } from './clock';
import { SHEET_IMAGE_WAIT_MS } from '../../src/scripts/printwait';

/**
 * vialo's paper sheet (Christian, 2026-11-25): a print-only block on the game page, filled and printed from the
 * `cueory:print` event. The clock is 1 November 2026, when vialo's sample word is "grace" (and "candy" on the 2nd).
 */
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
  // Stand in for the print dialog and count the calls.
  await page.addInitScript(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => { (window as unknown as { printed: number }).printed += 1; };
  });
});

const STATS_KEY = 'cueory-game-stats';
const FINISHED = { version: 1, results: [{ game: 'pulse', day: '2026-11-01', solved: true, tries: 4 }] };
const finish = (page: Page) => page.addInitScript((value) => localStorage.setItem('cueory-game-stats', JSON.stringify(value)), FINISHED);
const stored = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), STATS_KEY);
const printed = (page: Page) => page.evaluate(() => (window as unknown as { printed: number }).printed);
const todayRow = (page: Page) => page.getByTestId('play-status-pulse');
// The print island loads after the page, so wait until it says it is listening (data-print-ready) before pressing.
const press = async (page: Page) => {
  await expect(page.getByTestId('print-sheet')).toHaveAttribute('data-print-ready', 'true');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('cueory:print', { detail: { game: 'vialo' } })));
};
const warning = (page: Page) => page.getByRole('dialog', { name: 'print before you finish?' });
const sheet = (page: Page) => page.getByTestId('print-sheet');
const keeper = (page: Page) => page.getByTestId('sheet-keeper');

test('the sheet is hidden on screen and holds no word in the page', async ({ page }) => {
  await finish(page);
  await page.goto('/play/vialo');
  await expect(sheet(page)).toBeHidden();
  expect((await sheet(page).innerHTML()).toLowerCase()).not.toContain('grace');
  await expect(keeper(page)).toHaveAttribute('data-keeper', 'locked');
});

test('page 1 has the branding, an empty 5 by 6 pack and the 26 letter keys, and never the word', async ({ page }) => {
  await finish(page);
  await page.goto('/play/vialo');
  await page.emulateMedia({ media: 'print' });
  const one = page.getByTestId('sheet-page-1');
  await expect(one.getByTestId('sheet-label')).toHaveText("guesser's copy");
  await expect(page.getByTestId('sheet-label')).toHaveCount(2);
  const brand = one.getByTestId('sheet-page-1-brand');
  await expect(brand.getByRole('img', { name: 'vialo' })).toHaveAttribute('src', '/design/games-v2/assets/vialo-wordmark-oxblood-v3.svg');
  await expect(brand.locator('img')).toHaveCount(2);
  await expect(one).toContainText('guess the five-letter word in six tries.');
  await expect(one).toContainText('cueory.app · page 1 of 2');

  const board = page.getByTestId('sheet-board');
  await expect(board).toHaveAttribute('aria-label', 'empty board, 5 letters by 6 tries');
  expect(await board.locator('.sheet-cell').count()).toBe(30);
  expect(await board.locator('.sheet-well').count()).toBe(30);
  expect((await board.innerText()).trim()).toBe('');

  const keys = page.getByTestId('sheet-key');
  await expect(keys).toHaveCount(26);
  expect((await keys.allInnerTexts()).join('').toLowerCase()).toBe('qwertyuiopasdfghjklzxcvbnm');
  await expect(page.getByTestId('sheet-keys')).not.toContainText(/enter|⌫|delete/i);
  await expect(page.getByTestId('sheet-keys').locator('button, a, input, [tabindex]')).toHaveCount(0);

  await press(page);
  await expect(keeper(page)).toHaveAttribute('data-keeper', 'ready');
  expect((await one.innerHTML()).toLowerCase()).not.toContain('grace');
});

test('printing a finished game fills page 2 with the steps, the pen marks and the word, and prints once', async ({ page }) => {
  await finish(page);
  await page.goto('/play/vialo');
  await press(page);
  await expect.poll(() => printed(page)).toBe(1);
  await expect(warning(page)).toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  const two = page.getByTestId('sheet-page-2');
  await expect(two.getByRole('heading', { level: 2, name: 'how to play' })).toBeVisible();
  await expect(two.getByTestId('sheet-label')).toHaveText("keeper's copy");
  await expect(two).toContainText('knows the word and marks each guess · keep this copy away from the guesser');
  await expect(two.locator('ol > li')).toHaveCount(5);
  await expect(two).toContainText("the guesser gets the guesser's copy. the keeper keeps this copy hidden.");
  await expect(two).toContainText('the keeper writes the word in the next empty row of the pill pack.');
  await expect(two).toContainText('the keeper marks each letter:');
  await expect(two).toContainText('cross used letters off the alphabet. the guesser has six tries.');
  await expect(two).toContainText('cueory.app · page 2 of 2');
  const legend = page.getByTestId('sheet-legend');
  await expect(legend.getByRole('img')).toHaveCount(3);
  await expect(legend.getByRole('img', { name: /line through/ })).toBeVisible();
  await expect(legend.getByRole('img', { name: /x over/ })).toBeVisible();
  await expect(legend.getByRole('img', { name: /circle around/ })).toBeVisible();
  await expect(two).not.toContainText(/[●○]/);
  await expect(page.getByTestId('sheet-fold')).toHaveText('fold to hide answers');
  await expect(keeper(page).locator('[data-keeper-word]')).toHaveText('grace');
  await expect(keeper(page).locator('[data-keeper-date]')).toHaveText('sunday, november 1st · #1');
  await expect(page.getByText('word of the day')).toHaveCount(1);
  const box = await keeper(page).boundingBox();
  const sheet2 = await two.boundingBox();
  expect(box!.y).toBeGreaterThan(sheet2!.y + sheet2!.height * 0.5);
  // The word leaves the page again once printing is over.
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(keeper(page)).toHaveAttribute('data-keeper', 'locked');
  expect((await sheet(page).innerHTML()).toLowerCase()).not.toContain('grace');
});

test("in print only the sheet prints, and a Ctrl+P without the gate still shows no word", async ({ page }) => {
  await page.goto('/play/vialo');
  await page.emulateMedia({ media: 'print' });
  await expect(sheet(page)).toBeVisible();
  await expect(page.locator('main > :not(.sheet-print)').first()).toBeHidden();
  await expect(keeper(page)).toContainText("finish today's vialo to print the keeper's copy");
  expect((await page.locator('body').innerText()).toLowerCase()).not.toContain('grace');
});

for (const format of ['A4', 'Letter'] as const) {
  for (const state of ['locked', 'ready'] as const) {
    test(`it prints as exactly two ${format} pages (${state})`, async ({ page, browserName }, info) => {
      test.skip(browserName !== 'chromium', 'page.pdf is Chromium only');
      if (state === 'ready') await finish(page);
      await page.goto('/play/vialo');
      if (state === 'ready') {
        await press(page);
        await expect(keeper(page)).toHaveAttribute('data-keeper', 'ready');
      }
      await page.emulateMedia({ media: 'print' });
      const pdf = await page.pdf({ format, printBackground: false, preferCSSPageSize: true });
      expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(2);
      if (process.env.VIALO_PRINT_OUT && info.project.name === 'desktop' && state === 'ready') {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(`${process.env.VIALO_PRINT_OUT}/vialo-print-${format.toLowerCase()}.pdf`, pdf);
      }
    });
  }
}

for (const paper of [{ name: 'Letter', width: 816, height: 1056 }, { name: 'A4', width: 794, height: 1123 }]) {
  test(`large print on ${paper.name}: the pack fills the width and the key letters are big`, async ({ page }) => {
    await page.setViewportSize({ width: paper.width, height: paper.height });
    await page.goto('/play/vialo');
    await page.emulateMedia({ media: 'print' });
    const m = await page.evaluate(() => {
      const one = document.querySelector('[data-testid="sheet-page-1"]')!;
      const pack = document.querySelector('[data-testid="sheet-board"]')!.getBoundingClientRect();
      const keys = document.querySelector('[data-testid="sheet-keys"]')!.getBoundingClientRect();
      const key = document.querySelector('[data-testid="sheet-key"]')!;
      const foot = one.querySelector('.sheet-footer')!.getBoundingClientRect();
      const style = getComputedStyle(one);
      const printable = one.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return { pack: pack.width, printable, letter: parseFloat(getComputedStyle(key).fontSize), keysBottom: keys.bottom, footTop: foot.top, pageBottom: one.getBoundingClientRect().bottom, line: parseFloat(getComputedStyle(key).borderTopWidth), packLine: parseFloat(getComputedStyle(document.querySelector('[data-testid="sheet-board"]')!).borderTopWidth) };
    });
    expect(m.pack / m.printable).toBeGreaterThanOrEqual(0.85);
    expect(m.letter).toBeGreaterThanOrEqual(28 * 96 / 72 - 0.5);
    expect(m.keysBottom).toBeLessThanOrEqual(m.footTop);
    expect(m.line).toBeGreaterThanOrEqual(1.5 * 96 / 72 - 0.1);
    expect(m.packLine).toBeGreaterThanOrEqual(1.5 * 96 / 72 - 0.1);
  });
}

test('on paper the pack, wells and keys are outlined, not filled', async ({ page }) => {
  await page.goto('/play/vialo');
  await page.emulateMedia({ media: 'print' });
  const style = await page.evaluate(() => {
    const border = (selector: string) => parseFloat(getComputedStyle(document.querySelector(selector)!).borderTopWidth);
    const fill = (selector: string) => getComputedStyle(document.querySelector(selector)!).backgroundColor;
    return { pack: border('.sheet-pack'), well: border('.sheet-well'), key: border('.sheet-key'), wellFill: fill('.sheet-well'), keyFill: fill('.sheet-key'), image: getComputedStyle(document.querySelector('.sheet-pack')!).backgroundImage };
  });
  expect(style.pack).toBeGreaterThan(0);
  expect(style.well).toBeGreaterThan(0);
  expect(style.key).toBeGreaterThan(0);
  expect(style.image).toBe('none');
  expect(style.wellFill).toBe('rgba(0, 0, 0, 0)');
  expect(style.keyFill).toBe('rgba(0, 0, 0, 0)');
});

test('the game page keeps its flag control and the sheet adds no heading or control on screen', async ({ page }) => {
  await page.goto('/play/vialo');
  await expect(page.getByRole('link', { name: /flag or comment/ }).first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test.describe('printing an unfinished game', () => {
  test('warns first, and cancelling changes nothing', async ({ page }) => {
    await page.goto('/play/vialo');
    await press(page);
    const dialog = warning(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("the printed copy shows today's answers. if you print now, today's game will be marked wrong and incomplete. finish the game first to keep your result.");
    await expect(dialog.getByRole('button', { name: 'finish the game first' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'print anyway' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await printed(page)).toBe(0);
    expect(await stored(page)).toBeNull();
    await expect(keeper(page)).toHaveAttribute('data-keeper', 'locked');
  });

  test('"finish the game first" just closes the dialog; the game stays playable', async ({ page }) => {
    await page.goto('/play/vialo');
    await press(page);
    await warning(page).getByRole('button', { name: 'finish the game first' }).click();
    await expect(warning(page)).toBeHidden();
    expect(await stored(page)).toBeNull();
    const field = page.getByLabel('your guess', { exact: true });
    await field.fill('grace');
    await field.press('Enter');
    await expect(page.getByTestId('vialo-result')).toContainText('solved.');
  });

  test('"print anyway" records today as not solved, ends the game on screen as lost, then prints with the word', async ({ page }) => {
    await page.goto('/play/vialo');
    await press(page);
    await warning(page).getByRole('button', { name: 'print anyway' }).click();
    await expect.poll(() => printed(page)).toBe(1);
    expect((await stored(page)).results).toEqual([expect.objectContaining({ game: 'vialo', day: '2026-11-01', solved: false })]);
    await expect(keeper(page).locator('[data-keeper-word]')).toHaveText('grace');
    // The game on screen is over: it shows the lost result, and no more guesses are taken.
    await expect(page.getByTestId('vialo-result')).toBeVisible();
    await expect(page.getByLabel('your guess', { exact: true })).toHaveCount(0);
    await page.goto('/play');
    await expect(todayRow(page)).toHaveAttribute('data-status', 'done');
    await expect(page.getByTestId('play-status-words').first()).toHaveText('not solved');
  });

  test('a save that fails keeps the warning open with a plain message, and nothing prints or changes', async ({ page }) => {
    await page.addInitScript(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === 'cueory-game-stats') throw new DOMException('full', 'QuotaExceededError');
        return set.call(this, key, value);
      };
    });
    await page.goto('/play/vialo');
    await press(page);
    await warning(page).getByRole('button', { name: 'print anyway' }).click();
    await expect(page.getByRole('alert').filter({ hasText: "couldn't save that on this device" })).toHaveText("couldn't save that on this device. finish the game to print the keeper's copy.");
    await expect(warning(page)).toBeVisible();
    expect(await printed(page)).toBe(0);
    expect(await stored(page)).toBeNull();
  });

  test('the forfeit goes on the new day when midnight passes while the warning is open', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-01T23:59:50'));
    await page.goto('/play/vialo');
    await press(page);
    await expect(warning(page)).toBeVisible();
    await page.clock.setFixedTime(new Date('2026-11-02T00:00:20'));
    await warning(page).getByRole('button', { name: 'print anyway' }).click();
    await expect.poll(() => printed(page)).toBe(1);
    expect((await stored(page)).results).toEqual([expect.objectContaining({ game: 'vialo', day: '2026-11-02', solved: false })]);
    await expect(keeper(page).locator('[data-keeper-date]')).toHaveText('monday, november 2nd · #2');
    await expect(keeper(page).locator('[data-keeper-word]')).toHaveText('candy');
  });
});

test.describe('from /play', () => {
  test('a finished game offers print for a patient, which opens the game page and prints', async ({ page }) => {
    await finish(page);
    await page.goto('/play');
    await expect(todayRow(page).getByRole('link', { name: 'play vialo' })).toHaveCount(0);
    await todayRow(page).getByRole('button', { name: 'print for a patient (vialo)' }).click();
    await expect(page).toHaveURL(/\/play\/vialo$/);
    await expect.poll(() => printed(page)).toBe(1);
    await expect(keeper(page).locator('[data-keeper-word]')).toHaveText('grace');
  });

  test('an unfinished game shows only play, no print button', async ({ page }) => {
    await page.goto('/play');
    await expect(todayRow(page).getByRole('link', { name: 'play vialo' })).toBeVisible();
    await expect(page.getByRole('button', { name: /print for a patient/ })).toHaveCount(0);
  });

  test("yesterday's result does not offer print today", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('cueory-game-stats', JSON.stringify({ version: 1, results: [{ game: 'pulse', day: '2026-10-31', solved: true, tries: 4 }] })));
    await page.goto('/play');
    await expect(page.getByRole('button', { name: /print for a patient/ })).toHaveCount(0);
  });

  test('if the day rolls over after the page loaded, pressing print goes nowhere and the button goes', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-01T23:59:50'));
    await finish(page);
    await page.goto('/play');
    const print = todayRow(page).getByRole('button', { name: 'print for a patient (vialo)' });
    await expect(print).toBeVisible();
    await page.clock.setFixedTime(new Date('2026-11-02T00:00:20'));
    await print.click();
    await expect(page).toHaveURL(/\/play$/);
    await expect(page.getByRole('button', { name: /print for a patient/ })).toHaveCount(0);
    await expect(todayRow(page).getByRole('link', { name: 'play vialo' })).toBeVisible();
  });

  test('the warning fits at 390 and has no axe problems', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/play/vialo');
    await press(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    const box = await page.getByRole('button', { name: 'print anyway' }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test('two print requests during the picture wait print once, keep the word filled, and release after the print', async ({ page }) => {
  await finish(page);
  // Hold one sheet picture's response. The pictures are lazy until the first request sets them eager, so the held
  // picture is incomplete and the first request has to wait for it: that is the "preparing" phase.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let seen = false;
  await page.route('**/vialo-wordmark-oxblood-v3.svg', async (route) => {
    seen = true;
    await held;
    await route.continue();
  });
  // The wait for pictures is capped so a slow one never blocks printing. Here the cap is switched off, so a slow engine
  // cannot reach it while the test looks: only the held picture decides when printing starts.
  await page.addInitScript((cap) => {
    const real = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...rest: unknown[]) => (timeout === cap ? 0 : real(handler, timeout, ...rest))) as typeof window.setTimeout;
  }, SHEET_IMAGE_WAIT_MS);
  await page.goto('/play/vialo');
  await press(page);
  // The held picture was asked for, the keeper box is filled, and nothing has printed yet: still preparing.
  await expect.poll(() => seen).toBe(true);
  await expect(keeper(page)).toHaveAttribute('data-keeper', 'ready');
  expect(await printed(page)).toBe(0);
  await press(page);
  expect(await printed(page)).toBe(0);
  release();
  await expect.poll(() => printed(page)).toBe(1);
  await expect(keeper(page).locator('[data-keeper-word]')).toHaveText('grace');
  // A request while the print is still open is ignored too.
  await press(page);
  expect(await printed(page)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(keeper(page)).toHaveAttribute('data-keeper', 'locked');
  // Released: the next request prints again.
  await press(page);
  await expect.poll(() => printed(page)).toBe(2);
});

test('a picture that never arrives holds the print back only for the capped wait', async ({ page }) => {
  await finish(page);
  await page.route('**/vialo-wordmark-oxblood-v3.svg', () => new Promise<void>(() => { /* never answered */ }));
  await page.goto('/play/vialo');
  await press(page);
  await expect(keeper(page)).toHaveAttribute('data-keeper', 'ready');
  // The cap (1.5 s) ends the wait, and the sheet prints as the browser has it.
  await expect.poll(() => printed(page)).toBe(1);
});

test('a second request while the warning is open does not stack a second print', async ({ page }) => {
  await page.goto('/play/vialo');
  await press(page);
  await expect(warning(page)).toBeVisible();
  await press(page);
  expect(await printed(page)).toBe(0);
  await warning(page).getByRole('button', { name: 'finish the game first' }).click();
  await press(page);
  await expect(warning(page)).toBeVisible();
});
