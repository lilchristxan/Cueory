import { expect, test } from '@playwright/test';

// Home at 320px wide with 32px root text: the page never scrolls sideways, the "get launch updates" heading wraps
// inside its panel, and the study-mode carousel's arrows stay whole and on screen (the dots wrap between them).

test.use({ viewport: { width: 320, height: 700 } });

test('home fits 320px with 32px text, carousel arrows on screen', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional storage */ }
  });
  await page.goto('/');
  await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveCSS('font-size', '32px');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  const heading = page.locator('#signup-heading');
  const headingFits = await heading.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const box = element.getBoundingClientRect();
    return [...range.getClientRects()].every((rect) => rect.right <= box.right + 0.5);
  });
  expect(headingFits).toBe(true);

  const modesHeading = page.locator('#modes-heading');
  const modesHeadingFits = await modesHeading.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const box = element.getBoundingClientRect();
    return [...range.getClientRects()].every((rect) => rect.right <= box.right + 0.5);
  });
  expect(modesHeadingFits).toBe(true);

  for (const name of ['previous study mode', 'next study mode', 'pause the slideshow']) {
    const button = page.getByRole('button', { name });
    await button.scrollIntoViewIfNeeded();
    const box = (await button.boundingBox())!;
    expect(box.width, name).toBeGreaterThanOrEqual(44);
    expect(box.height, name).toBeGreaterThanOrEqual(44);
    expect(box.x, name).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, name).toBeLessThanOrEqual(320);
  }
  const before = await page.locator('[data-modes-dot][data-on]').evaluate((dot) => [...dot.parentElement!.children].indexOf(dot));
  await page.getByRole('button', { name: 'next study mode' }).click();
  await expect.poll(() => page.locator('[data-modes-dot][data-on]').evaluate((dot) => [...dot.parentElement!.children].indexOf(dot))).not.toBe(before);
});
