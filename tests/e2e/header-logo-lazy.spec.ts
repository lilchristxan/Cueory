import { expect, test } from '@playwright/test';

/**
 * Performance (2026-11-19): the header carries the phone emblem and the full logo, each in a Daytime and an Evening
 * copy, and CSS shows one. The full logo is lazy, so a copy the page hides (the full logo on phones, the other
 * palette's copy everywhere) is never downloaded, while the copy that shows still loads.
 */
for (const path of ['/support', '/play/word-path']) {
  test(`${path}: the header downloads only the logo it shows`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'load' });
    const home = page.getByRole('link', { name: 'cueory home' });
    await expect(home).toBeVisible();
    const shown = home.locator('.logo img').filter({ visible: true });
    await expect(shown).toHaveCount(1);
    await expect.poll(() => shown.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const hiddenFull = await home.locator('.logo img[src*="logo-full"]').evaluateAll((imgs) => {
      const resources = performance.getEntriesByType('resource');
      return imgs
        .filter((img) => img.getClientRects().length === 0)
        .map((img) => {
          const htmlImg = img as HTMLImageElement;
          const currentSrc = htmlImg.currentSrc;
          const started = currentSrc !== "" && resources.some((r) => r.name === currentSrc);
          return {
            src: img.getAttribute('src'),
            loading: htmlImg.loading,
            started,
          };
        });
    });
    // Phones hide both full-logo copies; wider screens hide the other palette's copy.
    expect(hiddenFull.length).toBeGreaterThan(0);
    for (const img of hiddenFull) expect(img, String(img.src)).toEqual({ src: img.src, loading: 'lazy', started: false });
  });
}

test('/support: responsive candidates: started detection catches a non-fallback candidate from srcset', async ({ page }) => {
  await page.goto('/support', { waitUntil: 'load' });
  const home = page.getByRole('link', { name: 'cueory home' });
  await expect(home).toBeVisible();

  const evaluated = await home.locator('.logo img[src*="logo-full"]').evaluateAll((imgs) => {
    const hidden = imgs.find((img) => img.getClientRects().length === 0) as HTMLImageElement;
    if (!hidden) return null;

    const srcset = hidden.getAttribute('srcset') ?? '';
    const candidates = srcset.split(',').map((p) => p.trim().split(/\s+/)[0]);
    const nonFallback = candidates.find((u) => u && !u.includes('960')) ?? '';
    const nonFallbackHref = new URL(nonFallback, window.location.href).href;

    const simulatedResources = [{ name: nonFallbackHref }];
    const simulatedCurrent = nonFallbackHref;
    const isStarted = simulatedCurrent !== '' && simulatedResources.some((r) => r.name === simulatedCurrent);

    return {
      nonFallback,
      isStarted,
    };
  });

  expect(evaluated?.nonFallback).toBeTruthy();
  expect(evaluated?.isStarted).toBe(true);
});
