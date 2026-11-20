import { expect, test, type Page, type Request } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { withoutWebkitSelectReports } from './csp-allow';

const dist = resolve('dist');
const missingPage = '/csp-sweep-page-does-not-exist';

// Match the accessibility sweep's built HTML inventory, including previews and
// the actual 404 response. A missing build fails instead of skipping the sweep.
function builtPages(folder = dist): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'pagefind' || entry.name === '_astro') return [];
    const file = join(folder, entry.name);
    if (entry.isDirectory()) return builtPages(file);
    if (!entry.isFile() || !entry.name.endsWith('.html')) return [];
    const name = relative(dist, file).split(sep).join('/');
    if (name === '404.html') return [missingPage];
    if (name === 'index.html') return ['/'];
    if (name.endsWith('/index.html')) return [`/${name.slice(0, -'/index.html'.length)}`];
    return [`/${name.slice(0, -'.html'.length)}`];
  });
}

async function watchCsp(page: Page): Promise<string[]> {
  const consoleErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' && /content[ -]security[ -]policy|\bcsp\b/i.test(message.text())) {
      consoleErrors.push(message.text());
    }
  });
  // Install before navigation so even violations from the first parser scripts
  // and styles are recorded. Console wording alone varies between engines.
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { __cueoryCspViolations: violations });
    document.addEventListener('securitypolicyviolation', event => {
      violations.push(`${event.effectiveDirective}: ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}`);
    });
  });
  return consoleErrors;
}

/**
 * Waits for the page to be done fetching, without 'networkidle' (WebKit on a loaded runner never reached it on a few
 * routes: a 90 s timeout though the page was finished). Every request the page makes is counted from 'request' until
 * 'requestfinished' or 'requestfailed'; settled() waits until none is pending and none has started for a settle
 * period, so a slow fetch whose answer later causes a policy violation is still waited for. Long-lived connections
 * would never finish: list one by exact URL in `longLived`, and nothing else is excluded. A hard cap, far below the
 * test's own timeout, fails with the URLs still pending rather than hanging or passing too early.
 */
function trackRequests(page: Page, longLived: string[] = []) {
  const pending = new Set<Request>();
  let lastActivity = Date.now();
  page.on('request', request => {
    if (longLived.includes(request.url())) return;
    pending.add(request);
    lastActivity = Date.now();
  });
  const done = (request: Request) => { pending.delete(request); lastActivity = Date.now(); };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  return {
    async settled({ quietMs = 500, capMs = 20_000 } = {}) {
      await page.waitForLoadState('load');
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const started = Date.now();
      while (pending.size > 0 || Date.now() - lastActivity < quietMs) {
        if (Date.now() - started > capMs) {
          throw new Error(`requests still pending after ${capMs} ms: ${[...pending].map(request => request.url()).join(', ') || 'none (still starting new ones)'}`);
        }
        await page.waitForTimeout(100);
      }
    },
  };
}

async function violations(page: Page, consoleErrors: string[]): Promise<string[]> {
  const events = await page.evaluate(() =>
    (window as Window & { __cueoryCspViolations?: string[] }).__cueoryCspViolations ?? []);
  // Only WebKit's native <select> report is set aside, narrowly (csp-allow.ts, #862).
  return withoutWebkitSelectReports(page, consoleErrors, events);
}

test.describe('Task 191: every built route obeys CSP', () => {
  for (const route of [...new Set(builtPages())].sort()) {
    test(`${route}: no policy violations during page load and hydration`, async ({ page }) => {
      const consoleErrors = await watchCsp(page);
      const pending = trackRequests(page);
      const response = await page.goto(route);
      expect(response?.status(), `${route}: HTTP response`).toBe(route === missingPage ? 404 : 200);
      const policy = response?.headers()['content-security-policy'] ??
        await page.locator('meta[http-equiv="content-security-policy" i]').getAttribute('content');
      expect(policy, `${route}: an enforced CSP must be present`).toBeTruthy();
      await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
      await pending.settled();
      expect(await violations(page, consoleErrors), `${route}: CSP findings`).toEqual([]);
    });
  }
});

test('CSP detector catches a deliberately blocked inline style', async ({ page }) => {
  const consoleErrors = await watchCsp(page);
  await page.route('**/__csp-detector-fixture', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><meta http-equiv="Content-Security-Policy" content="style-src \'none\'">' +
      '<title>CSP detector fixture</title><style>body { color: red; }</style><h1>fixture</h1>',
  }));
  await page.goto('/__csp-detector-fixture');
  await expect.poll(async () => (await violations(page, consoleErrors)).length).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __cueoryCspViolations?: string[] }).__cueoryCspViolations
      ?.some(message => message.startsWith('style-src-elem: inline')) ?? false)).toBe(true);
});

test('the sweep waits for a slow fetch whose answer causes a policy violation', async ({ page }) => {
  const consoleErrors = await watchCsp(page);
  const pending = trackRequests(page);
  await page.route('**/__csp-slow-fixture', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'unsafe-inline\'; img-src \'self\'">' +
      '<title>slow CSP fixture</title><h1>fixture</h1>' +
      '<script>fetch("/__csp-slow-data").then(r => r.text()).then(() => { new Image().src = "https://blocked.example/pixel.png"; });</script>',
  }));
  // The answer comes well after the 300 ms the old resource-count poll allowed, and only then does the page break its policy.
  await page.route('**/__csp-slow-data', async route => {
    await new Promise(resolve => setTimeout(resolve, 1_500));
    await route.fulfill({ contentType: 'text/plain', body: 'late' });
  });
  await page.goto('/__csp-slow-fixture');
  await pending.settled();
  expect((await violations(page, consoleErrors)).some(finding => finding.startsWith('img-src'))).toBe(true);
});
