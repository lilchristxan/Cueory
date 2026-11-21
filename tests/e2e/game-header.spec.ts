import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { markPanelsSeen } from './clock';

/**
 * The corner row on pillo, crossword and word path (Christian's brief, 2026-11-17): a drawn gear at the top left opens
 * the game's settings with the shared ones in the same dialog; the "?" sits at the top right. Sudoku has lane 6's own
 * toolbar. The /play hub has no settings button any more.
 */
const games = [
  { path: '/play/pillo', testId: 'pulse', name: 'pillo', own: 'hard mode' },
  { path: '/play/crossword', testId: 'cueword', name: 'crossword', own: 'show the timer' },
  { path: '/play/word-path', testId: 'suture', name: 'word path', own: null },
] as const;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
      localStorage.setItem('cueory-game-help-seen', JSON.stringify(['pulse', 'triage', 'cueword', 'suture']));
    } catch { /* optional storage */ }
  });
});

for (const game of games) {
  for (const [width, height] of [[320, 700], [390, 844], [1440, 900]] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`${game.name} at ${width} px (${scheme === 'light' ? 'light' : 'evening'}): gear top left, "?" top right`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(game.path);
        const box = page.getByTestId(game.testId);
        await expect(box).toBeVisible();
        const area = (await box.boundingBox())!;
        // Framed Crossword/Sudoku move shared controls out of the island; Pillo and Word Path retain legacy headers.
        const framed = game.name !== 'pillo' && game.name !== 'word path';
        const gear = framed ? page.getByTestId('game-frame-gear') : box.getByRole('button', { name: `${game.name} settings` });
        const help = framed ? page.getByTestId('game-frame-help-button') : box.getByRole('button', { name: `how to play ${game.name}` });
        const g = (await gear.boundingBox())!;
        const h = (await help.boundingBox())!;
        for (const corner of [g, h]) {
          expect(corner.width).toBeGreaterThanOrEqual(44);
          expect(corner.height).toBeGreaterThanOrEqual(44);
        }
        // Same row, gear at the left edge of the game, "?" at the right edge.
        expect(Math.abs(g.y - h.y)).toBeLessThanOrEqual(2);
        expect(g.x - area.x).toBeLessThanOrEqual(2);
        expect(area.x + area.width - (h.x + h.width)).toBeLessThanOrEqual(2);
        // The gear is drawn, not an emoji or text.
        await expect(gear.locator('svg')).toHaveCount(1);
        await expect(gear).toHaveText('');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      });
    }
  }

  test(`${game.name}: the gear opens its settings with the shared ones, and Escape returns to the gear`, async ({ page }) => {
    await page.goto(game.path);
    const framed = game.name !== 'pillo' && game.name !== 'word path';
    const gear = framed ? page.getByTestId('game-frame-gear') : page.getByTestId(game.testId).getByRole('button', { name: `${game.name} settings` });
    await gear.click();
    const dialog = page.getByRole('dialog', { name: `${game.name} settings` });
    await expect(dialog).toBeVisible();
    for (const shared of ['theme', 'motion', 'every game']) await expect(dialog.getByRole('group', { name: shared })).toBeVisible();
    if (game.own) await expect(dialog.getByText(game.own).first()).toBeVisible();
    expect((await new AxeBuilder({ page }).include('[data-testid="game-settings"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(gear).toBeFocused();
  });
}

test('the /play hub has no settings button: each game\'s gear holds the shared settings', async ({ page }) => {
  await page.goto('/play');
  await expect(page.getByRole('heading', { level: 1, name: 'daily games' })).toBeVisible();
  await expect(page.getByTestId('play-status')).toBeVisible();
  await expect(page.getByTestId('game-settings-button')).toHaveCount(0);
});

test('with 32 px text at 320 px the corner row wraps instead of pushing any game page sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const game of games) {
    await page.goto(game.path);
    await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
    await expect(page.getByTestId(game.testId)).toBeVisible();
    const helpLocator = game.name === 'crossword' ? page.getByTestId('game-frame-help-button') : page.getByTestId(game.testId).getByRole('button', { name: `how to play ${game.name}` });
    const help = (await helpLocator.boundingBox())!;
    expect(help.x + help.width, game.name).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), game.name).toBe(true);
  }
});

test('with 32 px text at 320 px each game\'s settings dialog wraps inside its card, with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const game of games) {
    await page.goto(game.path);
    await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
    await page.getByTestId(game.testId).getByRole('button', { name: `${game.name} settings` }).click();
    const card = page.getByRole('dialog', { name: `${game.name} settings` }).locator('.game-settings');
    await expect(card).toBeVisible();
    const [scrollWidth, clientWidth] = await card.evaluate((element) => [element.scrollWidth, element.clientWidth]);
    expect(scrollWidth, `${game.name}: settings card scrolls sideways`).toBeLessThanOrEqual(clientWidth);
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    await page.keyboard.press('Escape');
  }
});
