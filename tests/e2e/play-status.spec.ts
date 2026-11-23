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
const words = (page: Page, game: string) => row(page, game).getByTestId('play-status-words');

const RESULTS = (results: unknown[]) => (page: Page) =>
  page.addInitScript((value) => localStorage.setItem('cueory-game-stats', JSON.stringify({ version: 1, results: value })), results);

for (const size of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1440, height: 900 }]) {
  test.describe(`at ${size.width} × ${size.height}`, () => {
    test.use({ viewport: size });

    test('open games say "new today" with a 44 px play button, and nothing scrolls sideways', async ({ page }) => {
      await page.goto('/play');
      await expect(list(page).getByRole('heading', { name: 'today' })).toBeAttached();
      for (const [game, name, href] of [['pulse', 'vialo', '/play/vialo'], ['triage', 'sudoku', '/play/sudoku'], ['suture', 'piccline', '/play/piccline']]) {
        await expect(row(page, game)).toHaveAttribute('data-status', 'not-started');
        await expect(words(page, game)).toHaveText('new today');
        const link = row(page, game).getByRole('link');
        await expect(link).toHaveText('play');
        await expect(link).toHaveAttribute('href', href);
        await expect(link).toHaveAttribute('aria-label', `play ${name}`);
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await expect(page.getByTestId('play-status-note')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    test('a finished game shows "played" and an outlined result button; yesterday does not count', async ({ page }) => {
      await RESULTS([
        { game: 'pulse', day: '2026-11-01', solved: true, tries: 4 },
        { game: 'triage', day: '2026-11-01', solved: false, tries: 2 },
        { game: 'suture', day: '2026-10-31', solved: true, tries: 0 },
      ])(page);
      await page.goto('/play');
      await expect(row(page, 'pulse')).toHaveAttribute('data-status', 'done');
      await expect(words(page, 'pulse')).toHaveText('played · solved in 4');
      await expect(row(page, 'pulse').getByRole('link')).toHaveText('result');
      await expect(words(page, 'triage')).toHaveText('played · not solved');
      await expect(words(page, 'suture')).toHaveText('new today');
      await expect(row(page, 'suture').getByRole('link')).toHaveText('play');
    });

    test('the four totals read what this browser kept, and are dashes until then', async ({ page }) => {
      await RESULTS([
        { game: 'pulse', day: '2026-11-01', solved: true, tries: 4 },
        { game: 'pulse', day: '2026-10-31', solved: true, tries: 3 },
        { game: 'triage', day: '2026-10-31', solved: false, tries: 2 },
        { game: 'suture', day: '2026-10-29', solved: true, tries: 0 },
      ])(page);
      await page.goto('/play');
      await expect(page.getByTestId('play-total-played')).toHaveText('4');
      await expect(page.getByTestId('play-total-solved')).toHaveText('75%');
      await expect(page.getByTestId('play-total-day-streak')).toHaveText('2');
      await expect(page.getByTestId('play-total-best-streak')).toHaveText('2');
    });
  });
}

test('totals show dashes, not zeros, when nothing is kept yet', async ({ page }) => {
  await page.goto('/play');
  await expect(page.getByTestId('play-total-played')).toHaveText('0');
  await expect(page.getByTestId('play-total-solved')).toHaveText('–');
});

test('a game closed in this build says "coming soon" with no button and no link', async ({ page }) => {
  await page.goto('/play');
  for (const game of ['cueword', 'tachyyy', 'hello-cards']) {
    const card = row(page, game);
    if (!(await card.getAttribute('data-closed'))) continue; // this build shows the game itself
    await expect(words(page, game)).toHaveText('coming soon');
    await expect(card.getByRole('link')).toHaveCount(0);
  }
});

test('a started round shows in progress, and vialo finished on its own page shows played back on /play', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/play');
  await expect(row(page, 'pulse')).toHaveAttribute('data-status', 'not-started');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cueory:game-progress', { detail: { game: 'suture', day: '2026-11-01' } })));
  await expect(row(page, 'suture')).toHaveAttribute('data-status', 'in-progress');
  await expect(words(page, 'suture')).toHaveText('in progress');
  await expect(row(page, 'suture').getByRole('link')).toHaveText('play');
  await row(page, 'pulse').getByRole('link').click();
  await expect(page).toHaveURL(/\/play\/vialo$/);
  const field = page.getByLabel('your guess', { exact: true });
  await field.fill('grace');
  await field.press('Enter');
  await expect(page.getByTestId('vialo-result')).toContainText('solved.');
  await page.getByTestId('game-result-dialog').getByRole('button', { name: 'close results' }).click();
  await page.getByRole('link', { name: 'all games' }).click();
  await expect(row(page, 'pulse')).toHaveAttribute('data-status', 'done');
  await expect(row(page, 'pulse').getByRole('link')).toHaveText('result');
});

test('a browser that cannot save shows no totals and every open game as play', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  await page.goto('/play');
  await expect(page.getByTestId('play-total-played')).toHaveCount(0);
  await expect(words(page, 'pulse')).toHaveText('new today');
  await expect(row(page, 'pulse').getByRole('link')).toHaveText('play');
  await expect(page.getByTestId('play-status-note')).toBeVisible();
});

test('each row opens its game by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/play');
  const link = row(page, 'triage').getByRole('link');
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/play\/sudoku$/);
  await expect(page.getByTestId('sudoku')).toBeVisible();
});

test('old links to a game\'s section of /play go on to its own page', async ({ page }) => {
  for (const [hash, path] of [['#vialo-heading', '/play/vialo'], ['#pulse-heading', '/play/vialo'], ['#triage-heading', '/play/sudoku'], ['#sudoku-heading', '/play/sudoku'], ['#crossword-heading', '/play/crossword'], ['#piccline-heading', '/play/piccline']]) {
    await page.goto('/play' + hash);
    await expect(page).toHaveURL(new RegExp(path.replaceAll('/', '\\/') + '$'));
  }
  // Any other hash stays on the hub.
  await page.goto('/play#stats-heading');
  await expect(page.getByRole('heading', { level: 1, name: 'six games, new every day.' })).toBeVisible();
  await expect(page).toHaveURL(/\/play#stats-heading$/);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the rows are on the page with a dash for each status, and each open game is a plain link', async ({ page }) => {
    await page.goto('/play');
    await expect(page.getByRole('heading', { level: 1, name: 'six games, new every day.' })).toBeVisible();
    await expect(list(page)).toHaveCount(1);
    await expect(words(page, 'pulse')).toHaveText('–');
    for (const path of ['/play/vialo', '/play/sudoku', '/play/piccline']) {
      const link = list(page).locator(`a[href="${path}"]`);
      await expect(link).toHaveText('play');
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
