import { expect, test } from '@playwright/test';

/**
 * Lane 9, fonts: the two preloaded Lato files are the ones the page really uses, and each is downloaded once (a
 * preload whose crossorigin doesn't match the font request is fetched twice).
 */
const lato = ['lato-latin-400-normal.woff2', 'lato-latin-700-normal.woff2'];

for (const path of ['/', '/learn/study-skills', '/play', '/signin']) {
  test(`${path}: both preloaded Lato weights are used and downloaded once`, async ({ page }, testInfo) => {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => ({
      loaded: [...document.fonts]
        .filter((face) => face.family.replaceAll('"', '') === 'Lato' && face.style === 'normal' && face.status === 'loaded')
        .map((face) => face.weight)
        .sort(),
      requests: performance
        .getEntriesByType('resource')
        .map((entry) => entry.name.split('/').pop()!)
        .filter((name) => name.startsWith('lato-')),
    }));
    // Diagnostics only (no assertion depends on them): every Lato entry's transfer details, so a failing WebKit run
    // shows whether the second request is a revalidation (a 304 answer or an empty transfer) or a full second download.
    const entries = await page.evaluate(() => performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.split('/').pop()!.startsWith('lato-'))
      .map((entry) => {
        const timing = entry as PerformanceResourceTiming & { responseStatus?: number };
        return {
          name: entry.name.split('/').pop(),
          initiator: timing.initiatorType,
          responseStatus: timing.responseStatus ?? null,
          transferSize: timing.transferSize,
          encodedBodySize: timing.encodedBodySize,
          startTime: Math.round(timing.startTime),
        };
      }));
    console.log(`${testInfo.project.name} ${path} lato entries: ${JSON.stringify(entries)}`);
    await testInfo.attach('lato-resource-entries', { body: JSON.stringify(entries, null, 2), contentType: 'application/json' });
    expect(result.loaded).toEqual(['400', '700']);
    for (const file of lato) expect(result.requests.filter((name) => name === file), file).toHaveLength(1);
  });
}
