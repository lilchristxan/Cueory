import { expect, test, type Page } from '@playwright/test';

/**
 * Keyboard-only walk through every study mode on a lesson page (cards, learn mode, fill-in, questions, matching,
 * organizer, label it). Tab to each control inside the study area, press it, and check that keyboard focus is never
 * dropped onto the page body: after any press it must sit on a real element inside the study area, so a keyboard user
 * never has to start again from the top of the page.
 */

const modes = ['cards', 'learn-mode', 'fill-in', 'questions', 'matching', 'organizer', 'label-it'];

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

for (const mode of modes) {
  test(`${mode}: pressing every control by keyboard never drops focus onto the page body`, async ({ page }) => {
    await page.goto(`/learn/study-skills/${mode}`);
    // The study board is a client-only island. Wait until every island has mounted (Astro then drops `ssr`), so the walk
    // presses the board's controls instead of finishing before they exist.
    await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
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
      // Radios and boxes toggle with Space; buttons and the card turn with Enter.
      await page.keyboard.press(control.tag === 'INPUT' ? 'Space' : 'Enter');
      pressed++;
      if (control.onBoard) pressedOnBoard++;
      // Let any focus hand-off (an effect after the render) settle, then focus must be on a real element.
      await expect.poll(() => where(page), { message: `focus fell to the body after pressing a control in ${mode}` }).not.toBe('body');
    }
    expect(pressedOnBoard, `no control on the ${mode} board was pressed`).toBeGreaterThan(0);
  });
}
