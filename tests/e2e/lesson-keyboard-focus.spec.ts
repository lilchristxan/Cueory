import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Keyboard-only walk through every study mode on a lesson page (cards, learn mode, fill-in, questions, matching,
 * organizer, label it). Tab to each control inside the study area, press it, and check that keyboard focus is never
 * dropped onto the page body: after any press it must sit on a real element inside the study area, so a keyboard user
 * never has to start again from the top of the page.
 */

const modes = ['cards', 'learn-mode', 'fill-in', 'questions', 'matching', 'organizer', 'label-it'] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* blocked storage */ }
  });
});

/** Where focus is: 'body' when nothing has it, 'outside' when it is in the header or footer, else 'study'. */
const where = (page: Page) => page.evaluate(() => {
  const active = document.activeElement;
  if (!active || active === document.body || active === document.documentElement) return 'body';
  return active.closest('main') ? 'study' : 'outside';
});

type Checkpoint = {
  trigger: Locator;
  verify: () => Promise<void>;
};

/** Check one concrete board interaction when the existing Tab walk reaches it. */
function checkpointFor(page: Page, mode: (typeof modes)[number]): Checkpoint {
  const islandFor = (anchor: Locator) => page.locator('main astro-island').filter({ has: anchor });

  switch (mode) {
    case 'cards': {
      const card = page.locator('main').getByTestId('flashcard');
      return { trigger: card, verify: async () => {
        await expect(card).toHaveAccessibleName('Answer');
        await expect(card).toBeFocused();
      } };
    }
    case 'learn-mode': {
      const board = islandFor(page.getByTestId('learn-card'));
      const card = board.getByTestId('learn-card');
      const trigger = board.getByRole('button', { name: 'Show answer', exact: true });
      return { trigger, verify: async () => {
        await expect(card).toContainText('Placeholder card 1, back.');
        await expect(card).toBeFocused();
      } };
    }
    case 'fill-in': {
      const board = page.getByTestId('fill-in');
      const trigger = board.getByRole('button', { name: 'type instead', exact: true });
      return { trigger, verify: async () => {
        await expect(board.getByRole('button', { name: 'choose from options', exact: true })).toBeVisible();
        await expect(board.getByRole('textbox', { name: 'the missing word', exact: true })).toBeFocused();
      } };
    }
    case 'questions': {
      const board = page.getByTestId('sample-questions-ready');
      const trigger = board.getByRole('radio', { name: 'an apple', exact: true });
      return { trigger, verify: async () => {
        await expect(trigger).toBeChecked();
        await expect(trigger).toBeFocused();
      } };
    }
    case 'matching': {
      const board = islandFor(page.getByRole('progressbar', { name: 'matching progress', exact: true }));
      // The sample terms are shuffled, so use the first button in the Terms region's actual Tab order.
      const trigger = board.getByRole('region', { name: 'Terms', exact: true }).getByRole('button').first();
      return { trigger, verify: async () => {
        await expect(trigger).toHaveAttribute('aria-pressed', 'true');
        await expect(trigger).toBeFocused();
      } };
    }
    case 'organizer': {
      const board = page.getByTestId('organizer');
      // The tray also starts in a shuffled order.
      const trigger = board.getByRole('list', { name: 'tray', exact: true }).getByRole('button').first();
      return { trigger, verify: async () => {
        await expect(trigger).toHaveAttribute('aria-pressed', 'true');
        await expect(board.getByRole('button', { name: '1. fruit', exact: true })).toBeFocused();
      } };
    }
    case 'label-it': {
      const trigger = page.getByTestId('labelit').getByTestId('cover-1');
      return { trigger, verify: async () => {
        await expect(trigger).toHaveAccessibleName('label 1: roof');
        await expect(trigger).toBeFocused();
      } };
    }
  }
}

for (const mode of modes) {
  test(`${mode}: pressing every control by keyboard never drops focus onto the page body`, async ({ page }) => {
    await page.goto(`/learn/study-skills/${mode}`);
    // The study board is a client-only island. Wait until every island has mounted (Astro then drops `ssr`), so the walk
    // presses the board's controls instead of finishing before they exist.
    await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
    const checkpoint = checkpointFor(page, mode);
    await expect(checkpoint.trigger).toBeVisible();
    let checkedInteraction = false;
    // Start from the top of the page and Tab into the study area.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    let pressed = 0;
    let pressedOnBoard = 0;
    for (let step = 0; step < 80 && pressed < 30; step++) {
      // An empty text field with focus (reached by Tab, or because a press moved focus there) gets a word typed, so the
      // next Tab reaches the check button the word turns on.
      const emptyField = await page.evaluate(() => {
        const a = document.activeElement;
        return a instanceof HTMLInputElement && a.type === 'text' && a.value === '' && !a.readOnly && !!a.closest('main');
      });
      if (emptyField) await page.keyboard.type('word');
      await page.keyboard.press('Tab');
      const place = await where(page);
      if (place !== 'study') {
        expect(place, `Tab ${step} left focus on the body in ${mode}`).not.toBe('body');
        if (pressed > 0) break; // walked past the study area
        continue;
      }
      const control = await page.evaluate(() => {
        const a = document.activeElement as HTMLInputElement;
        return { tag: a.tagName, type: a.type ?? '', onBoard: !!a.closest('astro-island') };
      });
      if (control.tag === 'A') continue; // links leave the page; they are not a study control
      if (control.tag === 'INPUT' && control.type === 'text') continue; // typed into at the start of the next step
      const atCheckpoint = !checkedInteraction && (await checkpoint.trigger.and(page.locator(':focus')).count()) === 1;
      // Radios and boxes toggle with Space; buttons and the card turn with Enter.
      await page.keyboard.press(control.tag === 'INPUT' ? 'Space' : 'Enter');
      if (atCheckpoint) {
        await checkpoint.verify();
        checkedInteraction = true;
      }
      pressed++;
      if (control.onBoard) pressedOnBoard++;
      // Let any focus hand-off (an effect after the render) settle, then focus must be on a real element.
      await expect.poll(() => where(page), { message: `focus fell to the body after pressing a control in ${mode}` }).not.toBe('body');
    }
    expect(pressedOnBoard, `no control on the ${mode} board was pressed`).toBeGreaterThan(0);
    expect(checkedInteraction, `Tab did not reach and activate the ${mode} board checkpoint`).toBe(true);
  });
}
