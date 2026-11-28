import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';
import { picclineLayout, PICCLINE_STICKER_SIZE } from '../../src/islands/picclinesticker';

// The piccline share card (Christian's designs, 25 Nov 2026): two stickers drawn in the browser (one dot or bead line per
// word in the order found, the word of the day teal and ringed), the share/save/copy buttons, the visible solve timer.
// 1 November's puzzle is content/games/suture/sample-01.json: seven answers, BREAKTIME is the word of the day.

type Cell = [number, number];
const sample = JSON.parse(readFileSync(new URL('../../content/games/suture/sample-01.json', import.meta.url), 'utf8')) as {
  words: { answer: string; path: Cell[]; special?: boolean }[];
};
// Found order used here: the second word is the word of the day.
const order = [1, 0, 2, 3, 4, 5, 6];
const foundOrder = order.map((i) => sample.words[i]!.special === true);

async function open(page: Page, init?: () => void) {
  await page.clock.install({ time: new Date('2026-11-01T15:00:00') });
  await markPanelsSeen(page);
  if (init) await page.addInitScript(init);
  await page.goto('/play/piccline');
  await expect(page.getByTestId('suture')).toBeVisible();
}
const game = (page: Page) => page.getByTestId('suture');
async function playWord(page: Page, index: number) {
  for (const [row, col] of sample.words[index]!.path) await game(page).locator(`button[data-cell="${row},${col}"]`).click();
  await game(page).getByRole('button', { name: 'submit' }).click();
}
async function finish(page: Page) {
  for (const index of order) await playWord(page, index);
  await expect(page.getByTestId('suture-result')).toBeVisible();
  const card = page.getByTestId('share-dialog');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('share-dialog-save')).toBeEnabled({ timeout: 20_000 });
  return card;
}

async function inspect(page: Page, path: string, points: Array<[number, number]>) {
  const base64 = readFileSync(path).toString('base64');
  return page.evaluate(
    async ({ base64, points }) => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const at = (x: number, y: number) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data];
      return {
        width: bitmap.width,
        height: bitmap.height,
        corners: [at(2, 2)[3], at(bitmap.width - 3, 2)[3], at(2, bitmap.height - 3)[3], at(bitmap.width - 3, bitmap.height - 3)[3]],
        points: points.map(([x, y]) => at(x, y)),
      };
    },
    { base64, points },
  );
}

async function download(page: Page, button: string) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId(button).click()]);
  return { name: file.suggestedFilename(), path: (await file.path())! };
}

test('finishing the board opens the share card, and the card is not shown before', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('share-dialog')).toHaveCount(0);
  const card = await finish(page);
  await expect(card).toHaveAttribute('role', 'dialog');
  await expect(card).toBeFocused();
  await expect(page.getByTestId('share-dialog-countdown')).toHaveText(/^next piccline in \d\d:\d\d:\d\d$/);
});

for (const [kind, option, name] of [
  ['centered', 'portrait', 'piccline-portrait-2026-11-01.png'],
  ['lower-third', 'landscape', 'piccline-landscape-2026-11-01.png'],
] as const) {
  test(`${option} sticker: export size, transparent corners, one dot per word in the order found, the word of the day teal`, async ({ page }) => {
    await open(page);
    await finish(page);
    await page.getByTestId(`share-dialog-option-${option}`).click();
    const saved = await download(page, 'share-dialog-save');
    expect(saved.name).toBe(name);
    const layout = picclineLayout(kind, { found: foundOrder, date: 'x', stats: [] });
    // A sample point inside each dot, off its ring and highlight: the dot's lower left.
    const spots = (kind === 'centered' ? layout.dots : layout.beadLines.map((s) => s.beads[0]!)).map((d): [number, number] => [d.cx - d.radius * 0.45, d.cy + d.radius * 0.1]);
    const seen = await inspect(page, saved.path, spots);
    expect(seen.width).toBe(PICCLINE_STICKER_SIZE[kind].width);
    expect(seen.height).toBe(PICCLINE_STICKER_SIZE[kind].height);
    expect(seen.corners).toEqual([0, 0, 0, 0]);
    (seen.points as number[][]).forEach((pixel, i) => {
      if (foundOrder[i]) expect(pixel[2]).toBeGreaterThan(pixel[0]! + 30); // teal: more blue than red
      else expect(pixel[0]).toBeGreaterThan(pixel[2]! + 40); // brown: more red than blue
    });
  });
}

test('the card says the result in words (the word of the day is dot 2) and never a letter', async ({ page }) => {
  await open(page);
  await finish(page);
  const text = await page.getByTestId('share-dialog-description').textContent();
  expect(text).toMatch(/the word of the day was number 2 of 7/);
  expect(text).toMatch(/teal with a ring/);
  expect(text).not.toMatch(/breaktime|sunlight|podcast/i);
});

test('the signed-out sticker shows the solve time only', async ({ page }) => {
  await open(page);
  await finish(page);
  const text = await page.getByTestId('share-dialog-description').textContent();
  expect(text).toMatch(/solve time \d+:\d\d/);
  expect(text).not.toMatch(/day streak|solved \d/);
});

test('share opens the system sheet with the png where the browser can share files; Escape closes the card and focus returns to share', async ({ page }) => {
  await open(page, () => {
    const w = window as unknown as { __shared: Array<{ files: number; url: string | undefined }> };
    w.__shared = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d?: ShareData) => Boolean(d?.files?.length) });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d: ShareData) => {
        w.__shared.push({ files: d.files?.length ?? 0, url: d.url });
      },
    });
  });
  await finish(page);
  await page.getByTestId('share-dialog-share').click();
  const shared = await page.evaluate(() => (window as unknown as { __shared: Array<{ files: number; url?: string }> }).__shared);
  expect(shared).toHaveLength(1);
  expect(shared[0]!.files).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('share-dialog')).toBeHidden();
  await expect(page.getByTestId('suture-share-open')).toBeFocused();
});

test.describe('the solve timer', () => {
  test('shows a quiet time line from the first letter, stops at the last answer and is on the finished board', async ({ page }) => {
    await open(page);
    const time = page.getByTestId('suture-time');
    await expect(time).toHaveText('time: 0:00');
    await game(page).locator(`button[data-cell="${sample.words[1]!.path[0]![0]},${sample.words[1]!.path[0]![1]}"]`).click();
    await page.clock.fastForward(5000);
    await expect(time).toHaveText('time: 0:05');
    await page.keyboard.press('Escape');
    await finish(page);
    const frozen = await time.textContent();
    await page.clock.fastForward(8000);
    await expect(time).toHaveText(frozen!);
    await expect(page.getByTestId('suture-solve-time')).toHaveText(/solve time \d+:\d\d\./);
  });

  test('"show the timer" hides the line without moving the board, and the time still reaches the sticker', async ({ page }) => {
    await open(page);
    const board = game(page).locator('[role="grid"]');
    const before = (await board.boundingBox())!;
    await page.getByTestId('game-frame-gear').click();
    await page.getByTestId('suture-show-timer').uncheck();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('suture-time')).toHaveText('');
    const after = (await board.boundingBox())!;
    expect({ x: after.x, y: after.y }).toEqual({ x: before.x, y: before.y });
    await finish(page);
    expect(await page.getByTestId('share-dialog-description').textContent()).toMatch(/solve time \d+:\d\d/);
  });

  test('thinking time since the last move is kept when the page is left or reloaded', async ({ page }) => {
    await open(page);
    await playWord(page, 1);
    // No move for half a minute (the page's clock, not a sleep), then the page is reloaded.
    await page.clock.fastForward(30_000);
    await page.reload();
    await expect(page.getByTestId('suture-time')).toHaveText(/^time: 0:(3\d|4\d)$/);
  });

  test('a reload mid-game carries the time on, and a finished board reopens with its solve time', async ({ page }) => {
    await open(page);
    // The page's clock stands still between the test's own steps, so a slow machine's real seconds (Safari's engine on a
    // busy CI runner) cannot add to the 7 faked ones: the saved time is exactly what this test moved the clock by.
    // It pauses a minute ahead of wherever the page's clock has got to: opening the game can take more than a real second
    // on a busy runner, and the clock cannot be paused at a time it has already passed. The solve timer starts at the
    // first move, so the minute skipped before it adds nothing.
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 60_000);
    await playWord(page, 1);
    await page.clock.fastForward(7000);
    await playWord(page, 0);
    await page.reload();
    await expect(page.getByTestId('suture-time')).toHaveText(/^time: 0:(0[7-9]|1\d)$/);
    await page.clock.resume();
    for (const index of order.slice(2)) await playWord(page, index);
    await expect(page.getByTestId('suture-result')).toBeVisible();
    // A game that was reloaded part-way and then finished still gets its card.
    await expect(page.getByTestId('share-dialog')).toBeVisible();
    const solve = await page.getByTestId('suture-solve-time').textContent();
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.getByTestId('suture-solve-time')).toHaveText(solve!);
    // A board that reopens finished does not throw the card at the player again, but "share" offers it.
    await expect(page.getByTestId('share-dialog')).toBeHidden();
    await page.getByTestId('suture-share-open').click();
    await expect(page.getByTestId('share-dialog')).toBeVisible();
  });
});

test.describe('the share card fits every screen', () => {
  for (const [width, height] of [[390, 844], [844, 390], [820, 1180], [1440, 900]] as const) {
    test(`${width} x ${height}: inside the screen or scrollable, nothing clipped, no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page);
      const card = await finish(page);
      const fit = await page.evaluate(() => {
        const scrim = document.querySelector('[data-testid="share-dialog-scrim"]') as HTMLElement;
        const dialog = document.querySelector('[data-testid="share-dialog"]') as HTMLElement;
        const before = dialog.getBoundingClientRect();
        scrim.scrollTop = scrim.scrollHeight;
        const after = dialog.getBoundingClientRect();
        return {
          top: before.top,
          left: before.left,
          right: before.right,
          bottomWhenScrolled: after.bottom,
          vh: window.innerHeight,
          vw: window.innerWidth,
          scrolls: scrim.scrollHeight > scrim.clientHeight,
          sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth || scrim.scrollWidth > scrim.clientWidth,
        };
      });
      expect(fit.sideways).toBe(false);
      expect(fit.left).toBeGreaterThanOrEqual(0);
      expect(fit.right).toBeLessThanOrEqual(fit.vw);
      expect(fit.top).toBeGreaterThanOrEqual(0);
      // The whole card, down to the countdown, can be brought into view.
      expect(fit.bottomWhenScrolled).toBeLessThanOrEqual(fit.vh);
      await page.getByTestId('share-dialog-countdown').scrollIntoViewIfNeeded();
      await expect(page.getByTestId('share-dialog-countdown')).toBeInViewport();
      await expect(card).toBeVisible();
    });
  }
});
