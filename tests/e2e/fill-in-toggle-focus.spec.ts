import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch {
      // Storage is blocked
    }
  });
});

// Keyboard walk: after an item is answered, switching between choosing and typing leaves focus on the switch.
test('fill-in: the choose/type switch keeps keyboard focus once the item is answered', async ({ page }) => {
  await page.goto('/learn/study-skills/fill-in');
  const board = page.getByTestId('fill-in');
  const toggle = board.getByRole('button', { name: 'type instead' });

  // Before an answer, switching moves focus into the new control so typing can start at once.
  await toggle.focus();
  await page.keyboard.press('Enter');
  const input = board.getByRole('textbox', { name: 'the missing word' });
  await expect(input).toBeFocused();

  await page.keyboard.type('zzz');
  await page.keyboard.press('Enter');
  await expect(board.getByRole('button', { name: 'next' })).toBeFocused();

  // After the answer, the switch stays where the student is.
  const back = board.getByRole('button', { name: 'choose from options' });
  await back.focus();
  await page.keyboard.press('Enter');
  await expect(board.getByRole('button', { name: 'type instead' })).toBeFocused();
  await expect(board.getByRole('button', { name: 'next' })).toBeEnabled();
});
