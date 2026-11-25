import { expect, test } from '@playwright/test';
import { fixClock } from './clock';

/**
 * The daily piccline plays board-format puzzles only. 24 November 2026 used to land on the older 11 by 11 word search
 * (the sixth sample, every sixth day); it must show the 6 by 8 board with its submit, clear and cue controls.
 */
test('piccline on 24 November 2026 shows the 6 by 8 board with submit and cue controls', async ({ page }) => {
  await fixClock(page, new Date('2026-11-24T15:00:00'));
  await page.goto('/play/piccline');
  const game = page.getByTestId('suture');
  await expect(game).toBeVisible();
  await expect(game).toHaveAttribute('data-format', 'path');
  await expect(game.getByRole('row')).toHaveCount(8);
  await expect(game.getByRole('gridcell')).toHaveCount(48);
  for (const name of ['submit', 'clear', 'cue']) await expect(game.getByRole('button', { name })).toBeVisible();
  await expect(page.getByTestId('suture-count')).toHaveText(/^0 of \d+ found$/);
});
