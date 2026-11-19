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
    const hiddenFull = await home.locator('.logo img[src*="logo-full"]').evaluateAll((imgs) =>
      imgs.filter((img) => img.getClientRects().length === 0).map((img) => ({
        src: img.getAttribute('src'),
        loading: (img as HTMLImageElement).loading,
        started: (img as HTMLImageElement).currentSrc !== '',
      })),
    );
    // Phones hide both full-logo copies; wider screens hide the other palette's copy.
    expect(hiddenFull.length).toBeGreaterThan(0);
    for (const img of hiddenFull) expect(img, String(img.src)).toEqual({ src: img.src, loading: 'lazy', started: false });
  });
}
