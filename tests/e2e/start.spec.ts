import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

/** A local calendar day `days` from now, YYYY-MM-DD, so the dates here never fall outside setup's window. */
const daysFromNow = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// 400 days ahead: a month up (or a December→January wrap) from here still lands inside today..two years.
const EXAM = daysFromNow(400);

const savedAnswers = (page: Page) => page.evaluate(() =>
  JSON.parse(localStorage.getItem('cueory-progress') ?? 'null')?.onboarding ?? null,
);

async function toExam(page: Page) {
  await page.getByRole('button', { name: 'continue', exact: true }).click();
  await expect(page.getByTestId('setup-step')).toHaveText('question 2 of 2');
}

async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  for (let step = 0; step < 30; step++) {
    if (await target.evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

async function visibleKeyboardFocus(target: Locator) {
  expect(await target.evaluate(element => {
    const style = getComputedStyle(element);
    return element.matches(':focus-visible') && style.outlineStyle !== 'none' &&
      Number.parseFloat(style.outlineWidth) > 0 && style.outlineColor !== 'transparent' &&
      style.outlineColor !== 'rgba(0, 0, 0, 0)';
  })).toBe(true);
}

test('keyboard-only back and forward preserve both unsaved answers, and skip only the date', async ({ page }) => {
  await page.goto('/start');
  await page.getByRole('radio', { name: 'both', exact: true }).check();
  await toExam(page);
  const examHeading = page.getByRole('heading', { name: 'when is your exam?' });
  await expect(examHeading).toBeFocused();
  const date = page.getByLabel('when is your exam?');
  await date.fill(EXAM);

  const back = page.getByRole('button', { name: 'back', exact: true });
  await tabTo(page, back);
  await visibleKeyboardFocus(back);
  await page.keyboard.press('Enter');
  await expect(page.locator('form legend')).toBeFocused();
  await expect(page.getByRole('radio', { name: 'both', exact: true })).toBeChecked();
  expect(await savedAnswers(page)).toBeNull();

  const forward = page.getByRole('button', { name: 'continue', exact: true });
  await tabTo(page, forward);
  await visibleKeyboardFocus(forward);
  await page.keyboard.press('Enter');
  await expect(examHeading).toBeFocused();
  await expect(date).toHaveValue(EXAM);

  const skip = page.getByRole('button', { name: 'skip', exact: true });
  await tabTo(page, skip);
  await visibleKeyboardFocus(skip);
  await page.keyboard.press('Enter');
  await expect(page.getByText('saved on this device.', { exact: true })).toBeVisible();
  expect(await savedAnswers(page)).toEqual({ course: 'both', examDate: null, done: true });
});

for (const size of [
  { label: 'phone', width: 390, height: 844 },
  { label: 'tablet', width: 820, height: 1180 },
  { label: 'desktop', width: 1440, height: 900 },
] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`onboarding keyboard skips and passes axe at ${size.label} in ${colorScheme}`, async ({ page }) => {
      test.slow();
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/start');
      await expect(page.getByTestId('setup-step')).toHaveText('question 1 of 2');
      const scan = async () => {
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(result.violations.map(violation => violation.id + ': ' + violation.help)).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      };
      await scan();
      const skip = page.getByRole('button', { name: 'skip', exact: true });
      await tabTo(page, skip);
      await visibleKeyboardFocus(skip);
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('setup-step')).toHaveText('question 2 of 2');
      await expect(page.getByRole('heading', { name: 'when is your exam?' })).toBeFocused();

      const back = page.getByRole('button', { name: 'back', exact: true });
      await tabTo(page, back);
      await page.keyboard.press('Enter');
      await expect(page.locator('form legend')).toBeFocused();
      await expect(page.getByRole('radio', { name: 'not sure yet' })).toBeChecked();

      await tabTo(page, page.getByRole('button', { name: 'continue', exact: true }));
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'when is your exam?' })).toBeFocused();
      await tabTo(page, page.getByRole('button', { name: 'skip', exact: true }));
      await page.keyboard.press('Enter');
      await expect(page.getByText('saved on this device.', { exact: true })).toBeVisible();
      expect(await savedAnswers(page)).toEqual({ course: null, examDate: null, done: true });
      await scan();
    });
  }
}

test('two optional questions appear on separate screens, with no new stored fields', async ({ page }) => {
  await page.goto('/start');
  await expect(page.getByRole('heading', { name: 'get started', exact: true })).toBeVisible();
  await expect(page.getByTestId('setup-step')).toHaveText('question 1 of 2');
  await expect(page.locator('form [aria-hidden="true"] > span')).toHaveCount(2);
  await expect(page.getByRole('radio', { name: 'not sure yet' })).toBeChecked();
  await expect(page.getByLabel('when is your exam?')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'save my answers' })).toHaveCount(0);
  expect(await savedAnswers(page)).toBeNull();

  await page.getByRole('radio', { name: 'both', exact: true }).check();
  await toExam(page);
  await expect(page.getByRole('radio', { name: 'both', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('when is your exam?')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'save my answers' })).toBeVisible();
  await page.getByLabel('when is your exam?').fill(EXAM);
  await page.getByRole('button', { name: 'save my answers' }).click();

  await expect(page.locator(':focus')).toContainText('saved on this device.');
  expect(await savedAnswers(page)).toEqual({ course: 'both', examDate: EXAM, done: true });

  await page.reload();
  await expect(page.getByTestId('setup-step')).toHaveText('question 1 of 2');
  await expect(page.getByRole('radio', { name: 'both', exact: true })).toBeChecked();
  await toExam(page);
  await expect(page.getByLabel('when is your exam?')).toHaveValue(EXAM);
});

test('back retains unsaved answers and skip clears only the current question', async ({ page }) => {
  await page.goto('/start');
  await expect(page.getByRole('link', { name: 'back', exact: true })).toHaveAttribute('href', '/');
  await page.getByRole('radio', { name: 'both', exact: true }).check();
  await toExam(page);
  const date = page.getByLabel('when is your exam?');
  await date.fill(EXAM);
  await page.getByRole('button', { name: 'back', exact: true }).click();
  await expect(page.getByTestId('setup-step')).toHaveText('question 1 of 2');
  await expect(page.getByRole('radio', { name: 'both', exact: true })).toBeChecked();
  expect(await savedAnswers(page)).toBeNull();

  // Skip the course, then return to the date that was already entered.
  await page.getByRole('button', { name: 'skip', exact: true }).click();
  await expect(page.getByTestId('setup-step')).toHaveText('question 2 of 2');
  await expect(date).toHaveValue(EXAM);
  await page.getByRole('button', { name: 'save my answers' }).click();
  expect(await savedAnswers(page)).toEqual({ course: null, examDate: EXAM, done: true });

  await page.reload();
  await page.getByRole('radio', { name: 'fundamentals', exact: true }).check();
  await toExam(page);
  await page.getByRole('button', { name: 'skip', exact: true }).click();
  await expect(page.getByText('saved on this device.', { exact: true })).toBeVisible();
  expect(await savedAnswers(page)).toEqual({ course: 'fundamentals', examDate: null, done: true });
});

test('skip for now ends setup immediately without saving unsaved edits', async ({ page }) => {
  await page.goto('/start');
  await page.getByRole('radio', { name: 'fundamentals' }).check();
  await page.getByRole('button', { name: 'skip for now' }).click();
  await expect(page.locator(':focus')).toContainText('all set.');
  expect(await savedAnswers(page)).toEqual({ course: null, examDate: null, done: true });

  await page.goto('/start');
  await page.getByRole('radio', { name: 'med-surg i' }).check();
  await toExam(page);
  await page.getByLabel('when is your exam?').fill(EXAM);
  await page.getByRole('button', { name: 'skip for now' }).click();
  expect(await savedAnswers(page)).toEqual({ course: null, examDate: null, done: true });
});

test.describe('hardware keyboard', () => {
  // Native date controls behave differently on touch. Test editable keyboard
  // focus in non-touch mode at every configured width.
  test.use({ isMobile: false, hasTouch: false });

  test('both questions can be changed and saved with keyboard and visible focus', async ({ page }) => {
    await page.addInitScript((examDate) => localStorage.setItem('cueory-progress', JSON.stringify({
      version: 1, onboarding: { course: 'fundamentals', examDate, done: true }, decks: {},
    })), EXAM);
    await page.goto('/start');
    const firstCourse = page.getByRole('radio', { name: 'fundamentals', exact: true });
    await tabTo(page, firstCourse);
    await visibleKeyboardFocus(firstCourse);
    await page.keyboard.press('ArrowDown');
    const nextCourse = page.getByRole('radio', { name: 'med-surg i', exact: true });
    await expect(nextCourse).toBeChecked();
    await expect(nextCourse).toBeFocused();
    await visibleKeyboardFocus(nextCourse);

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('setup-step')).toHaveText('question 2 of 2');
    const date = page.getByLabel('when is your exam?');
    await tabTo(page, date);
    await visibleKeyboardFocus(date);
    await page.keyboard.press('ArrowUp');
    const changedDate = await date.inputValue();
    expect(changedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(changedDate).not.toBe(EXAM);

    const save = page.getByRole('button', { name: 'save my answers' });
    await tabTo(page, save);
    await visibleKeyboardFocus(save);
    await page.keyboard.press('Enter');
    await expect(page.locator(':focus')).toContainText('saved on this device.');
    expect(await savedAnswers(page)).toEqual({ course: 'med-surg-1', examDate: changedDate, done: true });
  });
});

test('clearing both answers is saved and survives a reload', async ({ page }) => {
  await page.goto('/start');
  await page.getByRole('radio', { name: 'fundamentals', exact: true }).check();
  await toExam(page);
  const date = page.getByLabel('when is your exam?');
  await date.fill(EXAM);
  await page.getByRole('button', { name: 'save my answers' }).click();
  await expect(page.getByText('saved on this device.', { exact: true })).toBeVisible();
  await page.reload();

  await page.getByRole('radio', { name: 'not sure yet' }).check();
  await toExam(page);
  const clear = page.getByRole('button', { name: 'clear the date' });
  await clear.click();
  await expect(date).toHaveValue('');
  await expect(date).toBeFocused();
  await expect(clear).toHaveCount(0);
  await page.getByRole('button', { name: 'save my answers' }).click();
  await expect(page.getByText('saved on this device.', { exact: true })).toBeVisible();
  expect(await savedAnswers(page)).toEqual({ course: null, examDate: null, done: true });

  await page.reload();
  await expect(page.getByRole('radio', { name: 'not sure yet' })).toBeChecked();
  await toExam(page);
  await expect(date).toHaveValue('');
});

test('each question and saved confirmation pass accessibility and fit a narrow screen', async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/start');
  const check = async () => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations.map(violation => violation.id + ': ' + violation.help)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  };

  await expect(page.getByTestId('setup-step')).toHaveText('question 1 of 2');
  await check();
  await toExam(page);
  await check();
  await page.getByRole('button', { name: 'save my answers' }).click();
  await expect(page.locator(':focus')).toContainText('saved on this device.');
  await check();
});

test.describe('exam date checks (lane 2)', () => {
  for (const [name, date, message] of [
    ['a date that has passed', daysFromNow(-1), 'that date has already passed. pick today or a later date, or leave it blank.'],
    ['a date more than two years away', daysFromNow(731), 'that’s more than two years away. pick a date in the next two years, or leave it blank.'],
  ] as const) {
    test(`${name} is refused with a clear message, kept on the field, and never saved`, async ({ page }) => {
      await page.goto('/start');
      await page.getByRole('radio', { name: 'fundamentals', exact: true }).check();
      await toExam(page);
      const field = page.getByLabel('when is your exam?');
      await field.fill(date);
      await page.getByRole('button', { name: 'save my answers' }).click();
      await expect(page.getByRole('alert')).toHaveText(message);
      await expect(field).toBeFocused();
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(await savedAnswers(page)).toBeNull();
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);

      // Fixing it clears the message and saves.
      await field.fill(daysFromNow(30));
      await expect(page.getByRole('alert')).toHaveCount(0);
      await page.getByRole('button', { name: 'save my answers' }).click();
      await expect(page.locator(':focus')).toContainText('saved on this device.');
      expect(await savedAnswers(page)).toEqual({ course: 'fundamentals', examDate: daysFromNow(30), done: true });
    });
  }

  test('a blank date is still fine: the question is optional', async ({ page }) => {
    await page.goto('/start');
    await toExam(page);
    await page.getByRole('button', { name: 'save my answers' }).click();
    await expect(page.locator(':focus')).toContainText('saved on this device.');
    expect(await savedAnswers(page)).toEqual({ course: null, examDate: null, done: true });
  });
});
