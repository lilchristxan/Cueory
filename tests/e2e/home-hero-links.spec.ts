import { expect, test } from '@playwright/test';
import { accountLaunch, accountsOpen, newsletter, showsHeroJoin } from '../../src/config/site';
import { isDesktopOfEachEngine } from './projects';

// The quiet join link shows only once it leads somewhere (accounts open or the Kit form set): see showsHeroJoin.
const joinShown = showsHeroJoin(accountsOpen, newsletter.formAction, newsletter.landingUrl);
const launch = accountLaunch(accountsOpen);

// Lane 14 home polish: the hero points to today's games (/play) and quietly to the launch list, by keyboard and touch,
// in Light and Evening, without sideways scroll, including a 320 px screen with 32 px text.
const sizes = [
  { width: 320, height: 720, rootText: '32px' },
  { width: 390, height: 844, rootText: '' },
  { width: 1440, height: 900, rootText: '' },
] as const;

for (const size of sizes) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`home hero links: ${size.width}px${size.rootText ? ' with ' + size.rootText + ' text' : ''} in ${scheme}`, async ({ browser }, testInfo) => {
      test.skip(!isDesktopOfEachEngine(testInfo), 'the size and scheme checks run once per browser engine');
      const context = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        viewport: { width: size.width, height: size.height },
        colorScheme: scheme,
        reducedMotion: 'reduce',
        hasTouch: true,
      });
      try {
        await context.addInitScript(() => {
          try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); }
          catch { /* The home page also works without storage. */ }
        });
        const page = await context.newPage();
        await page.goto('/');
        if (size.rootText) {
          const rootText = size.rootText;
          await page.evaluate((value) => document.documentElement.style.setProperty('font-size', value, 'important'), rootText);
          await expect(page.locator('html')).toHaveCSS('font-size', rootText);
        }

        const hero = page.locator('.scene-hero');
        const play = hero.getByTestId('hero-play');
        const join = hero.getByTestId('hero-join');
        await expect(play).toHaveText("play today's games");
        await expect(play).toHaveAttribute('href', '/play');
        if (!joinShown) {
          // No dead end: with no form and accounts closed, the hero has only its play button.
          await expect(join).toHaveCount(0);
          await expect(hero.getByRole('link')).toHaveCount(1);
        } else {
          await expect(join).toHaveText(launch.promoJoinLabel);
          await expect(join).toHaveAttribute('href', launch.accountHref);
        }

        for (const link of joinShown ? [play, join] : [play]) {
          const box = (await link.boundingBox())!;
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);

        // Keyboard: the play button takes real keyboard focus with a visible ring, and Enter opens the games hub.
        await play.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(play).toBeFocused();
        const playRing = await play.evaluate((el) => {
          const style = getComputedStyle(el);
          return el.matches(':focus-visible') && style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
        });
        expect(playRing).toBe(true);
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/play\/?$/);

        if (joinShown) {
          await page.goto('/');
          // The quiet link is underlined, so it never relies on color alone to read as a link.
          expect(await join.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain('underline');
          await play.focus();
          await page.keyboard.press('Tab');
          await expect(join).toBeFocused();
          const ring = await join.evaluate((el) => {
            const style = getComputedStyle(el);
            return el.matches(':focus-visible') && style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
          });
          expect(ring).toBe(true);
          await page.keyboard.press('Enter');
          if (launch.accountHref === '/#signup') {
            await expect(page).toHaveURL(/\/#signup$/);
            await expect(page.locator('#signup')).toBeInViewport();
          } else {
            await expect(page).toHaveURL(new RegExp(launch.accountHref + '$'));
          }
        }

        // Touch: a tap on the play button opens the games hub.
        await page.goto('/');
        await page.getByTestId('hero-play').tap();
        await expect(page).toHaveURL(/\/play\/?$/);
      } finally {
        await context.close();
      }
    });
  }
}
