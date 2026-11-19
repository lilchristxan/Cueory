import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch {
      // Storage is blocked
    }
  });
});

// The choices are radio buttons, not a native <select>: WebKit reports a CSP violation for every <select> (#862).
test('fill-in choices provide 4 options by default and allow toggling to type instead', async ({ page }) => {
  await page.goto('/learn/study-skills/fill-in');
  const board = page.getByTestId('fill-in');

  // Choosing is the default
  const dropdown = board.getByRole('radiogroup', { name: 'the missing word' });
  await expect(dropdown).toBeVisible();
  await expect(board.locator('select')).toHaveCount(0);

  // 4 options, none chosen yet
  const options = dropdown.getByRole('radio');
  await expect(options).toHaveCount(4);
  await expect(dropdown.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(board.getByRole('button', { name: 'check' })).toBeDisabled();
  for (const option of await options.all()) {
    // 24 px radios (axe target-size) inside a 44 px row that is itself the tap target.
    expect((await option.boundingBox())?.height).toBeGreaterThanOrEqual(24);
    expect((await option.locator('xpath=..').boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }

  // Toggle to type instead
  const toggle = board.getByRole('button', { name: 'type instead' });
  await expect(toggle).toBeVisible();
  await toggle.click();

  // Textbox is now visible
  const input = board.getByRole('textbox', { name: 'the missing word' });
  await expect(input).toBeVisible();
  await expect(board.getByRole('button', { name: 'choose from options' })).toBeVisible();

  // An answer typed outside the available options must not be submitted
  // invisibly when the student switches back to the choices.
  await input.fill('not a dropdown option');
  await board.getByRole('button', { name: 'choose from options' }).click();
  await expect(dropdown).toBeVisible();
  await expect(dropdown.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(board.getByRole('button', { name: 'check' })).toBeDisabled();

  // Choose the correct answer by tapping its row (the label)
  await dropdown.getByText('honey', { exact: true }).click();
  await expect(dropdown.getByRole('radio', { name: 'honey' })).toBeChecked();
  await board.getByRole('button', { name: 'check' }).click();

  // Spoken feedback and next button appear
  await expect(board.getByText('right.', { exact: true })).toBeVisible();
  const next = board.getByRole('button', { name: 'next' });
  await expect(next).toBeVisible();

  // Accessibility check on dropdown mode
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // Advance to next item
  await next.click();
  await expect(board.getByText('round 1 · item 2 of 4')).toBeVisible();
});

test('a resumed free-text typo cannot be checked as a hidden dropdown answer', async ({ page }) => {
  await page.goto('/learn/study-skills/fill-in');
  const board = page.getByTestId('fill-in');
  await board.getByRole('button', { name: 'type instead' }).click();
  const typed = board.getByRole('textbox', { name: 'the missing word' });
  await typed.fill('hnoey');
  await typed.press('Enter');
  await expect(board.getByText('almost. check the spelling.')).toBeVisible();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cueory-resume') ?? 'null'));
  expect(saved.answers['item-0']).toEqual(['n:hnoey']);

  await page.reload();
  await page.getByRole('button', { name: 'continue question 1' }).click();
  const dropdown = board.getByRole('radiogroup', { name: 'the missing word' });
  await expect(dropdown).toBeVisible();

  // The restored typo is not any visible option. It must not be submitted.
  const check = board.getByRole('button', { name: 'check' });
  await expect(check).toBeDisabled();
  await expect(dropdown.getByRole('radio', { checked: true })).toHaveCount(0);
  await dropdown.getByRole('radio', { name: 'honey' }).check();
  await expect(check).toBeEnabled();
  await check.click();
  await expect(board.getByText('right.', { exact: true })).toBeVisible();
});


test.describe('S6 keyboard and touch coverage', () => {
  test.use({ hasTouch: true });

for (const [size, width, height] of [['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test('S6 dropdown keyboard and tap at ' + size + ' in ' + scheme, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/learn/study-skills/fill-in');
      const board = page.getByTestId('fill-in');
      const dropdown = board.getByRole('radiogroup', { name: 'the missing word' });
      await expect(dropdown).toBeVisible();
      const radios = dropdown.getByRole('radio');
      const choices = await radios.evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value));
      expect(choices).toHaveLength(4);
      // Keyboard only: Tab from the mode switch reaches the first choice; Space picks it, or, when it is the right
      // answer, ArrowDown moves to and picks the next one.
      await board.getByRole('button', { name: 'type instead' }).focus();
      await page.keyboard.press('Tab');
      await expect(radios.first()).toBeFocused();
      const wrongIndex = choices[0] === 'honey' ? 1 : 0;
      await page.keyboard.press(wrongIndex === 0 ? 'Space' : 'ArrowDown');
      await expect(radios.nth(wrongIndex)).toBeFocused();
      await expect(radios.nth(wrongIndex)).toBeChecked();
      await expect(dropdown.getByRole('radio', { checked: true })).toHaveCount(1);
      // Enter on the chosen answer checks it, like Enter in the typed field.
      await page.keyboard.press('Enter');
      await expect(board.getByText('the word was honey.')).toBeVisible();
      // After "check" the choices are disabled, but the chosen one stays plain to see in both palettes: its dot is
      // full ink (not the browser's grey disabled radio) and its row has an ink edge; the others keep the surface.
      await expect(radios.nth(wrongIndex)).toBeDisabled();
      await expect(radios.nth(wrongIndex)).toBeChecked();
      const look = await radios.evaluateAll((nodes) => nodes.map((node) => {
        const input = getComputedStyle(node);
        const row = getComputedStyle(node.parentElement!);
        return { dot: input.backgroundColor, edge: input.borderTopColor, row: row.borderTopColor, ring: row.boxShadow, ink: row.color };
      }));
      const chosen = look[wrongIndex]!;
      expect(chosen.dot).toBe(chosen.ink);
      expect(chosen.edge).toBe(chosen.ink);
      expect(chosen.row).toBe(chosen.ink);
      expect(chosen.ring).not.toBe('none');
      for (const [position, other] of look.entries()) {
        if (position === wrongIndex) continue;
        expect(other.dot).not.toBe(other.ink);
        expect(other.ring).toBe('none');
      }
      const next = board.getByRole('button', { name: 'next' });
      const box = await next.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(axe.violations.map((entry) => entry.id)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await next.tap();
      await expect(board.getByText('round 1 · item 2 of 4')).toBeVisible();
    });
  }
}
});

test('S6 pre-existing n/h saved submissions resume with the same result', async ({ page }) => {
  await page.goto('/learn/study-skills/fill-in');
  await page.evaluate(() => {
    localStorage.setItem('cueory-resume', JSON.stringify({
      version: 1, tool: 'fill-in', page: '/learn/study-skills/fill-in', step: 'advance-0',
      itemIndex: 0, itemId: 'item-0', totalItems: 4,
      answers: { 'item-0': ['n:honey'] }, timer: null, phase: 'working', savedAt: Date.now(),
    }));
  });
  await page.reload();
  const board = page.getByTestId('fill-in');
  await page.getByRole('button', { name: 'continue question 1' }).click();
  await expect(board.getByText('right.', { exact: true })).toBeVisible();
  await board.getByRole('button', { name: 'next' }).click();
  await expect(board.getByText('round 1 · item 2 of 4')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cueory-resume') ?? 'null'));
  expect(saved.answers.format).toBe('v2');
  expect(saved.answers['item-0']).toEqual(['l:honey']);
  await page.reload();
  await page.getByRole('button', { name: 'continue question 2' }).click();
  await expect(board.getByText('round 1 · item 2 of 4')).toBeVisible();
});
