import { expect, test } from '@playwright/test';
import { markPanelsSeen } from './clock';

const game = (page: import('@playwright/test').Page) => page.getByTestId('sudoku');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
      localStorage.setItem('cueory-game-help-seen', JSON.stringify(['triage']));
    } catch { /* optional browser storage */ }
  });
  await markPanelsSeen(page);
});

test('framed Sudoku has one difficulty picker, pauses it, and keeps the picker synchronized', async ({ page }) => {
  await page.goto('/play/sudoku');
  await expect(game(page).getByRole('gridcell')).toHaveCount(81);
  const picker = page.getByTestId('game-frame-sudoku-difficulty');
  await expect(picker).toHaveValue('easy');
  await picker.selectOption('hard');
  await expect(picker).toHaveValue('hard');

  await game(page).getByRole('button', { name: 'pause puzzle' }).click();
  await expect(picker).toBeDisabled();
  await expect(picker).toHaveValue('hard');
  await game(page).getByRole('button', { name: 'resume puzzle' }).click();
  await expect(picker).toBeEnabled();
  await picker.selectOption('medium');
  await expect(picker).toHaveValue('medium');
});

test('the board adopts the last difficulty selected before it loads', async ({ page }) => {
  const moduleUrl = '**/SudokuGame.*.js';
  let releaseBoard!: () => void;
  const ready = new Promise<void>(resolve => { releaseBoard = resolve; });
  await page.route(moduleUrl, async route => {
    await ready;
    await route.continue();
  });
  const picker = page.getByTestId('game-frame-sudoku-difficulty');
  try {
    await Promise.all([
      page.waitForRequest(moduleUrl),
      page.goto('/play/sudoku', { waitUntil: 'commit' }),
    ]);
    await expect(game(page)).toHaveCount(0);
    await picker.selectOption('hard');
    await picker.selectOption('medium');
  } finally {
    releaseBoard();
  }
  await expect(game(page).getByTestId('sudoku-live')).toHaveText(/^medium puzzle ready\./);
  await expect(picker).toHaveValue('medium');
});

test('paused Sudoku prevents auto-cue setting changes until resume', async ({ page }) => {
  await page.goto('/play/sudoku');
  await expect(game(page).getByRole('gridcell')).toHaveCount(81);
  const gear = page.getByTestId('game-frame-gear');
  await game(page).getByRole('button', { name: 'pause puzzle' }).click();
  await gear.click();
  const settings = page.getByRole('dialog', { name: 'sudoku settings' });
  const auto = settings.getByRole('checkbox', { name: 'start in auto pencil mode' });
  await expect(auto).toBeDisabled();
  await page.keyboard.press('Escape');
  await game(page).getByRole('button', { name: 'resume puzzle' }).click();
  await gear.click();
  const resumedSettings = page.getByRole('dialog', { name: 'sudoku settings' });
  const resumedAuto = resumedSettings.getByRole('checkbox', { name: 'start in auto pencil mode' });
  await expect(resumedAuto).toBeEnabled();
  const before = await resumedAuto.isChecked();
  await resumedAuto.setChecked(!before);
  await expect(resumedAuto).toBeChecked({ checked: !before });
});

test('framed Sudoku settings returns focus to the shared gear without duplicate controls', async ({ page }) => {
  await page.goto('/play/sudoku');
  await expect(game(page).getByRole('gridcell')).toHaveCount(81);
  await expect(page.getByTestId('game-frame-gear')).toHaveCount(1);
  await expect(game(page).getByRole('button', { name: 'sudoku settings' })).toHaveCount(0);
  const gear = page.getByTestId('game-frame-gear');
  await gear.click();
  await expect(page.getByRole('dialog', { name: 'sudoku settings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'sudoku settings' })).toHaveCount(0);
  await expect(gear).toBeFocused();
});

test('framed Sudoku keeps per-level stats and forget-all in the shared settings dialog', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cueory-game-stats', JSON.stringify({ version: 1, results: [] }));
    localStorage.setItem('cueory-sudoku-stats', JSON.stringify({ version: 1, solves: [
      { level: 'easy', day: '2026-11-22', seconds: 61 },
      { level: 'hard', day: '2026-11-21', seconds: 121 },
    ] }));
  });
  await page.goto('/play/sudoku');
  await page.getByTestId('game-frame-gear').click();
  const settings = page.getByRole('dialog', { name: 'sudoku settings' });
  await expect(settings.getByTestId('sudoku-stats')).toBeVisible();
  await expect(settings.getByTestId('sudoku-stats')).toContainText('easy');
  await expect(settings.getByTestId('sudoku-stats')).toContainText('01:01');
  await expect(settings.getByRole('button', { name: 'forget sudoku stats' })).toBeVisible();
  await expect(settings.getByRole('button', { name: 'forget all my stats' })).toBeVisible();
});

test('framed Sudoku refreshes per-level stats when settings reopens', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cueory-game-stats', JSON.stringify({ version: 1, results: [] }));
    localStorage.setItem('cueory-sudoku-stats', JSON.stringify({ version: 1, solves: [
      { level: 'easy', day: '2026-11-22', seconds: 61 },
    ] }));
  });
  await page.goto('/play/sudoku');
  const gear = page.getByTestId('game-frame-gear');
  await gear.click();
  const settings = page.getByRole('dialog', { name: 'sudoku settings' });
  await expect(settings.getByTestId('sudoku-stats')).toContainText('01:01');
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);

  await page.evaluate(() => {
    localStorage.setItem('cueory-sudoku-stats', JSON.stringify({ version: 1, solves: [
      { level: 'medium', day: '2026-11-22', seconds: 122 },
    ] }));
  });
  await gear.click();
  await expect(settings.getByTestId('sudoku-stats')).toContainText('02:02');
  await expect(settings.getByTestId('sudoku-stats')).not.toContainText('01:01');
});

for (const [width, height] of [[390, 844], [820, 1180], [1440, 900]] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`framed Sudoku controls fit at ${width}px (${colorScheme})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme });
      await page.goto('/play/sudoku');
      await expect(game(page).getByRole('gridcell')).toHaveCount(81);
      const controls = page.locator('[data-testid="game-frame-gear"], [data-testid="game-frame-help-button"], [data-testid="game-frame-sudoku-difficulty"]');
      for (const box of await controls.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()))) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}
