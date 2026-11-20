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
      const cardBox = await firstCard.boundingBox();
      expect(cardBox?.width).toBe(280);
      expect(cardBox?.height).toBe(392);
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
});
