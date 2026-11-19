import { expect, test } from '@playwright/test';

/**
 * Engine run 44460645965, group E2: under reduced motion, WebKit's axe read text in its old color on the Evening
 * palette (black or Espresso on Charcoal), always on text that inherits its color. The blanket 0.01ms rule turned every
 * color change into a one-frame transition. Under reduced motion nothing may transition, so a palette switch lands in
 * one step, and text reads in its new color straight away, in the same task as the switch.
 */
const routes = ['/preview/reminders', '/learn/study-skills', '/learn/study-skills/questions'];

for (const route of routes) {
  test(`${route}: under reduced motion a theme switch starts no transition and text is Ivory at once`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    const result = await page.evaluate(async () => {
      const runs: string[] = [];
      document.addEventListener('transitionrun', (event) => {
        const target = event.target as Element;
        runs.push(target.tagName.toLowerCase() + ' ' + (event as TransitionEvent).propertyName);
      }, true);
      const ink = () => getComputedStyle(document.documentElement).getPropertyValue('--color-ink').trim();
      const lightInk = ink();
      document.documentElement.dataset.theme = 'dark';
      // Read in the same task as the switch: a transition would still show the old color here.
      const now = {
        root: getComputedStyle(document.documentElement).color,
        heading: getComputedStyle(document.querySelector('h1')!).color,
        ink: ink(),
      };
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { lightInk, now, runs };
    });
    expect(result.lightInk).not.toBe(result.now.ink);
    expect(result.now.root).toBe('rgb(249, 245, 239)'); // Ivory, --color-ink in Evening
    expect(result.now.heading).toBe('rgb(249, 245, 239)');
    expect(result.runs).toEqual([]);
  });
}

test('without reduced motion, components keep their own transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/learn/study-skills');
  const properties = await page.evaluate(() =>
    [...document.querySelectorAll('body *')].map((element) => getComputedStyle(element).transitionProperty)
      .filter((value) => value !== 'all' && value !== 'none'));
  expect(properties.length).toBeGreaterThan(0);
});
