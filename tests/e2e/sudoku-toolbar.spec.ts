import { expect, test, type Locator, type Page } from '@playwright/test';

// Christian's sudoku brief: top to bottom the title, the levels, the time and error line, five equal icon buttons
// spread across the board's width (settings, pause or play, print, stats, how to play), then the board. Pause hides
// every number, leaving the page pauses the game until the player presses play, and players see "cue", never
// "candidate".

const game = (page: Page) => page.getByTestId('sudoku');
const toolbar = (page: Page) => game(page).getByTestId('sudoku-toolbar');
const frameControls = (page: Page) => page.locator('.game-frame-controls-row');

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

      // The Frame controls, time/error line, and board retain their rendered order. The page title is screen-reader only in the Games v2 frame (the wordmark is in the left panel), so it is not part of the visual order.
      const section = page.getByTestId('sudoku-section');
      const tops = await Promise.all([
        frameControls(page),
        page.getByTestId('game-frame-sudoku-difficulty'),
        game(page).getByTestId('sudoku-status'),
        game(page).getByRole('grid', { name: 'sudoku grid' }),
      ].map(async (part) => (await part.boundingBox())!.y));
      for (let i = 1; i < tops.length; i++) expect(tops[i]!, `part ${i} below part ${i - 1}`).toBeGreaterThanOrEqual(tops[i - 1]!);
      await expect(section).not.toContainText('fill every row');

      // Frame-owned gear/help and Sudoku-owned pause/print remain four 44px controls across two intended rows.
      const frameButtons = frameControls(page).getByRole('button');
      const localButtons = toolbar(page).getByRole('button');
      await expect(frameButtons).toHaveCount(2);
      await expect(localButtons).toHaveCount(2);
      expect(await frameButtons.evaluateAll((list) => list.map((button) => button.getAttribute('aria-label')))).toEqual(['sudoku settings', 'how to play sudoku']);
      expect(await localButtons.evaluateAll((list) => list.map((button) => button.getAttribute('aria-label')))).toEqual(['pause puzzle', 'print this puzzle']);
      const boxes = await page.locator('.game-frame-controls-row button, [data-testid="sudoku-toolbar"] button').evaluateAll((list) => list.map((button) => button.getBoundingClientRect().toJSON() as DOMRect));
      for (const box of boxes) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      // Drawn icons, not emoji or text.
      for (const button of await localButtons.all()) await expect(button.locator('svg')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

      // The gear opens sudoku's settings; there is no second settings button below the numbers.
      await expect(game(page).locator('.sudoku-pad-wrap').getByRole('button', { name: /settings/ })).toHaveCount(0);
      await frameButtons.first().click();
      await expect(page.getByRole('dialog', { name: 'sudoku settings' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(frameButtons.first()).toBeFocused();
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

  await frameControls(page).getByTestId('game-frame-gear').click();
  const settings = page.getByRole('dialog', { name: 'sudoku settings' });
  await expect(settings.getByRole('checkbox', { name: 'start in auto cue mode' })).toBeVisible();
  expect(await settings.innerText()).not.toMatch(/candidate/i);
  await page.keyboard.press('Escape');

  await frameControls(page).getByRole('button', { name: 'how to play sudoku' }).click();
  const rules = page.getByRole('dialog', { name: 'how to play sudoku' });
  await expect(rules).toContainText('cue mode adds small cue numbers');
  expect(await rules.innerText()).not.toMatch(/candidate/i);
});

test('the gear opens one sudoku settings dialog with the shared settings and sudoku\'s own; no other settings button', async ({ page }) => {
  await page.goto('/play/sudoku');
  await expect(game(page).getByRole('gridcell')).toHaveCount(81);
  await expect(page.getByTestId('play-settings')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /settings/ })).toHaveCount(1);
  const gear = frameControls(page).getByTestId('game-frame-gear');
  await expect(gear).toHaveAttribute('data-testid', 'game-frame-gear');
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
  await frameControls(page).getByTestId('game-frame-gear').click();
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
    const print = toolbar(page).getByRole('button', { name: 'print this puzzle' });
    const gear = frameControls(page).getByTestId('game-frame-gear');
    const help = frameControls(page).getByRole('button', { name: 'how to play sudoku' });
    await pause.scrollIntoViewIfNeeded();
    const rowEdges = async (buttons: Locator[]) => {
      const boxes = await Promise.all(buttons.map(async (button) => ({
        label: await button.getAttribute('aria-label'),
        box: (await button.boundingBox())!,
      })));
      expect(boxes.every(({ box }) => box.width >= 44 && box.height >= 44)).toBe(true);
      return boxes;
    };
    const local = await rowEdges([pause, print]);
    const shared = await rowEdges([gear, help]);
    expect(local.map(({ label }) => label)).toEqual(['pause puzzle', 'print this puzzle']);
    expect(shared.map(({ label }) => label)).toEqual(['sudoku settings', 'how to play sudoku']);

    // The pause pseudo-hit is a local-row guarantee. Sample its declared vertical reach, not the shared Frame row.
    const pausePoint = await pause.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const inset = Number.parseFloat(getComputedStyle(button, '::before').insetBlockStart) || 0;
      const y = inset < 0 ? box.top + inset / 2 : box.top + box.height / 2;
      return { x: box.left + box.width / 2, y };
    });
    const pauseTarget = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'), pausePoint);
    expect(pauseTarget).toBe('pause puzzle');
    const press = () => hasTouch ? page.touchscreen.tap(pausePoint.x, pausePoint.y) : page.mouse.click(pausePoint.x, pausePoint.y);
    await press();
    await expect(toolbar(page).getByRole('button', { name: 'resume puzzle' })).toBeVisible();
    await press();
    await expect(pause).toBeVisible();
  });
}
