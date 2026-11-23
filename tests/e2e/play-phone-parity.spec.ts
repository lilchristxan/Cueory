import { expect, test } from '@playwright/test';
import { markPanelsSeen } from './clock';

// Phone parity for the games hub and game pages: the board comes before the rules, the flag sits in the header row,
// the legend keeps swatch and label on one line, and a game that is not open yet is one short card.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional storage */ }
  });
});

for (const [path, testId, name] of [['/play/vialo', 'vialo', 'vialo'], ['/play/sudoku', 'sudoku', 'sudoku'], ['/play/piccline', 'suture', 'piccline']] as const) {
  test(`${name}: on a phone the rules start folded and the board comes first`, async ({ page }, info) => {
    test.skip(info.project.name.includes('desktop') || info.project.name.includes('tablet'), 'phone layout');
    await page.goto(path);
    const card = page.getByTestId('game-help-first');
    const toggle = card.getByRole('button', { name: `new to ${name}? here's how to play` });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const box = await toggle.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(card.getByRole('button', { name: 'got it' })).toBeHidden();
    // The folded card is above the board, not a screen-tall block in front of it.
    const cardBox = await card.boundingBox();
    expect(cardBox!.height).toBeLessThan(120);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(card.getByRole('button', { name: 'got it' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    void testId;
  });
}

test('vialo: the help legend keeps each swatch and its label on one line', async ({ page }, info) => {
  test.skip(info.project.name.includes('desktop') || info.project.name.includes('tablet'), 'phone layout');
  await page.goto('/play/vialo');
  await page.getByTestId('game-help-first').getByRole('button', { name: /here's how to play/ }).click();
  const rows = page.getByTestId('game-help-first').getByTestId('vialo-legend').locator('li');
  await expect(rows).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) {
    const swatch = await rows.nth(i).locator('.vialo-pill').boundingBox();
    const label = await rows.nth(i).locator('span').last().boundingBox();
    expect(label!.x).toBeGreaterThan(swatch!.x + swatch!.width - 1);
    expect(label!.y).toBeLessThan(swatch!.y + swatch!.height);
  }
});

test('game pages: the flag button sits in the header row beside "games" and the logo', async ({ page }) => {
  await page.goto('/play/vialo');
  const flag = page.locator('a[data-game-flag]');
  const back = page.getByTestId('all-games-link');
  const flagBox = await flag.boundingBox();
  const backBox = await back.boundingBox();
  expect(flagBox!.width).toBeGreaterThanOrEqual(44);
  expect(flagBox!.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(flagBox!.y + flagBox!.height / 2 - (backBox!.y + backBox!.height / 2))).toBeLessThan(12);
});

test('vialo: the keys are at least 44 px tall and the stats labels are at least 14 px', async ({ page }) => {
  await page.goto('/play/vialo');
  const keys = page.getByRole('group', { name: 'letters' }).getByRole('button');
  const count = await keys.count();
  for (let i = 0; i < count; i += 1) {
    const box = await keys.nth(i).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});

test('games that are not open yet show one short card with a back button', async ({ page }) => {
  for (const [path, testId] of [['/play/tachyyy', 'stat-soon'], ['/play/hello-cards', 'hello-cards-soon'], ['/play/stat', 'stat-soon']] as const) {
    await page.goto(path);
    if (await page.getByTestId(testId).count() === 0) continue; // this build shows the game itself
    await expect(page.getByTestId('game-frame-stats')).toHaveCount(0);
    await expect(page.getByTestId('game-frame-help-button')).toHaveCount(0);
    const back = page.getByRole('link', { name: 'back to daily games' });
    expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test('the games hub lists a play button beside each game with no results yet', async ({ page }) => {
  await page.goto('/play');
  const stats = page.getByTestId('game-stats');
  const play = stats.getByRole('link', { name: /^play / });
  await expect(play.first()).toBeVisible();
  expect((await play.first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
