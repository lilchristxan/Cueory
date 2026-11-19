import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';

/**
 * Engine run 44460645965, group E4: at 320 px, WebKit's native radios and checkboxes on the questions page were under
 * axe's 24 px target size. Like /preview/admin-flags (#919): each input is 24 px and its label is a 44 px tap area.
 */
test.use({ viewport: { width: 320, height: 720 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch { /* optional storage */ }
  });
});

async function expectTargets(page: import('@playwright/test').Page, choices: Locator) {
  const all = await choices.all();
  expect(all.length).toBeGreaterThan(1);
  for (const choice of all) {
    const input = (await choice.boundingBox())!;
    expect(input.width).toBeGreaterThanOrEqual(24);
    expect(input.height).toBeGreaterThanOrEqual(24);
    const label = (await choice.locator('xpath=ancestor::label[1]').boundingBox())!;
    expect(label.width).toBeGreaterThanOrEqual(44);
    expect(label.height).toBeGreaterThanOrEqual(44);
  }
  const results = await new AxeBuilder({ page }).withRules(['target-size']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('question radios and checkboxes are 24 px with 44 px labels at 320 px, and axe target-size passes', async ({ page }) => {
  await page.goto('/learn/study-skills/questions');
  const board = page.getByTestId('questions');
  await expect(board.getByText('question 1 of 3')).toBeVisible();
  await expectTargets(page, board.getByRole('radio'));

  await board.getByRole('radio', { name: 'a carrot' }).check();
  await board.getByRole('button', { name: 'check' }).click();
  await expect(board.getByText('not quite.', { exact: true }).first()).toBeVisible();
  await expectTargets(page, board.getByRole('radio'));

  await board.getByRole('button', { name: 'next question' }).click();
  await expect(board.getByText('question 2 of 3')).toBeVisible();
  await expectTargets(page, board.getByRole('checkbox'));
});
