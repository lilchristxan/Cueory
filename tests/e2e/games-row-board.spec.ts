import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

// The games row follows Christian's Home v3 boards (home-light, home-phone-light, home-landscape-light .dc.html):
// arrow places, the phone's one-card-plus-a-peek row, and the gaps around the heading, cards and dots.
// Tolerance is 2 px; every number below is measured from the boards in /home/claude/boards-final (2026-11-24 revision).
const TOLERANCE = 2;

type Rect = { left: number; right: number; top: number; bottom: number; width: number; height: number };

const sizes = [
  { name: 'desktop', width: 1440, height: 900, arrow: 52, edge: 80, cardW: 280, cardH: 392, gap: 28, subToCards: 50, cardsToDot: 58, platterTop: 482 },
  { name: 'phone', width: 390, height: 844, arrow: 44, edge: 16, cardW: 250, cardH: 350, gap: 14, subToCards: 30, cardsToDot: 50, platterTop: 416 },
  { name: 'phone landscape', width: 844, height: 390, arrow: 40, edge: 24, cardW: 186, cardH: 260, gap: 12, subToCards: 18, cardsToDot: 35, platterTop: 320 },
] as const;

for (const size of sizes) {
  test(`games row matches the board at ${size.width} x ${size.height}`, async ({ browser }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'the size checks run once per browser engine');
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: size.width, height: size.height },
      reducedMotion: 'reduce',
    });
    try {
      await context.addInitScript(() => {
        try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); }
        catch { /* The home page also works without storage. */ }
      });
      const page = await context.newPage();
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      const m = await page.evaluate(() => {
        const rect = (el: Element | null): Rect => {
          if (!el) throw new Error('missing element');
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top + scrollY, bottom: r.bottom + scrollY, width: r.width, height: r.height };
        };
        const cards = [...document.querySelectorAll('#games-track .gcard')].map(rect);
        const dot = document.querySelector('.games-dot');
        const dotBox = rect(dot);
        const dotSize = (() => { const s = getComputedStyle(dot as Element, '::after'); return { w: parseFloat(s.width), h: parseFloat(s.height) }; })();
        return {
          vw: document.documentElement.clientWidth,
          heading: rect(document.querySelector('#games-heading')),
          sub: rect(document.querySelector('[data-testid="daily-games-summary"]')),
          prev: rect(document.querySelector('[data-games-prev]')),
          next: rect(document.querySelector('[data-games-next]')),
          cards,
          dotCenter: dotBox.top + dotBox.height / 2,
          dotSize,
          section: rect(document.querySelector('#daily-games')),
          platter: rect(document.querySelector('#ways-to-study')),
        };
      });

      // Cards and the gap between them.
      expect(Math.round(m.cards[0].width)).toBe(size.cardW);
      expect(Math.round(m.cards[0].height)).toBe(size.cardH);
      expect(Math.abs(m.cards[1].left - m.cards[0].right - size.gap)).toBeLessThanOrEqual(TOLERANCE);

      // Arrows flank the heading row at both ends, centred on the heading, at the board's size.
      expect(Math.round(m.prev.width)).toBe(size.arrow);
      expect(Math.round(m.prev.height)).toBe(size.arrow);
      expect(Math.abs(m.prev.left - size.edge)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(m.vw - m.next.right - size.edge)).toBeLessThanOrEqual(TOLERANCE);
      const headingMid = (m.heading.top + m.heading.bottom) / 2;
      expect(Math.abs((m.prev.top + m.prev.bottom) / 2 - headingMid)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs((m.next.top + m.next.bottom) / 2 - headingMid)).toBeLessThanOrEqual(TOLERANCE);
      expect(m.prev.right).toBeLessThanOrEqual(m.heading.left + TOLERANCE);
      expect(m.next.left).toBeGreaterThanOrEqual(m.heading.right - TOLERANCE);

      // Gaps: line to cards, cards to the 8 px dot's centre, the card tops to where the platter section starts (the boards
      // draw nothing under the dots: "play today's" and the date line are kept for screen readers and the keyboard only).
      expect(Math.abs(m.cards[0].top - m.sub.bottom - size.subToCards)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(m.dotCenter - m.cards[0].bottom - size.cardsToDot)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(m.platter.top - m.cards[0].top - size.platterTop)).toBeLessThanOrEqual(TOLERANCE);
      // The section adds only 16 px above its heading (the hero's own bottom padding is the gap); that keeps the
      // heading's glyphs out of the scene fade above it (D-53).
      expect(Math.abs(m.heading.top - m.section.top - 16)).toBeLessThanOrEqual(TOLERANCE);

      if (size.name === 'phone') {
        // One card and a peek of the next: the second card starts inside the screen with at least 100 px showing.
        expect(m.cards[1].left).toBeLessThan(m.vw - 100);
        expect(m.cards[1].right).toBeGreaterThan(m.vw);
        expect(m.cards[0].left).toBeCloseTo(16, 0);
        // Edge to edge: the row's clip is the whole screen width.
        const car = await page.locator('[data-games-car]').boundingBox();
        expect(Math.round(car?.width ?? 0)).toBe(size.width);
      }
      if (size.name === 'phone landscape') {
        // Four cards centred, the fifth not showing at all.
        expect(Math.abs(m.cards[0].left - (size.width - (4 * 186 + 3 * 12)) / 2)).toBeLessThanOrEqual(TOLERANCE);
        expect(m.cards[4].left).toBeGreaterThanOrEqual(m.vw - size.edge - TOLERANCE);
      }
    } finally {
      await context.close();
    }
  });
}

test('on a phone the active card is centred with a peek on both sides, and the row ends line up', async ({ browser }, testInfo) => {
  test.skip(!isDesktopOfEachEngine(testInfo), 'the size checks run once per browser engine');
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  try {
    await context.addInitScript(() => {
      try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); }
      catch { /* The home page also works without storage. */ }
    });
    const page = await context.newPage();
    await page.goto('/');
    const cards = page.locator('#games-track .gcard');
    const next = page.locator('[data-games-next]');
    await next.click();
    await expect(cards.nth(1)).toHaveClass(/on/);
    const second = await cards.nth(1).boundingBox();
    const first = await cards.nth(0).boundingBox();
    const third = await cards.nth(2).boundingBox();
    expect(Math.abs((second?.x ?? 0) - 70)).toBeLessThanOrEqual(TOLERANCE);
    // A peek of the card before (right edge inside the screen) and the card after (left edge inside the screen).
    expect((first?.x ?? 0) + (first?.width ?? 0)).toBeGreaterThan(40);
    expect(third?.x ?? 999).toBeLessThan(390 - 40);
    // Last card: right edge sits 16 px in from the screen's edge.
    for (let i = 0; i < 4; i += 1) await next.click();
    await expect(cards.nth(5)).toHaveClass(/on/);
    const last = await cards.nth(5).boundingBox();
    expect(Math.abs(390 - ((last?.x ?? 0) + (last?.width ?? 0)) - 16)).toBeLessThanOrEqual(TOLERANCE);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  } finally {
    await context.close();
  }
});
