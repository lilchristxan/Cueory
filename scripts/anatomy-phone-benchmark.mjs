/**
 * Manual, repeatable Anatomy Lab phone benchmark (Task 178, issue #662, work package 5).
 *
 * On a local draft preview:
 *   CUEORY_ANATOMY_DRAFTS=1 npm run build
 *   npx astro preview --port 4322 --ignore-lock
 *   node scripts/anatomy-phone-benchmark.mjs
 *
 * Install supported browser binaries with npx playwright install chromium webkit.
 * This does not deploy, publish or approve anatomy models.
 */
import { chromium, webkit, devices } from '@playwright/test';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';

const url = process.env.ANATOMY_BENCH_URL || 'http://127.0.0.1:4322/preview/anatomy-lab';
const allowed = new Set(['chromium', 'webkit']);
const engines = (process.env.ANATOMY_BENCH_ENGINES ?? 'chromium,webkit')
  .split(',').map((name) => name.trim()).filter(Boolean);
const rounds = Number(process.env.ANATOMY_BENCH_ROUNDS ?? '3');
const timeout = 120_000;

if (!engines.length || engines.some((name) => !allowed.has(name))) {
  throw new Error('ANATOMY_BENCH_ENGINES must contain chromium and/or webkit.');
}
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) {
  throw new Error('ANATOMY_BENCH_ROUNDS must be an integer from 1 to 10.');
}
if (!/^https?:\/\//i.test(url)) throw new Error('ANATOMY_BENCH_URL must be an HTTP(S) address.');
const target = new URL(url);
// This benchmark deliberately loads the unpublished GLBs. Restrict it to the
// developer's own loopback server, not a lookalike remote or public origin.
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
    target.username || target.password || target.search || target.hash ||
    target.pathname !== '/preview/anatomy-lab') {
  throw new Error('Only the unpublished /preview/anatomy-lab route on loopback may be benchmarked.');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (n) => n === null ? null : Math.round(n * 10) / 10;

async function waitForWholeBodyFiles(page, loaded, expected = 11) {
  await page.waitForFunction(
    ([count, total]) => {
      const text = document.querySelector('[data-testid="anatomy-files"]')?.textContent || '';
      return text.includes(`model files loaded: ${count} of ${total}`);
    },
    [loaded, expected],
    { timeout },
  );
}

async function heapBytes(session) {
  if (!session) return null; // CDP is unavailable in WebKit; never fabricate a heap reading.
  const { metrics } = await session.send('Performance.getMetrics');
  const metric = metrics.find((entry) => entry.name === 'JSHeapUsedSize');
  return metric && Number.isFinite(metric.value) ? Math.round(metric.value) : null;
}

async function sampleTurning(page) {
  // Browser rAF cadence is a responsiveness proxy, NOT 3D render FPS.
  // Bound the observation even in suspended or backgrounded tabs where rAF
  // may never fire, so a failed sample is reported instead of hanging.
  const trace = page.evaluate(() => new Promise((resolve, reject) => {
    const times = [];
    const start = performance.now();
    const deadline = window.setTimeout(() => reject(new Error('rAF cadence unavailable on this tab')), 8_000);
    const tick = (at) => {
      times.push(at);
      if (performance.now() - start < 3000) requestAnimationFrame(tick);
      else {
        window.clearTimeout(deadline);
        const elapsed = Math.max(1, at - times[0]);
        const gaps = times.slice(1).map((time, i) => time - times[i]);
        gaps.sort((a, b) => a - b);
        resolve({
          rafHz: (times.length - 1) * 1000 / elapsed,
          maxRafGapMs: gaps.at(-1) ?? 0,
          p95RafGapMs: gaps[Math.floor(gaps.length * 0.95)] ?? 0,
        });
      }
    };
    requestAnimationFrame(tick);
  }));
  const orbit = page.getByRole('button', { name: 'turn right' });
  for (let i = 0; i < 24; i++) {
    await orbit.click();
    await sleep(30);
  }
  return trace;
}

async function oneRound(name, index) {
  const browser = await (name === 'chromium' ? chromium : webkit).launch({ headless: true });
  let context;
  try {
    const device = name === 'chromium' ? devices['Pixel 7'] : devices['iPhone 14'];
    context = await browser.newContext({
      ...device,
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block',
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    let session = null;
    let throttle = 'WebKit: +150ms per GLB request; CDP CPU/throughput throttle unavailable';
    if (name === 'chromium') {
      session = await context.newCDPSession(page);
      await session.send('Performance.enable');
      await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await session.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: 200_000, // 1.6 Mbit/s in bytes per second
        uploadThroughput: 93_750, // 0.75 Mbit/s
      });
      throttle = 'Chromium: 4x CPU, 150ms RTT, 1.6 Mbit/s down, 0.75 Mbit/s up';
    } else {
      // Playwright has no WebKit CDP equivalent; this is latency only.
      await page.route(/\/models\/anatomy\/.*\.glb(?:[?#]|$)/, async (route) => {
        await sleep(150);
        await route.continue();
      });
    }

    let beforeTap = true;
    let prematureModels = 0;
    const fetchedModels = new Set();
    page.on('request', (request) => {
      const match = /\/models\/anatomy\/[^/?#]+\.glb(?:[?#]|$)/.exec(request.url());
      if (!match) return;
      if (beforeTap) prematureModels += 1;
      fetchedModels.add(new URL(request.url()).pathname);
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.getByRole('button', { name: 'open the anatomy lab' }).waitFor({ timeout });
    await sleep(200);
    if (prematureModels) throw new Error(`${prematureModels} model request(s) began before the open tap`);

    beforeTap = false;
    const startOpen = performance.now();
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    // An enabled orbit button is not enough: the GLB must have reached the
    // ready state before first-model timing and heap measurement are recorded.
    await page.getByRole('button', { name: 'turn right' }).waitFor({ state: 'visible', timeout });
    await page.waitForFunction(() => {
      const button = document.querySelector('button[aria-label="turn right"]');
      return button instanceof HTMLButtonElement && !button.disabled;
    }, undefined, { timeout });
    const firstSystemMs = performance.now() - startOpen;
    const firstSystemHeapBytes = await heapBytes(session);

    // Body-system choices live inside a fieldset/legend, which is not a
    // reliable ARIA group role. Use the visible button directly and ensure
    // only the intended system choice is selected.
    const whole = page.getByRole('button', { name: 'whole body', exact: true });
    if (await whole.count() !== 1) throw new Error('Expected one whole-body system choice.');
    const startWhole = performance.now();
    await whole.click();
    await waitForWholeBodyFiles(page, 1);
    const firstWholeBodyModelMs = performance.now() - startWhole;
    const outerOnlyHeapBytes = await heapBytes(session);

    const turning = await sampleTurning(page);
    const showAllStart = performance.now();
    await page.getByRole('button', { name: 'show all', exact: true }).click();
    const confirm = page.getByRole('button', { name: 'load every layer', exact: true });
    // On a phone, the bulk download requires explicit consent. Wait for React
    // to present that consent rather than racing its next render.
    await confirm.waitFor({ state: 'visible', timeout: 15_000 });
    await confirm.click();
    await waitForWholeBodyFiles(page, 11);
    const showAllMs = performance.now() - showAllStart;
    const allLayersHeapBytes = await heapBytes(session);

    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    if (fetchedModels.size !== 11) {
      throw new Error(`Expected 11 distinct GLB requests, observed ${fetchedModels.size}`);
    }
    if (horizontalOverflow) throw new Error('Whole-body page overflows horizontally on the phone');

    return {
      engine: name,
      round: index + 1,
      viewport: '390x844',
      throttle,
      firstSystemMs: round(firstSystemMs),
      firstWholeBodyModelMs: round(firstWholeBodyModelMs),
      showAllMs: round(showAllMs),
      distinctModelUrlsRequested: fetchedModels.size,
      firstSystemHeapBytes,
      outerOnlyHeapBytes,
      allLayersHeapBytes,
      rafHzWhileTurning: round(turning.rafHz),
      p95RafGapMs: round(turning.p95RafGapMs),
      maxRafGapMs: round(turning.maxRafGapMs),
      horizontalOverflow,
    };
  } finally {
    await context?.close();
    await browser.close();
  }
}

const results = [];
const failures = [];
for (const name of engines) {
  for (let index = 0; index < rounds; index++) {
    try {
      const result = await oneRound(name, index);
      results.push(result);
      process.stdout.write(JSON.stringify(result) + '\n');
    } catch (error) {
      const failure = {
        engine: name,
        round: index + 1,
        error: error instanceof Error ? error.message : String(error),
      };
      failures.push(failure);
      process.stderr.write(JSON.stringify(failure) + '\n');
    }
  }
}
const report = {
  purpose: 'Task 178 / issue #662, manual measurement only, never model approval',
  page: url,
  capturedAt: new Date().toISOString(),
  caveats: [
    'Headless emulation on a desktop is not equivalent to a real mid-range phone.',
    'WebKit lacks CDP CPU/throughput throttling and JS heap telemetry; results are not directly comparable.',
    'rAF cadence is a responsiveness proxy, not GPU render frames per second.',
    'Chromium JS heap excludes GPU, other processes and overall device memory.',
    'Real-device locked-staging checks and founder review remain required.',
  ],
  results,
  failures,
};
if (process.env.ANATOMY_BENCH_REPORT) {
  writeFileSync(process.env.ANATOMY_BENCH_REPORT, JSON.stringify(report, null, 2) + '\n');
}
process.stdout.write(JSON.stringify({ rounds: results.length, failures: failures.length }) + '\n');
if (failures.length) process.exitCode = 1;
