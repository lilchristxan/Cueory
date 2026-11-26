import { expect, test } from '@playwright/test';
import { markPanelsSeen } from './clock';

// The shared share card must take focus in every engine (Safari's engine dropped it in CI): the focus target is
// focusable, focus lands when the card opens, and opening never waits for the stickers to be drawn.

async function solve(page: import('@playwright/test').Page) {
  await page.clock.install({ time: new Date('2026-11-01T15:00:00') });
  await markPanelsSeen(page);
  await page.goto('/play/vialo');
  const field = page.getByLabel('your guess', { exact: true });
  await field.fill('grace');
  await field.press('Enter');
}

test('the card is a focusable target and takes focus when it opens', async ({ page }) => {
  await solve(page);
  const card = page.getByTestId('share-dialog');
  await expect(card).toBeFocused();
  await expect(card).toHaveAttribute('tabindex', '-1');
  await expect(card).toHaveAttribute('role', 'dialog');
  await expect(card).toHaveAttribute('aria-modal', 'true');
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await page.getByTestId('vialo-share-open').click();
  await expect(card).toBeFocused();
});

test('opening does not wait for the stickers: focus lands even when every sticker asset hangs', async ({ page }) => {
  await page.route(/\/design\/games-v2\/assets\/vialo-/, () => { /* never answered */ });
  await solve(page);
  const card = page.getByTestId('share-dialog');
  await expect(card).toBeVisible();
  await expect(card).toBeFocused();
  await expect(page.getByTestId('share-dialog-save')).toBeDisabled();
});
