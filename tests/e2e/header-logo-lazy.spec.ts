import { expect, test } from '@playwright/test';

/**
 * Checks whether an image has started downloading, either recorded in resource timing or currently in flight.
 */
function isDownloadStarted(
  img: { currentSrc: string; resourceLoaded: boolean },
  requestedUrls: ReadonlySet<string>,
): boolean {
  return img.resourceLoaded || (img.currentSrc !== '' && requestedUrls.has(img.currentSrc));
}

/**
 * Performance (2026-11-19): the header carries the phone emblem and the full logo, each in a Daytime and an Evening
 * copy, and CSS shows one. The full logo is lazy, so a copy the page hides (the full logo on phones, the other
 * palette's copy everywhere) is never downloaded, while the copy that shows still loads.
 */
for (const path of ['/support', '/play/word-path']) {
  test(`${path}: the header downloads only the logo it shows`, async ({ page }) => {
    const requestedUrls = new Set<string>();
    page.on('request', (req) => requestedUrls.add(req.url()));

    await page.goto(path, { waitUntil: 'load' });
    const home = page.locator('header').getByRole('link', { name: 'cueory home' });
    await expect(home).toBeVisible();
    const shown = home.locator('.logo img').filter({ visible: true });
    await expect(shown).toHaveCount(1);
    await expect.poll(() => shown.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    const hiddenFull = await home.locator('.logo img[src*="logo-full"]').evaluateAll((imgs) => {
      const resourceUrls = new Set(performance.getEntriesByType('resource').map((r) => r.name));
      return imgs
        .filter((img) => img.getClientRects().length === 0)
        .map((img) => {
          const htmlImg = img as HTMLImageElement;
          const currentSrc = htmlImg.currentSrc;
          const resourceLoaded = currentSrc !== '' && resourceUrls.has(currentSrc);
          return {
            src: img.getAttribute('src'),
            currentSrc,
            loading: htmlImg.loading,
            resourceLoaded,
          };
        });
    });

    // Phones hide both full-logo copies; wider screens hide the other palette's copy.
    expect(hiddenFull.length).toBeGreaterThan(0);
    // Game pages also render the shared Frame, whose visible sidebar logo can request the same full-logo URL as one
    // of the header's hidden copies. A request is allowed only for a URL that a visible image on the page shows; any
    // other hidden copy (for example the other palette's) must still never download.
    const shownUrls = new Set(
      await page.locator('img').evaluateAll((imgs) =>
        imgs
          .filter((img) => img.getClientRects().length > 0 && getComputedStyle(img).visibility !== 'hidden')
          .flatMap((img) => [(img as HTMLImageElement).currentSrc, (img as HTMLImageElement).src])
          .filter((url) => url !== ''),
      ),
    );
    for (const img of hiddenFull) {
      const absolute = img.src === null ? '' : new URL(img.src, page.url()).href;
      const sharedWithVisible = shownUrls.has(img.currentSrc) || shownUrls.has(absolute);
      const started = isDownloadStarted(img, requestedUrls) && !sharedWithVisible;
      expect({ src: img.src, loading: img.loading, started }, String(img.src)).toEqual({
        src: img.src,
        loading: 'lazy',
        started: false,
      });
    }
  });
}

test('/support: responsive candidates: started detection catches a non-fallback candidate from srcset', async ({ page }) => {
  const requestedUrls = new Set<string>();
  page.on('request', (req) => requestedUrls.add(req.url()));

  await page.goto('/support', { waitUntil: 'load' });
  const home = page.locator('header').getByRole('link', { name: 'cueory home' });
  await expect(home).toBeVisible();

  const nonFallbackUrl = await home.locator('.logo img[src*="logo-full"]').evaluateAll((imgs) => {
    const hidden = imgs.find((img) => img.getClientRects().length === 0) as HTMLImageElement;
    if (!hidden) return '';
    const rawSrcset = hidden.getAttribute('srcset') ?? '';
    const candidates = rawSrcset
      .split(',')
      .map((p) => p.trim().split(/\s+/)[0])
      .filter(Boolean)
      .map((url) => new URL(url, document.baseURI).href);
    return candidates.find((u) => !u.includes('960')) ?? '';
  });

  expect(nonFallbackUrl).toBeTruthy();

  // Trigger a real request for the non-fallback responsive candidate
  await page.evaluate((url) => {
    const testImg = document.createElement('img');
    testImg.id = 'test-non-fallback-img';
    testImg.src = url;
    document.body.appendChild(testImg);
  }, nonFallbackUrl);

  await expect.poll(() => requestedUrls.has(nonFallbackUrl)).toBe(true);

  // Exercise the real detection path on the downloaded candidate
  const detectionResult = await page.locator('#test-non-fallback-img').evaluate((img) => {
    const htmlImg = img as HTMLImageElement;
    const resourceUrls = new Set(performance.getEntriesByType('resource').map((r) => r.name));
    const currentSrc = htmlImg.currentSrc;
    const resourceLoaded = currentSrc !== '' && resourceUrls.has(currentSrc);
    return {
      currentSrc,
      resourceLoaded,
    };
  });

  const started = isDownloadStarted(detectionResult, requestedUrls);
  expect(started).toBe(true);
});
