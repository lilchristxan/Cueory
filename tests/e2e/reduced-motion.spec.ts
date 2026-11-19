import { expect, test, type Page, type Request } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const dist = resolve('dist');

function builtPages(folder = dist): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'pagefind' || entry.name === '_astro') continue;
    const file = join(folder, entry.name);
    if (entry.isDirectory()) routes.push(...builtPages(file));
    else if (entry.isFile() && entry.name.endsWith('.html')) {
      const name = relative(dist, file).split(sep).join('/');
      if (name === '404.html') routes.push('/reduced-motion-page-does-not-exist');
      else if (name === 'index.html') routes.push('/');
      else if (name.endsWith('/index.html')) routes.push(`/${name.slice(0, -'/index.html'.length)}`);
      else routes.push(`/${name.slice(0, -'.html'.length)}`);
    }
  }
  return routes;
}

const pages = [...new Set(builtPages())].sort();

/** Requests the page has started and not yet finished or failed (with their start time), and the last network event. */
type OpenRequests = { open: Map<Request, number>; lastActivity: number };

function trackOpenRequests(page: Page): OpenRequests {
  const tracker: OpenRequests = { open: new Map(), lastActivity: Date.now() };
  const settle = (request: Request) => { tracker.open.delete(request); tracker.lastActivity = Date.now(); };
  page.on('request', (request) => { tracker.open.set(request, Date.now()); tracker.lastActivity = Date.now(); });
  page.on('requestfinished', settle);
  page.on('requestfailed', settle);
  return tracker;
}

async function waitForIslands(page: Page, route: string, network: OpenRequests): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0, undefined, {
    timeout: 10_000,
  }).catch(() => {
    throw new Error(`${route}: islands did not finish loading within 10 s`);
  });
  // Concrete end state: the page has loaded, its fonts are ready and every picture on screen has loaded.
  await page.waitForFunction(() => {
    if (document.readyState !== 'complete' || document.fonts.status !== 'loaded') return false;
    const onScreen = (img: HTMLImageElement) => {
      const rect = img.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
    };
    return [...document.images].filter(onScreen).every((img) => img.complete);
  }, undefined, { timeout: 10_000 }).catch(() => {
    throw new Error(`${route}: the page, its fonts or its on-screen pictures did not finish loading within 10 s`);
  });
  // The same quiet-network check as Playwright's networkidle (no request open for 500 ms, within 10 s), but counted
  // here so a timeout names the requests still open (one webkit-phone run timed out on / with no clue which). Any
  // request starting or ending restarts the 500 ms, even one that comes and goes between two polls.
  const deadline = Date.now() + 10_000;
  const quietFor = () => (network.open.size > 0 ? 0 : Date.now() - network.lastActivity);
  while (quietFor() < 500) {
    if (Date.now() > deadline) {
      const names = [...network.open].map(([request, at]) => `${request.url()} (open ${Date.now() - at} ms)`).join(', ');
      throw new Error(`${route}: network requests did not settle within 10 s: ${names}`);
    }
    await page.waitForTimeout(50);
  }
}

type MotionFinding = { name: string; animation: string; animationDuration: string; transitionDuration: string };

function motionFindings(page: Page): Promise<MotionFinding[]> {
  return page.evaluate(() => {
    const seconds = (value: string) => value.split(',').map(part => {
      const trimmed = part.trim();
      return trimmed.endsWith('ms') ? Number.parseFloat(trimmed) / 1000 : Number.parseFloat(trimmed);
    });
    const visible = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const findings: MotionFinding[] = [];
    for (const element of [...document.querySelectorAll<HTMLElement>('*')]) {
      if (!visible(element)) continue;
      const style = getComputedStyle(element);
      const animationActive = style.animationName !== 'none' && seconds(style.animationDuration).some(value => value > 0.001);
      const transitionActive = style.transitionProperty !== 'none' && seconds(style.transitionDuration).some(value => value > 0.001);
      const runningWebAnimation = element.getAnimations().some(animation => {
        const duration = animation.effect?.getComputedTiming().duration;
        return animation.playState === 'running' && typeof duration === 'number' && duration > 1;
      });
      if (animationActive || transitionActive || runningWebAnimation) {
        findings.push({
          name: element.tagName.toLowerCase() + (element.id ? `#${element.id}` : ''),
          animation: style.animationName,
          animationDuration: style.animationDuration,
          transitionDuration: style.transitionDuration,
        });
      }
    }
    return findings;
  });
}

test.describe('Task 222: reduced motion route sweep', () => {
  for (const route of pages) {
    test(`${route} has no visible motion under reduced motion`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name === 'phone-evening', 'Daytime route sweep runs once; widget tests cover Evening.');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(() => {
        try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* storage unavailable */ }
      });
      const network = trackOpenRequests(page);
      await page.goto(route);
      await waitForIslands(page, route, network);
      await expect.poll(() => motionFindings(page), { timeout: 2_000 }).toEqual([]);
    });
  }
});
