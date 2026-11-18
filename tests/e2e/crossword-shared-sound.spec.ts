import { expect, test, type Page } from '@playwright/test';

// The shared "game sounds" switch (#734) silences the crossword's solve sound too (lane8/settings-crossword). The
// browser's AudioContext is replaced with a counter, so the test hears nothing and counts each tone. Easy November sample.

const SAMPLE = ['.ABC.', 'DEFGH', 'IJKLM', 'NOPQR', '.STU.'];
const board = (page: Page) => page.getByTestId('cueword');
const square = (page: Page, row: number, column: number) =>
  board(page).getByRole('button', { name: new RegExp('^(?:\\d+, )?row ' + row + ', column ' + column + ',') });

async function solve(page: Page) {
  for (const [row, letters] of SAMPLE.entries()) {
    for (const [column, letter] of [...letters].entries()) {
      if (letter === '.') continue;
      await square(page, row + 1, column + 1).click();
      await page.keyboard.type(letter);
    }
  }
  await expect(board(page).getByTestId('cueword-result')).toBeVisible();
}

const tones = (page: Page) => page.evaluate(() => (window as unknown as { tones: number }).tones);

for (const shared of [true, false]) {
  test(`with game sounds ${shared ? 'on' : 'off'}, a solve ${shared ? 'plays a' : 'plays no'} tone`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
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
    await page.goto('/play/crossword');
    await expect(board(page)).toBeVisible();
    await solve(page);
    expect(await tones(page)).toBe(shared ? 1 : 0);
  });
}
