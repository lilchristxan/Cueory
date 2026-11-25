import { expect, test, type Page } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

/**
 * The cueory logo and the game wordmarks must match the theme the page SHOWS: the site's own Light / Dark pick
 * (localStorage "cueory-theme", applied to <html data-theme> before paint), and only when there is no pick, the
 * device. Bug found on real Safari: with the device in dark appearance and the site on Light, the game page's rail
 * showed the cream (Evening) logo on the light rail, because it was switched by a device-only media query.
 *
 * For each page, in the two crossed cases (device dark + site Light, device light + site Dark) and the two follow
 * cases, this reads the file each visible logo or wordmark image actually rendered (currentSrc), checks it is the
 * Daytime or Evening variant meant for the page's ground, and measures the real ink of the drawn image against the
 * ground behind it (WCAG contrast of at least 3, the bar for large graphics).
 */

const pages = [
  '/',
  '/about',
  '/play',
  '/play/vialo',
  '/play/tachyyy',
  '/play/piccline',
  '/play/word-path',
  '/play/pillo',
  '/play/stat',
  '/play/sudoku',
  '/play/crossword',
  '/play/hello-cards',
];

type Device = 'light' | 'dark';
type Pick = 'light' | 'dark' | 'device';
const cases: { device: Device; pick: Pick; shows: Device }[] = [
  { device: 'dark', pick: 'light', shows: 'light' },
  { device: 'light', pick: 'dark', shows: 'dark' },
  { device: 'dark', pick: 'device', shows: 'dark' },
  { device: 'light', pick: 'device', shows: 'light' },
];

const selector = '.logo img, .game-frame-logo, .game-frame-wordmark-img';

async function inspectArt(page: Page) {
  return page.evaluate(async (sel) => {
    const parse = (value: string) => {
      const m = value.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a] = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r: r!, g: g!, b: b!, a: a ?? 1 };
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ground = (el: Element) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c && c.a > 0.9) return c;
      }
      return parse(getComputedStyle(document.documentElement).getPropertyValue('--color-page')) ?? { r: 255, g: 255, b: 255, a: 1 };
    };
    const out: { src: string; ground: number; ink: number | null; ratio: number | null }[] = [];
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>(sel))) {
      if (!img.getClientRects().length || getComputedStyle(img).display === 'none') continue;
      const rect = img.getBoundingClientRect();
      if (rect.width < 4) continue;
      await img.decode().catch(() => {});
      const g = ground(img);
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = Math.max(8, Math.round((160 * img.naturalHeight) / Math.max(1, img.naturalWidth)));
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let r = 0, gg = 0, b = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! > 200) { r += data[i]!; gg += data[i + 1]!; b += data[i + 2]!; n++; }
      }
      const gl = lum(g);
      let ink: number | null = null;
      let ratio: number | null = null;
      if (n > 20) {
        ink = lum({ r: r / n, g: gg / n, b: b / n });
        ratio = (Math.max(ink, gl) + 0.05) / (Math.min(ink, gl) + 0.05);
      }
      out.push({ src: img.currentSrc || img.src, ground: gl, ink, ratio });
    }
    return out;
  }, selector);
}

// Files built for the Daytime ground (dark ink) and for the Evening ground (light ink).
const dayFile = /logo-full-light|emblem-light|wordmark-light|oxblood|light-bar|logo-pillo/;
const eveningFile = /logo-full-dark|emblem-dark|wordmark-dark/;

test.describe('logo and wordmark artwork follows the site theme, not only the device', () => {
  test.beforeEach(({}, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one desktop run per engine; the crossed cases set their own scheme');
  });

  for (const path of pages) {
    for (const c of cases) {
      test(`${path}: device ${c.device}, site ${c.pick}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: c.device });
        await page.addInitScript((pick) => {
          if (pick !== 'device') localStorage.setItem('cueory-theme', pick);
        }, c.pick);
        await page.goto(path);
        await page.waitForLoadState('load');
        const art = await inspectArt(page);
        expect(art.length, 'the page shows at least one logo or wordmark').toBeGreaterThan(0);
        for (const item of art) {
          const file = item.src.replace(/^https?:\/\/[^/]+/, '');
          // Pillo's wordmark is a single multi-ground photo-like file, not a day/evening pair; the small game icons are
          // multi-colour tiles, not the cueory logo or a wordmark, so they are not part of this check.
          if (/logo-pillo/.test(file) || !/logo-full|wordmark|emblem/.test(file)) continue;
          // Contrast of the drawn artwork against the ground behind it.
          if (item.ratio !== null) expect(item.ratio, `${file} on its ground`).toBeGreaterThanOrEqual(3);
          // The variant meant for that ground.
          if (c.shows === 'dark') expect(file, 'Evening ground shows Evening art').toMatch(eveningFile);
          else expect(file, 'Daytime ground shows Daytime art').toMatch(dayFile);
        }
      });
    }
  }

  test('switching the site theme on a game page swaps the rail logo live, whatever the device says', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/play/piccline');
    const logo = page.locator('.game-frame-logo:visible');
    await expect(logo).toHaveCount(1);
    expect(await logo.evaluate((img: HTMLImageElement) => img.currentSrc)).toContain('logo-full-dark');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await expect(logo).toHaveCount(1);
    // The hidden file is lazy-loaded, so its currentSrc fills in once it is shown.
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.currentSrc)).toContain('logo-full-light');
    await page.evaluate(() => { delete document.documentElement.dataset.theme; });
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.currentSrc)).toContain('logo-full-dark');
  });

  test('no JavaScript: the rail logo follows the device', async ({ browser }) => {
    for (const device of ['light', 'dark'] as const) {
      const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: device });
      const page = await context.newPage();
      await page.goto('/play/piccline');
      const src = await page.locator('.game-frame-logo:visible').evaluate((img: HTMLImageElement) => img.currentSrc);
      expect(src).toContain(device === 'dark' ? 'logo-full-dark' : 'logo-full-light');
      await context.close();
    }
  });
});
