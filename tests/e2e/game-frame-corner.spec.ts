import { expect, test, type Page } from '@playwright/test';
import { fixClock } from './clock';

/**
 * The gear and the "?" are one pair in the top right corner of the play area on every framed game (Christian, 25 Nov):
 * side by side, settings on the left, the same size, one centre line, and the board and keyboard share the play area's
 * centre line at every size and orientation.
 */
const sizes = [
  [390, 844], [844, 390], [820, 1180], [1180, 820], [1288, 640], [1440, 900], [2560, 1280],
] as const;

test.beforeEach(async ({ page }) => {
  await fixClock(page, new Date('2026-11-01T15:00:00'));
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-game-help-seen', JSON.stringify(['pulse', 'triage', 'cueword', 'suture', 'stat', 'vialo'])); } catch { /* storage blocked */ }
  });
});

async function measure(page: Page) {
  return page.evaluate(() => {
    const box = (node: Element | null) => {
      const r = node!.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    };
    const keys = [...document.querySelectorAll('.vialo-keys button')].map((key) => key.getBoundingClientRect());
    const keyLeft = Math.min(...keys.map((r) => r.left));
    const keyRight = Math.max(...keys.map((r) => r.right));
    const dateLine = document.querySelector('.game-frame-dateline')!;
    const range = document.createRange();
    range.selectNodeContents(dateLine);
    const text = [...range.getClientRects()].map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }));
    return {
      area: box(document.querySelector('.game-frame-main')),
      pack: box(document.querySelector('.vialo-pack')),
      keysCx: (keyLeft + keyRight) / 2,
      gear: box(document.querySelector('[data-testid="game-frame-gear"]')),
      help: box(document.querySelector('[data-testid="game-frame-help-button"]')),
      text,
      deck: [...document.querySelectorAll('.game-deck-item')].map((item) => box(item)),
      noSideways: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    };
  });
}

const overlaps = (a: { left: number; right: number; top: number; bottom: number }, b: { left: number; right: number; top: number; bottom: number }) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

for (const [width, height] of sizes) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`vialo at ${width}x${height} (${scheme === 'light' ? 'light' : 'evening'}): board and keyboard on the play area's centre line, gear and ? paired in its top right corner`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/play/vialo');
      await expect(page.getByTestId('vialo')).toBeVisible();
      await expect(page.getByTestId('game-frame-gear')).toBeVisible();
      const m = await measure(page);

      expect(Math.abs(m.pack.cx - m.area.cx), 'pack centre vs play area centre').toBeLessThanOrEqual(1);
      expect(Math.abs(m.keysCx - m.area.cx), 'keyboard centre vs play area centre').toBeLessThanOrEqual(1);
      expect(Math.abs(m.pack.cx - m.keysCx), 'pack centre vs keyboard centre').toBeLessThanOrEqual(1);

      // Same size (44 px tap targets), same top, one centre line.
      for (const button of [m.gear, m.help]) {
        expect(button.width).toBeGreaterThanOrEqual(43.9);
        expect(button.height).toBeGreaterThanOrEqual(43.9);
      }
      expect(Math.abs(m.gear.width - m.help.width)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(m.gear.height - m.help.height)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(m.gear.top - m.help.top)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(m.gear.cy - m.help.cy)).toBeLessThanOrEqual(0.5);
      // Settings on the left, "?" on the right, side by side.
      expect(m.gear.right).toBeLessThanOrEqual(m.help.left);
      expect(m.help.left - m.gear.right).toBeLessThanOrEqual(12);
      // In the corner, within the page padding (24 px) of the play area's top and right edges.
      expect(m.area.right - m.help.right).toBeGreaterThanOrEqual(8);
      expect(m.area.right - m.help.right).toBeLessThanOrEqual(24);
      expect(m.gear.top - m.area.top).toBeGreaterThanOrEqual(8);
      expect(m.gear.top - m.area.top).toBeLessThanOrEqual(24);

      // Nothing lies under them: not the date line's text, not the board, not a deck card.
      const buttons = [m.gear, m.help];
      for (const button of buttons) {
        for (const line of m.text) expect(overlaps(button, line), 'date line').toBe(false);
        expect(overlaps(button, m.pack), 'board').toBe(false);
        for (const card of m.deck) expect(overlaps(button, card), 'deck card').toBe(false);
      }
      // The date line stays on one line, clear of the buttons (on a phone the pair has its own row above it).
      expect(m.text.length, 'date line is one line').toBe(1);
      expect(m.noSideways).toBe(true);
    });
  }
}

test('the gear is an outline: stroke only, no fill, and the "?" keeps its name', async ({ page }) => {
  await page.goto('/play/vialo');
  const gear = page.getByRole('button', { name: 'vialo settings' });
  await expect(gear).toBeVisible();
  const paint = await gear.locator('svg').evaluate((svg) => {
    const parts = [...svg.querySelectorAll('path, circle')].map((node) => getComputedStyle(node));
    return parts.map((style) => ({ fill: style.fill, stroke: style.stroke }));
  });
  expect(paint.length).toBeGreaterThan(0);
  for (const part of paint) {
    expect(part.fill).toBe('none');
    expect(part.stroke).not.toBe('none');
  }
  await expect(page.getByRole('button', { name: 'how to play vialo' })).toBeVisible();
});

test('the gear and the ? open their dialogs and give focus back, from the new corner', async ({ page }) => {
  await page.goto('/play/vialo');
  await page.getByRole('button', { name: 'vialo settings' }).click();
  await expect(page.getByRole('dialog', { name: 'vialo settings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'vialo settings' })).toBeFocused();
  await page.getByRole('button', { name: 'how to play vialo' }).click();
  await expect(page.getByRole('dialog', { name: 'how to play vialo' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'how to play vialo' })).toBeFocused();
});

// Every other framed game route: the same corner pair at every size, in both palettes.
const others = ['/play/pillo', '/play/sudoku', '/play/piccline', '/play/word-path', '/play/tachyyy', '/play/stat', '/play/hello-cards'];
const framedRoutes = [...others, '/play/crossword'];
for (const path of framedRoutes) {
  for (const [width, height] of sizes) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`${path} at ${width}x${height} (${scheme === 'light' ? 'light' : 'evening'}): corner pair in the play area's top right`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(path);
        await expect(page.getByTestId('game-frame-gear')).toBeVisible();
        const m = await page.evaluate(() => {
          const r = (n: Element | null) => { const b = n!.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, width: b.width, height: b.height }; };
          const range = document.createRange();
          range.selectNodeContents(document.querySelector('.game-frame-dateline')!);
          return {
            area: r(document.querySelector('.game-frame-main')),
            gear: r(document.querySelector('[data-testid="game-frame-gear"]')),
            help: r(document.querySelector('[data-testid="game-frame-help-button"]')),
            text: [...range.getClientRects()].map((t) => ({ left: t.left, right: t.right, top: t.top, bottom: t.bottom })),
            noSideways: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          };
        });
        for (const button of [m.gear, m.help]) {
          expect(button.width).toBeGreaterThanOrEqual(43.9);
          expect(button.height).toBeGreaterThanOrEqual(43.9);
        }
        expect(Math.abs(m.gear.width - m.help.width)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(m.gear.height - m.help.height)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(m.gear.top - m.help.top)).toBeLessThanOrEqual(0.5);
        expect(m.gear.right).toBeLessThanOrEqual(m.help.left);
        expect(m.help.left - m.gear.right).toBeLessThanOrEqual(12);
        expect(m.area.right - m.help.right).toBeGreaterThanOrEqual(8);
        expect(m.area.right - m.help.right).toBeLessThanOrEqual(24);
        expect(m.gear.top - m.area.top).toBeGreaterThanOrEqual(8);
        expect(m.gear.top - m.area.top).toBeLessThanOrEqual(24);
        expect(m.text.length, 'date line is one line').toBe(1);
        for (const button of [m.gear, m.help]) expect(overlaps(button, m.text[0]!), 'date line').toBe(false);
        expect(m.noSideways).toBe(true);
      });
    }
  }
}

// The board column is on the play area's centre line at every size, on every framed game route.
for (const path of framedRoutes) {
  for (const [width, height] of sizes) {
    test(`${path} at ${width}x${height}: board column centred on the play area`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      await expect(page.getByTestId('game-frame-gear')).toBeVisible();
      const m = await page.evaluate(() => {
        const cx = (n: Element | null) => { const b = n!.getBoundingClientRect(); return b.left + b.width / 2; };
        return { area: cx(document.querySelector('.game-frame-main')), board: cx(document.querySelector('.game-frame-board')) };
      });
      expect(Math.abs(m.board - m.area)).toBeLessThanOrEqual(1);
    });
  }
}
