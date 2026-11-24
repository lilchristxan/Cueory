import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

// Visual-check regressions (#86): every project size (390 / 820 / 1440) in Light and Evening shows the whole board and
// all ten number buttons, marks the chosen level with more than color, and keeps settings on screen.
const game = (page: Page) => page.getByTestId('sudoku');
const rect = (locator: Locator) => locator.evaluate((element) => element.getBoundingClientRect().toJSON() as DOMRect);

function channelValues(color: string): number[] {
  const match = /rgba?\((\d+(?:\.\d+)?),?\s*(\d+(?:\.\d+)?),?\s*(\d+(?:\.\d+)?)/.exec(color);
  if (!match) throw new Error(`unreadable color ${color}`);
  return match.slice(1, 4).map(Number);
}

function contrast(first: string, second: string): number {
  const luminance = (color: string) => {
    const channels = channelValues(color).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  };
  const [low, high] = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (high! + 0.05) / (low! + 0.05);
}

const painted = (locator: Locator) => locator.evaluate((element) => {
  const style = getComputedStyle(element);
  return { color: style.color, background: style.backgroundColor };
});

/** Composite the page's actual flat background layers for text such as the status line, which has no fill of its own. */
const effectivePaint = (locator: Locator) => locator.evaluate((element) => {
  const parse = (value: string) => {
    const match = /rgba?\((\d+(?:\.\d+)?),?\s*(\d+(?:\.\d+)?),?\s*(\d+(?:\.\d+)?)(?:,?\s*([\d.]+))?/.exec(value);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])] as const;
  };
  let background: [number, number, number] = [255, 255, 255];
  const layers: number[][] = [];
  for (let node: Element | null = element; node; node = node.parentElement) {
    const layer = parse(getComputedStyle(node).backgroundColor);
    if (layer && layer[3] > 0) layers.push([...layer]);
  }
  for (const [red, green, blue, alpha] of [...layers].reverse()) {
    background = [red * alpha + background[0] * (1 - alpha), green * alpha + background[1] * (1 - alpha), blue * alpha + background[2] * (1 - alpha)];
  }
  return { color: getComputedStyle(element).color, background: `rgb(${background.join(', ')})` };
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional */ }
  });
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
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
    for (const control of [game(page).getByRole('checkbox', { name: /auto cues/ }), page.getByTestId('game-frame-gear')]) {
      await expect(control).toBeVisible();
      const box = await rect(control);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // The selected level remains explicit in the framed difficulty picker.
    const difficulty = page.getByTestId('game-frame-sudoku-difficulty');
    for (const level of ['easy', 'medium', 'hard']) {
      await difficulty.selectOption(level);
      await expect(difficulty).toHaveValue(level);
      if (scheme === 'light') {
        const look = await painted(difficulty);
        expect(contrast(look.color, look.background), `${level} Light difficulty text`).toBeGreaterThanOrEqual(4.5);
      }
    }

    // The route gives all interactive controls an opaque surface. Measure the actual rendered foreground/background
    // pair in both themes, including the status text whose background is inherited from the panel.
    const toolbar = game(page).getByTestId('sudoku-toolbar').getByRole('button');
    for (const button of await toolbar.all()) {
      const look = await painted(button);
      expect(contrast(look.color, look.background), `${scheme} toolbar ${await button.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(3);
    }
    await toolbar.first().hover();
    let look = await painted(toolbar.first());
    expect(contrast(look.color, look.background), `${scheme} toolbar hover`).toBeGreaterThanOrEqual(3);
    await toolbar.first().focus();
    look = await painted(toolbar.first());
    expect(contrast(look.color, look.background), `${scheme} toolbar focus`).toBeGreaterThanOrEqual(3);

    for (const button of await game(page).locator('.sudoku-number-row button, .sudoku-tool-button:not([disabled]), .sudoku-setting-button').all()) {
      const control = await painted(button);
      expect(contrast(control.color, control.background), `${scheme} ${await button.innerText()} control text`).toBeGreaterThanOrEqual(4.5);
    }
    const status = await effectivePaint(game(page).getByTestId('sudoku-status'));
    expect(contrast(status.color, status.background), `${scheme} status text`).toBeGreaterThanOrEqual(4.5);

    // Settings fits the screen, scrolls inside itself, and its theme rows drive the footer's theme switch.
    await page.getByTestId('game-frame-gear').click();
    const dialog = page.getByRole('dialog', { name: 'sudoku settings' });
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
    await expect(page.getByTestId('game-frame-gear')).toBeFocused();
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

// The level is called "medium" everywhere (Sudoku.png, copy deck): the button, the screen-reader announcement and the
// stats row header all use the same LEVEL_LABELS, so nobody hears "mid" while the button says "medium".
test('the medium level is announced and listed as "medium"', async ({ page }) => {
  await page.goto('/play/sudoku');
  const medium = page.getByTestId('game-frame-sudoku-difficulty');
  await medium.selectOption('medium');
  await expect(medium).toHaveValue('medium');
  await expect(game(page).getByTestId('sudoku-live')).toHaveText(/^medium puzzle ready\./);
  await page.getByTestId('game-frame-gear').click();
  await expect(page.getByRole('dialog', { name: 'sudoku settings' })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'medium', exact: true })).toBeVisible();
  await expect(page.getByRole('rowheader', { name: 'mid', exact: true })).toHaveCount(0);
});
