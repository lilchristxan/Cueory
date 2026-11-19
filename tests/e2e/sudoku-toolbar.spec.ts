import { expect, test, type Page } from '@playwright/test';

// Christian's sudoku brief: top to bottom the title, the levels, the time and error line, five equal icon buttons
// spread across the board's width (settings, pause or play, print, stats, how to play), then the board. Pause hides
// every number, leaving the page pauses the game until the player presses play, and players see "cue", never
// "candidate".

const game = (page: Page) => page.getByTestId('sudoku');
const toolbar = (page: Page) => game(page).getByTestId('sudoku-toolbar');
const order = ['sudoku settings', 'pause puzzle', 'print this puzzle', 'sudoku stats', 'how to play sudoku'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
      localStorage.setItem('cueory-game-help-seen', JSON.stringify(['triage']));
    } catch { /* optional storage */ }
  });
});

for (const [width, height] of [[320, 700], [390, 844], [820, 1180], [1440, 900]] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`toolbar order and even spacing at ${width} px (${colorScheme === 'light' ? 'Light' : 'Evening'})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme });
      await page.goto('/play/sudoku');
      await expect(game(page).getByRole('gridcell')).toHaveCount(81);

      // The levels, the time and error line, the tools and the board, in that order down the page.
      const section = page.getByTestId('sudoku-section');
      const tops = await Promise.all([
        // The page title (sudoku on its own page, 2026-11-17).
        page.getByRole('heading', { level: 1, name: 'sudoku', exact: true }),
        game(page).getByRole('group', { name: 'difficulty' }).or(game(page).locator('.sudoku-levels')).first(),
        game(page).getByTestId('sudoku-status'),
        toolbar(page),
        game(page).getByRole('grid', { name: 'sudoku grid' }),
      ].map(async (part) => (await part.boundingBox())!.y));
      for (let i = 1; i < tops.length; i++) expect(tops[i]!, `part ${i} below part ${i - 1}`).toBeGreaterThan(tops[i - 1]!);
      await expect(section).not.toContainText('fill every row');

      // Five icon buttons, in order, equal in size, on one line, from the board's left edge to its right edge.
      const buttons = toolbar(page).getByRole('button');
      await expect(buttons).toHaveCount(5);
      const names = await buttons.evaluateAll((list) => list.map((button) => button.getAttribute('aria-label')));
      expect(names).toEqual(order);
      const boxes = await buttons.evaluateAll((list) => list.map((button) => button.getBoundingClientRect().toJSON() as DOMRect));
      const board = (await game(page).getByRole('grid', { name: 'sudoku grid' }).boundingBox())!;
      for (const box of boxes) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(Math.abs(box.width - boxes[0]!.width)).toBeLessThan(0.5);
        expect(Math.abs(box.height - boxes[0]!.height)).toBeLessThan(0.5);
        expect(Math.abs(box.top - boxes[0]!.top)).toBeLessThan(0.5);
      }
      expect(Math.abs(boxes[0]!.left - board.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(boxes[4]!.right - (board.x + board.width))).toBeLessThanOrEqual(1);
      const gaps = boxes.slice(1).map((box, i) => box.left - boxes[i]!.right);
      for (const gap of gaps) expect(Math.abs(gap - gaps[0]!)).toBeLessThanOrEqual(1.5);
      // Drawn icons, not emoji or text.
      for (const button of (await buttons.all()).slice(0, 4)) await expect(button.locator('svg')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

      // The gear opens sudoku's settings; there is no second settings button below the numbers.
      await expect(game(page).locator('.sudoku-pad-wrap').getByRole('button', { name: /settings/ })).toHaveCount(0);
      await buttons.first().click();
      await expect(game(page).getByRole('dialog', { name: 'settings' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(buttons.first()).toBeFocused();
    });
  }
}

test('pause hides every number, givens included, with the same mark in every square; play brings them back', async ({ page }) => {
  await page.goto('/play/sudoku');
  const cells = game(page).getByRole('gridcell');
  await expect(cells).toHaveCount(81);
  const before = await cells.allInnerTexts();
  expect(before.filter((text) => /\d/.test(text)).length).toBeGreaterThan(0);
  await toolbar(page).getByRole('button', { name: 'pause puzzle' }).click();
  await expect(game(page).locator('.sudoku-paused-mark')).toHaveCount(81);
  for (const text of await cells.allInnerTexts()) expect(text.trim()).toBe('');
  for (const label of await cells.evaluateAll((list) => list.map((cell) => cell.getAttribute('aria-label') ?? ''))) {
    expect(label).toMatch(/, hidden until resumed$/);
  }
  await expect(game(page).locator('.sudoku-number-row button').first()).toBeDisabled();
  await toolbar(page).getByRole('button', { name: 'resume puzzle' }).click();
  await expect(game(page).locator('.sudoku-paused-mark')).toHaveCount(0);
  expect(await cells.allInnerTexts()).toEqual(before);
});

test('leaving the page or the window pauses the game until the player presses play', async ({ page }) => {
  await page.goto('/play/sudoku');
  await expect(game(page).getByRole('gridcell')).toHaveCount(81);
  const pause = toolbar(page).getByRole('button', { name: 'pause puzzle' });
  const resume = toolbar(page).getByRole('button', { name: 'resume puzzle' });
  await expect(pause).toBeVisible();

  // The page is hidden (another app or tab).
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(resume).toBeVisible();
  await expect(game(page).locator('.sudoku-paused-mark')).toHaveCount(81);
  await expect(game(page).getByTestId('sudoku-live')).toHaveText('puzzle paused while you were away. press play to go on.');
  // Coming back does not resume on its own.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(pause).toBeVisible();

  // The window loses focus (another window).
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(resume).toBeVisible();
  await expect(game(page).locator('.sudoku-paused-mark')).toHaveCount(81);
});

test('players see "cue", never "candidate"', async ({ page }) => {
  await page.goto('/play/sudoku');
  await expect(game(page).getByRole('gridcell')).toHaveCount(81);
  const mode = game(page).getByTestId('sudoku-mode');
  await expect(mode.getByRole('button')).toHaveText([/normal/, /cue/]);
  await expect(game(page).getByRole('checkbox', { name: 'auto cues' })).toBeVisible();
  expect(await game(page).innerText()).not.toMatch(/candidate/i);

  await toolbar(page).getByRole('button', { name: 'sudoku settings' }).click();
  const settings = game(page).getByRole('dialog', { name: 'settings' });
  await expect(settings.getByRole('checkbox', { name: 'start in auto cue mode' })).toBeVisible();
  expect(await settings.innerText()).not.toMatch(/candidate/i);
  await page.keyboard.press('Escape');

  await toolbar(page).getByRole('button', { name: 'how to play sudoku' }).click();
  const rules = page.getByRole('dialog', { name: 'how to play sudoku' });
  await expect(rules).toContainText('cue mode adds small cue numbers');
  expect(await rules.innerText()).not.toMatch(/candidate/i);
});

test('the gear opens one sudoku settings dialog with the shared settings and sudoku\'s own; no other settings button', async ({ page }) => {
  await page.goto('/play/sudoku');
  await expect(game(page).getByRole('gridcell')).toHaveCount(81);
  await expect(page.getByTestId('play-settings')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /settings/ })).toHaveCount(1);
  const gear = toolbar(page).getByRole('button', { name: 'sudoku settings' });
  await expect(gear).toHaveAttribute('data-testid', 'game-settings-button');
  await gear.click();
  const dialog = page.getByRole('dialog', { name: 'sudoku settings' });
  await expect(dialog).toBeVisible();
  for (const shared of ['theme', 'motion', 'every game', 'gameboard settings']) await expect(dialog.getByRole('group', { name: shared })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'start in auto cue mode' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(gear).toBeFocused();
});

test('with 32 px text at 320 px the sudoku settings dialog wraps inside its card, with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/play/sudoku');
  await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
  await toolbar(page).getByRole('button', { name: 'sudoku settings' }).click();
  const card = page.getByRole('dialog', { name: 'sudoku settings' }).locator('.game-settings');
  await expect(card).toBeVisible();
  const [scrollWidth, clientWidth] = await card.evaluate((element) => [element.scrollWidth, element.clientWidth]);
  expect(scrollWidth, 'sudoku: settings card scrolls sideways').toBeLessThanOrEqual(clientWidth);
  const box = (await card.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
});

for (const [width, height] of [[320, 700], [390, 844]] as const) {
  test(`pause and resume respond beyond the visible toolbar button at ${width} px`, async ({ page, hasTouch }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/play/sudoku');
    const pause = toolbar(page).getByRole('button', { name: 'pause puzzle' });
    await pause.scrollIntoViewIfNeeded();
    const { top, bottom, left, right, settings, print } = await pause.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const centerX = box.left + box.width / 2;
      const centerY = box.top + box.height / 2;
      const reach = 1.5;
      const target = (x: number, y: number) => ({
        x, y, label: document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'),
      });
      return {
        top: target(centerX, box.top - reach),
        bottom: target(centerX, box.bottom + reach),
        left: target(box.left - reach, centerY),
        right: target(box.right + reach, centerY),
        settings: target(button.previousElementSibling!.getBoundingClientRect().right - 1, centerY),
        print: target(button.nextElementSibling!.getBoundingClientRect().left + 1, centerY),
      };
    });
    expect(top.label).toBe('pause puzzle');
    expect(bottom.label).toBe('pause puzzle');
    expect(settings.label).toBe('sudoku settings');
    expect(print.label).toBe('print this puzzle');
    // At 320 px the gaps are narrower than the overlay. At 390 px there is room for the full width.
    if (width === 390) {
      expect(left.label).toBe('pause puzzle');
      expect(right.label).toBe('pause puzzle');
    }

    const point = width === 390 ? right : top;
    const press = () => hasTouch ? page.touchscreen.tap(point.x, point.y) : page.mouse.click(point.x, point.y);
    await press();
    await expect(toolbar(page).getByRole('button', { name: 'resume puzzle' })).toBeVisible();
    await press();
    await expect(pause).toBeVisible();
  });
}
