import { expect, test, type Locator } from '@playwright/test';

/**
 * Engine run 44460645965, group E8: in WebKit the radio that the browser's own arrow keys move to did not match
 * :focus-visible (reminder-opt-in 52, start 190). The page now moves the choice itself (src/islands/radioarrows.ts);
 * these checks keep the browser's radio behavior: each arrow moves and picks, the ends wrap, and the ring shows.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch { /* optional storage */ }
  });
});

async function ringed(radio: Locator) {
  await expect(radio).toBeFocused();
  await expect(radio).toBeChecked();
  expect(await radio.evaluate((element) => element.matches(':focus-visible')
    && parseFloat(getComputedStyle(element).outlineWidth) > 0)).toBe(true);
}

test('reminder choices: arrows move, pick and wrap with a visible ring, and the status follows', async ({ page }) => {
  await page.goto('/preview/reminders');
  const box = page.getByTestId('completed-review');
  await box.getByRole('button', { name: 'remind me', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  const phone = box.getByRole('radio', { name: 'phone notifications', exact: true });
  const email = box.getByRole('radio', { name: 'email reminders', exact: true });
  await expect(phone).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await ringed(email);
  await expect(phone).not.toBeChecked();
  await expect(box.getByRole('status')).toHaveText('email reminders selected for this preview. nothing is enabled or saved.');
  await page.keyboard.press('ArrowDown');
  await ringed(phone);
  await page.keyboard.press('ArrowLeft');
  await ringed(email);
  await page.keyboard.press('ArrowRight');
  await ringed(phone);
  await expect(box.getByRole('status')).toHaveText('phone notifications selected for this preview. nothing is enabled or saved.');
});

test('setup course: arrows move and pick with a visible ring, and Enter still continues', async ({ page }) => {
  await page.goto('/start');
  // With no saved answer "not sure yet" is picked, so Tab lands on it.
  const notSure = page.getByRole('radio', { name: 'not sure yet', exact: true });
  const first = page.getByRole('radio', { name: 'fundamentals', exact: true });
  await expect(notSure).toBeChecked();
  for (let step = 0; step < 30 && !(await notSure.evaluate((element) => element === document.activeElement)); step++) {
    await page.keyboard.press('Tab');
  }
  await expect(notSure).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await ringed(first);
  await page.keyboard.press('ArrowUp');
  await ringed(notSure);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await ringed(page.getByRole('radio', { name: 'med-surg i', exact: true }));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('setup-step')).toHaveText('question 2 of 2');
});
