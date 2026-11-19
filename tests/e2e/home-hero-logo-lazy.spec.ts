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
 * Performance (2026-11-19): the home hero draws its own logo row, the phone emblem and the full logo, each in a Daytime
 * and an Evening copy, and CSS shows one. The full logo is lazy, so a copy the page hides (the full logo on phones, the
 * other palette's copy everywhere) is never downloaded, while the copy that shows still loads.
 */
test('/: the hero logo row downloads only the logo it shows', async ({ page }) => {
  const requestedUrls = new Set<string>();
  page.on('request', (req) => requestedUrls.add(req.url()));

  await page.goto('/', { waitUntil: 'load' });
  const row = page.locator('.scene-hero .logo').first().locator('xpath=..');
  const shown = row.locator('.logo img').filter({ visible: true });
  await expect(shown).toHaveCount(1);
  await expect.poll(() => shown.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  const hiddenFull = await row.locator('.logo img[src*="logo-full"]').evaluateAll((imgs) => {
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
  for (const img of hiddenFull) {
    const started = isDownloadStarted(img, requestedUrls);
    expect({ src: img.src, loading: img.loading, started }, String(img.src)).toEqual({
      src: img.src,
      loading: 'lazy',
      started: false,
    });
  }
});
