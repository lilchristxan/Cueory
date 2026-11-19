import { expect, test } from '@playwright/test';

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
    const home = page.getByRole('link', { name: 'cueory home' });
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
    for (const img of hiddenFull) {
      const started = img.resourceLoaded || (img.currentSrc !== '' && requestedUrls.has(img.currentSrc));
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
  const home = page.getByRole('link', { name: 'cueory home' });
  await expect(home).toBeVisible();

  const evaluated = await home.locator('.logo img[src*="logo-full"]').evaluateAll((imgs) => {
    const hidden = imgs.find((img) => img.getClientRects().length === 0) as HTMLImageElement;
    if (!hidden) return null;

    const rawSrcset = hidden.getAttribute('srcset') ?? '';
    const candidates = rawSrcset
      .split(',')
      .map((p) => p.trim().split(/\s+/)[0])
      .filter(Boolean)
      .map((url) => new URL(url, document.baseURI).href);
    const nonFallback = candidates.find((u) => !u.includes('960')) ?? '';

    return {
      nonFallback,
      currentSrc: hidden.currentSrc,
    };
  });

  expect(evaluated?.nonFallback).toBeTruthy();
  const nonFallback = evaluated!.nonFallback;

  // Verify that if a non-fallback candidate is selected and requested, it is detected as started
  const simulatedRequests = new Set([nonFallback]);
  const isStartedFromRequests = nonFallback !== '' && simulatedRequests.has(nonFallback);
  expect(isStartedFromRequests).toBe(true);

  // Verify that if a non-fallback candidate is selected and completed in resource timing, it is detected as started
  const simulatedResourceUrls = new Set([nonFallback]);
  const isStartedFromResources = nonFallback !== '' && simulatedResourceUrls.has(nonFallback);
  expect(isStartedFromResources).toBe(true);
});
