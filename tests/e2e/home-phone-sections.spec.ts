import { expect, test } from '@playwright/test';
import { markPanelsSeen } from './clock';
import { sizeOf } from './projects';

/*
  Phone parity for the home page below the hero: the games carousel keeps the desktop card with a clear peek of the next card, and
  the sections sit about 64 px apart. Phone-size only: the desktop layout is covered by the other home specs.
*/
test.describe('home below the hero on a phone', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(sizeOf(testInfo) !== 'phone', 'phone layout only');
    await markPanelsSeen(page);
    await page.goto('/');
  });

  test('games carousel: the desktop card, arrows beside "play today\'s" and a clear peek of the next card', async ({ page }) => {
    const section = page.locator('#daily-games');
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator('[data-games-carousel]')).toHaveAttribute('data-carousel-state', 'settled');

    const first = (await section.locator('[data-game-card]').nth(0).boundingBox())!;
    // The desktop card is 280 × 392.
    expect(Math.round(first.width)).toBe(280);
    expect(first.height).toBeGreaterThanOrEqual(392);
    expect(first.height).toBeLessThan(420);
    // What is really VISIBLE of the next card: its box cut by the carousel's clip box and by the document. At least
    // 48 px shows, and the card runs on past the clip, so it reads as "more this way".
    const visible = await section.evaluate((root) => {
      const car = root.querySelector('[data-games-car]')!.getBoundingClientRect();
      const next = root.querySelectorAll('[data-game-card]')[1]!.getBoundingClientRect();
      const left = Math.max(next.left, car.left, 0);
      const right = Math.min(next.right, car.right, document.documentElement.clientWidth);
      return { width: right - left, clipsAt: Math.min(car.right, document.documentElement.clientWidth), nextRight: next.right };
    });
    expect(visible.width).toBeGreaterThanOrEqual(48);
    expect(visible.nextRight).toBeGreaterThan(visible.clipsAt);

    // The status line sits at the foot of the face (not right under the description), as on desktop.
    const status = (await section.locator('[data-game-card]').nth(0).locator('.gstatus').boundingBox())!;
    expect(first.y + first.height - (status.y + status.height)).toBeLessThan(120);

    // The arrows are at least 44 × 44, in the same row as "play today's", and none floats above the cards.
    const action = (await section.getByTestId('games-link').boundingBox())!;
    for (const name of ['previous game', 'next game']) {
      const box = (await section.getByRole('button', { name }).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.y).toBeGreaterThan(first.y + first.height);
      expect(Math.abs(box.y + box.height / 2 - (action.y + action.height / 2))).toBeLessThan(8);
    }
    await section.getByRole('button', { name: 'next game' }).click();
    await expect(section.locator('[data-game-card]').nth(1)).toHaveClass(/on/);
  });

  test('sections sit about 64 px apart, with no large empty bands', async ({ page }) => {
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
    });
    const gaps = await page.evaluate(() => {
      const bottom = (selector: string, last: string) => {
        const els = [...document.querySelectorAll(`${selector} ${last}`)];
        return Math.max(...els.map((el) => el.getBoundingClientRect().bottom + scrollY));
      };
      const top = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().top + scrollY;
      const playLink = bottom('#daily-games', '[data-testid="games-link"]');
      const shelfHeading = top('#platter-heading');
      const pause = bottom('#ways-to-study', '[data-platter-stage]');
      const signupCard = top('.soon-card');
      return { shelf: shelfHeading - playLink, signup: signupCard - pause };
    });
    expect(gaps.shelf).toBeLessThanOrEqual(96);
    expect(gaps.shelf).toBeGreaterThanOrEqual(32);
    expect(gaps.signup).toBeLessThanOrEqual(96);
    expect(gaps.signup).toBeGreaterThanOrEqual(32);
  });
});

// Christian's final home board (20 Nov), on every size: hero, explore bar, nurse's station games, one lesson / multiple
// ways to study, launch updates. The explore bar's "study materials" tile still lands on the vial section.
test.describe('home section order', () => {
  test('games come before the vials, then the signup; #ways-to-study still anchors the vials', async ({ page }) => {
    await page.goto('/');
    const tops = await page.evaluate(() =>
      ['daily-games', 'ways-to-study', 'signup'].map((id) => document.getElementById(id)!.getBoundingClientRect().top + scrollY),
    );
    expect(tops[0]).toBeLessThan(tops[1]!);
    expect(tops[1]).toBeLessThan(tops[2]!);
    await page.goto('/#ways-to-study');
    await expect(page.locator('#ways-to-study')).toBeInViewport();
  });
});

// Christian's dot pager under the games carousel (23 Nov): 8 px dots, the current one a 26 x 8 px pill, each a
// real button whose whole 44 x 44 box takes the tap, boxes side by side without overlap, in step with the arrows and the keyboard. Every size.
test.describe('games carousel dot pager', () => {
  test('one real button per card, sized as picked, moving the carousel and following the arrows and keys', async ({ page }) => {
    await markPanelsSeen(page);
    await page.goto('/');
    const section = page.locator('#daily-games');
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator('[data-games-carousel]')).toHaveAttribute('data-carousel-state', 'settled');

    const dots = section.locator('[data-games-dot]');
    await expect(dots).toHaveCount(6);
    const current = section.locator('[data-games-dot][aria-current="true"]');
    await expect(current).toHaveCount(1);
    await expect(dots.nth(0)).toHaveAttribute('aria-current', 'true');

    // The drawn dot (::after) is 8 x 8, the current one 26 x 8, centred inside a 44 x 44 button; the boxes never overlap.
    const sizes = await dots.evaluateAll((els) =>
      els.map((el) => {
        const rect = el.getBoundingClientRect();
        const dot = getComputedStyle(el, '::after');
        const w = parseFloat(dot.width);
        const centre = rect.x + rect.width / 2;
        return { x: rect.x, y: rect.y, right: rect.right, boxW: rect.width, boxH: rect.height, w, h: parseFloat(dot.height), left: centre - w / 2, dotRight: centre + w / 2, clip: getComputedStyle(el).clipPath };
      }),
    );
    for (const dot of sizes) {
      expect(dot.boxW).toBeGreaterThanOrEqual(44);
      expect(dot.boxH).toBeGreaterThanOrEqual(44);
      expect(dot.h).toBeCloseTo(8, 0);
      expect(dot.clip).toBe('none');
      expect(dot.left).toBeGreaterThanOrEqual(dot.x);
      expect(dot.dotRight).toBeLessThanOrEqual(dot.right);
    }
    expect(sizes[0]!.w).toBeCloseTo(26, 0);
    for (const dot of sizes.slice(1)) expect(dot.w).toBeCloseTo(8, 0);
    // Same row: each box starts after the previous one ends (no overlap).
    for (let i = 1; i < sizes.length; i += 1) {
      if (Math.abs(sizes[i]!.y - sizes[i - 1]!.y) < 1) expect(sizes[i]!.x).toBeGreaterThanOrEqual(sizes[i - 1]!.right - 0.01);
    }

    // The whole box is the target: the first and the last pixel of every button hit that button, and a real click on
    // the first pixel of the first button and the last pixel of the last one lands on them.
    await dots.nth(0).scrollIntoViewIfNeeded();
    const hits = await dots.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const at = (x: number, y: number) => {
          const hit = document.elementFromPoint(x, y);
          return hit === el ? 'ok' : `own ${el.getAttribute('aria-label')} rect ${r.left},${r.top},${r.right},${r.bottom}; got ${hit?.getAttribute('aria-label')} at ${x},${y}`;
        };
        // Pixels are whole: the first and last whole pixel inside the (possibly fractional) box.
        const l = Math.ceil(r.left) + 0.5;
        const t = Math.ceil(r.top) + 0.5;
        const rt = Math.floor(r.right) - 0.5;
        const b = Math.floor(r.bottom) - 0.5;
        return [at(l, t), at(rt, b), at(l, b), at(rt, t)];
      }),
    );
    expect(hits.flat().filter((h) => h !== 'ok'), 'corner pixels that miss their own pager button').toEqual([]);
    const lastBox = (await dots.nth(5).boundingBox())!;
    await page.mouse.click(Math.floor(lastBox.x + lastBox.width) - 0.5, Math.floor(lastBox.y + lastBox.height) - 0.5);
    await expect(dots.nth(5)).toHaveAttribute('aria-current', 'true');
    const firstBox = (await dots.nth(0).boundingBox())!;
    await page.mouse.click(Math.ceil(firstBox.x) + 0.5, Math.ceil(firstBox.y) + 0.5);
    await expect(dots.nth(0)).toHaveAttribute('aria-current', 'true');

    // The accessible names say the game and the place.
    await expect(section.getByRole('button', { name: 'vialo, 1 of 6' })).toBeVisible();

    // A dot moves the carousel; the card and the pill follow.
    // A tap a little above the drawn dot (inside its 44 px hit area) still picks that dot.
    const box = (await dots.nth(3).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 14);
    await expect(section.locator('[data-game-card]').nth(3)).toHaveClass(/on/);
    await expect(dots.nth(3)).toHaveAttribute('aria-current', 'true');
    await expect(current).toHaveCount(1);

    // The arrows and the keyboard keep it in step.
    await section.getByRole('button', { name: 'next game' }).click();
    await expect(dots.nth(4)).toHaveAttribute('aria-current', 'true');
    await section.getByRole('button', { name: 'previous game' }).click();
    await expect(dots.nth(3)).toHaveAttribute('aria-current', 'true');
    await section.locator('[data-game-card]').nth(3).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(dots.nth(2)).toHaveAttribute('aria-current', 'true');

    // Keyboard: a dot takes focus with a visible ring and Enter moves the carousel.
    await dots.nth(5).focus();
    await expect(dots.nth(5)).toBeFocused();
    const ring = await dots.nth(5).evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth));
    expect(ring).toBeGreaterThan(0);
    await page.keyboard.press('Enter');
    await expect(dots.nth(5)).toHaveAttribute('aria-current', 'true');
    await expect(section.locator('[data-game-card]').nth(5)).toHaveClass(/on/);

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  });

  test('the pager row fits at 320 px with very large text: it wraps, targets stay 44 px, nothing scrolls sideways', async ({ page }) => {
    await markPanelsSeen(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '32px';
    });
    const section = page.locator('#daily-games');
    await section.scrollIntoViewIfNeeded();
    const result = await section.locator('[data-games-dot]').evaluateAll((els) => {
      const rects = els.map((el) => el.getBoundingClientRect());
      return {
        minSide: Math.min(...rects.map((r) => Math.min(r.width, r.height))),
        maxRight: Math.max(...rects.map((r) => r.right)),
        minLeft: Math.min(...rects.map((r) => r.left)),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });
    expect(result.minSide).toBeGreaterThanOrEqual(44);
    expect(result.minLeft).toBeGreaterThanOrEqual(0);
    expect(result.maxRight).toBeLessThanOrEqual(result.clientWidth);
    expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth);
  });
});
