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

/** The compact phone and two-row desktop headers use the same official full wordmark.
 * Its unused palette image is lazy and must stay off the network. */
test('/: the hero logo row downloads only the logo it shows', async ({ page }) => {
  const requestedUrls = new Set<string>();
  page.on('request', (req) => requestedUrls.add(req.url()));

  await page.goto('/', { waitUntil: 'load' });
  const row = page.locator('.home-board-header .home-brand');
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

  // All sizes show a full wordmark and hide the unused palette.
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
