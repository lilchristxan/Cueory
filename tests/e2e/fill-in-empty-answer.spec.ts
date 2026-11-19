import { expect, test } from '@playwright/test';

/**
 * Form validation in fill-in mode: pressing "check" with nothing typed explains the problem
 * in words next to the field, marks the field invalid, announces it through a role="alert" region,
 * and keeps focus in the field.
 */

const FILL_IN_URL = '/learn/study-skills/fill-in';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch {
      // Storage is blocked
    }
  });
});

test('fill-in: checking an empty answer explains the problem, marks the field, and keeps focus at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(FILL_IN_URL);

  const board = page.getByTestId('fill-in');
  await expect(board).toBeVisible();

  // Switch to typed mode
  const toggle = board.getByRole('button', { name: 'type instead' });
  await toggle.click();

  const field = board.getByRole('textbox', { name: 'the missing word' });
  await expect(field).toBeVisible();

  const check = board.getByRole('button', { name: 'check' });
  await expect(check).toBeEnabled();
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');

  // Check with empty field
  await check.click();

  const problem = board.getByTestId('answer-problem');
  await expect(problem).toHaveText('problem: type an answer first, or look at the card again.');
  await expect(problem).toHaveAttribute('role', 'alert');
  await expect(field).toHaveAttribute('aria-invalid', 'true');

  const problemId = await problem.getAttribute('id');
  expect(problemId).toBeTruthy();
  await expect(field).toHaveAttribute('aria-describedby', problemId!);
  await expect(field).toBeFocused();

  // Spaces alone are still empty
  await field.fill('   ');
  await expect(problem).toHaveText('');
  await page.keyboard.press('Enter');
  await expect(problem).toHaveText('problem: type an answer first, or look at the card again.');
  await expect(field).toBeFocused();

  // Typing non-whitespace clears the problem and invalid state
  await field.fill('honey');
  await expect(problem).toHaveText('');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');

  // No horizontal scroll at 320 px
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
