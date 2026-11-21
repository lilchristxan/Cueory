import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

/**
 * The "?" help dialog's layout (#736 follow-up, from Christian's iPhone test): the title always sits above the rules,
 * the rules use the full width of the dialog, and no text ever sits under the × close button. Checked for every game in
 * portrait and landscape phones with enlarged root text.
 */

// Each game is on its own page (2026-11-17).
const games = [
  { testId: 'pulse', name: 'pillo', path: '/play/pillo' },
  { testId: 'sudoku', name: 'sudoku', path: '/play/sudoku' },
  { testId: 'cueword', name: 'crossword', path: '/play/crossword' },
  { testId: 'suture', name: 'word path', path: '/play/word-path' },
] as const;
const screens = [[390, 844], [320, 568], [844, 390]] as const;
const fonts = [20, 32] as const;

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

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Every line box of text the player can see in the dialog, except the close button's own ×. Text scrolled out of the
 * rules' own scroll box is clipped by it, so only the part inside that box counts.
 */
const textBoxes = (page: Page) => page.getByTestId('game-help').evaluate((dialog) => {
  const boxes: Array<{ x: number; y: number; width: number; height: number; text: string }> = [];
  const body = dialog.querySelector('[data-testid="game-help-body"]')!.getBoundingClientRect();
  const walker = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim() || node.parentElement?.closest('.game-settings-close')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const inBody = Boolean(node.parentElement?.closest('[data-testid="game-help-body"]'));
    for (const rect of range.getClientRects()) {
      const top = inBody ? Math.max(rect.top, body.top) : rect.top;
      const bottom = inBody ? Math.min(rect.bottom, body.bottom) : rect.bottom;
      if (rect.width > 0 && bottom > top) boxes.push({ x: rect.x, y: top, width: rect.width, height: bottom - top, text: node.textContent.trim().slice(0, 30) });
    }
  }
  return boxes;
});

for (const [width, height] of screens) {
  for (const font of fonts) {
    test(`at ${width}×${height} with ${font}px text, every help dialog stacks its title over full-width rules and keeps text clear of ×`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      for (const game of games) {
        await page.goto(game.path);
        await page.evaluate((size) => document.documentElement.style.setProperty('font-size', `${size}px`, 'important'), font);
        const button = page.getByTestId(game.testId).getByRole('button', { name: `how to play ${game.name}` });
        await button.click();
        const dialog = page.getByRole('dialog', { name: `how to play ${game.name}` });
        await expect(dialog).toBeVisible();
        const panel = (await page.getByTestId('game-help').locator('.game-help').boundingBox())!;
        const title = (await dialog.getByRole('heading', { level: 2 }).boundingBox())!;
        const list = (await dialog.locator('.game-help-steps').boundingBox())!;
        const close = dialog.getByRole('button', { name: 'close how to play' });
        const closeBox = (await close.boundingBox())!;

        // The dialog fits the screen, and the × is a full 44 × 44 target that is on screen.
        expect(panel.x).toBeGreaterThanOrEqual(0);
        expect(panel.x + panel.width).toBeLessThanOrEqual(width + 0.5);
        expect(closeBox.width).toBeGreaterThanOrEqual(44);
        expect(closeBox.height).toBeGreaterThanOrEqual(44);
        expect(closeBox.y).toBeGreaterThanOrEqual(0);
        expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(height + 0.5);
        // Title above the list, never beside it, with its text centred in the dialog.
        expect(title.y + title.height).toBeLessThanOrEqual(list.y + 0.5);
        await expect(dialog.getByRole('heading', { level: 2 })).toHaveCSS('text-align', 'center');
        const titleMiddle = title.x + title.width / 2;
        expect(Math.abs(titleMiddle - (panel.x + panel.width / 2))).toBeLessThanOrEqual(2);
        // The game's one-line description is in its help.
        await expect(dialog.locator('.game-help-line')).toHaveCount(1);
        // Each rule uses the dialog's width, not a narrow column.
        const items = await dialog.locator('.game-help-steps > li').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width));
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) expect(item, `${game.name} rule width`).toBeGreaterThanOrEqual(panel.width * 0.6);

        // No text sits under the ×, at the top or after scrolling the rules to the end.
        for (const where of ['top', 'end'] as const) {
          if (where === 'end') await page.getByTestId('game-help-body').evaluate((body) => { body.scrollTop = body.scrollHeight; });
          const now = (await close.boundingBox())!;
          expect(now.y).toBeGreaterThanOrEqual(0);
          const under = (await textBoxes(page)).filter((box) => overlaps(box, now));
          expect(under, `${game.name}: text under × (${where})`).toEqual([]);
        }
        // "got it" sits centred at the bottom.
        const gotIt = (await dialog.getByRole('button', { name: 'got it' }).boundingBox())!;
        expect(Math.abs(gotIt.x + gotIt.width / 2 - (panel.x + panel.width / 2))).toBeLessThanOrEqual(2);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
      }
    });
  }
}

test('pillo\'s marks are explained in its help, not below the board', async ({ page }) => {
  await page.goto('/play/pillo');
  const pillo = page.getByTestId('pulse');
  await expect(pillo.getByRole('list', { name: 'your guesses' })).toBeAttached();
  await expect(pillo.getByTestId('pillo-legend')).toHaveCount(0);
  await pillo.getByRole('button', { name: 'how to play pillo' }).click();
  const legend = page.getByRole('dialog', { name: 'how to play pillo' }).getByRole('list', { name: 'what the marks mean' });
  // Each row is the drawn pill (its symbol inside it) and the symbol again in words beside it.
  await expect(legend.getByRole('listitem')).toHaveText([/● in its place$/, /○ in the word, somewhere else$/, /· not in the word$/]);
  await expect(legend.locator('.pillo-pill')).toHaveCount(3);
});

test('pillo\'s help lists only hard mode and on-screen keyboard under its own settings', async ({ page }) => {
  await page.goto('/play/pillo');
  await page.getByTestId('pulse').getByRole('button', { name: 'how to play pillo' }).click();
  const terms = page.getByRole('dialog', { name: 'how to play pillo' }).locator('.game-help-settings dt');
  await expect(terms).toHaveText(['hard mode', 'on-screen keyboard only']);
});
