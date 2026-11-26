import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

// The blister artwork file has an ivory mat baked around the foil card. The pack is clipped to the foil, so nothing
// light shows around the card on the dark Evening page, the live wells stay exactly where they were, and the visible
// card is centred on the keyboard's centre line. Pixels are read in the browser, so the test needs no image library.

const artwork = readFileSync(new URL('../../public/design/pillo-blister-board.webp', import.meta.url)).toString('base64');

/**
 * Proves the artwork file itself is drawn, not just the grey fill and hatch behind it: the page must decode the
 * file's URL, and a patch of foil below the last row of wells (cross-hatch and dashed perforations, no live
 * element on top) must correlate with the same patch of the file read from disk, scaled to the pack's box.
 */
async function artworkDrawn(page: Page, png: Buffer, clip: { x: number; y: number }, box: { x: number; y: number; width: number; height: number }) {
  return page.evaluate(
    async ({ b64, ref, clip, box }) => {
      const loaded = await new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth > 0);
        img.onerror = () => resolve(false);
        img.src = '/design/pillo-blister-board.webp';
      });
      const decode = async (data: string, type: string) => createImageBitmap(new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type }));
      const shot = await decode(b64, 'image/png');
      const scale = window.devicePixelRatio || 1;
      const file = await decode(ref, 'image/webp');
      const sCanvas = new OffscreenCanvas(shot.width, shot.height);
      const sCtx = sCanvas.getContext('2d')!;
      sCtx.drawImage(shot, 0, 0);
      const rw = Math.round(box.width * scale);
      const rh = Math.round(box.height * scale);
      const rCanvas = new OffscreenCanvas(rw, rh);
      const rCtx = rCanvas.getContext('2d')!;
      rCtx.drawImage(file, 0, 0, rw, rh);
      // Patch in the pack's own coordinates: x 8% to 92%, y 90.5% to 95.5% of the box.
      const px0 = Math.round(0.08 * rw);
      const px1 = Math.round(0.92 * rw);
      const py0 = Math.round(0.905 * rh);
      const py1 = Math.round(0.955 * rh);
      const a = rCtx.getImageData(px0, py0, px1 - px0, py1 - py0).data;
      const b = sCtx.getImageData(Math.round((box.x - clip.x) * scale) + px0, Math.round((box.y - clip.y) * scale) + py0, px1 - px0, py1 - py0).data;
      // Averaged in 4 px blocks, so the fine hatch (which the browser resamples differently from this canvas) does not
      // matter and the dashed perforations and the shading between wells carry the comparison.
      const w = px1 - px0;
      const h = py1 - py0;
      const block = Math.max(2, Math.round(4 * scale));
      const grey = (d: Uint8ClampedArray, x: number, y: number) => {
        let total = 0;
        let count = 0;
        for (let yy = y; yy < Math.min(h, y + block); yy += 1) {
          for (let xx = x; xx < Math.min(w, x + block); xx += 1) {
            const i = (yy * w + xx) * 4;
            total += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            count += 1;
          }
        }
        return total / count;
      };
      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
      for (let y = 0; y < h; y += block) {
        for (let x = 0; x < w; x += block) {
          const u = grey(a, x, y), v = grey(b, x, y);
          sa += u; sb += v; saa += u * u; sbb += v * v; sab += u * v; n += 1;
        }
      }
      const cov = sab / n - (sa / n) * (sb / n);
      const sd = Math.sqrt(Math.max(1e-9, saa / n - (sa / n) ** 2)) * Math.sqrt(Math.max(1e-9, sbb / n - (sb / n) ** 2));
      return { loaded, correlation: cov / sd };
    },
    { b64: png.toString('base64'), ref: artwork, clip, box },
  );
}

const sizes = [
  [390, 844],
  [820, 1180],
  [1440, 900],
] as const;
const margin = 24;

for (const scheme of ['light', 'dark'] as const) {
  for (const [width, height] of sizes) {
    test(`vialo shows only the foil card: ${scheme}, ${width}x${height}`, async ({ page }) => {
      await markPanelsSeen(page);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height });
      await page.goto('/play/wordpill');
      const pack = page.locator('.vialo-pack');
      await expect(pack).toBeVisible();
      await expect(page.locator('.vialo-keys .vialo-key-row').first()).toBeVisible();
      // The "print a copy for your patients!" bubble appears a moment after load and, while it shows, the Frame makes room
      // for it, which moves the card. This test looks at the resting card, so it waits for the bubble and closes it (Escape).
      await expect(page.getByTestId('print-hint')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('print-hint')).toHaveCount(0);
      await pack.evaluate((node) => node.scrollIntoView({ block: 'center' }));
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

      const box = (await pack.boundingBox())!;
      // The margin is cut off where the page ends, so the screenshot never reaches past the viewport.
      const x = Math.max(0, Math.floor(box.x) - margin);
      const y = Math.max(0, Math.floor(box.y) - margin);
      const clip = {
        x,
        y,
        width: Math.min(Math.ceil(box.x + box.width) + margin, width) - x,
        height: Math.min(Math.ceil(box.y + box.height) + margin, height) - y,
      };
      const png = await page.screenshot({ clip });

      const result = await page.evaluate(
        async ({ b64, clip, box }) => {
          const style = getComputedStyle(document.querySelector('.vialo-pack')!);
          const wrap = getComputedStyle(document.querySelector('.vialo-pack-wrap')!);
          // inset(top right bottom left round rx / ry), every value a percentage of the pack box.
          const nums = [...style.clipPath.matchAll(/(-?\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]) / 100);
          const [t, r, b, l, rx, ry] = nums;
          const left = box.x + l * box.width;
          const right = box.x + box.width - r * box.width;
          const top = box.y + t * box.height;
          const bottom = box.y + box.height - b * box.height;
          const radX = rx * box.width;
          const radY = ry * box.height;
          // Distance outside the visible card's rounded rectangle (negative inside), in CSS pixels.
          const outside = (px: number, py: number) => {
            const cx = Math.min(Math.max(px, left + radX), right - radX);
            const cy = Math.min(Math.max(py, top + radY), bottom - radY);
            if (px >= left + radX && px <= right - radX) return Math.max(top - py, py - bottom);
            if (py >= top + radY && py <= bottom - radY) return Math.max(left - px, px - right);
            return Math.hypot((px - cx) / radX, (py - cy) / radY) * Math.min(radX, radY) - Math.min(radX, radY);
          };
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
          const scale = bitmap.width / clip.width;
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0);
          const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
          let brightest = 0;
          let bandPixels = 0;
          let insideDark = 0;
          for (let y = 0; y < bitmap.height; y += 1) {
            for (let x = 0; x < bitmap.width; x += 1) {
              const d = outside(clip.x + (x + 0.5) / scale, clip.y + (y + 0.5) / scale);
              const i = (y * bitmap.width + x) * 4;
              const lum = Math.min(data[i], data[i + 1], data[i + 2]);
              if (d >= 2 && d <= 12) {
                bandPixels += 1;
                brightest = Math.max(brightest, lum);
              } else if (d <= -6 && lum < 200) {
                insideDark += 1;
              }
            }
          }
          // Where the live wells sit, as fractions of the pack box (unchanged from the artwork measurements).
          const art = document.querySelector('.vialo-pack')!.getBoundingClientRect();
          const pills = [...document.querySelectorAll('.vialo-pocket .vialo-pill')].map((pill) => {
            const p = pill.getBoundingClientRect();
            return [(p.x + p.width / 2 - art.x) / art.width, (p.y + p.height / 2 - art.y) / art.height, p.width / art.width, p.height / art.height];
          });
          const keys = document.querySelector('.vialo-keys .vialo-key-row')!.getBoundingClientRect();
          return {
            clipPath: style.clipPath,
            filter: wrap.filter,
            boxShadow: style.boxShadow,
            brightest,
            bandPixels,
            insideDark,
            pills,
            ratio: art.width / art.height,
            visibleCentre: (left + right) / 2,
            keysCentre: keys.left + keys.width / 2,
          };
        },
        { b64: png.toString('base64'), clip, box },
      );

      expect(result.clipPath).toMatch(/^inset\(/);
      expect(result.filter).toContain('drop-shadow');
      expect(result.boxShadow).toBe('none');
      expect(result.bandPixels).toBeGreaterThan(1000);
      expect(result.insideDark).toBeGreaterThan(1000); // the card itself is still there
      const drawn = await artworkDrawn(page, png, clip, box);
      expect(drawn.loaded).toBe(true);
      expect(drawn.correlation).toBeGreaterThan(0.7); // the file's own texture is on screen
      // Nothing light survives between the visible card and the page: in Evening the page is dark, so the band
      // around the card (2 to 12 px out, which covers the old mat at every size) must be dark; the old mat was ivory,
      // 223 and up, and the page's own buttons sit further out.
      if (scheme === 'dark') expect(result.brightest).toBeLessThan(110);

      // The wells have not moved: same fractions of the pack box as the artwork measurements.
      expect(result.ratio).toBeCloseTo(1230 / 1180, 2);
      expect(result.pills).toHaveLength(30);
      for (const [i, [x, y, w, h]] of result.pills.entries()) {
        expect(x).toBeCloseTo((167 + 224 * (i % 5)) / 1230, 2);
        expect(y).toBeCloseTo(0.123 + 0.144 * Math.floor(i / 5), 2);
        expect(w).toBeCloseTo(0.132, 2);
        expect(h).toBeCloseTo(0.092, 2);
      }

      // The VISIBLE card (not the hidden mat) is centred on the keyboard's centre line.
      expect(Math.abs(result.visibleCentre - result.keysCentre)).toBeLessThanOrEqual(1);
    });
  }
}

// Negative control: with the artwork request blocked, the same check must report that the card is not drawn, so the
// assertion above is shown to catch a missing artwork (the grey fill and hatch alone would still look like a card).
test('the artwork check fails when the artwork file does not load', async ({ page }) => {
  await markPanelsSeen(page);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.route('**/design/pillo-blister-board.webp', (route) => route.abort());
  await page.goto('/play/wordpill');
  const pack = page.locator('.vialo-pack');
  await expect(pack).toBeVisible();
  await pack.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const box = (await pack.boundingBox())!;
  const clip = { x: Math.max(0, Math.floor(box.x) - margin), y: Math.max(0, Math.floor(box.y) - margin) };
  const png = await page.screenshot({ clip: { ...clip, width: Math.ceil(box.width) + 2 * margin, height: Math.ceil(box.height) + 2 * margin } });
  const drawn = await artworkDrawn(page, png, clip, box);
  expect(drawn.loaded).toBe(false);
  expect(drawn.correlation).toBeLessThan(0.7);
});
