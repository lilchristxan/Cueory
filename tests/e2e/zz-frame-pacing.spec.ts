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
      ? `html[${marker}="filter-off"] .veil { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }`
      : selected === 'animation-off'
        ? `html[${marker}="animation-off"] .modes *, html[${marker}="animation-off"] .modes *::before, html[${marker}="animation-off"] .modes *::after { animation: none !important; transition: none !important; }`
        : selected === 'combined'
          ? `html[${marker}="combined"] .veil { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; } html[${marker}="combined"] .modes *, html[${marker}="combined"] .modes *::before, html[${marker}="combined"] .modes *::after { animation: none !important; transition: none !important; }`
          : '';

    if (css) {
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      } catch (error) {
        return {
          applied: false,
          backdropFilter: null,
          animationName: null,
          veilFound: false,
          illustrationFound: false,
          error: error instanceof Error ? error.name : 'stylesheet-unavailable',
        };
      }
    }

    const veil = document.querySelector<HTMLElement>('.veil');
    const illustration = document.querySelector<HTMLElement>('.modes .ill-anim');
    const veilStyle = veil ? getComputedStyle(veil) : null;
    const illustrationStyle = illustration ? getComputedStyle(illustration) : null;
    const filterExpected = selected === 'filter-off' || selected === 'combined';
    const animationExpected = selected === 'animation-off' || selected === 'combined';
    const filterValue = veilStyle?.getPropertyValue('backdrop-filter') || veilStyle?.getPropertyValue('-webkit-backdrop-filter') || null;
    const animationValue = illustrationStyle?.animationName ?? null;
    return {
      applied: (!filterExpected || (veil !== null && filterValue === 'none')) && (!animationExpected || (illustration !== null && animationValue === 'none')),
      backdropFilter: filterValue,
      animationName: animationValue,
      veilFound: veil !== null,
      illustrationFound: illustration !== null,
      error: null,
    };
  }, treatment);
}

async function measureFrames(page: Page): Promise<FrameMeasurement> {
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

  const completed = await Promise.race([
    measurement,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), WALL_CLOCK_LIMIT_MS)),
  ]);
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
