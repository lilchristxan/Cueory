import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

/**
 * Today's status for each daily game on /play (#735), from this device only. The clock is set to 1 November 2026, when
 * vialo's sample word is "grace" (content/games/pulse/sample-01.json).
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch {
      // Storage is blocked: the panel never shows then anyway.
    }
  });
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
});

const list = (page: Page) => page.getByTestId('play-status');
const row = (page: Page, game: string) => page.getByTestId(`play-status-${game}`);

for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test.describe(`at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: size });

    test('every game shows "not started" in words and a symbol, with 44 px targets and no sideways scroll', async ({ page }) => {
      await page.goto('/play');
      await expect(list(page).getByRole('heading', { name: 'today' })).toBeVisible();
      for (const [game, name] of [['vialo', 'vialo'], ['triage', 'sudoku'], ['cueword', 'crossword'], ['suture', 'word path']]) {
        await expect(row(page, game)).toHaveAttribute('data-status', 'not-started');
        await expect(row(page, game)).toContainText(name);
        await expect(row(page, game)).toContainText('○');
        await expect(row(page, game)).toContainText('not started');
        const box = await row(page, game).getByRole('link').boundingBox();
        // Each card opens the game's own page (2026-11-17).
        await expect(row(page, game).getByRole('link')).toHaveAttribute('href', { vialo: '/play/vialo', triage: '/play/sudoku', cueword: '/play/crossword', suture: '/play/word-path' }[game]!);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      // Stats are always kept (2026-11-17), so the "turn on stats" note is gone; it shows only where storage is blocked.
      await expect(page.getByTestId('play-status-note')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    test('a result kept in the stats record shows as done, and the stats note goes away', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('cueory-game-stats', JSON.stringify({
          version: 1,
          results: [
            { game: 'cueword', day: '2026-11-01', solved: true, tries: 0 },
            { game: 'suture', day: '2026-10-31', solved: true, tries: 0 },
          ],
        }));
      });
      await page.goto('/play');
      await expect(row(page, 'cueword')).toHaveAttribute('data-status', 'done');
      await expect(row(page, 'cueword')).toContainText('✓');
      await expect(row(page, 'cueword')).toContainText('done');
      // Yesterday's result doesn't count for today.
      await expect(row(page, 'suture')).toHaveAttribute('data-status', 'not-started');
      await expect(page.getByTestId('play-status-note')).toHaveCount(0);
    });

    test('a suture result kept in the stats record, with no word counts saved, shows plain done (never an assumed count)', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('cueory-game-stats', JSON.stringify({
          version: 1,
          results: [
            { game: 'suture', day: '2026-11-01', solved: true, tries: 0 },
          ],
        }));
      });
      await page.goto('/play');
      await expect(row(page, 'suture')).toHaveAttribute('data-status', 'done');
      await expect(row(page, 'suture')).toContainText('✓');
      await expect(row(page, 'suture')).toContainText('done');
      await expect(row(page, 'suture')).not.toContainText('of 6 words');
    });
  });
}

test('a started round shows in progress, and vialo finished on its own page shows done back on /play', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/play');
  await expect(row(page, 'vialo')).toHaveAttribute('data-status', 'not-started');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cueory:game-progress', { detail: { game: 'suture', day: '2026-11-01' } })));
  await expect(row(page, 'suture')).toHaveAttribute('data-status', 'in-progress');
  await expect(row(page, 'suture')).toContainText('◐');
  await expect(row(page, 'suture')).toContainText('in progress');
  // Each game is on its own page (2026-11-17): with stats kept, a finished game is still marked when you come back.
  // Stats are always kept (2026-11-17): there is no switch to turn on.
  await expect(page.getByTestId('game-stats').getByRole('switch')).toHaveCount(0);
  await row(page, 'vialo').getByRole('link').click();
  await expect(page).toHaveURL(/\/play\/vialo$/);
  const field = page.getByLabel('your guess', { exact: true });
  await field.fill('grace');
  await field.press('Enter');
  await expect(page.getByTestId('vialo-result')).toContainText('solved.');
  await page.getByTestId('game-result-dialog').getByRole('button', { name: 'close results' }).click();
  await page.getByRole('link', { name: 'all games' }).click();
  await expect(row(page, 'vialo')).toHaveAttribute('data-status', 'done');
});

test('each card opens its game by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/play');
  const link = row(page, 'triage').getByRole('link');
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/play\/sudoku$/);
  await expect(page.getByTestId('sudoku')).toBeVisible();
});

test('old links to a game\'s section of /play go on to its own page', async ({ page }) => {
  for (const [hash, path] of [['#vialo-heading', '/play/vialo'], ['#pulse-heading', '/play/vialo'], ['#triage-heading', '/play/sudoku'], ['#sudoku-heading', '/play/sudoku'], ['#crossword-heading', '/play/crossword'], ['#word-path-heading', '/play/word-path']]) {
    await page.goto('/play' + hash);
    await expect(page).toHaveURL(new RegExp(path.replaceAll('/', '\\/') + '$'));
  }
  // Any other hash stays on the hub.
  await page.goto('/play#stats-heading');
  await expect(page.getByRole('heading', { level: 1, name: 'daily games' })).toBeVisible();
  await expect(page).toHaveURL(/\/play#stats-heading$/);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('no status shows, so none can be wrong, and each game is still a plain link', async ({ page }) => {
    await page.goto('/play');
    await expect(page.getByRole('heading', { level: 1, name: 'daily games' })).toBeVisible();
    await expect(list(page)).toHaveCount(0);
    for (const name of ['vialo', 'sudoku', 'crossword', 'word path']) {
      await expect(page.getByTestId('play-links').getByRole('link', { name, exact: true })).toBeVisible();
    }
  });
});
