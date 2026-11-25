import { expect, test, type Page } from '@playwright/test';

// The hero's stage photo is darker (Evening) or slightly different (Light) from the page ground. It fades out on all four
// sides, so on a screen wider than the photo no rectangle shows. This samples the drawn pixels just outside and just inside
// the photo's left, right and top edges and expects them to match.

const TOLERANCE = 6; // out of 255 per channel

// The test sets its own wide window, so it is drawn as a plain desktop browser in every project (a phone's pixel ratio would
// make the full-page picture huge).
test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

async function pixelsAt(page: Page, points: Array<[number, number]>): Promise<number[][]> {
  const shot = (await page.screenshot({ fullPage: true })).toString('base64');
  // Decoded on a blank page: the site's content security policy rightly blocks data: fetches.
  const blank = await page.context().newPage();
  await blank.goto('about:blank');
  const colours = await blank.evaluate(async ({ shot, points }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${shot}`)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    return points.map(([x, y]) => [...context.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3));
  }, { shot, points });
  await blank.close();
  return colours;
}

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [1920, 2560]) {
    test(`${scheme} ${width}px: the hero photo blends into the ground on its left, right and top edges`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.addInitScript(() => {
        try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); localStorage.removeItem('cueory-theme'); } catch { /* blocked storage */ }
      });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      const photo = page.locator('.stage-photo');
      const box = (await photo.boundingBox())!;
      expect(box.width).toBeLessThan(width); // the photo is narrower than the screen, so it has side edges
      const scroll = await page.evaluate(() => window.scrollY);
      const top = box.y + scroll;
      const heights = [0.4, 0.6].map((share) => top + box.height * share);
      const points: Array<[number, number]> = [];
      const pairs: string[] = [];
      for (const y of heights) {
        points.push([box.x - 3, y], [box.x + 3, y], [box.x + box.width + 3, y], [box.x + box.width - 3, y]);
        pairs.push('left', 'right');
      }
      // The top edge, away from the words in the middle.
      for (const share of [0.1, 0.9]) points.push([box.x + box.width * share, top - 3], [box.x + box.width * share, top + 3]);
      pairs.push('top-left', 'top-right');
      expect(top).toBeGreaterThan(8); // the top edge is on the page, so it can be sampled
      const colours = await pixelsAt(page, points);
      for (let i = 0; i < colours.length; i += 2) {
        const [outside, inside] = [colours[i], colours[i + 1]];
        const edge = pairs[Math.floor(i / 2)] ?? '';
        const worst = Math.max(...outside.map((value, c) => Math.abs(value - inside[c])));
        expect(worst, `${scheme} ${width}px, ${edge}: outside rgb(${outside}) vs inside rgb(${inside})`).toBeLessThanOrEqual(TOLERANCE);
      }
    });
  }
}
