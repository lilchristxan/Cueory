import { expect, test, type Page } from '@playwright/test';

// /start and /progress at 320px wide with 32px root text: every step of the setup questions and the saved-progress
// page fit the screen. The page never scrolls sideways and every visible control is fully on screen.

test.use({ viewport: { width: 320, height: 700 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional storage */ }
  });
});

async function bigText(page: Page) {
  await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
  await expect(page.locator('html')).toHaveCSS('font-size', '32px');
}

async function fits(page: Page, step: string) {
  const findings = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const scrolls = (node: Element | null) => {
      for (let at = node; at && at !== document.body; at = at.parentElement) if (getComputedStyle(at).overflowX !== 'visible') return true;
      return false;
    };
    const outside = [...document.querySelectorAll<HTMLElement>('main a, main button, main input, main select, main textarea, main label')]
      .filter((element) => element.getClientRects().length > 0 && !element.closest('.sr-only') && !scrolls(element.parentElement))
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && (box.left < -0.5 || box.right > width + 0.5))
      .map(({ element, box }) => `${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim().slice(0, 30)}" ${Math.round(box.left)}-${Math.round(box.right)}`);
    return { sideways: document.documentElement.scrollWidth - width, outside };
  });
  expect(findings.outside, step).toEqual([]);
  expect(findings.sideways, step).toBeLessThanOrEqual(0);
}

test('setup questions and the progress page fit 320px with 32px text', async ({ page }) => {
  await page.goto('/start');
  await bigText(page);
  await fits(page, 'question 1');
  await page.getByRole('radio', { name: 'med-surg i' }).check();
  await page.getByRole('button', { name: 'continue', exact: true }).click();
  await expect(page.getByTestId('setup-step')).toHaveText('question 2 of 2');
  await fits(page, 'question 2');
  await page.getByLabel('when is your exam?').fill('2027-05-12');
  await page.getByRole('button', { name: 'save my answers' }).click();
  await expect(page.locator(':focus')).toContainText('saved on this device.');
  await fits(page, 'saved');

  await page.goto('/progress');
  await bigText(page);
  await expect(page.getByText('course: med-surg i')).toBeVisible();
  await fits(page, 'progress');
});
