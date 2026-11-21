import { appendFileSync, writeSync } from 'node:fs';
import { test, type Browser, type Page, type TestInfo } from '@playwright/test';

/*
 * Temporary WebKit-only staging diagnostic for #634. It records the browser's rendered-frame cadence without changing
 * an application assertion or product source. Remove this file after the retained release evidence has answered the
 * frame-pacing question.
 */

const SAMPLE_MS = 3_000;
const WALL_CLOCK_LIMIT_MS = 4_000;

type Treatment = 'baseline' | 'filter-off' | 'animation-off' | 'combined';
type CaseName = Treatment | 'preview-open-baseline';

type Summary = {
  count: number;
  medianMs: number | null;
  p95Ms: number | null;
  maxMs: number | null;
};

type FrameMeasurement = Summary & {
  elapsedMs: number | null;
  frameCount: number;
  missedFrames: boolean;
  stoppedBy: 'raf-deadline' | 'timer-deadline' | 'node-wall-clock' | 'page-error';
  error?: string;
};

type CaseReceipt = {
  name: CaseName;
  viewport: { width: number; height: number };
  treatment: Treatment;
  computedTreatment: Record<string, string | boolean | null>;
  preview: 'not-requested' | 'opened' | 'unavailable';
  measurement: FrameMeasurement | null;
  setupError?: string;
};

function logCaseReceipt(entry: CaseReceipt) {
  const measurement = entry.measurement;
  // Keep this compact receipt in runner stdout too: retained failure reports may omit test attachments.
  const summary = {
    viewport: entry.viewport,
    case: entry.name,
    count: measurement?.count ?? null,
    median: measurement?.medianMs ?? null,
    p95: measurement?.p95Ms ?? null,
    max: measurement?.maxMs ?? null,
    missed: measurement?.missedFrames ?? null,
    error: entry.setupError ?? measurement?.error ?? null,
  };
  console.log('frame-pacing ' + JSON.stringify(summary));

  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (!stepSummary) return;
  try {
    appendFileSync(stepSummary, `\n#### Frame pacing: ${entry.name}\n\n\`\`\`json\n${JSON.stringify(summary)}\n\`\`\`\n`);
    // The browser-free GitHub-reporter probe verified this direct stdout notice survives reporter capture.
    const notice = `case=${entry.name}; count=${summary.count}; median=${summary.median}; p95=${summary.p95}; max=${summary.max}; missed=${summary.missed}; error=${summary.error}`
      .replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    writeSync(1, `::notice title=Frame pacing receipt::${notice}\n`);
  } catch {
    // Receipt reporting is best effort; attachment and test behavior remain unchanged if a runner disallows it.
  }
}

const percentile = (sorted: readonly number[], fraction: number) => {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))]!;
};

function summarize(intervals: readonly number[]): Summary {
  const sorted = [...intervals].sort((a, b) => a - b);
  return {
    count: sorted.length,
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1) ?? null,
  };
}

async function applyTreatment(page: Page, treatment: Treatment): Promise<Record<string, string | boolean | null>> {
  return page.evaluate((selected) => {
    const state = document.documentElement;
    const marker = 'data-cueory-frame-pacing-treatment';
    state.setAttribute(marker, selected);

    const css = selected === 'filter-off'
      ? `html[${marker}="filter-off"] *, html[${marker}="filter-off"] *::before, html[${marker}="filter-off"] *::after { filter: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }`
      : selected === 'animation-off'
        ? `html[${marker}="animation-off"] *, html[${marker}="animation-off"] *::before, html[${marker}="animation-off"] *::after { animation: none !important; }`
        : selected === 'combined'
          ? `html[${marker}="combined"] *, html[${marker}="combined"] *::before, html[${marker}="combined"] *::after { filter: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; animation: none !important; }`
          : '';

    if (css) {
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      } catch (error) {
        return {
          applied: false,
          filter: null,
          backdropFilter: null,
          webkitBackdropFilter: null,
          animationName: null,
          pseudoAnimationName: null,
          veilFound: false,
          vialImageFound: false,
          illustrationFound: false,
          cardFound: false,
          transitionsUntouched: null,
          error: error instanceof Error ? error.name : 'stylesheet-unavailable',
        };
      }
    }

    const veil = document.querySelector<HTMLElement>('.veil');
    const vialImage = document.querySelector<HTMLElement>('.vial-img');
    const illustration = document.querySelector<HTMLElement>('.modes .ill-anim');
    const card = document.querySelector<HTMLElement>('.mode-card');
    const styleOf = (element: HTMLElement | null, pseudo?: string) => element ? getComputedStyle(element, pseudo) : null;
    const veilStyle = styleOf(veil);
    const vialStyle = styleOf(vialImage);
    const illustrationStyle = styleOf(illustration);
    const cardBeforeStyle = styleOf(card, '::before');
    const filterExpected = selected === 'filter-off' || selected === 'combined';
    const animationExpected = selected === 'animation-off' || selected === 'combined';
    const filterValue = vialStyle?.filter || null;
    const backdropValue = veilStyle?.getPropertyValue('backdrop-filter') || null;
    const webkitBackdropValue = veilStyle?.getPropertyValue('-webkit-backdrop-filter') || null;
    const animationValue = illustrationStyle?.animationName ?? null;
    const pseudoAnimationValue = cardBeforeStyle?.animationName ?? null;
    const filterApplied = vialImage !== null && filterValue === 'none';
    const backdropApplied = veil !== null && (backdropValue === 'none' || webkitBackdropValue === 'none');
    const animationApplied = illustration !== null && animationValue === 'none' && card !== null && pseudoAnimationValue === 'none';
    return {
      applied: (!filterExpected || (filterApplied && backdropApplied)) && (!animationExpected || animationApplied),
      filter: filterValue,
      backdropFilter: backdropValue,
      webkitBackdropFilter: webkitBackdropValue,
      animationName: animationValue,
      pseudoAnimationName: pseudoAnimationValue,
      veilFound: veil !== null,
      vialImageFound: vialImage !== null,
      illustrationFound: illustration !== null,
      cardFound: card !== null,
      transitionsUntouched: illustrationStyle?.transitionProperty ?? null,
      error: null,
    };
  }, treatment);
}

type NodeTimers = Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;

const nodeTimers: NodeTimers = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
};

export async function measureFrames(page: Pick<Page, 'evaluate'>, timers: NodeTimers = nodeTimers): Promise<FrameMeasurement> {
  const startedAt = Date.now();
  const measurement = page.evaluate((sampleMs) => new Promise<{
    elapsedMs: number;
    frameCount: number;
    intervals: number[];
    stoppedBy: 'raf-deadline' | 'timer-deadline';
  }>((resolve) => {
    const started = performance.now();
    const intervals: number[] = [];
    let previous: number | undefined;
    let frameCount = 0;
    let done = false;
    const finish = (stoppedBy: 'raf-deadline' | 'timer-deadline') => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      resolve({ elapsedMs: performance.now() - started, frameCount, intervals, stoppedBy });
    };
    const tick = (now: number) => {
      frameCount++;
      if (previous !== undefined) intervals.push(now - previous);
      previous = now;
      if (now - started >= sampleMs) finish('raf-deadline');
      else window.requestAnimationFrame(tick);
    };
    // This timer is deliberately independent of rAF, so a missed rAF still yields a zero-frame receipt.
    const timer = window.setTimeout(() => finish('timer-deadline'), sampleMs + 100);
    window.requestAnimationFrame(tick);
  }), SAMPLE_MS);

  let wallClockTimer: ReturnType<typeof setTimeout> | undefined;
  const wallClockDeadline = new Promise<null>((resolve) => {
    wallClockTimer = timers.setTimeout(() => resolve(null), WALL_CLOCK_LIMIT_MS);
  });
  const completed = await Promise.race([measurement, wallClockDeadline]);
  if (wallClockTimer !== undefined) timers.clearTimeout(wallClockTimer);
  if (completed === null) {
    void measurement.catch(() => undefined);
    return {
      ...summarize([]),
      elapsedMs: Date.now() - startedAt,
      frameCount: 0,
      missedFrames: true,
      stoppedBy: 'node-wall-clock',
      error: `page measurement did not resolve within ${WALL_CLOCK_LIMIT_MS} ms`,
    };
  }

  return {
    ...summarize(completed.intervals),
    elapsedMs: completed.elapsedMs,
    frameCount: completed.frameCount,
    missedFrames: completed.frameCount === 0,
    stoppedBy: completed.stoppedBy,
  };
}

async function openPreview(page: Page): Promise<'opened' | 'unavailable'> {
  const section = page.locator('#ways-to-study');
  await section.scrollIntoViewIfNeeded();
  const opener = section.locator('#mode-video [data-mode-open]');
  if (!await opener.isVisible().catch(() => false)) return 'unavailable';
  await opener.click();
  return page.locator('[data-mode-preview][open]').isVisible().then(() => 'opened' as const).catch(() => 'unavailable' as const);
}

async function freshPage(browser: Browser, testInfo: TestInfo): Promise<{ page: Page; close: () => Promise<void> }> {
  const viewport = testInfo.project.use.viewport ?? { width: 1440, height: 900 };
  const context = await browser.newContext({
    viewport,
    screen: testInfo.project.use.screen ?? viewport,
    hasTouch: testInfo.project.use.hasTouch,
    isMobile: testInfo.project.use.isMobile,
    deviceScaleFactor: testInfo.project.use.deviceScaleFactor,
    colorScheme: testInfo.project.use.colorScheme,
    reducedMotion: testInfo.project.use.reducedMotion,
    serviceWorkers: 'block',
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch {
      // The pacing diagnostic records setup failure below if storage cannot be used.
    }
  });
  return { page: await context.newPage(), close: () => context.close() };
}

test('temporary WebKit frame-pacing receipt for Home treatments', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.use.browserName !== 'webkit', 'temporary WebKit-only diagnostic; Chromium and Windows coverage stay unchanged');

  const viewport = testInfo.project.use.viewport ?? { width: 1440, height: 900 };
  const cases: readonly { name: CaseName; treatment: Treatment; preview: boolean }[] = [
    { name: 'baseline', treatment: 'baseline', preview: false },
    { name: 'filter-off', treatment: 'filter-off', preview: false },
    { name: 'animation-off', treatment: 'animation-off', preview: false },
    { name: 'combined', treatment: 'combined', preview: false },
    { name: 'preview-open-baseline', treatment: 'baseline', preview: true },
  ];
  const receipt: { sampleMs: number; wallClockLimitMs: number; cases: CaseReceipt[] } = {
    sampleMs: SAMPLE_MS,
    wallClockLimitMs: WALL_CLOCK_LIMIT_MS,
    cases: [],
  };

  try {
    for (const item of cases) {
      const entry: CaseReceipt = {
        name: item.name,
        viewport,
        treatment: item.treatment,
        computedTreatment: {},
        preview: item.preview ? 'unavailable' : 'not-requested',
        measurement: null,
      };
      const { page, close } = await freshPage(browser, testInfo);
      try {
        await page.goto('/');
        entry.computedTreatment = await applyTreatment(page, item.treatment);
        if (item.preview) entry.preview = await openPreview(page);
        entry.measurement = await measureFrames(page);
      } catch (error) {
        entry.setupError = error instanceof Error ? error.message : String(error);
      } finally {
        receipt.cases.push(entry);
        logCaseReceipt(entry);
        await close();
      }
    }
  } finally {
    await testInfo.attach('webkit-frame-pacing', {
      body: JSON.stringify(receipt, null, 2),
      contentType: 'application/json',
    });
  }
});
