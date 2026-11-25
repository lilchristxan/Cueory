import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

// tachyyy shows its board from the first moment: ring, progress and the rules card with "start" inside the board
// column, the game's wordmark in the frame, and starting changes nothing about where the board sits.

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-11T09:00:00') });
  await markPanelsSeen(page);
  await page.goto('/play/tachyyy');
  await expect(page.getByTestId('stat-start')).toBeVisible();
  await page.clock.pauseAt(new Date('2026-11-11T09:05:00'));
});

/** The box's top and left on the page itself (scroll added back), so a scroll cannot hide or fake a jump. */
async function pagePosition(page: Page, testId: string) {
  return page.getByTestId(testId).evaluate((el) => {
    const box = el.getBoundingClientRect();
    return { top: box.top + window.scrollY, left: box.left + window.scrollX, width: box.width };
  });
}

test('on arrival the title, the board, the resting ring and the rules with start are visible', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  // The game's wordmark art (Daytime or Evening, whichever the palette shows) is visible in the frame.
  const wordmark = page.locator('.game-frame-wordmark-img:visible');
  await expect(wordmark).toHaveCount(1);
  const board = page.getByTestId('stat-board');
  await expect(board).toBeVisible();
  await expect(page.getByTestId('stat-timer')).toBeVisible();
  await expect(page.getByTestId('stat-seconds')).toContainText('20');
  await expect(page.getByTestId('stat-dots').locator('li')).toHaveCount(15);
  const rules = page.getByTestId('stat-rules');
  await expect(rules).toBeVisible();
  const background = await rules.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).not.toBe('rgba(0, 0, 0, 0)');
  expect(background).not.toBe('transparent');
  const start = page.getByTestId('stat-start');
  await expect(start).toBeVisible();
  const box = (await start.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
  const inBoard = (await board.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(inBoard.x - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(inBoard.x + inBoard.width + 1);
  // No sideways scroll.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('the clock does not run before start', async ({ page }) => {
  await page.clock.runFor(30_000);
  await expect(page.getByTestId('stat-seconds')).toContainText('20');
  await expect(page.getByTestId('stat-start')).toBeVisible();
  await expect(page.getByTestId('stat-stem')).toHaveCount(0);
});

test('start begins question 1 in place: the board does not move', async ({ page }) => {
  const before = await pagePosition(page, 'stat-board');
  await page.getByTestId('stat-start').click();
  await expect(page.getByTestId('stat-progress')).toHaveText('question 1 of 15');
  await expect(page.getByTestId('stat-stem')).toBeVisible();
  const after = await pagePosition(page, 'stat-board');
  expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.left - before.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
  // Same on the board during play: the wordmark stays and the board has its box.
  await expect(page.locator('.game-frame-wordmark-img:visible')).toHaveCount(1);
  await expect(page.getByTestId('stat-board')).toBeVisible();
});

test('the arrival view has no accessibility violations', async ({ page }) => {
  // axe needs the page's timers; nothing has started, so letting the clock run changes nothing on screen.
  await page.clock.resume();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
});
