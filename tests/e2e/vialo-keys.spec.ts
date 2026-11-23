import { expect, test } from '@playwright/test';
import { fixClock } from './clock';

test.beforeEach(async ({ page }) => {
  await fixClock(page, new Date('2026-11-01T15:00:00'));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-game-help-seen', JSON.stringify(['vialo']));
    } catch {
      // If storage is unavailable, the game still provides its visible help control.
    }
  });
  await page.goto('/play/vialo');
  await expect(page.getByTestId('vialo')).toBeVisible();
});

test('vialo virtual keys keep 44px targets and can type, delete, and submit a committed guess', async ({ page }) => {
  const vialo = page.getByTestId('vialo');
  const keys = vialo.getByRole('group', { name: 'letters' });
  const buttons = keys.getByRole('button');

  await expect(buttons).toHaveCount(28);
  for (const box of await buttons.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()))) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  const guess = vialo.getByLabel('your guess', { exact: true });
  await keys.getByRole('button', { name: 'x', exact: true }).click();
  await expect(guess).toHaveValue('x');
  await keys.getByRole('button', { name: 'delete', exact: true }).click();
  await expect(guess).toHaveValue('');

  for (const letter of 'crane') await keys.getByRole('button', { name: letter, exact: true }).click();
  await expect(guess).toHaveValue('crane');
  await keys.getByRole('button', { name: 'enter', exact: true }).click();
  await expect(vialo.getByRole('list', { name: 'your guesses' }).getByRole('listitem')).toHaveAccessibleName(/^guess 1: crane\./);
});
