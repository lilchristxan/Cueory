import { expect, test } from '@playwright/test';

/**
 * WCAG 2.4.11 (focus not obscured) for pillo's letter keys under the sticky header (lane 8, #823). With reduced motion
 * the header stays shown while the page scrolls, so a key reached by Tab near the bottom of the page must scroll fully
 * into view below the header (the site's scroll-padding-top, SiteHeader.astro), never partly under it.
 */
for (const [width, height] of [[390, 844], [1440, 900]] as const) {
  test(`at ${width} px with reduced motion, Tab to keys r to v near the footer shows each key fully below the header`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      try {
        localStorage.setItem('cueory-promo-seen', String(Date.now()));
        localStorage.setItem('cueory-game-help-seen', JSON.stringify(['pulse']));
      } catch { /* optional storage */ }
    });
    await page.goto('/play/pillo');
    const pillo = page.getByTestId('pulse');
    await expect(pillo.getByRole('button', { name: 'enter', exact: true })).toBeVisible();
    const keys = pillo.locator('.pillo-key');
    const labels = await keys.evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label') ?? ''));

    for (const letter of ['r', 's', 't', 'u', 'v']) {
      // Near the footer, the way the Evening audit leaves the page.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const index = labels.indexOf(letter);
      expect(index, letter).toBeGreaterThan(0);
      // Start on the key before it without scrolling, then Tab, as a keyboard user would.
      await keys.nth(index - 1).evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }));
      await page.keyboard.press('Tab');
      const key = keys.nth(index);
      await expect(key).toBeFocused();
      await expect.poll(async () => {
        return key.evaluate((element) => {
          const header = document.querySelector('header[data-scroll-header]')!.getBoundingClientRect();
          const box = element.getBoundingClientRect();
          return box.top >= header.bottom - 0.5 && box.bottom <= window.innerHeight + 0.5;
        });
      }, { message: `${letter} fully visible below the header` }).toBe(true);
      // Nothing covers the middle of the key either.
      const covered = await key.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + 2);
        return !(hit === element || element.contains(hit));
      });
      expect(covered, `${letter} top edge covered`).toBe(false);
    }
  });
}
