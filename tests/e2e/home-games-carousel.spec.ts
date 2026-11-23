import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';
import { markPanelsSeen } from './clock';

test.describe('home games carousel (Home v2 Lane 5)', () => {
  test('keyboard navigation: arrow keys slide and wrap cards with visible focus', async ({ page }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');

    await page.goto('/');
    await markPanelsSeen(page);
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

    await page.goto('/');
    await markPanelsSeen(page);
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

  test('hover and focus plays looping demo, paused when idle', async ({ page }, testInfo) => {
    test.skip(!isDesktopOfEachEngine(testInfo), 'runs once per browser engine');

    await page.goto('/');
    await markPanelsSeen(page);
    const section = page.locator('#daily-games');
    await section.scrollIntoViewIfNeeded();

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
      await page.goto('/');
      await markPanelsSeen(page);

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
      await page.goto('/');
      await markPanelsSeen(page);

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

      // Cards are 280px wide
      const firstCard = section.locator('[data-game-card]').first();
      const cardSize = await firstCard.evaluate((el) => {
        const card = el as HTMLElement;
        return { width: card.offsetWidth, height: card.offsetHeight };
      });
      expect(cardSize.width).toBe(280);
      expect(cardSize.height).toBe(392);
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
      await page.goto('/');
      await markPanelsSeen(page);

      const section = page.locator('#daily-games');
      await section.scrollIntoViewIfNeeded();

      const car = section.locator('[data-games-car]');
      const cards = section.locator('[data-game-card]');
      await expect(cards.nth(0)).toHaveClass(/on/);

      // Simulate touch swipe left on car element (dx < -40)
      await car.evaluate((el) => {
        const touchStart = new Touch({
          identifier: 0,
          target: el,
          clientX: 300,
          clientY: 200,
        });
        const touchEnd = new Touch({
          identifier: 0,
          target: el,
          clientX: 100,
          clientY: 200,
        });
        el.dispatchEvent(new TouchEvent('touchstart', { touches: [touchStart], changedTouches: [touchStart], bubbles: true }));
        el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [touchEnd], bubbles: true }));
      });

      // After swipe left, active card advances to index 1 (tachyyy)
      await expect(cards.nth(1)).toHaveClass(/on/);

      // Simulate touch swipe right on car element (dx > 40)
      await car.evaluate((el) => {
        const touchStart = new Touch({
          identifier: 0,
          target: el,
          clientX: 100,
          clientY: 200,
        });
        const touchEnd = new Touch({
          identifier: 0,
          target: el,
          clientX: 300,
          clientY: 200,
        });
        el.dispatchEvent(new TouchEvent('touchstart', { touches: [touchStart], changedTouches: [touchStart], bubbles: true }));
        el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [touchEnd], bubbles: true }));
      });

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

    await page.goto('/');
    await markPanelsSeen(page);
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
      await page.goto('/');
      await markPanelsSeen(page);

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

    await page.goto('/');
    await markPanelsSeen(page);

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
      await page.goto('/');
      await markPanelsSeen(page);

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

      // Controls and heading are on separate rows: buttons are below heading
      const headingBox = await heading.boundingBox();
      const prevBox = await prevBtn.boundingBox();
      const nextBox = await nextBtn.boundingBox();

      expect(prevBox?.y ?? 0).toBeGreaterThanOrEqual((headingBox?.y ?? 0) + (headingBox?.height ?? 0));
      expect(nextBox?.y ?? 0).toBeGreaterThanOrEqual((headingBox?.y ?? 0) + (headingBox?.height ?? 0));

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
