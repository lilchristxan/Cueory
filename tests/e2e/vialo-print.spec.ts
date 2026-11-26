import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { markPanelsSeen } from './clock';

/** vialo's paper sheet (Christian, 2026-11-25). The clock is 1 November 2026, when vialo's sample word is "grace". */
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
});

const FINISHED = { version: 1, results: [{ game: 'pulse', day: '2026-11-01', solved: true, tries: 4 }] };
const finish = (page: import('@playwright/test').Page) =>
  page.addInitScript((value) => localStorage.setItem('cueory-game-stats', JSON.stringify(value)), FINISHED);

test('page 1 has the branding, an empty 5 by 6 pack and the 26 letter keys, and never the word', async ({ page }) => {
  await finish(page);
  await page.goto('/play/vialo/print');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  const one = page.getByTestId('sheet-page-1');
  const brand = one.getByTestId('sheet-page-1-brand');
  await expect(brand.getByRole('img', { name: 'vialo' })).toHaveAttribute('src', '/design/games-v2/assets/vialo-wordmark-oxblood-v3.svg');
  await expect(brand.locator('img')).toHaveCount(2);
  await expect(one.getByTestId('sheet-label')).toHaveText("guesser's copy");
  await expect(one).toContainText('guess the five-letter word in six tries.');
  await expect(one).toContainText('cueory.app · page 1 of 2');
  await expect(page.getByTestId('sheet-page-2')).toContainText('cueory.app · page 2 of 2');

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

  await expect(page.getByTestId('sheet-keeper')).toHaveAttribute('data-keeper', 'ready');
  expect((await one.innerHTML()).toLowerCase()).not.toContain('grace');
  expect((await one.innerText()).toLowerCase()).not.toContain('grace');
});

test('page 2 has the steps, the three pen marks and, once today is finished, the word', async ({ page }) => {
  await finish(page);
  await page.goto('/play/vialo/print');
  const two = page.getByTestId('sheet-page-2');
  await expect(two.getByRole('heading', { level: 2, name: 'how to play' })).toBeVisible();
  await expect(two.getByTestId('sheet-label')).toHaveText("keeper's copy");
  await expect(page.getByTestId('sheet-label')).toHaveCount(2);
  await expect(two).toContainText('knows the word and marks each guess · keep this copy away from the guesser');
  await expect(two).toContainText("the guesser gets the guesser's copy. the keeper keeps this copy hidden.");
  await expect(two.locator('ol > li')).toHaveCount(5);
  await expect(two).toContainText('the keeper writes the word in the next empty row of the pill pack.');
  await expect(two).toContainText('the keeper marks each letter:');
  await expect(two).toContainText('cross used letters off the alphabet. the guesser has six tries.');
  const legend = page.getByTestId('sheet-legend');
  await expect(legend.locator('li')).toHaveCount(3);
  await expect(legend.getByRole('img')).toHaveCount(3);
  await expect(legend.getByRole('img', { name: /line through/ })).toBeVisible();
  await expect(legend.getByRole('img', { name: /x over/ })).toBeVisible();
  await expect(legend.getByRole('img', { name: /circle around/ })).toBeVisible();
  await expect(two).not.toContainText(/[●○]/);
  await expect(page.getByTestId('sheet-page-1').getByText('word of the day')).toHaveCount(0);
  await expect(page.getByText('word of the day')).toHaveCount(1);
  const keeper = page.getByTestId('sheet-keeper');
  await expect(keeper).toHaveAttribute('data-keeper', 'ready');
  await expect(keeper).toContainText('word of the day');
  await expect(keeper.locator('[data-keeper-word]')).toHaveText('grace');
  await expect(keeper.locator('[data-keeper-date]')).toHaveText('sunday, november 1st · #1');
  await expect(keeper.locator('.sheet-locked')).toBeHidden();
  await expect(page.getByTestId('sheet-fold')).toHaveText('fold to hide answers');
  const box = await keeper.boundingBox();
  const sheet = await two.boundingBox();
  expect(box!.y).toBeGreaterThan(sheet!.y + sheet!.height * 0.5);
});

test("without a finished game today the word is nowhere in the page's text, and page 2 says to finish first", async ({ page }) => {
  await page.goto('/play/vialo/print');
  const keeper = page.getByTestId('sheet-keeper');
  await expect(keeper).toHaveAttribute('data-keeper', 'locked');
  await expect(keeper).toContainText("finish today's vialo to print the keeper's copy");
  await expect(keeper.locator('[data-keeper-word]')).toHaveText('');
  expect((await page.locator('main').innerText()).toLowerCase()).not.toContain('grace');
  await expect(page.getByTestId('sheet-page-1')).toBeVisible();
});

test('yesterday finished does not unlock the word', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cueory-game-stats', JSON.stringify({ version: 1, results: [{ game: 'pulse', day: '2026-10-31', solved: true, tries: 4 }] })));
  await page.goto('/play/vialo/print');
  await expect(page.getByTestId('sheet-keeper')).toHaveAttribute('data-keeper', 'locked');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('page 1 and the steps show, the word does not', async ({ page }) => {
    await page.goto('/play/vialo/print');
    await expect(page.getByTestId('sheet-key')).toHaveCount(26);
    await expect(page.getByTestId('sheet-page-2')).toContainText('how to play');
    await expect(page.getByTestId('sheet-keeper')).toContainText("finish today's vialo");
    expect((await page.locator('main').innerText()).toLowerCase()).not.toContain('grace');
  });
});

test('print and back controls are on screen and exposed, and print calls the browser print', async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { printed: number }).printed = 0; window.print = () => { (window as unknown as { printed: number }).printed += 1; }; });
  await page.goto('/play/vialo/print');
  await page.getByTestId('print-sheet').click();
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  await expect(page.getByTestId('back-to-games')).toHaveAttribute('href', '/play');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('print-sheet')).toBeHidden();
  await expect(page.getByTestId('back-to-games')).toBeHidden();
});

for (const format of ['A4', 'Letter'] as const) {
  for (const state of ['locked', 'ready'] as const) test(`it prints as exactly two ${format} pages (${state})`, async ({ page, browserName }, info) => {
    test.skip(browserName !== 'chromium', 'page.pdf is Chromium only');
    if (state === 'ready') await finish(page);
    await page.goto('/play/vialo/print');
    await expect(page.getByTestId('sheet-keeper')).toHaveAttribute('data-keeper', state);
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ format, printBackground: false, preferCSSPageSize: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBe(2);
    if (process.env.VIALO_PRINT_OUT && info.project.name === 'desktop' && state === 'ready') {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(`${process.env.VIALO_PRINT_OUT}/vialo-print-${format.toLowerCase()}.pdf`, pdf);
    }
  });
}

for (const size of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 900 }]) {
  test(`at ${size.width} px nothing scrolls sideways and axe is clean`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/play/vialo/print');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}

test('on paper the pack, wells and keys are outlined, not filled', async ({ page }) => {
  await page.goto('/play/vialo/print');
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

const STATS_KEY = 'cueory-game-stats';
const stored = (page: import('@playwright/test').Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), STATS_KEY);
const todayRow = (page: import('@playwright/test').Page) => page.getByTestId('play-status-pulse');

test.describe('printing from /play', () => {
  test('a finished game prints straight away, without a warning', async ({ page }) => {
    await finish(page);
    await page.goto('/play');
    await todayRow(page).getByRole('button', { name: 'print for a patient (vialo)' }).click();
    await expect(page).toHaveURL(/\/play\/vialo\/print$/);
    await expect(page.getByTestId('sheet-keeper').locator('[data-keeper-word]')).toHaveText('grace');
  });

  test('an unfinished game warns first, and cancelling changes nothing', async ({ page }) => {
    await page.goto('/play');
    const button = todayRow(page).getByRole('button', { name: 'print for a patient (vialo)' });
    await expect(todayRow(page).getByRole('link', { name: 'play vialo' })).toBeVisible();
    await button.click();
    const dialog = page.getByRole('dialog', { name: 'print before you finish?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("the printed copy shows today's answers. if you print now, today's game will be marked wrong and incomplete. finish the game first to keep your result.");
    await expect(dialog.getByRole('button', { name: 'finish the game first' })).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'print anyway' })).toBeVisible();
    // Focus stays inside the dialog.
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'print anyway' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
    expect(await stored(page)).toBeNull();
    await expect(todayRow(page)).toHaveAttribute('data-status', 'not-started');
    await expect(page).toHaveURL(/\/play$/);
  });

  test('"finish the game first" goes to the game and records nothing', async ({ page }) => {
    await page.goto('/play');
    await todayRow(page).getByRole('button', { name: 'print for a patient (vialo)' }).click();
    await page.getByRole('button', { name: 'finish the game first' }).click();
    await expect(page).toHaveURL(/\/play\/vialo$/);
    expect(await stored(page)).toBeNull();
  });

  test('"print anyway" records today as not solved, then the sheet shows the word, and the hub shows played', async ({ page }) => {
    await page.goto('/play');
    await todayRow(page).getByRole('button', { name: 'print for a patient (vialo)' }).click();
    await page.getByRole('button', { name: 'print anyway' }).click();
    await expect(page).toHaveURL(/\/play\/vialo\/print$/);
    const kept = await stored(page);
    expect(kept.results).toEqual([expect.objectContaining({ game: 'vialo', day: '2026-11-01', solved: false })]);
    await expect(page.getByTestId('sheet-keeper').locator('[data-keeper-word]')).toHaveText('grace');
    await page.goto('/play');
    await expect(todayRow(page)).toHaveAttribute('data-status', 'done');
    await expect(page.getByTestId('play-status-words').first()).toHaveText('not solved');
    await expect(todayRow(page).getByRole('link')).toHaveCount(0);
    // Playing the game page afterwards cannot change the kept result: the first result of a day stays.
    await page.goto('/play/vialo');
    expect((await stored(page)).results).toHaveLength(1);
  });

  test('the warning works by touch and has no motion or axe problems in this theme', async ({ page }) => {
    await page.goto('/play');
    await todayRow(page).getByRole('button', { name: 'print for a patient (vialo)' }).click();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    const box = await page.getByRole('button', { name: 'print anyway' }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test('the flag or comment control stays on screen and is not printed', async ({ page }) => {
  await page.goto('/play/vialo/print');
  const flag = page.getByRole('button', { name: 'flag or comment', exact: true });
  await expect(flag).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(flag).toBeHidden();
});

test.describe('the revealed keeper word on screen', () => {
  for (const size of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
    test(`fits without sideways scroll at ${size.width} px`, async ({ page }) => {
      await page.setViewportSize(size);
      await finish(page);
      await page.goto('/play/vialo/print');
      const word = page.getByTestId('sheet-keeper').locator('[data-keeper-word]');
      await expect(word).toHaveText('grace');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const fits = await page.evaluate(() => {
        const box = document.querySelector('[data-testid="sheet-keeper"]')!.getBoundingClientRect();
        const text = document.querySelector('[data-keeper-word]')!;
        const range = document.createRange();
        range.selectNodeContents(text);
        const r = range.getBoundingClientRect();
        return r.left >= box.left && r.right <= box.right && box.right <= window.innerWidth;
      });
      expect(fits).toBe(true);
    });
  }
});

test('a save that fails keeps the warning open with a plain message, and nothing opens or changes', async ({ page }) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'cueory-game-stats') throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  });
  await page.goto('/play');
  await todayRow(page).getByRole('button', { name: 'print for a patient (vialo)' }).click();
  await page.getByRole('button', { name: 'print anyway' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toHaveText("couldn't save that on this device. finish the game to print the keeper's copy.");
  await expect(page.getByRole('dialog', { name: 'print before you finish?' })).toBeVisible();
  await expect(page).toHaveURL(/\/play$/);
  expect(await stored(page)).toBeNull();
});

test('a forfeited day stays not solved even if the game is then played and solved', async ({ page }) => {
  await page.goto('/play');
  await todayRow(page).getByRole('button', { name: 'print for a patient (vialo)' }).click();
  await page.getByRole('button', { name: 'print anyway' }).click();
  await expect(page).toHaveURL(/\/play\/vialo\/print$/);
  await page.goto('/play/vialo');
  const field = page.getByLabel('your guess', { exact: true });
  await field.fill('grace');
  await field.press('Enter');
  await expect(page.getByTestId('vialo-result')).toContainText('solved.');
  await page.goto('/play');
  await expect(page.getByTestId('play-status-words').first()).toHaveText('not solved');
  expect((await stored(page)).results).toEqual([expect.objectContaining({ game: 'vialo', solved: false })]);
});

test('the forfeit goes on the new day when midnight passes while the warning is open', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T23:59:50'));
  await page.goto('/play');
  await todayRow(page).getByRole('button', { name: 'print for a patient (vialo)' }).click();
  await expect(page.getByRole('dialog', { name: 'print before you finish?' })).toBeVisible();
  await page.clock.setFixedTime(new Date('2026-11-02T00:00:20'));
  await page.getByRole('button', { name: 'print anyway' }).click();
  await expect(page).toHaveURL(/\/play\/vialo\/print$/);
  expect((await stored(page)).results).toEqual([expect.objectContaining({ game: 'vialo', day: '2026-11-02', solved: false })]);
  const keeper = page.getByTestId('sheet-keeper');
  await expect(keeper).toHaveAttribute('data-keeper', 'ready');
  await expect(keeper.locator('[data-keeper-date]')).toHaveText('monday, november 2nd · #2');
  await expect(keeper.locator('[data-keeper-word]')).not.toHaveText('grace');
});
