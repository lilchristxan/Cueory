import { expect, test } from '@playwright/test';

/**
 * Advisor findings (#903, lanes 3 and 4): links that stand alone as actions (not links inside a sentence) and the
 * survey's yes/no choices are at least 44 px tall, so they are easy to tap on a phone. The /start coming-soon links
 * only render when onboarding is closed, which the test build is not, so tests/unit/standalone-link-targets.test.ts
 * checks those in the source.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch { /* optional storage */ }
  });
});

const cases: { route: string; names: string[] }[] = [
  { route: '/learn/study-skills/cards', names: ['learn these cards in learn mode', 'back to the lesson'] },
];

for (const { route, names } of cases) {
  test(`${route}: standalone action links are at least 44 px tall`, async ({ page }) => {
    await page.goto(route);
    for (const name of names) {
      const box = (await page.getByRole('main').getByRole('link', { name, exact: true }).boundingBox())!;
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
  });
}

test('/preview/survey: the yes and no choices are at least 44 px tall', async ({ page }) => {
  await page.goto('/preview/survey');
  for (const name of ['yes', 'no']) {
    const radio = page.getByRole('radio', { name, exact: true }).first();
    await expect(radio).toBeVisible();
    const box = (await radio.locator('xpath=ancestor::label[1]').boundingBox())!;
    expect(box.height, name).toBeGreaterThanOrEqual(44);
  }
});
