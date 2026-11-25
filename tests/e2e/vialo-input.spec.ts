import { expect, test, type Locator, type Page } from '@playwright/test';
import { fixClock } from './clock';

// Christian (25 Nov 2026): backspace and enter must work on vialo from every focus position, by physical keyboard,
// mouse, touch and keyboard activation of the on-screen keys.
test.beforeEach(async ({ page }) => {
  await fixClock(page, new Date('2026-11-01T15:00:00'));
  await page.goto('/play/vialo');
  await expect(page.getByTestId('vialo')).toBeVisible();
});

const keys = (page: Page) => page.getByRole('group', { name: 'letters' });
// A letter key that has a result is named like "a, in its place", so letters match their first word.
const key = (page: Page, name: string) =>
  name.length === 1 ? keys(page).getByRole('button', { name: new RegExp(`^${name}(,|$)`) }) : keys(page).getByRole('button', { name, exact: true });
const typed = (page: Page) => page.locator('[data-testid="vialo"] .vialo-typed .vialo-letter');
const guesses = (page: Page) => page.getByRole('list', { name: 'your guesses' }).getByRole('listitem');
const field = (page: Page) => page.getByLabel('your guess', { exact: true });
async function tap(page: Page, target: Locator, touch: boolean) {
  if (touch) await target.tap();
  else await target.click();
}
async function typeOnScreen(page: Page, word: string) {
  for (const letter of word) await key(page, letter).click();
}
const focusTargets: Record<string, (page: Page) => Promise<void>> = {
  'the page body': async (page) => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  },
  'the guess cell': async (page) => {
    await field(page).focus();
  },
  'a letter key just pressed': async (page) => {
    await key(page, 'q').focus();
  },
  'the delete key': async (page) => {
    await key(page, 'delete').focus();
  },
};

for (const [where, focus] of Object.entries(focusTargets)) {
  for (const physical of ['Backspace', 'Delete']) {
    test(`${physical} removes the last typed letter with focus on ${where}`, async ({ page }) => {
      await typeOnScreen(page, 'cra');
      await focus(page);
      await page.keyboard.press(physical);
      await expect(typed(page)).toHaveText(['c', 'r']);
      await page.keyboard.press(physical);
      await page.keyboard.press(physical);
      await expect(typed(page)).toHaveCount(0);
      await page.keyboard.press(physical);
      await expect(typed(page)).toHaveCount(0);
      await expect(guesses(page)).toHaveCount(0);
    });
  }

  for (const enter of ['Enter', 'NumpadEnter']) {
    test(`${enter} submits a full row with focus on ${where}, once`, async ({ page }) => {
      await typeOnScreen(page, 'crane');
      await focus(page);
      await page.keyboard.press(enter);
      await expect(guesses(page)).toHaveCount(1);
      await expect(guesses(page)).toHaveAccessibleName(/^guess 1: crane\./);
      await expect(typed(page)).toHaveCount(0);
    });
  }
}

test('Backspace never touches submitted rows and Enter on a short row submits nothing', async ({ page }) => {
  await typeOnScreen(page, 'crane');
  await key(page, 'enter').click();
  await expect(guesses(page)).toHaveCount(1);
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(guesses(page)).toHaveCount(1);
  await expect(guesses(page)).toHaveAccessibleName(/^guess 1: crane\./);
  await typeOnScreen(page, 'ab');
  await page.keyboard.press('Enter');
  await expect(guesses(page)).toHaveCount(1);
  await expect(page.getByTestId('vialo-problem')).toBeVisible();
  await expect(typed(page)).toHaveText(['a', 'b']);
});

test('Backspace on the page does not navigate back', async ({ page }) => {
  await page.goto('/');
  await page.goto('/play/vialo');
  await typeOnScreen(page, 'ab');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Backspace');
  await expect(page).toHaveURL(/\/play\/vialo$/);
  await expect(typed(page)).toHaveText(['a']);
});

test('holding Enter submits a row once', async ({ page }) => {
  await typeOnScreen(page, 'crane');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.down('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(guesses(page)).toHaveCount(1);
});

test('Enter on a word that is not in the list shows the message and submits nothing', async ({ page }) => {
  await typeOnScreen(page, 'zzzzz');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('vialo-problem')).toBeVisible();
  await expect(guesses(page)).toHaveCount(0);
  await expect(typed(page)).toHaveCount(5);
});

test('Enter and Backspace do nothing while the how-to-play dialog is open', async ({ page }) => {
  await typeOnScreen(page, 'crane');
  await page.getByTestId('game-help-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  await expect(guesses(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(typed(page)).toHaveCount(5);
});

test('Enter and Backspace do nothing after the game is finished', async ({ page }) => {
  for (const word of ['crane', 'crane', 'crane', 'crane', 'crane', 'crane']) {
    await typeOnScreen(page, word);
    await page.keyboard.press('Enter');
  }
  await expect(page.getByTestId('vialo-result')).toBeVisible();
  const before = await guesses(page).count();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  await expect(guesses(page)).toHaveCount(before);
});

test.describe('on-screen delete and enter keys', () => {
  for (const how of ['click', 'tap', 'Enter key', 'Space key']) {
    test(`delete key removes the last letter by ${how}`, async ({ page }, info) => {
      test.skip(how === 'tap' && !info.project.use.hasTouch && !info.project.name.includes('phone'), 'touch projects only');
      await typeOnScreen(page, 'cra');
      const del = key(page, 'delete');
      if (how === 'tap') await del.tap();
      else if (how === 'click') await del.click();
      else {
        await del.focus();
        // Enter on a focused key submits the row (Christian, 25 Nov); only Space activates the focused delete key.
        if (how === 'Space key') await page.keyboard.press('Space');
        else {
          await page.keyboard.press('Enter');
          await expect(guesses(page)).toHaveCount(0);
          await expect(typed(page)).toHaveText(['c', 'r', 'a']);
          return;
        }
      }
      await expect(typed(page)).toHaveText(['c', 'r']);
      await del.click();
      await del.click();
      await del.click();
      await expect(typed(page)).toHaveCount(0);
    });
  }

  for (const how of ['click', 'tap', 'Enter key', 'Space key']) {
    test(`enter key submits a full row once by ${how}`, async ({ page }, info) => {
      test.skip(how === 'tap' && !info.project.use.hasTouch && !info.project.name.includes('phone'), 'touch projects only');
      await typeOnScreen(page, 'crane');
      const enter = key(page, 'enter');
      if (how === 'tap') await enter.tap();
      else if (how === 'click') await enter.click();
      else {
        await enter.focus();
        await page.keyboard.press(how === 'Enter key' ? 'Enter' : 'Space');
      }
      await expect(guesses(page)).toHaveCount(1);
    });
  }
});
