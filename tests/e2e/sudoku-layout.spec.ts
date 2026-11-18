import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

// Visual-check regressions (#86): every project size (390 / 820 / 1440) in Light and Evening shows the whole board and
// all ten number buttons, marks the chosen level with more than color, and keeps settings on screen.
const game = (page: Page) => page.getByTestId('sudoku');
const rect = (locator: Locator) => locator.evaluate((element) => element.getBoundingClientRect().toJSON() as DOMRect);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional */ }
  });
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
});

for (const scheme of ['light', 'dark'] as const) {
  test(`sudoku layout fits the screen (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/play/sudoku');
    await expect(game(page).getByRole('gridcell')).toHaveCount(81);
    const width = page.viewportSize()!.width;

    // The whole board sits inside the panel and the screen, with squares of at least 24 px (WCAG 2.2), in a region
    // that scrolls on its own only when enlarged text makes the squares wider than the panel.
    const panel = await rect(game(page).locator('.sudoku-panel'));
    const region = game(page).getByRole('region', { name: 'sudoku grid scroll area' });
    const board = await rect(game(page).locator('.sudoku-board'));
    expect(board.left).toBeGreaterThanOrEqual(panel.left - 0.5);
    expect(board.right).toBeLessThanOrEqual(panel.right + 0.5);
    expect(board.right).toBeLessThanOrEqual(width);
    await expect(region).toHaveCSS('overflow-x', 'auto');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const boardCells = game(page).getByRole('gridcell');
    const firstCell = await rect(boardCells.first());
    expect(firstCell.width).toBeGreaterThanOrEqual(24);
    expect(firstCell.height).toBeGreaterThanOrEqual(24);
    await boardCells.last().scrollIntoViewIfNeeded();
    await expect(boardCells.last()).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // All of 1–9 and x are on screen, 44 px or more, with nothing hidden in a sideways scroller.
    const row = game(page).locator('.sudoku-number-row');
    expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const rowBox = await rect(row);
    const pad = await row.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().toJSON() as DOMRect));
    expect(pad).toHaveLength(10);
    for (const box of pad) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.left).toBeGreaterThanOrEqual(rowBox.left - 0.5);
      expect(box.right).toBeLessThanOrEqual(Math.min(rowBox.right, width) + 0.5);
    }
    for (const control of [game(page).getByRole('checkbox', { name: /auto cues/ }), game(page).getByRole('button', { name: /settings/ })]) {
      await expect(control).toBeVisible();
      const box = await rect(control);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // The chosen level shows a check mark and bold text, not only a darker fill.
    await game(page).getByRole('button', { name: 'mid' }).click();
    const medium = game(page).getByRole('button', { name: 'mid' });
    const easy = game(page).getByRole('button', { name: 'easy' });
    await expect(medium).toHaveAttribute('aria-pressed', 'true');
    await expect(medium.locator('.segmented-check')).toHaveText('✓');
    await expect(medium.locator('.segmented-check')).toBeVisible();
    await expect(medium).toHaveCSS('font-weight', '700');
    await expect(easy).toHaveAttribute('aria-pressed', 'false');
    await expect(easy.locator('.segmented-check')).toHaveCount(0);
    expect(await easy.evaluate((element) => getComputedStyle(element).fontWeight)).not.toBe('700');

    // Settings fits the screen, scrolls inside itself, and its theme rows drive the footer's theme switch.
    await game(page).getByRole('button', { name: /settings/ }).click();
    const dialog = game(page).getByRole('dialog', { name: 'settings' });
    await expect(dialog).toBeVisible();
    const card = dialog.locator('.game-settings');
    const cardBox = await rect(card);
    const height = page.viewportSize()!.height;
    expect(cardBox.top).toBeGreaterThanOrEqual(0);
    expect(cardBox.bottom).toBeLessThanOrEqual(height);
    expect(cardBox.right).toBeLessThanOrEqual(width);
    expect(await card.evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto');

    await dialog.getByRole('group', { name: 'theme' }).getByRole('radio', { name: /^dark mode/ }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('[data-theme-picker] input[value="dark"]')).toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem('cueory-theme'))).toBe('dark');
    await dialog.getByRole('group', { name: 'theme' }).getByRole('radio', { name: /^follow device/ }).check();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
    await expect(page.locator('[data-theme-picker] input[value="device"]')).toBeChecked();

    const results = await new AxeBuilder({ page }).include('[data-testid="game-settings"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(game(page).getByRole('button', { name: /settings/ })).toBeFocused();
  });
}

test('sudoku keeps usable cells in a contained scroll area at 320px with 32px root text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/play/sudoku');
  // After the page loads, so the larger root text applies to this page and not the blank one before it.
  await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
  await expect(page.locator('html')).toHaveCSS('font-size', '32px');
  await expect(game(page).getByRole('gridcell')).toHaveCount(81);

  const region = game(page).getByRole('region', { name: 'sudoku grid scroll area' });
  const board = region.getByRole('grid', { name: 'sudoku grid' });
  await expect(region).toHaveCSS('overflow-x', 'auto');
  expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  const first = board.getByRole('gridcell').first();
  const firstBox = await rect(first);
  expect(firstBox.width).toBeGreaterThanOrEqual(44);
  expect(firstBox.height).toBeGreaterThanOrEqual(44);
  const last = board.getByRole('gridcell').last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // Keyboard travel keeps the roving focused cell visible within the same region.
  const firstCell = board.getByRole('gridcell').first();
  await firstCell.focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  await expect(board.getByRole('gridcell').nth(8)).toBeFocused();
  await expect(board.getByRole('gridcell').nth(8)).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
