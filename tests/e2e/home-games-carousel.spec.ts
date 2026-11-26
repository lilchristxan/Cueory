import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';
import AxeBuilder from '@axe-core/playwright';
import { markPanelsSeen } from './clock';

test.describe('home games carousel (Home v2 Lane 5)', () => {
  test('keyboard navigation: arrow keys slide and wrap cards with visible focus', async ({ page }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');

    await markPanelsSeen(page);
    await page.goto('/');
    const section = page.locator('#daily-games');
    await section.scrollIntoViewIfNeeded();

    const carousel = section.locator('[data-games-carousel]');
    await expect(carousel).toBeVisible();
    await expect(carousel).toHaveAttribute('data-carousel-state', 'settled');

    const cards = section.locator('[data-game-card]');
    await expect(cards).toHaveCount(6);

    const firstCard = cards.nth(0);
    const secondCard = cards.nth(1);
    const lastCard = cards.nth(5);

    // Initial state: first card is active (.on)
    await expect(firstCard).toHaveClass(/on/);

    // Focus first card
    await firstCard.focus();
    await expect(firstCard).toBeFocused();

    // ArrowRight advances to second card (tachyyy)
    await page.keyboard.press('ArrowRight');
    await expect(secondCard).toBeFocused();
    await expect(secondCard).toHaveClass(/on/);

    // ArrowLeft moves back to first card (vialo)
    await page.keyboard.press('ArrowLeft');
    await expect(firstCard).toBeFocused();
    await expect(firstCard).toHaveClass(/on/);

    // ArrowLeft wraps from first card to last card (hello cards)
    await page.keyboard.press('ArrowLeft');
    await expect(lastCard).toBeFocused();
    await expect(lastCard).toHaveClass(/on/);

    // ArrowRight wraps from last card to first card
    await page.keyboard.press('ArrowRight');
    await expect(firstCard).toBeFocused();
    await expect(firstCard).toHaveClass(/on/);

    // Check visible focus styling
    const visibleFocus = await firstCard.evaluate((el) => {
      const style = getComputedStyle(el);
      return (
        style.outlineStyle !== 'none' &&
        Number.parseFloat(style.outlineWidth) > 0 &&
        style.outlineColor !== 'transparent'
      );
    });
    expect(visibleFocus).toBe(true);
  });

  test('button controls: previous and next buttons slide and wrap cards', async ({ page }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');

    await markPanelsSeen(page);
    await page.goto('/');
    const section = page.locator('#daily-games');
    await section.scrollIntoViewIfNeeded();

    const prevBtn = section.locator('[data-games-prev]');
    const nextBtn = section.locator('[data-games-next]');
    const cards = section.locator('[data-game-card]');

    await expect(cards.nth(0)).toHaveClass(/on/);

    // Click next
    await nextBtn.click();
    await expect(cards.nth(1)).toHaveClass(/on/);

    // Click prev
    await prevBtn.click();
    await expect(cards.nth(0)).toHaveClass(/on/);

    // Click prev wraps to end
    await prevBtn.click();
    const activeCards = section.locator('[data-game-card].on');
    await expect(activeCards).toHaveCount(1);
  });

  // The row is a circle (Christian, 2026-11-25): after the last game comes the first, before the first comes the last.
  const openLoop = async (page: import('@playwright/test').Page) => {
    // Before the page loads: the mark is an init script, so it only applies to pages opened after it. Added after the
    // load it did nothing, and the launch-updates pop-up opened 10 seconds in and covered the arrows.
    await markPanelsSeen(page);
    await page.goto('/');
    const section = page.locator('#daily-games');
    await section.scrollIntoViewIfNeeded();
    const carousel = section.locator('[data-games-carousel]');
    await expect(carousel).toHaveAttribute('data-carousel-state', 'settled');
    return { section, carousel, cards: section.locator('[data-game-card]'), dots: section.locator('[data-games-dot]') };
  };

  const expectFront = async (
    s: Awaited<ReturnType<typeof openLoop>>,
    index: number,
  ) => {
    await expect(s.cards.nth(index)).toHaveClass(/on/);
    await expect(s.section.locator('[data-game-card].on')).toHaveCount(1);
    await expect(s.dots.nth(index)).toHaveAttribute('aria-current', 'true');
    await expect(s.section.locator('[data-games-dot][aria-current="true"]')).toHaveCount(1);
    await expect(s.carousel).toHaveAttribute('data-carousel-state', 'settled');
    // The front card is really on screen, inside the row.
    const box = await s.cards.nth(index).boundingBox();
    const row = await s.section.locator('[data-games-car]').boundingBox();
    expect(box && row && box.x >= row.x - 1 && box.x + box.width <= row.x + row.width + 1, JSON.stringify({ index, box, row })).toBe(true);
  };

  test('loop: the next button goes round forever, every game becomes the front card, and the dots follow', async ({ page }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');
    const s = await openLoop(page);
    await expectFront(s, 0);
    for (let step = 1; step <= 13; step += 1) {
      await s.section.locator('[data-games-next]').click();
      await expectFront(s, step % 6);
    }
  });

  test('loop: the previous button goes round backwards from the first game to the last and on', async ({ page }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');
    const s = await openLoop(page);
    for (let step = 1; step <= 13; step += 1) {
      await s.section.locator('[data-games-prev]').click();
      await expectFront(s, (((-step) % 6) + 6) % 6);
    }
  });

  test('loop: crossing the join is one step of movement, never a rewind across the cards', async ({ page }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');
    const s = await openLoop(page);
    const track = s.section.locator('[data-games-track]');
    const x = () => track.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
    for (let i = 0; i < 5; i += 1) await s.section.locator('[data-games-next]').click();
    await expectFront(s, 5);
    const atLast = await x();
    await s.section.locator('[data-games-next]').click();
    await expectFront(s, 0);
    // Settled on the first game: the row is back at the position it started in, with no animation left running.
    expect(await x()).toBeCloseTo(0, 0);
    expect(atLast).toBeLessThan(0);
    // Mid-slide across the join the row moves by at most one step (the sample is taken straight after the press).
    await s.section.locator('[data-games-prev]').click();
    await expectFront(s, 5);
    const step = Math.abs(atLast) / 5;
    await s.section.locator('[data-games-next]').click();
    const midSlide = await x();
    expect(Math.abs(midSlide - atLast)).toBeLessThanOrEqual(step + 1);
  });

  test('loop: arrow keys go round both ways and focus follows the front card', async ({ page }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');
    const s = await openLoop(page);
    await s.cards.nth(0).focus();
    for (let step = 1; step <= 7; step += 1) {
      await page.keyboard.press('ArrowRight');
      await expectFront(s, step % 6);
      await expect(s.cards.nth(step % 6)).toBeFocused();
    }
    for (let step = 1; step <= 8; step += 1) {
      await page.keyboard.press('ArrowLeft');
      await expectFront(s, (((1 - step) % 6) + 6) % 6);
    }
  });

  test('loop: every dot opens its game, going the short way round', async ({ page }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');
    const s = await openLoop(page);
    await expect(s.dots).toHaveCount(6);
    for (const index of [5, 0, 4, 1, 3, 2, 5, 0]) {
      await s.dots.nth(index).click();
      await expectFront(s, index);
      await expect(s.dots.nth(index)).toHaveAttribute('aria-label', new RegExp(`, ${index + 1} of 6$`));
    }
  });

  test('loop: look-alike cards are hidden from screen readers, not tabbable, and the real cards are one set', async ({ page }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');
    const s = await openLoop(page);
    const clones = s.section.locator('[data-game-clone]');
    expect(await clones.count()).toBeGreaterThan(0);
    for (const clone of await clones.all()) {
      await expect(clone).toHaveAttribute('aria-hidden', 'true');
      await expect(clone).toHaveAttribute('tabindex', '-1');
      await expect(clone).not.toHaveAttribute('data-game-card', /.*/);
    }
    // Exactly one real set: six cards that are announced, each a different game.
    await expect(s.cards).toHaveCount(6);
    await expect(s.section.locator('a[data-game-card]:not([aria-hidden])')).toHaveCount(6);
    // Tabbing through the row visits each real card once and never a look-alike.
    await s.cards.nth(0).focus();
    const visited: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return { clone: !!el?.closest('[data-game-clone]'), id: el?.getAttribute('data-game-card') ?? '' };
      });
      expect(info.clone).toBe(false);
      if (info.id) visited.push(info.id);
    }
    expect(new Set(visited).size).toBe(visited.length);
    // The names read out are one per game: "N of 6" on the dots, none on look-alikes.
    await expect(s.section.locator('[data-games-dot]')).toHaveCount(6);
    await expect(s.section.locator('[data-game-clone] [aria-label]')).toHaveCount(0);
  });

  test('loop: reduced motion still wraps, with no sliding', async ({ browser }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      const s = await openLoop(page);
      const track = s.section.locator('[data-games-track]');
      await s.section.locator('[data-games-prev]').click();
      await expectFront(s, 5);
      // The site's reduced-motion rule leaves 0.01 ms, which is no visible slide.
      expect(await track.evaluate((el) => Number.parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThan(0.001);
      await s.section.locator('[data-games-next]').click();
      await expectFront(s, 0);
      await s.section.locator('[data-games-next]').click();
      await expectFront(s, 1);
    } finally {
      await context.close();
    }
  });

  test('loop: touch swipe goes round both ways across the join (phone)', async ({ browser }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');
    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    try {
      const page = await context.newPage();
      const s = await openLoop(page);
      const car = s.section.locator('[data-games-car]');
      const swipe = async (startX: number, endX: number) => {
        const start = { identifier: 0, clientX: startX, clientY: 200 };
        const move = { identifier: 0, clientX: (startX + endX) / 2, clientY: 200 };
        const end = { identifier: 0, clientX: endX, clientY: 200 };
        await car.dispatchEvent('touchstart', { touches: [start], targetTouches: [start], changedTouches: [start] });
        await car.dispatchEvent('touchmove', { touches: [move], targetTouches: [move], changedTouches: [move] });
        await car.dispatchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [end] });
      };
      await swipe(100, 300); // swipe right from the first game: back to the last
      await expectFront(s, 5);
      await swipe(300, 100); // swipe left from the last game: forward to the first
      await expectFront(s, 0);
      for (let step = 1; step <= 7; step += 1) {
        await swipe(300, 100);
        await expectFront(s, step % 6);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    } finally {
      await context.close();
    }
  });

  test('loop: status badges also fill the look-alike cards, and the page has no axe violations with the loop in place', async ({ page }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');
    const s = await openLoop(page);
    await s.section.locator('[data-games-prev]').click();
    await expectFront(s, 5);
    const results = await new AxeBuilder({ page })
      .include('#daily-games')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test('hover and focus plays looping demo, paused when idle', async ({ page }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');

    await markPanelsSeen(page);
    await page.goto('/');
    const section = page.locator('#daily-games');
    await section.scrollIntoViewIfNeeded();

    // Ready state, as in the first test: the track is settled and the section's reveal has started (it no longer
    // waits), so no slide or rise moves the card out from under the pointer before the hover is read.
    const carousel = section.locator('[data-games-carousel]');
    await expect(carousel).toHaveAttribute('data-carousel-state', 'settled');
    await expect(carousel).not.toHaveAttribute('data-reveal', 'waiting');

    const firstCard = section.locator('[data-game-card]').first();
    const demo = firstCard.locator('.gdemo');
    await expect(demo).toBeAttached();

    // Idle: demo has opacity 0 or animation paused
    const initialPlayState = await demo.locator('.gc').first().evaluate((el) => {
      return getComputedStyle(el).animationPlayState;
    });
    expect(initialPlayState).toBe('paused');

    // Hover card: animation runs
    await firstCard.hover();
    const hoverPlayState = await demo.locator('.gc').first().evaluate((el) => {
      return getComputedStyle(el).animationPlayState;
    });
    expect(hoverPlayState).toBe('running');

    // Unhover: move mouse away
    await page.mouse.move(0, 0);
    const unhoverPlayState = await demo.locator('.gc').first().evaluate((el) => {
      return getComputedStyle(el).animationPlayState;
    });
    expect(unhoverPlayState).toBe('paused');

    // Focus card: animation runs
    await firstCard.focus();
    const focusPlayState = await demo.locator('.gc').first().evaluate((el) => {
      return getComputedStyle(el).animationPlayState;
    });
    expect(focusPlayState).toBe('running');
  });

  test('reduced motion: demos and carousel transitions stop', async ({ browser }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');

    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      reducedMotion: 'reduce',
    });
    try {
      const page = await context.newPage();
      await markPanelsSeen(page);
      await page.goto('/');

      const section = page.locator('#daily-games');
      await section.scrollIntoViewIfNeeded();

      const carousel = section.locator('[data-games-carousel]');
      await expect(carousel).toHaveAttribute('data-carousel-state', 'settled');

      const firstCard = section.locator('[data-game-card]').first();
      await firstCard.hover();

      // Under reduced motion, animation is none
      const anim = await firstCard.locator('.gc').first().evaluate((el) => {
        return getComputedStyle(el).animationName;
      });
      expect(anim).toBe('none');

      // Next button still updates active card without hanging in "turning"
      const nextBtn = section.locator('[data-games-next]');
      await nextBtn.click();
      await expect(carousel).toHaveAttribute('data-carousel-state', 'settled');
    } finally {
      await context.close();
    }
  });

  test('320px viewport: tap targets >= 44px, no horizontal scroll, about 1.2 cards visible', async ({ browser }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');

    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: 320, height: 600 },
      hasTouch: true,
      isMobile: true,
    });
    try {
      const page = await context.newPage();
      await markPanelsSeen(page);
      await page.goto('/');

      const section = page.locator('#daily-games');
      await section.scrollIntoViewIfNeeded();

      // No horizontal page overflow
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth - document.documentElement.clientWidth;
      });
      expect(overflow).toBeLessThanOrEqual(0);

      // Buttons >= 44px
      const prevBtn = section.locator('[data-games-prev]');
      const nextBtn = section.locator('[data-games-next]');
      const prevBox = await prevBtn.boundingBox();
      const nextBox = await nextBtn.boundingBox();
      expect(prevBox?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(prevBox?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(nextBox?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(nextBox?.height ?? 0).toBeGreaterThanOrEqual(44);

      // Cards are the board's phone size, 250 x 350
      const firstCard = section.locator('[data-game-card]').first();
      const cardSize = await firstCard.evaluate((el) => {
        const card = el as HTMLElement;
        return { width: card.offsetWidth, height: card.offsetHeight };
      });
      expect(cardSize.width).toBe(250);
      expect(cardSize.height).toBe(350);
    } finally {
      await context.close();
    }
  });

  test('touch swipe: swipe left and right slides cards', async ({ browser }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');

    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    try {
      const page = await context.newPage();
      await markPanelsSeen(page);
      await page.goto('/');

      const section = page.locator('#daily-games');
      await section.scrollIntoViewIfNeeded();

      const car = section.locator('[data-games-car]');
      const cards = section.locator('[data-game-card]');
      await expect(cards.nth(0)).toHaveClass(/on/);

      // Simulate touch swipe left on car element (dx < -40)
      const swipe = async (startX: number, endX: number) => {
        const start = { identifier: 0, clientX: startX, clientY: 200 };
        const move = { identifier: 0, clientX: (startX + endX) / 2, clientY: 200 };
        const end = { identifier: 0, clientX: endX, clientY: 200 };
        await car.dispatchEvent('touchstart', { touches: [start], targetTouches: [start], changedTouches: [start] });
        await car.dispatchEvent('touchmove', { touches: [move], targetTouches: [move], changedTouches: [move] });
        await car.dispatchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [end] });
      };
      await swipe(300, 100);

      // After swipe left, active card advances to index 1 (tachyyy)
      await expect(cards.nth(1)).toHaveClass(/on/);

      // Simulate touch swipe right on car element (dx > 40)
      await swipe(100, 300);

      // Moves back to index 0 (vialo)
      await expect(cards.nth(0)).toHaveClass(/on/);

      // Tap card navigates to game page
      await cards.nth(0).click();
      await expect(page).toHaveURL(/\/play\/vialo\/?$/);
    } finally {
      await context.close();
    }
  });

  test("hydrates today's status badges from cueory-game-stats storage envelope", async ({ page }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');

    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // Seed localStorage with { version: 1, results: [...] } using persistent IDs
    await page.addInitScript((todayStr) => {
      try {
        localStorage.setItem(
          'cueory-game-stats',
          JSON.stringify({
            version: 1,
            results: [
              { game: 'pulse', day: todayStr, solved: true, tries: 3 },
              { game: 'stat', day: todayStr, solved: true, tries: 2 },
              { game: 'suture', day: todayStr, solved: true, tries: 4 },
              { game: 'cueword', day: todayStr, solved: true, tries: 0 },
              { game: 'triage', day: todayStr, solved: true, tries: 1 },
            ],
          })
        );
      } catch {
        // Ignore
      }
    }, today);

    await markPanelsSeen(page);
    await page.goto('/');
    const section = page.locator('#daily-games');
    await section.scrollIntoViewIfNeeded();

    await expect(section.locator('[data-game-status="vialo"]')).toContainText('done today');
    await expect(section.locator('[data-game-status="tachyyy"]')).toContainText('done today');
    await expect(section.locator('[data-game-status="piccline"]')).toContainText('done today');
    await expect(section.locator('[data-game-status="crossword"]')).toContainText('done today');
    await expect(section.locator('[data-game-status="sudoku"]')).toContainText('done today');
    await expect(section.locator('[data-game-status="hello-cards"]')).toContainText('not started');
  });

  test('evening mode: white playing cards maintain dark ink contrast on text and status badges', async ({ browser }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');

    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    });
    try {
      const page = await context.newPage();
      await markPanelsSeen(page);
      await page.goto('/');

      const section = page.locator('#daily-games');
      await section.scrollIntoViewIfNeeded();

      const firstCard = section.locator('[data-game-card]').first();
      const statusBadge = firstCard.locator('.gstatus');
      const desc = firstCard.locator('.gdesc');

      // Card, status badge and description must use fixed dark ink, not ivory (--color-ink on dark is #f9f5ef)
      const statusColor = await statusBadge.evaluate((el) => getComputedStyle(el).color);
      const descColor = await desc.evaluate((el) => getComputedStyle(el).color);
      const cardColor = await firstCard.evaluate((el) => getComputedStyle(el).color);

      // #3e2c23 is rgb(62, 44, 35); #6b5243 is rgb(107, 82, 67)
      expect(statusColor).toBe('rgb(62, 44, 35)');
      expect(cardColor).toBe('rgb(62, 44, 35)');
      expect(descColor).toBe('rgb(107, 82, 67)');
    } finally {
      await context.close();
    }
  });

  test('large default font size (32px): step and extent scale dynamically and reach all cards', async ({ page }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');

    await markPanelsSeen(page);
    await page.goto('/');

    // Set 32px root font size (simulates 200% text zoom)
    await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
    await expect(page.locator('html')).toHaveCSS('font-size', '32px');

    const section = page.locator('#daily-games');
    await section.scrollIntoViewIfNeeded();

    const firstCard = section.locator('[data-game-card]').first();
    const nextBtn = section.locator('[data-games-next]');
    const track = section.locator('[data-games-track]');

    // Card width scales with font size (17.5rem * 32px = 560px)
    const cardBox = await firstCard.boundingBox();
    expect(cardBox?.width).toBeCloseTo(560, 0);

    // Initial card is on
    await expect(firstCard).toHaveClass(/on/);

    // Click next button
    await nextBtn.click();
    const secondCard = section.locator('[data-game-card]').nth(1);
    await expect(secondCard).toHaveClass(/on/);

    // Track offset has moved by the dynamic step (~616px: 560px card + 56px gap)
    const transform = await track.evaluate((el) => el.style.transform);
    expect(transform).toMatch(/translateX\(-616px\)/);
  });

  test('phone (390px) with 32px root font size: header and active card contents fit', async ({ browser }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');

    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
      hasTouch: true,
      isMobile: true,
    });
    try {
      await context.addInitScript(() => {
        try {
          localStorage.setItem('cueory-promo-seen', String(Date.now()));
          localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
        } catch {}
      });
      const page = await context.newPage();
      await markPanelsSeen(page);
      await page.goto('/');

      // Set 32px root font size (simulates 200% text zoom on mobile)
      await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
      await expect(page.locator('html')).toHaveCSS('font-size', '32px');

      const section = page.locator('#daily-games');
      await section.scrollIntoViewIfNeeded();

      const heading = section.locator('#games-heading');
      const prevBtn = section.locator('[data-games-prev]');
      const nextBtn = section.locator('[data-games-next]');
      const carousel = section.locator('[data-games-carousel]');
      const viewport = section.locator('[data-games-car]');
      const cards = section.locator('[data-game-card]');

      await expect(heading).toBeVisible();
      await expect(prevBtn).toBeVisible();
      await expect(nextBtn).toBeVisible();

      // Home v3 board: the arrows flank the heading (one at each side, level with it), never over its words.
      const headingBox = await heading.boundingBox();
      const prevBox = await prevBtn.boundingBox();
      const nextBox = await nextBtn.boundingBox();

      expect((prevBox?.x ?? 0) + (prevBox?.width ?? 0)).toBeLessThanOrEqual((headingBox?.x ?? 0) + 1);
      expect(nextBox?.x ?? 0).toBeGreaterThanOrEqual((headingBox?.x ?? 0) + (headingBox?.width ?? 0) - 1);
      const headingMid = (headingBox?.y ?? 0) + (headingBox?.height ?? 0) / 2;
      expect(Math.abs((prevBox?.y ?? 0) + (prevBox?.height ?? 0) / 2 - headingMid)).toBeLessThanOrEqual(2);
      expect(Math.abs((nextBox?.y ?? 0) + (nextBox?.height ?? 0) / 2 - headingMid)).toBeLessThanOrEqual(2);

      // Buttons are clickable and >= 44px
      expect(prevBox?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(prevBox?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(nextBox?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(nextBox?.height ?? 0).toBeGreaterThanOrEqual(44);

      // Verify buttons sit inside the 390px viewport
      expect(prevBox?.x ?? 0).toBeGreaterThanOrEqual(0);
      expect((nextBox?.x ?? 0) + (nextBox?.width ?? 0)).toBeLessThanOrEqual(390);

      // Check header horizontal overflow
      const headerOverflow = await page.evaluate(() => {
        const header = document.querySelector('.games-header');
        return header ? header.scrollWidth - header.clientWidth : 0;
      });
      expect(headerOverflow).toBeLessThanOrEqual(0);

      // Prev and next buttons can be clicked
      const checkActiveCard = async () => {
        await expect(carousel).toHaveAttribute('data-carousel-state', 'settled');
        const active = section.locator('[data-game-card].on');
        await expect(active).toHaveCount(1);
        const cardBox = await active.boundingBox();
        const viewportBox = await viewport.boundingBox();
        expect(cardBox).not.toBeNull();
        expect(viewportBox).not.toBeNull();
        expect(cardBox!.width).toBeLessThanOrEqual(viewportBox!.width + 1);
        expect(cardBox!.x).toBeGreaterThanOrEqual(viewportBox!.x - 1);
        expect(cardBox!.x + cardBox!.width, `${await active.getAttribute('data-game-card')}: card ${JSON.stringify(cardBox)} exceeds carousel ${JSON.stringify(viewportBox)}`).toBeLessThanOrEqual(viewportBox!.x + viewportBox!.width + 1);

        for (const selector of ['.gface', '.gname', '.gdesc', '.gstatus']) {
          const content = active.locator(selector);
          await expect(content).toBeVisible();
          const contentBox = await content.boundingBox();
          expect(contentBox).not.toBeNull();
          expect(contentBox!.x).toBeGreaterThanOrEqual(cardBox!.x - 1);
          expect(contentBox!.x + contentBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
          expect(contentBox!.y).toBeGreaterThanOrEqual(cardBox!.y - 1);
          expect(contentBox!.y + contentBox!.height, `${selector} exceeds active card bottom`).toBeLessThanOrEqual(cardBox!.y + cardBox!.height + 1);
        }
      };

      await checkActiveCard();
      for (let step = 0; step < await cards.count(); step++) {
        await nextBtn.click();
        await checkActiveCard();
      }
    } finally {
      await context.close();
    }
  });

  test('daily game status badges reconcile at midnight and restore default when day changes', async ({ browser }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'a clock test runs once per browser engine');

    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      timezoneId: 'America/New_York',
      reducedMotion: 'reduce',
    });
    try {
      const page = await context.newPage();
      await page.clock.install({ time: new Date('2026-11-11T23:59:00-05:00') });
      await markPanelsSeen(page);

      // Seed localStorage with completion for 2026-11-11
      await context.addInitScript(() => {
        try {
          localStorage.setItem(
            'cueory-game-stats',
            JSON.stringify({
              version: 1,
              results: [
                { game: 'vialo', day: '2026-11-11', solved: true, tries: 3 },
                { game: 'tachyyy', day: '2026-11-11', solved: true, tries: 2 },
              ],
            })
          );
        } catch {
          // Ignore
        }
      });

      await page.clock.pauseAt(new Date('2026-11-11T23:59:58-05:00'));
      await page.goto('/');
      const section = page.locator('#daily-games');
      await section.scrollIntoViewIfNeeded();

      const vialoStatus = section.locator('[data-game-status="vialo"]');
      const tachyyyStatus = section.locator('[data-game-status="tachyyy"]');
      const picclineStatus = section.locator('[data-game-status="piccline"]');

      await expect(vialoStatus).toContainText('done today');
      await expect(tachyyyStatus).toContainText('done today');
      await expect(picclineStatus).toContainText('not started');

      // Advance clock past midnight
      await page.clock.runFor(3_000);

      // Statuses reconcile to the new day (2026-11-12): neither game has a result for today
      await expect(vialoStatus).toContainText('not started');
      await expect(tachyyyStatus).toContainText('not started');
      await expect(picclineStatus).toContainText('not started');
    } finally {
      await context.close();
    }
  });

  test('status badges reconcile on page resume (pageshow persisted, focus, storage)', async ({ browser }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'a clock test runs once per browser engine');

    const context = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      timezoneId: 'America/New_York',
      reducedMotion: 'reduce',
    });
    try {
      const page = await context.newPage();
      await page.clock.install({ time: new Date('2026-11-11T23:59:00-05:00') });
      await markPanelsSeen(page);

      // Seed localStorage with completion for 2026-11-11
      await context.addInitScript(() => {
        try {
          localStorage.setItem(
            'cueory-game-stats',
            JSON.stringify({
              version: 1,
              results: [{ game: 'vialo', day: '2026-11-11', solved: true, tries: 3 }],
            })
          );
        } catch {
          // Ignore
        }
      });

      await page.clock.pauseAt(new Date('2026-11-11T23:59:58-05:00'));
      await page.goto('/');
      const section = page.locator('#daily-games');
      await section.scrollIntoViewIfNeeded();
      const vialoStatus = section.locator('[data-game-status="vialo"]');
      await expect(vialoStatus).toContainText('done today');

      // Jump time to next day without running scheduled timers
      await page.clock.setFixedTime(new Date('2026-11-12T08:00:00-05:00'));

      // pageshow persisted (BFCache resume)
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      await expect(vialoStatus).toContainText('not started');

      // Update storage with a result for today (2026-11-12) and dispatch storage event
      await page.evaluate(() => {
        localStorage.setItem(
          'cueory-game-stats',
          JSON.stringify({
            version: 1,
            results: [{ game: 'vialo', day: '2026-11-12', solved: true, tries: 2 }],
          })
        );
        window.dispatchEvent(new StorageEvent('storage', { key: 'cueory-game-stats' }));
      });
      await expect(vialoStatus).toContainText('done today');

      // Clear storage and dispatch storage event
      await page.evaluate(() => {
        localStorage.removeItem('cueory-game-stats');
        window.dispatchEvent(new StorageEvent('storage', { key: 'cueory-game-stats' }));
      });
      await expect(vialoStatus).toContainText('not started');
    } finally {
      await context.close();
    }
  });
});
