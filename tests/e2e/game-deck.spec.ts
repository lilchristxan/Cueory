import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The fanned card deck at the right edge of every game page (Christian's two canvas comments, 23 Nov). Playwright's
// build shows drafts, so all six games are open and the deck has five cards.
const pages = [
  { path: '/play/vialo', id: 'pulse', order: ['hello cards', 'sudoku', 'crossword', 'piccline', 'tachyyy'] },
  { path: '/play/hello-cards', id: 'hello-cards', order: ['sudoku', 'crossword', 'piccline', 'tachyyy', 'vialo'] },
  { path: '/play/sudoku', id: 'triage', order: ['crossword', 'piccline', 'tachyyy', 'vialo', 'hello cards'] },
  { path: '/play/crossword', id: 'cueword', order: ['piccline', 'tachyyy', 'vialo', 'hello cards', 'sudoku'] },
  { path: '/play/piccline', id: 'suture', order: ['tachyyy', 'vialo', 'hello cards', 'sudoku', 'crossword'] },
  { path: '/play/tachyyy', id: 'stat', order: ['vialo', 'hello cards', 'sudoku', 'crossword', 'piccline'] },
];

/** An item's untransformed box in the frame (offsetWidth/Height ignore the tilt) and its tilt in degrees. */
async function geometry(page: Page, index: number) {
  return page.locator('.game-deck-item').nth(index).evaluate((el) => {
    const frame = el.closest('.game-frame') as HTMLElement;
    const f = frame.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2 - f.x;
    const cy = r.y + r.height / 2 - f.y;
    const w = (el as HTMLElement).offsetWidth;
    const h = (el as HTMLElement).offsetHeight;
    const rotate = parseFloat(getComputedStyle(el).rotate);
    return { w, h, left: cx - w / 2, top: cy - h / 2, right: cx + w / 2, frameWidth: f.width, rotate };
  });
}

test.describe('card deck at 1440 x 900', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the deck is a desktop feature; the phone and tablet row has its own test');
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('five cards of 220 x 308, each one step further out, higher and less tilted than the one in front', async ({ page }) => {
    await page.goto('/play/vialo');
    await expect(page.locator('.game-deck-item')).toHaveCount(5);
    // Index 0 is the front card (the next game). Each step back: 18 px further right, 42 px higher, 2.5 degrees less tilted.
    for (let depth = 0; depth < 5; depth++) {
      const g = await geometry(page, depth);
      expect(g.w).toBeCloseTo(220, 0);
      expect(g.h).toBeCloseTo(308, 0);
      expect(g.top).toBeCloseTo(372 - depth * 42, 0);
      expect(g.right - g.frameWidth).toBeCloseTo(78 + depth * 18, 0);
      expect(g.rotate).toBeCloseTo(15 - depth * 2.5, 1);
    }
  });

  test('the front card is the fixed point: 142 px in from the right edge and 372 px down, on every game page', async ({ page }) => {
    for (const p of pages) {
      await page.goto(p.path);
      const g = await geometry(page, 0);
      expect(g.frameWidth - g.left, p.path).toBeCloseTo(142, 0);
      expect(g.top, p.path).toBeCloseTo(372, 0);
      expect(g.rotate, p.path).toBeCloseTo(15, 1);
    }
  });

  test('the cards are positioned from the page top and scroll with the page', async ({ page }) => {
    await page.goto('/play/vialo');
    const before = await page.locator('.game-deck-item').first().boundingBox();
    await page.evaluate(() => window.scrollTo(0, 120));
    const after = await page.locator('.game-deck-item').first().boundingBox();
    const scrolled = await page.evaluate(() => window.scrollY);
    expect(before!.y - after!.y).toBeCloseTo(scrolled, 0);
  });

  test('the order on each game page: the next game in the loop in front, never the current game', async ({ page }) => {
    for (const p of pages) {
      await page.goto(p.path);
      const names = await page.locator('.game-deck-card').evaluateAll((els) => els.map((el) => el.querySelector('.sr-only')!.textContent));
      expect(names, p.path).toEqual(p.order);
      await expect(page.locator('.game-deck-item[data-front="true"]'), p.path).toHaveCount(1);
      await expect(page.locator('.game-deck-item').first(), p.path).toHaveAttribute('data-front', 'true');
    }
  });

  test('each card is one real link named for its game; "next game" is on the front card only, hidden from screen readers', async ({ page }) => {
    await page.goto('/play/vialo');
    const hrefs = ['/play/hello-cards', '/play/sudoku', '/play/crossword', '/play/piccline', '/play/tachyyy'];
    const names = ['hello cards', 'sudoku', 'crossword', 'piccline', 'tachyyy'];
    for (let i = 0; i < 5; i++) {
      const link = page.getByRole('navigation', { name: 'other games' }).getByRole('link', { name: names[i]!, exact: true });
      await expect(link).toHaveAttribute('href', hrefs[i]!);
    }
    await expect(page.locator('.game-deck-label')).toHaveCount(1);
    await expect(page.locator('.game-deck-label')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.game-deck-item[data-front="true"] .game-deck-label')).toHaveText('next game ›');
  });

  test('"next game ›" sits inside the front card, centred between its side edges, 202 px down the card', async ({ page }) => {
    await page.goto('/play/vialo');
    const m = await page.locator('.game-deck-item').first().evaluate((el) => {
      // Measure in the card's own frame by undoing the tilt: the label's box corners against the card's padding box.
      const card = el.querySelector('.game-deck-card') as HTMLElement;
      const label = el.querySelector('.game-deck-label') as HTMLElement;
      const range = document.createRange();
      range.selectNodeContents(label);
      const text = range.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      const angle = (parseFloat(getComputedStyle(el).rotate) * Math.PI) / 180;
      const cx = c.x + c.width / 2;
      const cy = c.y + c.height / 2;
      const local = (x: number, y: number) => {
        const dx = x - cx, dy = y - cy;
        return { x: dx * Math.cos(-angle) - dy * Math.sin(-angle), y: dx * Math.sin(-angle) + dy * Math.cos(-angle) };
      };
      const mid = local(text.x + text.width / 2, text.y + text.height / 2);
      const style = getComputedStyle(label);
      return { midX: mid.x, label: label.offsetTop, labelLeft: label.offsetLeft, labelWidth: label.offsetWidth, cardInner: card.clientWidth, font: style.fontWeight + ' ' + style.fontSize, align: style.textAlign };
    });
    expect(Math.abs(m.midX)).toBeLessThanOrEqual(1);
    expect(m.label).toBe(202);
    expect(m.labelLeft).toBe(0);
    expect(m.labelWidth).toBe(m.cardInner);
    expect(m.font).toBe('700 14px');
    expect(m.align).toBe('center');
  });

  test('hover moves the card face 170 px left and straightens it to -2 degrees; the hit area stays put', async ({ page }) => {
    await page.goto('/play/vialo');
    const item = page.locator('.game-deck-item').first();
    const card = item.locator('.game-deck-card');
    const itemBefore = await item.boundingBox();
    const cardBefore = await card.boundingBox();
    // Hover inside the front card, well clear of the cards behind it.
    await page.mouse.move(itemBefore!.x + itemBefore!.width * 0.45, itemBefore!.y + itemBefore!.height * 0.62);
    await expect.poll(async () => (await card.boundingBox())!.x).toBeLessThan(cardBefore!.x - 100);
    await page.waitForTimeout(500);
    const cardAfter = await card.boundingBox();
    const itemAfter = await item.boundingBox();
    expect(itemAfter).toEqual(itemBefore);
    // The card's centre moved straight left by 170 px on the page.
    const dx = cardAfter!.x + cardAfter!.width / 2 - (cardBefore!.x + cardBefore!.width / 2);
    const dy = cardAfter!.y + cardAfter!.height / 2 - (cardBefore!.y + cardBefore!.height / 2);
    expect(dx).toBeCloseTo(-170, 0);
    expect(Math.abs(dy)).toBeLessThan(1);
    const angle = await card.evaluate((el) => {
      // The tilt is the item's tilt plus the card's own turn (both are individual `rotate` properties).
      return parseFloat(getComputedStyle(el.parentElement!).rotate) + parseFloat(getComputedStyle(el).rotate);
    });
    expect(angle).toBeCloseTo(-2, 0);
    const shadow = await card.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toContain('44px');
  });

  test('keyboard focus moves a card exactly as hover does, with a visible focus ring', async ({ page }) => {
    await page.goto('/play/vialo');
    const card = page.locator('.game-deck-card').first();
    const before = await card.boundingBox();
    await card.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(card).toBeFocused();
    await page.waitForTimeout(500);
    const after = await card.boundingBox();
    expect(after!.x + after!.width / 2 - (before!.x + before!.width / 2)).toBeCloseTo(-170, 0);
    const outline = await card.evaluate((el) => getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth);
    expect(outline).toBe('solid 3px');
  });

  test('under reduced motion the card still moves, without animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/play/vialo');
    const card = page.locator('.game-deck-card').first();
    // The site's reduced-motion rule shortens every transition to one hundred-thousandth of a second.
    expect(parseFloat(await card.evaluate((el) => getComputedStyle(el).transitionDuration))).toBeLessThan(0.001);
    const before = await card.boundingBox();
    await card.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    // No wait: with no animation the card is at its place at once.
    const after = await card.boundingBox();
    expect(after!.x + after!.width / 2 - (before!.x + before!.width / 2)).toBeCloseTo(-170, 0);
  });

  test('card face: icon tile, name beside it, name in the middle, tile again upside down', async ({ page }) => {
    await page.goto('/play/sudoku');
    const face = await page.locator('.game-deck-item').first().evaluate((el) => {
      const q = (s: string) => el.querySelector(s) as HTMLElement;
      const tile = q('.game-deck-top .game-deck-tile');
      const bottom = q('.game-deck-bottom');
      const top = q('.game-deck-top-name');
      const mid = q('.game-deck-name');
      return {
        tile: [tile.offsetWidth, tile.offsetHeight, tile.offsetLeft, tile.offsetTop],
        tileRadius: getComputedStyle(tile).borderRadius,
        bottomRotate: getComputedStyle(bottom).rotate,
        bottomRight: (el.querySelector('.game-deck-card') as HTMLElement).clientWidth - bottom.offsetLeft - bottom.offsetWidth,
        topFont: getComputedStyle(top).fontSize + ' ' + getComputedStyle(top).fontWeight,
        midFont: getComputedStyle(mid).fontSize + ' ' + getComputedStyle(mid).fontWeight,
        names: [top.textContent!.trim(), mid.textContent!.trim()],
        radius: getComputedStyle(el.querySelector('.game-deck-card')!).borderRadius,
      };
    });
    expect(face.tile).toEqual([40, 40, 18, 18]);
    expect(face.tileRadius).toBe('10px');
    expect(face.bottomRotate).toBe('180deg');
    expect(face.bottomRight).toBe(18);
    expect(face.topFont).toBe('19px 500');
    expect(face.midFont).toBe('32px 500');
    expect(face.names).toEqual(['crossword', 'crossword']);
    expect(face.radius).toBe('20px');
  });

  test('games with art show their logo (right file for Light and Evening); the rest show their name; images are decorative', async ({ page }) => {
    await page.goto('/play/sudoku');
    // sudoku's deck: crossword, piccline, tachyyy, vialo, hello cards
    const piccline = page.locator('.game-deck-item[data-game="suture"]');
    await expect(piccline.locator('img.game-deck-day.game-deck-wordmark-mid')).toHaveAttribute('src', '/brand/games/piccline-wordmark-light.svg');
    await expect(piccline.locator('img.game-deck-evening.game-deck-wordmark-mid')).toHaveAttribute('src', '/brand/games/piccline-wordmark-dark.svg');
    await expect(piccline.locator('img.game-deck-day.game-deck-tile-art').first()).toHaveAttribute('src', '/brand/games/piccline-light.svg');
    await expect(piccline.locator('img.game-deck-evening.game-deck-tile-art').first()).toHaveAttribute('src', '/brand/games/piccline-dark.svg');
    await expect(piccline.locator('img.game-deck-wordmark-mid:visible')).toHaveCount(1);
    await expect(page.locator('.game-deck-item[data-game="cueword"] img')).toHaveCount(0);
    const imgs = page.locator('.game-deck img');
    const count = await imgs.count();
    for (let i = 0; i < count; i++) {
      const img = imgs.nth(i);
      await expect(img).toHaveAttribute('alt', '');
      await expect(img).toHaveAttribute('aria-hidden', 'true');
      await expect(img).toHaveAttribute('loading', 'lazy');
      await expect(img).toHaveAttribute('width', /\d+/);
      await expect(img).toHaveAttribute('height', /\d+/);
    }
  });

  test('Evening shows the Evening art and Evening colours', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/play/sudoku');
    const piccline = page.locator('.game-deck-item[data-game="suture"]');
    await expect(piccline.locator('img.game-deck-wordmark-mid:visible')).toHaveAttribute('src', '/brand/games/piccline-wordmark-dark.svg');
    const bg = await piccline.locator('.game-deck-card').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(28, 25, 23)');
  });

  // The game is the board's tiles (vialo's tile slots, sudoku's cells, piccline's letters), its keys or number pad and
  // the gear and "?" buttons; the empty frame round them does not count.
  async function clashes(page: Page) {
    return page.evaluate(() => {
      type P = [number, number];
      const polys: { name: string; pts: P[] }[] = [];
      document.querySelectorAll<HTMLElement>('.game-deck-item').forEach((el) => {
        const r = el.getBoundingClientRect();
        const angle = (parseFloat(getComputedStyle(el).rotate) * Math.PI) / 180;
        const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
        const hw = el.offsetWidth / 2, hh = el.offsetHeight / 2;
        const pts = ([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as P[]).map(([x, y]): P => [cx + x * Math.cos(angle) - y * Math.sin(angle), cy + x * Math.sin(angle) + y * Math.cos(angle)]);
        polys.push({ name: el.dataset.game ?? '', pts });
      });
      const selector = '.game-frame-board button, .game-frame-board [role="button"], .game-frame-board input, .sudoku-cell, .wordpath-letter, .game-frame-controls-row button, .game-frame-controls-row a'  + ', .vialo-pocket';
      const targets = [...document.querySelectorAll<HTMLElement>(selector)].filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0);
      // Separating-axis test between a tilted card and an upright box.
      const hit = (pts: P[], b: DOMRect) => {
        const bp: P[] = [[b.left, b.top], [b.right, b.top], [b.right, b.bottom], [b.left, b.bottom]];
        const axes: P[] = [[1, 0], [0, 1]];
        for (let i = 0; i < 4; i++) {
          const [x1, y1] = pts[i]!, [x2, y2] = pts[(i + 1) % 4]!;
          axes.push([-(y2 - y1), x2 - x1]);
        }
        return axes.every(([ax, ay]) => {
          const a = pts.map(([x, y]) => x * ax + y * ay), c = bp.map(([x, y]) => x * ax + y * ay);
          return Math.max(...a) > Math.min(...c) && Math.max(...c) > Math.min(...a);
        });
      };
      const out = new Set<string>();
      for (const poly of polys) for (const t of targets) if (hit(poly.pts, t.getBoundingClientRect())) out.add(t.className || t.tagName);
      return [...out];
    });
  }

  for (const width of [1056, 1100, 1280, 1440]) {
    test(`at ${width} px the cards at rest cover no part of vialo, sudoku or piccline and never scroll sideways`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/play/vialo', '/play/sudoku', '/play/piccline']) {
        await page.goto(path);
        await expect(page.locator('.game-deck-item').first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${path} at ${width}`).toBeLessThanOrEqual(0);
        expect(await clashes(page), `${path} at ${width}`).toEqual([]);
      }
    });
  }

  test('no axe violations on the deck', async ({ page }) => {
    await page.goto('/play/vialo');
    const results = await new AxeBuilder({ page }).include('.game-deck').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('the deck is hidden in print', async ({ page }) => {
    await page.goto('/play/vialo');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.game-frame-deck-slot')).toBeHidden();
  });
});

test.describe('below 64rem the other games are a plain row of cards', () => {
  for (const [width, height] of [[390, 844], [820, 1180]] as const) {
    test(`${width} px: one tidy row, plain cards, no label, no tilt`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/play/vialo');
      const cards = page.locator('.game-deck-card');
      await expect(cards).toHaveCount(5);
      await expect(page.locator('.game-deck-label')).toBeHidden();
      const boxes = await cards.evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
      for (const [x, y, w, h] of boxes) {
        expect(y).toBeCloseTo(boxes[0]![1]!, 0);
        expect(w).toBeGreaterThan(0);
        expect(h).toBeGreaterThanOrEqual(44);
        expect(x! + w!).toBeLessThanOrEqual(width + 0.5);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }
});
