import { expect, test, type Request } from '@playwright/test';

/**
 * Lane 5, fonts: the two preloaded Lato files are the ones the page really uses, and each is requested once (a
 * preload whose crossorigin doesn't match the font request is requested twice).
 */
const lato = ['lato-latin-400-normal.woff2', 'lato-latin-700-normal.woff2'];

const requestHeaderNames = ['origin', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'purpose'] as const;
const responseHeaderNames = ['access-control-allow-origin', 'cache-control', 'content-type', 'vary'] as const;

type LatoRequestDiagnostic = {
  name: string;
  url: string;
  requestHeaders: Record<string, string>;
  preload: { as: string | null; type: string | null; crossorigin: string | null } | null;
  resourceTimingInitiators: string[];
  responseStatus: number | null;
  responseHeaders: Record<string, string>;
  responseBodySize: number | null;
  measurementError?: string;
};

function safeHeaders(headers: Record<string, string>, names: readonly string[]) {
  return Object.fromEntries(names.flatMap((name) => headers[name] === undefined ? [] : [[name, headers[name]]]));
}

// The offline first-visit save (src/scripts/offline.ts) asks again, through the service worker, for every file the
// page loaded (initiator "fetch", answered from cache) once the worker takes control. That deliberate request is not
// the font load measured here and lands at a random moment, so this spec runs without service workers.
test.use({ serviceWorkers: 'block' });

for (const path of ['/', '/learn/study-skills', '/play', '/signin']) {
  test(`${path}: both preloaded Lato weights are used and requested once`, async ({ page }, testInfo) => {
    const requests = new Map(lato.map((file) => [file, 0]));
    const diagnostics = new Map<Request, LatoRequestDiagnostic>();
    const completed: Promise<void>[] = [];
    page.on('request', (request) => {
      if (request.resourceType() !== 'font') return;
      const file = new URL(request.url()).pathname.split('/').at(-1);
      if (!file || !requests.has(file)) return;
      requests.set(file, requests.get(file)! + 1);
      diagnostics.set(request, {
        name: file,
        url: request.url(),
        requestHeaders: safeHeaders(request.headers(), requestHeaderNames),
        preload: null,
        resourceTimingInitiators: [],
        responseStatus: null,
        responseHeaders: {},
        responseBodySize: null,
      });
    });
    page.on('requestfinished', (request) => {
      const diagnostic = diagnostics.get(request);
      if (!diagnostic) return;
      completed.push((async () => {
        try {
          const response = await request.response();
          diagnostic.responseStatus = response?.status() ?? null;
          diagnostic.responseHeaders = response ? safeHeaders(response.headers(), responseHeaderNames) : {};
          diagnostic.responseBodySize = (await request.sizes()).responseBodySize;
        } catch (error) {
          diagnostic.measurementError = error instanceof Error ? error.message : String(error);
        }
      })());
    });

    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    await Promise.all(completed);
    const loaded = await page.evaluate(() => [...document.fonts]
      .filter((face) => face.family.replaceAll('"', '') === 'Lato' && face.style === 'normal' && face.status === 'loaded')
      .map((face) => face.weight)
      .sort());

    const browserEvidence = await page.evaluate((files) => {
      const preloads: Record<string, { as: string | null; type: string | null; crossorigin: string | null }> = {};
      for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="font"]')) {
        const file = new URL(link.href).pathname.split('/').at(-1);
        if (file && files.includes(file)) {
          preloads[file] = {
            as: link.getAttribute('as'),
            type: link.getAttribute('type'),
            crossorigin: link.getAttribute('crossorigin'),
          };
        }
      }
      const initiators = performance.getEntriesByType('resource')
        .filter((entry) => files.includes(entry.name.split('/').pop()!))
        .map((entry) => ({ name: entry.name, initiator: (entry as PerformanceResourceTiming).initiatorType }));
      return { preloads, initiators };
    }, lato);
    for (const diagnostic of diagnostics.values()) {
      diagnostic.preload = browserEvidence.preloads[diagnostic.name] ?? null;
      diagnostic.resourceTimingInitiators = browserEvidence.initiators
        .filter((entry) => entry.name === diagnostic.url)
        .map((entry) => entry.initiator);
    }
    await testInfo.attach('lato-request-diagnostics', {
      body: JSON.stringify([...diagnostics.values()], null, 2),
      contentType: 'application/json',
    });

    expect(loaded).toEqual(['400', '700']);
    for (const file of lato) expect(requests.get(file), file).toBe(1);
  });
}
