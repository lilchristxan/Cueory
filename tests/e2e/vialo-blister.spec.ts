import { expect, test } from '@playwright/test';
import { fixClock } from './clock';

test('the Vialo blister artwork carries the live pills and their spoken marks', async ({ page }) => {
  await fixClock(page, new Date('2026-11-01T15:00:00'));
  const artwork = page.waitForResponse((response) => new URL(response.url()).pathname === '/design/pillo-blister-board.webp');
  await page.goto('/play/wordpill');
  const pack = page.locator('.vialo-pack');
  await expect(pack).toBeVisible();
  expect((await artwork).ok()).toBe(true);
  await expect(pack.locator('.vialo-pocket')).toHaveCount(30);

  // Every live cell stays at the centre of its photographed well as the board scales.
  const geometry = await pack.evaluate((board) => {
    const art = board.getBoundingClientRect();
    const pills = [...board.querySelectorAll('.vialo-pocket .vialo-pill')].map((pill) => {
      const box = pill.getBoundingClientRect();
      return [(box.x + box.width / 2 - art.x) / art.width, (box.y + box.height / 2 - art.y) / art.height, box.width / art.width, box.height / art.height];
    });
    return { ratio: art.width / art.height, pills };
  });
  expect(geometry.ratio).toBeCloseTo(1230 / 1180, 2);
  for (const [i, [x, y, width, height]] of geometry.pills.entries()) {
    expect(x).toBeCloseTo((167 + 224 * (i % 5)) / 1230, 2);
    expect(y).toBeCloseTo(0.123 + 0.144 * Math.floor(i / 5), 2);
    expect(width).toBeCloseTo(0.132, 2);
    expect(height).toBeCloseTo(0.092, 2);
  }

  const guess = pack.getByLabel('your guess', { exact: true });
  await guess.fill('crane');
  await expect(pack.locator('.vialo-typed')).toHaveCount(5);
  await expect(pack.locator('.vialo-typed').first()).toHaveCSS('box-shadow', /inset/);
  await guess.press('Enter');
  const committed = pack.getByRole('listitem');
  await expect(committed).toHaveAccessibleName(/^guess 1: crane\./);
  await expect(committed.locator('.vialo-letter')).toHaveText([...'crane']);
  const pockets = committed.locator('.vialo-pill');
  await expect(pockets).toHaveClass(['elsewhere', 'here', 'here', 'absent', 'here'].map((mark) => `vialo-pill vialo-${mark}`));
  await expect(pockets).toHaveText([...'crane']);
  await expect(pockets.first()).toHaveCSS('font-family', /^"?Times New Roman"?,/);
  await expect(pockets.nth(0)).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(pockets.nth(1)).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(pockets.nth(3)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(pockets.nth(3)).toHaveCSS('color', 'rgb(107, 82, 67)');
  await expect(committed.locator('.vialo-here').first()).toHaveCSS('background-image', /gradient/);
  await expect(committed.locator('.vialo-elsewhere').first()).toHaveCSS('box-shadow', /inset/);
  await expect(committed.locator('.vialo-absent').first()).toHaveCSS('background-image', 'none');

  // Colour is never the only signal: in normal mode "elsewhere" (red) carries a thin light inner ring, "in place"
  // (green) and "not in the word" (white) carry none, and no mark of any kind is drawn under a letter.
  const after = await pockets.evaluateAll((pills) =>
    pills.map((pill) => {
      const style = getComputedStyle(pill, '::after');
      return { content: style.content, ring: style.borderTopWidth, position: style.position, letterShift: getComputedStyle(pill.querySelector('.vialo-letter')!).transform };
    }),
  );
  expect(after.map((a) => a.content !== 'none' && a.content !== 'normal')).toEqual([true, false, false, false, false]);
  expect(after[0]).toMatchObject({ content: '""', ring: '2px', position: 'absolute' });
  // Letters sit centred in the pill: nothing was lifted to make room for a mark.
  for (const a of after) expect(a.letterShift).toBe('none');
  expect(await committed.locator('.vialo-pill').evaluateAll((pills) => pills.map((p) => p.textContent))).toEqual([...'crane']);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await committed.locator('.vialo-here').first().evaluate((pill) => getComputedStyle(pill, '::before').animationName)).toBe('none');
});

test('Vialo preserves three distinct result outlines when both contrast settings are active', async ({ page }) => {
  await fixClock(page, new Date('2026-11-01T15:00:00'));
  await page.emulateMedia({ forcedColors: 'active' });
  await page.addInitScript(() => {
    localStorage.setItem('cueory-game-settings', JSON.stringify({ highContrast: true }));
  });
  await page.goto('/play/wordpill');
  const game = page.getByTestId('vialo');
  await expect(game).toHaveClass(/vialo-contrast/);
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
  const guess = game.getByLabel('your guess', { exact: true });
  await guess.fill('crane');
  await guess.press('Enter');
  const committed = game.getByRole('list', { name: 'your guesses' }).getByRole('listitem');
  for (const [finish, outline] of [['here', 'solid'], ['elsewhere', 'double'], ['absent', 'dashed']]) {
    await expect(committed.locator('.vialo-' + finish).first()).toHaveCSS('border-top-style', outline);
  }
});
