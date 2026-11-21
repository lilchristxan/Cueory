import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

/**
 * Each daily game on its own page (Christian's decision, 2026-11-17): /play/vialo, /play/sudoku, /play/crossword and
 * /play/word-path. These were share landings; a shared result now opens the playable game. Each page has a link back
 * to all games, the game's name centred at the top, the shared settings, only its own game, its own stats and the
 * result dialog. The clock is 1 November 2026, the first sample day.
 */

const games = [
  { path: '/play/vialo', name: 'vialo', testId: 'vialo', id: 'vialo' },
  { path: '/play/sudoku', name: 'sudoku', testId: 'sudoku', id: 'triage' },
  { path: '/play/crossword', name: 'crossword', testId: 'cueword', id: 'cueword' },
  { path: '/play/word-path', name: 'word path', testId: 'suture', id: 'suture' },
] as const;
const others = (testId: string) => games.map((game) => game.testId).filter((other) => other !== testId);

const axe = async (page: Page) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => (document.querySelector('header')?.getBoundingClientRect().top ?? 0) >= 0);
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
};

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional storage */ }
  });
});

for (const game of games) {
  test.describe(`${game.name} on its own page`, () => {
    test('shows only this game, with its name at the top and a link back to all games', async ({ page }) => {
      await page.goto(game.path);
      const heading = page.getByRole('heading', { level: 1, name: game.name });
      await expect(heading).toBeVisible();
      await expect(heading).toHaveCSS('text-align', 'center');
      await expect(page.getByTestId(game.testId)).toBeVisible();
      for (const other of others(game.testId)) await expect(page.getByTestId(other)).toHaveCount(0);
      // Only this game's island is on the page.
      const islands = await page.locator('astro-island').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('component-url') ?? ''));
      const gameIslands = islands.filter((url) => /\/(VialoGame|SudokuGame|CuewordToday|SutureToday)\./.test(url));
      expect(gameIslands).toHaveLength(1);

      const back = page.getByRole('link', { name: 'all games' });
      await expect(back).toHaveAttribute('href', '/play');
      const box = (await back.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      await expect(game.id === 'triage' ? page.getByTestId('game-frame-gear') : page.getByTestId('game-settings-button')).toBeVisible();
      await expect(game.id === 'triage' ? page.getByTestId('game-frame-stats') : page.getByTestId('game-stats')).toBeVisible();
      // The share tags stay those of the game, so a shared result still previews as before.
      await expect(page).toHaveTitle(new RegExp(`^${game.name}`));
      expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toBe('https://cueory.app/share/games-scene.png');
      expect(await page.locator('meta[property="og:title"]').getAttribute('content')).toMatch(new RegExp(`^${game.name}`));
    });

    test('the keyboard reaches the back link, the settings and the game\'s own "?"', async ({ page }) => {
      await page.goto(game.path);
      await expect(page.getByTestId(game.testId)).toBeVisible();
      const back = page.getByRole('link', { name: 'all games' });
      await back.focus();
      await expect(back).toBeFocused();
      const help = game.id === 'triage'
        ? page.getByTestId('game-frame-help-button')
        : page.getByTestId(game.testId).getByRole('button', { name: `how to play ${game.name}` });
      for (let step = 0; step < 40 && !(await help.evaluate((node) => node === document.activeElement)); step++) await page.keyboard.press('Tab');
      await expect(help).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: `how to play ${game.name}` })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(help).toBeFocused();
    });

    for (const [size, width, height] of [['320', 320, 568], ['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]] as const) {
      for (const scheme of ['light', 'dark'] as const) {
        test(`fits ${size} in ${scheme === 'light' ? 'light' : 'evening'} without sideways scrolling, and passes axe`, async ({ page }) => {
          await page.setViewportSize({ width, height });
          await page.emulateMedia({ colorScheme: scheme });
          await page.addInitScript(() => {
            try { localStorage.setItem('cueory-game-help-seen', JSON.stringify(['vialo', 'triage', 'cueword', 'suture'])); } catch { /* optional */ }
          });
          await page.goto(game.path);
          await expect(page.getByTestId(game.testId)).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
          expect((await axe(page)).violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
        });
      }
    }
  });
}

test('a finished vialo on its own page opens the result dialog and keeps stats only for vialo', async ({ page }) => {
  await page.goto('/play/vialo');
  // Stats are always kept (2026-11-17): there is no switch to turn on.
  await expect(page.getByTestId('game-stats').getByRole('switch')).toHaveCount(0);
  const field = page.getByLabel('your guess', { exact: true });
  await field.fill('grace');
  await field.press('Enter');
  await expect(page.getByTestId('game-result-dialog')).toBeVisible();
  await page.getByTestId('game-result-dialog').getByRole('button', { name: 'close results' }).click();
  await expect(page.getByTestId('vialo-result')).toContainText('solved.');
  const kept = JSON.parse((await page.evaluate(() => localStorage.getItem('cueory-game-stats')))!);
  expect(kept.results).toContainEqual(expect.objectContaining({ game: 'vialo', day: '2026-11-01', solved: true, tries: 1 }));
  await expect(page.getByTestId('game-stats').getByRole('heading', { level: 3 })).toHaveText(['vialo']);
});

for (const game of [
  { path: '/play/sudoku', name: 'sudoku', testId: 'sudoku', print: 'print this puzzle' },
  { path: '/play/crossword', name: 'crossword', testId: 'cueword', print: 'print this puzzle' },
  { path: '/play/word-path', name: 'word path', testId: 'suture', print: 'print' },
] as const) {
  test(`printing ${game.name} from its own page prints only the game`, async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('cueory-game-help-seen', JSON.stringify(['vialo', 'triage', 'cueword', 'suture'])); } catch { /* optional */ }
      window.print = () => {};
    });
    await page.goto(game.path);
    await expect(page.getByTestId(game.testId)).toBeVisible();
    await page.getByRole('button', { name: game.print, exact: true }).click();
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('link', { name: 'all games' })).toBeHidden();
    await expect(page.getByTestId('game-stats')).toBeHidden();
    await expect(page.getByTestId('play-settings')).toBeHidden();
    await expect(page.getByRole('grid').first()).toBeVisible();
  });
}
