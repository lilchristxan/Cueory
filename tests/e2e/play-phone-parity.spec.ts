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

for (const [path, name] of [['/play/vialo', 'vialo'], ['/play/sudoku', 'sudoku'], ['/play/piccline', 'piccline']] as const) {
  test(`${name}: on a phone there is no rules card in front of the board, and the board is in the first screen`, async ({ page }, info) => {
    test.skip(info.project.name.includes('desktop') || info.project.name.includes('tablet'), 'phone layout');
    await page.goto(path);
    await expect(page.getByTestId('game-help-first')).toHaveCount(0);
    const help = page.getByRole('button', { name: `how to play ${name}` });
    await expect(help).toBeVisible();
    const box = await help.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('vialo: the help legend keeps each swatch and its label on one line', async ({ page }, info) => {
  test.skip(info.project.name.includes('desktop') || info.project.name.includes('tablet'), 'phone layout');
  await page.goto('/play/vialo');
  await page.getByRole('button', { name: 'how to play vialo' }).click();
  const rows = page.getByTestId('game-help').getByTestId('vialo-legend').locator('li');
  await expect(rows).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) {
    const swatch = await rows.nth(i).locator('.vialo-pill').boundingBox();
    const label = await rows.nth(i).locator('span').last().boundingBox();
    expect(label!.x).toBeGreaterThan(swatch!.x + swatch!.width - 1);
    expect(label!.y).toBeLessThan(swatch!.y + swatch!.height);
  }
});

test('game pages: the flag button sits in the frame header with "games" and the logo, and the logo keeps its width', async ({ page }, info) => {
  await page.goto('/play/vialo');
  const flag = page.locator('a[data-game-flag]');
  const back = page.getByTestId('all-games-link');
  const logo = page.locator('.game-frame-logo-wrap');
  const flagBox = (await flag.boundingBox())!;
  const backBox = (await back.boundingBox())!;
  const logoBox = (await logo.boundingBox())!;
  expect(flagBox.width).toBeGreaterThanOrEqual(44);
  expect(flagBox.height).toBeGreaterThanOrEqual(44);
  expect(backBox.width).toBeGreaterThanOrEqual(44);
  // The cueory logo is never squeezed under its drawn width (96 px) by its neighbours.
  expect((await logo.locator('img:visible').boundingBox())!.width).toBeGreaterThanOrEqual(96);
  const centre = (box: { y: number; height: number }) => box.y + box.height / 2;
  // "games" and the logo always share a line.
  expect(Math.abs(centre(logoBox) - centre(backBox))).toBeLessThan(12);
  expect(logoBox.x).toBeGreaterThanOrEqual(backBox.x + backBox.width - 1);
  if (info.project.name.includes('desktop')) {
    // The desktop sidebar is too narrow for all three at full size, so the flag takes the next line, inside the sidebar.
    expect(flagBox.y).toBeGreaterThanOrEqual(backBox.y + backBox.height - 1);
    const sidebar = (await page.locator('.game-frame-sidebar').boundingBox())!;
    expect(flagBox.x).toBeGreaterThanOrEqual(sidebar.x);
    expect(flagBox.x + flagBox.width).toBeLessThanOrEqual(sidebar.x + sidebar.width);
  } else {
    // Phones and tablets (Games v2 frame): one row, "games", the logo, then the flag at the right, nothing overlapping.
    expect(Math.abs(centre(flagBox) - centre(backBox))).toBeLessThan(12);
    expect(flagBox.x).toBeGreaterThanOrEqual(logoBox.x + logoBox.width - 1);
  }
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

test('sudoku: a signed-out visitor sees no stats block beside the board (the signed-in 14 px label size is checked in game-stats-gate.spec.ts)', async ({ page }, info) => {
  test.skip(info.project.name.includes('desktop'), 'phone and tablet layout; the desktop sidebar keeps its own size');
  await page.goto('/play/sudoku');
  await expect(page.locator('astro-island[component-url*="GameFrameStats"]:not([ssr])')).toHaveCount(1);
  await expect(page.getByTestId('game-frame-stats')).toHaveCount(0);
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
