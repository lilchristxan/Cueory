import { expect, test, type Page } from '@playwright/test';
import { markGameRulesSeen } from './clock';

// wordpill's Evening wordmark (the game formerly called vialo; Christian approved the thin ivory rim, 2026-11-26) is the Daytime
// artwork with a different rim colour in a canvas of the same size, so it must take exactly the Daytime wordmark's box in Light
// and Evening, on the game page's sidebar and on the /play hub.
const EVENING = '/design/games-v2/assets/wordpill-wordmark-dark.svg';
const DAY = '/design/games-v2/assets/wordpill-wordmark-light.svg';

test.beforeEach(async ({ page }) => {
  await markGameRulesSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem('cueory-promo-seen', String(Date.now()));
    localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
  });
});

/** The letters' box: the visible image's layout box (what the Daytime file fills), centred where the scaled image is. */
const lettersBox = (page: Page, selector: string) =>
  page.locator(selector).evaluateAll((imgs) => {
    const img = imgs.find((node) => (node as HTMLElement).offsetParent !== null) as HTMLImageElement | undefined;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const scale = Number.parseFloat(getComputedStyle(img).scale) || 1;
    const width = rect.width / scale;
    const height = rect.height / scale;
    return { src: new URL(img.src).pathname, x: rect.x + rect.width / 2 - width / 2, y: rect.y + rect.height / 2 - height / 2, width, height };
  });

for (const [name, path, selector] of [
  ['the game page sidebar', '/play/wordpill', '.game-frame-wordmark-img'],
  ['the /play hub row', '/play', '[data-testid="play-status-pulse"] .logo img'],
] as const) {
  test(`${name}: Evening uses the rimmed wordmark, with the same letter box as Light (within 1 px)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(path);
    await page.locator(selector).first().waitFor({ state: 'attached' });
    const light = await lettersBox(page, selector);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(path);
    await page.locator(selector).first().waitFor({ state: 'attached' });
    const evening = await lettersBox(page, selector);
    expect(light?.src).toBe(DAY);
    expect(evening?.src).toBe(EVENING);
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(evening![key] - light![key]), `${name} ${key}`).toBeLessThanOrEqual(1);
    }
  });
}
