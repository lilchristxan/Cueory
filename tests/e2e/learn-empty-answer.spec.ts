import { expect, test, type Page } from '@playwright/test';

/**
 * Form validation: pressing "Check" on a typed or fill-in card with nothing typed explains the problem in words next to
 * the field, marks the field invalid, announces it, and keeps focus in the field. No answer is spent.
 */

const LEARN_URL = '/learn/study-skills/learn-mode';
const backs: Record<string, string> = {
  'Placeholder card 1, front.': "Placeholder card 1, back. Christian's reviewed card text replaces this.",
  'Placeholder card 2, front.': 'Placeholder card 2, back.',
  'Placeholder card 3, front.': 'Placeholder card 3, back.',
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch {
      // Storage is blocked: the panel never shows then anyway.
    }
  });
});

/** Plays correct answers until a typed or fill-in step shows its text field. */
async function reachTypedStep(page: Page) {
  const field = page.getByRole('textbox');
  for (let turn = 0; turn < 20 && !(await field.isVisible()); turn++) {
    const step = (await page.getByTestId('learn-step').textContent()) ?? '';
    const prompt = (await page.getByTestId('learn-prompt').textContent()) ?? '';
    if (step === 'Choose the answer') {
      await page.getByRole('list', { name: 'Answers' }).getByRole('button', { name: backs[prompt]!, exact: true }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
    } else if (step === 'New card') {
      await page.getByRole('button', { name: 'Show answer' }).click();
      await page.getByRole('button', { name: 'Next card' }).click();
    } else {
      break;
    }
  }
  await expect(field).toBeVisible();
}

test('checking an empty answer explains the problem, marks the field and keeps focus there', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(LEARN_URL);
  await reachTypedStep(page);
  const field = page.getByRole('textbox');
  const check = page.getByRole('button', { name: 'Check' });
  await expect(check).toBeEnabled();
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');

  await check.click();
  const problem = page.getByTestId('answer-problem');
  await expect(problem).toHaveText('problem: type an answer first, or look at the card again.');
  await expect(problem).toHaveAttribute('role', 'alert');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAttribute('aria-describedby', (await problem.getAttribute('id'))!);
  await expect(field).toBeFocused();
  // Spaces alone are still empty.
  await field.fill('   ');
  await expect(problem).toHaveText('');
  await page.keyboard.press('Enter');
  await expect(problem).toContainText('type an answer first');

  // Typing clears the message and the invalid mark.
  await field.fill('x');
  await expect(problem).toHaveText('');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
