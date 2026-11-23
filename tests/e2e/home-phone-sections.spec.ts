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
    await page.goto('/');
    await markPanelsSeen(page);
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
    const second = (await section.locator('[data-game-card]').nth(1).boundingBox())!;
    // The desktop card is 280 × 392.
    expect(Math.round(first.width)).toBe(280);
    expect(first.height).toBeGreaterThanOrEqual(392);
    expect(first.height).toBeLessThan(420);
    // The next card shows at least 48 px, and is cut off by the window, so it reads as "more this way".
    expect(390 - second.x).toBeGreaterThanOrEqual(48);
    expect(second.x + second.width).toBeGreaterThan(390);

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
      const pause = bottom('#ways-to-study', '[data-modes-pause]');
      const gamesHeading = top('#games-heading');
      const playLink = bottom('#daily-games', '[data-testid="games-link"]');
      const signupCard = top('.signup-card');
      return { shelf: gamesHeading - pause, signup: signupCard - playLink };
    });
    expect(gaps.shelf).toBeLessThanOrEqual(96);
    expect(gaps.shelf).toBeGreaterThanOrEqual(32);
    expect(gaps.signup).toBeLessThanOrEqual(96);
    expect(gaps.signup).toBeGreaterThanOrEqual(32);
  });
});
