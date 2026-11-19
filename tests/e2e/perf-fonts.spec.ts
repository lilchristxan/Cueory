import { expect, test } from '@playwright/test';

/**
 * Lane 9, fonts: the two preloaded Lato files are the ones the page really uses, and each is downloaded once (a
 * preload whose crossorigin doesn't match the font request is fetched twice).
 *
 * WebKit (engine run 44460645965): when @font-face reuses a finished preload from the memory cache, WebKit adds a
 * second Resource Timing entry (initiator "css") and gives it the preload's own network numbers
 * (CachedResourceLoader::requestResource, the `Use` case, calls ResourceTiming::fromMemoryCache with the resource's
 * taken network metrics). So in WebKit one more entry is allowed only when it is that reuse: from the stylesheet, with
 * the preload's size and the preload's own response end, which is before the reuse began. A real second download ends
 * after its own start, so it still fails. Chromium and Firefox add no entry for a consumed preload: one entry.
 */
const lato = ['lato-latin-400-normal.woff2', 'lato-latin-700-normal.woff2'];

// The offline first-visit save (src/scripts/offline.ts) asks again, through the service worker, for every file the
// page loaded (initiator "fetch", answered from cache) once the worker takes control. That deliberate request is not
// the font load measured here and lands at a random moment, so this spec runs without service workers.
test.use({ serviceWorkers: 'block' });

for (const path of ['/', '/learn/study-skills', '/play', '/signin']) {
  test(`${path}: both preloaded Lato weights are used and downloaded once`, async ({ page, browserName }, testInfo) => {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => ({
      loaded: [...document.fonts]
        .filter((face) => face.family.replaceAll('"', '') === 'Lato' && face.style === 'normal' && face.status === 'loaded')
        .map((face) => face.weight)
        .sort(),
      entries: performance
        .getEntriesByType('resource')
        .filter((entry) => entry.name.split('/').pop()!.startsWith('lato-'))
        .map((entry) => {
          const timing = entry as PerformanceResourceTiming & { responseStatus?: number };
          return {
            name: entry.name.split('/').pop()!,
            initiator: timing.initiatorType,
            responseStatus: timing.responseStatus ?? null,
            transferSize: timing.transferSize,
            encodedBodySize: timing.encodedBodySize,
            startTime: timing.startTime,
            responseEnd: timing.responseEnd,
          };
        }),
    }));
    console.log(`${testInfo.project.name} ${path} lato entries: ${JSON.stringify(result.entries)}`);
    await testInfo.attach('lato-resource-entries', { body: JSON.stringify(result.entries, null, 2), contentType: 'application/json' });
    expect(result.loaded).toEqual(['400', '700']);
    for (const file of lato) {
      const entries = result.entries.filter((entry) => entry.name === file);
      const preloads = entries.filter((entry) => entry.initiator === 'link');
      // The file's one download is the preload's.
      expect(preloads, `${file} preload entry`).toHaveLength(1);
      const others = entries.filter((entry) => entry.initiator !== 'link');
      if (browserName !== 'webkit') {
        expect(entries, file).toHaveLength(1);
        continue;
      }
      // WebKit only: at most the stylesheet's memory-cache reuse of that same transfer.
      expect(others.length, `${file} entries after the preload`).toBeLessThanOrEqual(1);
      for (const reuse of others) {
        const preload = preloads[0]!;
        expect(reuse.initiator, file).toBe('css');
        // The preload must report real bytes, so "same size" can't pass on two zeros.
        expect(preload.encodedBodySize, `${file} preload size`).toBeGreaterThan(0);
        expect(reuse.encodedBodySize, file).toBe(preload.encodedBodySize);
        // The same network transfer: its response ended with the preload's, before the reuse even started.
        expect(Math.abs(reuse.responseEnd - preload.responseEnd), `${file} response time`).toBeLessThanOrEqual(1);
        expect(reuse.responseEnd, `${file} reuse began after the transfer ended`).toBeLessThanOrEqual(reuse.startTime);
      }
    }
  });
}
