import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

// Issue #736: every daily game shows its rules on the first visit, and from then on behind a "?" button that opens a
// focus-trapped dialog Escape closes. The clock is 1 November 2026, so word path's puzzle is a board-format sample.

// Each game is on its own page (2026-11-17).
const games = [
  { testId: 'pulse', name: 'pillo', id: 'pulse', path: '/play/pillo' },
  { testId: 'sudoku', name: 'sudoku', id: 'triage', path: '/play/sudoku' },
  { testId: 'cueword', name: 'crossword', id: 'cueword', path: '/play/crossword' },
  { testId: 'suture', name: 'piccline', id: 'suture', path: '/play/word-path' },
] as const;

const seen = (page: Page) => page.evaluate(() => localStorage.getItem('cueory-game-help-seen'));
const axe = (page: Page, selector: string) =>
  new AxeBuilder({ page }).include(selector).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();

// On a phone the first-visit card starts folded so the board comes first (phone parity); open it to read or dismiss it.
const openFirstVisitCard = async (page: Page) => {
  const toggle = page.getByTestId('game-help-first').getByRole('button', { name: /here's how to play/ });
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
};

const helpButton = (page: Page, game: (typeof games)[number]) =>
  game.id === 'cueword' || game.id === 'triage'
    ? page.getByTestId('game-frame-help-button')
    : page.getByTestId(game.testId).getByRole('button', { name: `how to play ${game.name}` });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional storage */ }
  });
});

test('the first visit shows each game\'s rules above its board, and "got it" puts them away for good', async ({ page }) => {
  for (const game of games) {
    await page.goto(game.path);
    const card = page.getByTestId(game.testId).getByTestId('game-help-first');
    await expect(card).toBeVisible();
    await openFirstVisitCard(page);
    await expect(card.getByRole('heading', { name: `new to ${game.name}? here's how to play` })).toBeVisible();
    expect((await axe(page, '[data-testid="game-help-first"]')).violations).toEqual([]);
  }

  await page.goto('/play/sudoku');
  const sudoku = page.getByTestId('sudoku');
  await openFirstVisitCard(page);
  const gotIt = sudoku.getByTestId('game-help-first').getByRole('button', { name: 'got it' });
  const box = await gotIt.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await gotIt.press('Enter');
  await expect(sudoku.getByTestId('game-help-first')).toHaveCount(0);
  // Focus goes to the "?" that brings the rules back.
  await expect(page.getByTestId('game-frame-help-button')).toBeFocused();
  expect(JSON.parse((await seen(page))!)).toEqual(['triage']);

  await page.reload();
  await expect(page.getByTestId('sudoku').getByRole('grid')).toBeVisible();
  await expect(page.getByTestId('sudoku').getByTestId('game-help-first')).toHaveCount(0);
  await page.goto('/play/pillo');
  await expect(page.getByTestId('pulse').getByTestId('game-help-first')).toBeVisible();
});

for (const game of games) {
  test(`${game.name}: the "?" opens the rules in a focus-trapped dialog that Escape closes`, async ({ page }) => {
    await page.goto(game.path);
    test.skip(game.name === 'crossword' && await page.getByTestId('crossword-soon').count() > 0, 'crossword is closed in this build');
    const area = page.getByTestId(game.testId);
    const button = helpButton(page, game);
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await button.click();
    const dialog = page.getByRole('dialog', { name: `how to play ${game.name}` });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'settings' })).toBeVisible();
    // Where the shared settings are now (each game's gear, Christian's brief).
    await expect(dialog).toContainText('change them with the gear at the top left of a game');
    // Using the "?" counts as seeing the rules, so the first-visit card goes away.
    await expect(area.getByTestId('game-help-first')).toHaveCount(0);
    expect(JSON.parse((await seen(page))!)).toEqual([game.id]);

    const close = dialog.getByRole('button', { name: 'close how to play' });
    await expect(close).toBeFocused();
    const closeBox = await close.boundingBox();
    expect(closeBox!.width).toBeGreaterThanOrEqual(44);
    expect(closeBox!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'got it' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    for (let step = 0; step < 4; step++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="game-help"]')))).toBe(true);
    }
    expect((await axe(page, '[data-testid="game-help"]')).violations).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(button).toBeFocused();

    // "got it" and the × close it too.
    await button.click();
    await dialog.getByRole('button', { name: 'got it' }).click();
    await expect(dialog).toHaveCount(0);
    await button.click();
    await dialog.getByRole('button', { name: 'close how to play' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(button).toBeFocused();
  });
}

test('piccline help opens from the keyboard at phone width and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/play/word-path');

  const area = page.getByTestId('suture');
  const button = area.getByRole('button', { name: 'how to play piccline' });
  await button.focus();
  await expect(button).toBeFocused();

  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'how to play piccline' });
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
});

test('the help dialog fits a phone without sideways scrolling, in light and evening', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/play/crossword');
    const button = page.getByTestId('game-frame-help-button');
    await button.click();
    const panel = page.getByTestId('game-help').locator('.game-help');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect((await axe(page, '[data-testid="game-help"]')).violations).toEqual([]);
    await page.keyboard.press('Escape');
  }
});

test('typing in the sudoku help dialog never changes the board', async ({ page }) => {
  await page.goto('/play/sudoku');
  const sudoku = page.getByTestId('sudoku');
  // Wait for today's puzzle, so "before" is the finished board and not one still being set up.
  await expect(sudoku.getByRole('gridcell')).toHaveCount(81);
  await expect(sudoku.locator('[data-given="true"]').first()).toBeVisible();
  const before = await sudoku.getByRole('gridcell').evaluateAll((cells) => cells.map((cell) => cell.getAttribute('aria-label')));
  await page.getByTestId('game-frame-help-button').click();
  await expect(page.getByRole('dialog', { name: 'how to play sudoku' })).toBeVisible();
  await page.keyboard.press('5');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Escape');
  const after = await sudoku.getByRole('gridcell').evaluateAll((cells) => cells.map((cell) => cell.getAttribute('aria-label')));
  expect(after).toEqual(before);
});
