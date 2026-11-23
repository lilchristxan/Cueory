import { expect, test } from '@playwright/test';
import { studyModes } from '../../src/config/modes';
import { markPanelsSeen } from './clock';
import { sizeOf } from './projects';

/*
  Phone parity for the home page below the hero: the vial shelf shows about five vials with arrows at the sides and a
  "1 of 11" counter instead of dots, the games carousel keeps the desktop card with a clear peek of the next card, and
  the sections sit about 64 px apart. Phone-size only: the desktop layout is covered by the other home specs.
*/
test.describe('home below the hero on a phone', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(sizeOf(testInfo) !== 'phone', 'phone layout only');
    await markPanelsSeen(page);
    await page.goto('/');
  });

  test('vial shelf: about five vials, 44 px arrows at the sides, dots and a readable caption', async ({ page }) => {
    const section = page.locator('#ways-to-study');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toHaveAttribute('data-ring', '');
    await expect(section.locator('[data-modes-controls]')).not.toHaveClass(/invisible/);

    const shown = section.locator('[data-mode-card]:not([data-far])');
    await expect(shown).toHaveCount(5);

    // The front vial's name is readable: at least 10 px (it was a few vials too big before, now smaller but legible).
    const nameSize = await section.locator('[data-mode-card][data-active] .vial-name').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(nameSize).toBeGreaterThanOrEqual(10);

    for (const label of ['previous study mode', 'next study mode']) {
      const arrow = section.locator('[data-modes-controls]').getByRole('button', { name: label });
      const box = (await arrow.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      // Beside the vials, not under them: inside the window and above the shelf's pedestal.
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }

    // The dots show the position (they are a picture, not buttons); one readable line under them names the front vial.
    await expect(section.locator('.modes-dots')).toBeVisible();
    const caption = section.locator('[data-modes-caption]');
    // The ring slides on its own every six seconds, so take it over first (Home on the card group is a keyboard use):
    // "video then cards" only holds once autoplay is off and the video vial is in front.
    await section.getByRole('group', { name: 'study mode cards' }).press('Home');
    await expect(section).toHaveAttribute('data-autoplay', 'off');
    await expect(caption).toHaveText(`${studyModes[0]!.name}, ${studyModes[0]!.time} min`);
    await section.getByRole('button', { name: 'next study mode' }).first().click();
    await expect(caption).toHaveText(`${studyModes[1]!.name}, ${studyModes[1]!.time} min`);
    expect(await caption.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
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
      const shelfHeading = top('#modes-heading');
      const pause = bottom('#ways-to-study', '[data-modes-pause]');
      const signupCard = top('.signup-card');
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

// Christian's dot pager under the games carousel (23 Nov): 8 px dots 16 px apart, the current one a 26 x 8 px pill, each a
// real button with a 44 x 44 hit area, in step with the arrows and the keyboard. Every size.
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

    const sizes = await dots.evaluateAll((els) =>
      els.map((el) => {
        const rect = el.getBoundingClientRect();
        const hit = getComputedStyle(el, '::before');
        return { w: rect.width, h: rect.height, x: rect.x, hitW: parseFloat(hit.width), hitH: parseFloat(hit.height) };
      }),
    );
    expect(sizes[0]!.w).toBeCloseTo(26, 0);
    expect(sizes[0]!.h).toBeCloseTo(8, 0);
    for (const dot of sizes.slice(1)) {
      expect(dot.w).toBeCloseTo(8, 0);
      expect(dot.h).toBeCloseTo(8, 0);
      // 44 px tall; sideways it reaches halfway into the gaps (44 px wide boxes would overlap and steal each other's taps).
      expect(dot.hitW).toBeGreaterThanOrEqual(24);
      expect(dot.hitH).toBeGreaterThanOrEqual(44);
    }
    // 16 px apart (the picked 8 px fails the 24 px target-size rule: centres must be 24 px apart).
    expect(sizes[1]!.x - (sizes[0]!.x + sizes[0]!.w)).toBeCloseTo(16, 0);

    // The accessible names say the game and the place.
    await expect(section.getByRole('button', { name: 'vialo, 1 of 6' })).toBeVisible();

    // A dot moves the carousel; the card and the pill follow.
    // A tap just above the dot's own box (inside its hit area) still picks that dot.
    const box = (await dots.nth(3).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y - 14);
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
});
