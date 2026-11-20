import { expect, test } from '@playwright/test';

/**
 * Lane 5, fonts: the two preloaded Lato files are the ones the page really uses, and each is requested once (a
 * preload whose crossorigin doesn't match the font request is requested twice).
 */
const lato = ['lato-latin-400-normal.woff2', 'lato-latin-700-normal.woff2'];

// The offline first-visit save (src/scripts/offline.ts) asks again, through the service worker, for every file the
// page loaded (initiator "fetch", answered from cache) once the worker takes control. That deliberate request is not
// the font load measured here and lands at a random moment, so this spec runs without service workers.
test.use({ serviceWorkers: 'block' });

for (const path of ['/', '/learn/study-skills', '/play', '/signin']) {
  test(`${path}: both preloaded Lato weights are used and requested once`, async ({ page }) => {
    const requests = new Map(lato.map((file) => [file, 0]));
    page.on('request', (request) => {
      if (request.resourceType() !== 'font') return;
      const file = new URL(request.url()).pathname.split('/').at(-1);
      if (file && requests.has(file)) requests.set(file, requests.get(file)! + 1);
    });

    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() => [...document.fonts]
      .filter((face) => face.family.replaceAll('"', '') === 'Lato' && face.style === 'normal' && face.status === 'loaded')
      .map((face) => face.weight)
      .sort());

    expect(loaded).toEqual(['400', '700']);
    for (const file of lato) expect(requests.get(file), file).toBe(1);
  });
}
