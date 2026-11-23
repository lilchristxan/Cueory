import { expect, test } from '@playwright/test';
import { fixClock } from './clock';

test('the Vialo blister artwork carries the live pills and their spoken marks', async ({ page }) => {
  await fixClock(page, new Date('2026-11-01T15:00:00'));
  const artwork = page.waitForResponse((response) => new URL(response.url()).pathname === '/design/pillo-blister-board.webp');
  await page.goto('/play/vialo');
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
  await expect(committed.locator('.vialo-here').first()).toHaveCSS('background-image', /gradient/);
  await expect(committed.locator('.vialo-elsewhere').first()).toHaveCSS('box-shadow', /inset/);
  await expect(committed.locator('.vialo-absent').first()).toHaveCSS('background-image', 'none');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await committed.locator('.vialo-here').first().evaluate((pill) => getComputedStyle(pill, '::before').animationName)).toBe('none');
});
