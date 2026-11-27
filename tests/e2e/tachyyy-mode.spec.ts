import { expect, test, type Page } from '@playwright/test';

// tachyyy mode (Christian, 2026-11-26): an optional countdown on pages where the student guesses. When it runs out the
// question is marked not right and the next one comes up at once. The page clock is driven by hand, so nothing waits.
const LEARN = '/learn/study-skills/learn-mode';

/** Steps past the "here is the card" screens until the student has something to guess. */
async function toGuessingStep(page: Page) {
  const nextCard = page.getByRole('button', { name: 'Next card', exact: true });
  const guess = page.getByRole('button', { name: "don't know?", exact: true });
  const show = page.getByRole('button', { name: 'Show answer', exact: true });
  for (let i = 0; i < 12 && !(await guess.isVisible()); i++) {
    await show.click();
    await nextCard.click();
  }
  await expect(guess).toBeVisible();
}

test('tachyyy mode is off until turned on, and the time can be set by tapping', async ({ page }) => {
  await page.goto(LEARN);
  const chip = page.getByTestId('tachyyy-chip');
  await expect(chip).toContainText('off');
  await expect(page.getByTestId('tachyyy-bar')).toHaveCount(0);
  await chip.click();
  const panel = page.getByTestId('tachyyy-panel');
  await panel.getByRole('button', { name: 'more time' }).click();
  await expect(page.getByTestId('tachyyy-seconds')).toHaveText('15 seconds');
  await panel.getByRole('button', { name: 'less time' }).click();
  await panel.getByRole('button', { name: 'less time' }).click();
  await expect(page.getByTestId('tachyyy-seconds')).toHaveText('5 seconds');
  await expect(panel.getByRole('button', { name: 'less time' })).toBeDisabled();
  await panel.getByRole('switch', { name: 'tachyyy mode' }).check();
  await panel.getByRole('button', { name: 'done' }).click();
  await expect(page.getByTestId('tachyyy-clock')).toBeVisible();
  // The choice is kept on this device.
  await page.reload();
  await expect(page.getByTestId('tachyyy-clock')).toBeVisible();
});

test('when the time runs out the card is marked not right and the next one comes up at once', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('cueory.tachyyy-mode', '{"on":true,"seconds":5}'));
  await page.goto(LEARN);
  // The first step only shows a card: no guessing, so no countdown runs there.
  const prompt = page.getByTestId('learn-prompt');
  await expect(prompt).toBeVisible();
  await page.clock.runFor(8000);
  await expect(page.getByTestId('tachyyy-said')).toHaveText('');
  // Move on until a guessing step is up.
  await toGuessingStep(page);
  const before = await prompt.textContent();
  await page.clock.runFor(4000);
  await expect(page.getByTestId('tachyyy-said')).toHaveText('');
  await page.clock.runFor(1500);
  await expect(page.getByTestId('tachyyy-said')).toHaveText(`time is up: ${before} is marked not right.`);
  // No feedback screen to dismiss: the session is already on another card or step.
  await expect(page.getByTestId('learn-feedback')).toHaveCount(0);
});

test('the countdown waits while the settings are open', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('cueory.tachyyy-mode', '{"on":true,"seconds":5}'));
  await page.goto(LEARN);
  await toGuessingStep(page);
  await page.getByTestId('tachyyy-chip').click();
  await page.clock.runFor(20_000);
  await expect(page.getByTestId('tachyyy-said')).toHaveText('');
});
