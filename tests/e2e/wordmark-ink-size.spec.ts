import { expect, test, type Page } from '@playwright/test';
import { markGameRulesSeen } from './clock';

// Piccline's wordmark is a thin script and looked smaller than the others (Christian, 2026-11-25). In every place the
// wordmarks appear, its rendered INK height (the visible letters, found from the image's own transparency at the size it
// is drawn, after any CSS scale) must be at least that of the other games' wordmarks, and nothing may scroll sideways.
test.beforeEach(async ({ page }) => {
  await markGameRulesSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem('cueory-promo-seen', String(Date.now()));
    localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
  });
});

type Ink = { game: string; inkH: number; inkW: number };

/** Ink bounds of each matching wordmark image, drawn at its rendered size (CSS scale included). */
async function ink(page: Page, scope: string): Promise<Ink[]> {
  return page.evaluate(async (scopeSelector) => {
    const out: { game: string; inkH: number; inkW: number }[] = [];
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(`${scopeSelector} img`))) {
      const match = new URL(img.src).pathname.match(/(vialo|tachyyy|piccline)-wordmark/);
      if (!match || getComputedStyle(img).display === 'none') continue;
      img.loading = 'eager';
      if (!img.complete) await new Promise<void>((done) => { img.addEventListener('load', () => done(), { once: true }); img.addEventListener('error', () => done(), { once: true }); });
      const scale = Number.parseFloat(getComputedStyle(img).scale) || 1;
      const rect = img.getBoundingClientRect();
      if (rect.width < 2) continue;
      const k = 4;
      const boxW = rect.width / scale;
      const boxH = rect.height / scale;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(boxW * k);
      canvas.height = Math.ceil(boxH * k);
      const ctx = canvas.getContext('2d')!;
      const fit = getComputedStyle(img).objectFit === 'contain';
      let w = canvas.width, h = canvas.height, x = 0, y = 0;
      if (fit) {
        const s = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
        w = img.naturalWidth * s; h = img.naturalHeight * s; y = (canvas.height - h) / 2;
        x = getComputedStyle(img).objectPosition.startsWith('0%') ? 0 : (canvas.width - w) / 2;
      }
      ctx.drawImage(img, x, y, w, h);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
      for (let row = 0; row < canvas.height; row++) for (let col = 0; col < canvas.width; col++) {
        if (data[(row * canvas.width + col) * 4 + 3]! > 40) { x0 = Math.min(x0, col); x1 = Math.max(x1, col); y0 = Math.min(y0, row); y1 = Math.max(y1, row); }
      }
      out.push({ game: match[1]!, inkH: ((y1 - y0 + 1) / k) * scale, inkW: ((x1 - x0 + 1) / k) * scale });
    }
    return out;
  }, scope);
}

const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`wordmark ink height, ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('home card: piccline is at least as tall as the others, and nothing scrolls sideways', async ({ page }) => {
      await page.goto('/');
      const found = await ink(page, '[data-game-card]');
      const piccline = Math.max(...found.filter((i) => i.game === 'piccline').map((i) => i.inkH));
      const others = found.filter((i) => i.game !== 'piccline').map((i) => i.inkH);
      expect(others.length).toBeGreaterThan(0);
      expect(piccline).toBeGreaterThanOrEqual(Math.max(...others));
      expect(await noSideways(page)).toBe(true);
    });

    test('hub rows: piccline is at least as tall as the others', async ({ page }) => {
      await page.goto('/play');
      const found = await ink(page, '[data-testid="play-status"]');
      const piccline = found.find((i) => i.game === 'piccline')!.inkH;
      const others = found.filter((i) => i.game !== 'piccline').map((i) => i.inkH);
      expect(others.length).toBeGreaterThan(0);
      expect(piccline).toBeGreaterThanOrEqual(Math.max(...others));
      expect(await noSideways(page)).toBe(true);
    });

    test('game pages: the sidebar wordmark of piccline is at least as tall as vialo\'s and tachyyy\'s', async ({ page }) => {
      const heights: Record<string, number> = {};
      for (const [game, path] of [['vialo', '/play/vialo'], ['tachyyy', '/play/tachyyy'], ['piccline', '/play/piccline']] as const) {
        await page.goto(path);
        const found = await ink(page, '.game-frame-sidebar .game-frame-wordmark-wrap');
        heights[game] = Math.max(...found.filter((i) => i.game === game).map((i) => i.inkH));
        expect(await noSideways(page), path).toBe(true);
      }
      expect(heights.piccline).toBeGreaterThanOrEqual(Math.max(heights.vialo!, heights.tachyyy!));
    });
  });
}
