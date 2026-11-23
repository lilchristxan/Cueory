import { expect, test } from '@playwright/test';
import { markPanelsSeen } from './clock';

// Phone parity for the games hub and game pages: the flag sits in the header row, the legend keeps swatch and label on
// one line, and a game that is not open yet is one short card. (The first-visit rules card is unchanged here; the
// Games v2 frame replaces it with the "?" steps.)

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional storage */ }
  });
});

test('vialo: the help legend keeps each swatch and its label on one line', async ({ page }, info) => {
  test.skip(info.project.name.includes('desktop') || info.project.name.includes('tablet'), 'phone layout');
  await page.goto('/play/vialo');
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

// The keys are a three-row keyboard now (Christian, 23 Nov 2026). On a phone a letter key may be at least 32 px wide
// and 52 px tall, as phone keyboards are (his approved exception, D-pending); everywhere else keys keep 44 px.
// tests/e2e/vialo-keys.spec.ts checks the layout, the gaps and the marks.
test('vialo: every key is a comfortable target for its screen', async ({ page }, info) => {
  await page.goto('/play/vialo');
  const keys = page.getByRole('group', { name: 'letters' }).getByRole('button');
  // Wait for the whole keyboard (26 letters, enter and delete), so the loop below can never run over nothing.
  await expect(keys).toHaveCount(28);
  const phone = info.project.name.includes('phone');
  for (let i = 0; i < 28; i += 1) {
    const key = keys.nth(i);
    const box = await key.boundingBox();
    const wide = await key.evaluate((node) => node.classList.contains('vialo-key-wide'));
    expect(box!.height).toBeGreaterThanOrEqual(phone ? 52 : 44);
    expect(box!.width).toBeGreaterThanOrEqual(phone && !wide ? 32 : 44);
  }
});

test('sudoku: the four stats labels beside the board are at least 14 px on a phone and a tablet', async ({ page }, info) => {
  test.skip(info.project.name.includes('desktop'), 'phone and tablet layout; the desktop sidebar keeps its own size');
  await page.goto('/play/sudoku');
  const labels = page.getByTestId('game-frame-stats').locator('.game-frame-stat-label');
  await expect(labels).toHaveCount(4);
  for (let i = 0; i < 4; i += 1) {
    await expect(labels.nth(i)).toBeVisible();
    const size = await labels.nth(i).evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
    expect(size).toBeGreaterThanOrEqual(14);
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
