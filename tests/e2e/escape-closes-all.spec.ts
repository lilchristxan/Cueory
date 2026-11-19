import { expect, test, type Locator, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';
import { sizeOf } from './projects';

/*
  Every dialog and pop-up closes with Escape and gives focus back to the control that opened it (WCAG 2.1.1, 2.4.3).
  One sweep over all of them, so a new one cannot ship without the behavior. Each surface also has its own detailed
  spec; this one only checks the common promise: open it from the keyboard, press Escape, it is gone, and focus is
  back on the trigger.
*/

test.beforeEach(async ({ page }, info) => {
  if (info.title === 'the launch-updates pop-up') return;
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
});

async function openByKeyboard(page: Page, trigger: Locator) {
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
}

async function escapeBack(page: Page, trigger: Locator, surface: Locator) {
  await expect(surface).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(surface).toBeHidden();
  await expect(trigger).toBeFocused();
}

test('the ☰ site menu', async ({ page }) => {
  await page.goto('/');
  const trigger = page.locator('[data-menu-open]:visible').first();
  await openByKeyboard(page, trigger);
  await escapeBack(page, trigger, page.getByTestId('site-menu'));
});

test('the account menu', async ({ page }) => {
  await page.goto('/');
  const trigger = page.locator('[data-account-toggle]');
  await openByKeyboard(page, trigger);
  await escapeBack(page, trigger, page.getByTestId('account-menu'));
});

test('the "about" dropdown in the desktop navigation', async ({ page }, info) => {
  test.skip(sizeOf(info) !== 'desktop', 'the navigation bar shows from the desktop width up');
  await page.goto('/');
  const menu = page.locator('[data-about-menu]');
  const trigger = menu.locator('summary');
  await openByKeyboard(page, trigger);
  await expect(menu).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(trigger).toBeFocused();
});

test('the study-mode preview on the home page', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const carousel = page.locator('#ways-to-study');
  await expect(carousel).toHaveAttribute('data-ring', '');
  const track = carousel.locator('[data-modes-track]');
  await track.focus();
  await expect(track).toBeFocused();

  // Take over from autoplay and choose a non-first card to catch focus returning to the wrong opener.
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  const activeCard = carousel.locator('#mode-cards');
  await expect(activeCard).toHaveAttribute('data-active', '');
  const opener = activeCard.getByRole('button', { name: 'preview cards', exact: true });
  await openByKeyboard(page, opener);

  const dialog = page.locator('#mode-preview');
  await expect(dialog).toHaveAccessibleName('cards');
  await escapeBack(page, opener, dialog);
});

test('an info tip', async ({ page }) => {
  await page.goto('/learn/study-skills/fill-in');
  const trigger = page.getByRole('button', { name: 'more about fill-in' });
  await openByKeyboard(page, trigger);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

for (const game of [
  { name: 'pillo', path: '/play/pillo' },
  { name: 'sudoku', path: '/play/sudoku' },
  { name: 'word path', path: '/play/word-path' },
]) {
  test(`${game.name}: the rules and the settings dialogs`, async ({ page }) => {
    await page.goto(game.path);
    for (const [label, dialogId] of [
      [`how to play ${game.name}`, 'game-help'],
      [`${game.name} settings`, 'game-settings'],
    ] as const) {
      const trigger = page.getByRole('button', { name: label });
      await openByKeyboard(page, trigger);
      await escapeBack(page, trigger, page.getByTestId(dialogId).last());
    }
  });
}

test('the launch-updates pop-up', async ({ page }) => {
  // The pop-up comes 10 seconds into a visit by the page's clock; start fresh, with the clock under the test's control.
  // Paused, so only the test moves the page's clock. The promo panel counts as shown so it does not come first.
  const start = new Date('2026-11-01T15:00:00').getTime();
  await page.clock.install({ time: start });
  await page.clock.pauseAt(start + 1_000);
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* the page works without storage */ }
  });
  await page.goto('/privacy');
  const dialog = page.locator('[data-signup-popup]');
  const before = page.locator('main a, main button, a').first();
  await before.focus();
  await page.clock.runFor(11_500);
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(before).toBeFocused();
});
