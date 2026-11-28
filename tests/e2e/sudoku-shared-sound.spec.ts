import { expect, test } from '@playwright/test';
import { dailySudokuSeed, generateSudoku } from '../../src/islands/sudoku';
import { markPanelsSeen } from './clock';

// The shared "game sounds" switch (#734) silences sudoku's solve sound too, even with sudoku's own "play sound on
// solve" on. The browser's AudioContext is replaced with a counter, so the test hears nothing and counts each tone.

const daily = generateSudoku(dailySudokuSeed('2026-11-01', 'easy'), 'easy');
const open = daily.puzzle.flatMap((digit, index) => (digit === 0 ? [index] : []));

test.use({ timezoneId: 'America/Phoenix' });

for (const shared of [true, false]) {
  test(`with game sounds ${shared ? 'on' : 'off'}, a sudoku solve ${shared ? 'plays a' : 'plays no'} tone`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-01T15:00:00-07:00'));
    await markPanelsSeen(page);
    await page.addInitScript((sound) => {
      try {
        localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
        localStorage.setItem('cueory-game-help-seen', JSON.stringify(['pulse', 'triage', 'cueword', 'suture']));
        if (!sound) localStorage.setItem('cueory-game-settings', JSON.stringify({ highContrast: false, motion: 'device', sound: false }));
      } catch { /* optional storage */ }
      const counted = window as unknown as { tones: number; AudioContext: unknown };
      counted.tones = 0;
      counted.AudioContext = class {
        constructor() { counted.tones += 1; throw new Error('no audio in tests'); }
      };
    }, shared);
    await page.goto('/play/sudoku');
    const game = page.getByTestId('sudoku');
    const cells = game.getByRole('grid', { name: 'sudoku grid' }).getByRole('gridcell');
    await expect(cells).toHaveCount(81);
    // Sudoku's own setting stays on, so only the shared switch decides.
    await page.getByTestId('game-frame-gear').click();
    await expect(page.getByRole('dialog', { name: 'sudoku settings' }).getByRole('checkbox', { name: 'play sound on solve' })).toBeChecked();
    await page.keyboard.press('Escape');
    for (const index of open) {
      await cells.nth(index).click();
      await page.keyboard.press(String(daily.solution[index]));
    }
    await expect(page.getByTestId('sudoku-result')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { tones: number }).tones)).toBe(shared ? 1 : 0);
  });
}

test('game sounds turned off in the sudoku dialog keep the solve silent even when browser storage refuses to save', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00-07:00'));
  await markPanelsSeen(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
      localStorage.setItem('cueory-game-help-seen', JSON.stringify(['pulse', 'triage', 'cueword', 'suture']));
    } catch { /* optional storage */ }
    // Saving the shared settings fails, as it does when the browser's storage is full.
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'cueory-game-settings') throw new DOMException('storage is full', 'QuotaExceededError');
      return save.call(this, key, value);
    };
    const counted = window as unknown as { tones: number; AudioContext: unknown };
    counted.tones = 0;
    // The first tap (the gear below) happens while sounds are still on, so the shared sound module makes its audio
    // context then. This stand-in therefore counts scheduled sounds (oscillators started), not contexts made.
    counted.AudioContext = class {
      state = 'running'; currentTime = 0; destination = {};
      resume() { return Promise.resolve(); }
      createGain() { return { connect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
      createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, start() { counted.tones += 1; }, stop() {} }; }
    };
  });
  await page.goto('/play/sudoku');
  const game = page.getByTestId('sudoku');
  const cells = game.getByRole('grid', { name: 'sudoku grid' }).getByRole('gridcell');
  await expect(cells).toHaveCount(81);

  await page.getByTestId('game-frame-gear').click();
  const dialog = page.getByRole('dialog', { name: 'sudoku settings' });
  const sounds = dialog.getByRole('checkbox', { name: /game sounds/ });
  await expect(sounds).toBeChecked();
  await sounds.uncheck();
  await expect(sounds).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'play sound on solve' })).toBeChecked();
  await page.keyboard.press('Escape');
  // Nothing was saved, so only the live value can silence the solve.
  expect(await page.evaluate(() => localStorage.getItem('cueory-game-settings'))).toBeNull();

  for (const index of open) {
    await cells.nth(index).click();
    await page.keyboard.press(String(daily.solution[index]));
  }
  await expect(page.getByTestId('sudoku-result')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { tones: number }).tones)).toBe(0);
});
