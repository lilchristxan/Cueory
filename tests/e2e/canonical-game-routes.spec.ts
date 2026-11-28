import { expect, test } from '@playwright/test';
import { markGameRulesSeen } from './clock';

test.beforeEach(async ({ page }) => { await markGameRulesSeen(page); });

const games = [
  { path: '/play/tachyyy', name: /^tachyyy/, root: 'stat-start' },
  { path: '/play/piccline', name: /^piccline/, root: 'suture' },
] as const;

for (const game of games) {
  test(`the canonical ${game.path} route renders its branded game`, async ({ page }) => {
    await page.goto(game.path);

    await expect(page).toHaveURL(new RegExp(`${game.path}/?$`));
    await expect(page.getByRole('heading', { level: 1, name: game.name })).toBeVisible();
    await expect(page.getByTestId(game.root)).toBeVisible();
  });
}
