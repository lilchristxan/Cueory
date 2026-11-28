import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

// Christian's rule for the games row at every size: everything inside a game card (wordmark, description, status pill,
// both corner pips) stays within the card's edges. Phone landscape uses the board's 186 x 260 cards.
const sizes = [
  { width: 390, height: 844, landscape: false },
  { width: 844, height: 390, landscape: true },
  { width: 1440, height: 900, landscape: false },
] as const;

for (const size of sizes) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`game cards keep their contents inside the card at ${size.width} x ${size.height} in ${scheme}`, async ({ browser }, testInfo) => {
      test.skip(!isDesktopOfEachEngine(testInfo), 'the size and scheme checks run once per browser engine');
      const context = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        viewport: { width: size.width, height: size.height },
        colorScheme: scheme,
        reducedMotion: 'reduce',
      });
      try {
        const page = await context.newPage();
        await page.goto('/');
        await page.evaluate(() => document.fonts.ready);
        const result = await page.evaluate(() => {
          const out: { card: string; child: string; overflow: number }[] = [];
          const cards = [...document.querySelectorAll('#games-track .gcard')];
          const measured: { width: number; height: number }[] = [];
          for (const card of cards) {
            const box = card.getBoundingClientRect();
            measured.push({ width: Math.round(box.width), height: Math.round(box.height) });
            const label = card.querySelector('.gname')?.textContent?.trim() || card.getAttribute('aria-label') || 'card';
            for (const child of card.querySelectorAll('.gface, .gname, .gname img, .gname span, .gdesc, .gstatus, .gpip')) {
              const r = child.getBoundingClientRect();
              const over = Math.max(box.left - r.left, r.right - box.right, box.top - r.top, r.bottom - box.bottom);
              if (over > 1) out.push({ card: label, child: (child as HTMLElement).className || child.tagName, overflow: Math.round(over) });
            }
          }
          return { out, measured };
        });
        expect(result.measured.length).toBeGreaterThanOrEqual(4);
        expect(result.out).toEqual([]);
        if (size.landscape) {
          for (const card of result.measured) expect(card).toEqual({ width: 186, height: 260 });
        }
      } finally {
        await context.close();
      }
    });
  }
}
