import { expect, test } from '@playwright/test';
import { markPanelsSeen } from './clock';

/**
 * Word path tap interaction test at phone viewport (390 × 844).
 * On the word-path search format (2026-11-06), tapping the start cell selects it (aria-selected="true"),
 * and tapping the end cell completes and finds the word.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch {
      // Storage is blocked
    }
  });
  // Set fixed time to 6 November 2026 to load sample-06 ("study break")
  await page.clock.setFixedTime(new Date('2026-11-06T15:00:00'));
  await markPanelsSeen(page);
});

test('word-path: tap two letter cells at 390x844, checking aria-selected and the found word', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/play/word-path');

  const game = page.getByTestId('suture');
  await expect(game).toBeVisible();

  // Word: "SNACK" runs horizontally from [2, 0] to [2, 4]
  const firstButton = game.locator('button[data-cell="2,0"]');
  const firstCell = firstButton.locator('xpath=..');
  const lastButton = game.locator('button[data-cell="2,4"]');

  await expect(firstButton).toBeVisible();
  await expect(firstCell).toHaveAttribute('aria-selected', 'false');

  // Tap first letter cell
  await firstButton.click();
  await expect(firstCell).toHaveAttribute('aria-selected', 'true');
  await expect(game.locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(1);

  // Tap second letter cell (word boundary)
  await lastButton.click();

  // Verify the found word
  const live = page.getByTestId('suture-live');
  await expect(live).toHaveText('found: snack, 1 of 12.');

  const wordItem = page.getByRole('list', { name: 'words to find' }).getByRole('listitem').filter({ hasText: 'snack' });
  await expect(wordItem).toContainText('(found)');
  await expect(wordItem.locator('s')).toHaveText('snack');
  await expect(page.getByTestId('suture-count')).toContainText('1 of 12 words found');

  // Check the cells now reflect the found word
  await expect(firstButton).toHaveAccessibleName(/found: snack$/);
  await expect(lastButton).toHaveAccessibleName(/found: snack$/);

  // Verify 390 px no horizontal scroll
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
