import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { SIGNUP_POPUP_STORAGE_KEY } from '../../src/scripts/signuppopup';

// The message-glove note: 30 minutes into a visit, then every 30 minutes, on every page except games (src/islands/
// stickynote.ts has the rules; src/components/GloveNote.astro shows it). Playwright's clock jumps the 30 minutes.
const MINUTE = 60 * 1000;
const START = Date.parse('2026-11-24T12:00:00Z');
const note = (page: Page) => page.getByTestId('glove-note');

/** Fake time from START; the launch-list pop-up and promo panel count as already seen so they never get in the way. */
async function openAt(page: Page, path: string) {
  await page.clock.install({ time: new Date(START) });
  await page.addInitScript((key) => {
    try {
      if (sessionStorage.getItem('test-seeded')) return;
      sessionStorage.setItem('test-seeded', '1');
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem(key, String(Date.now()));
    } catch {
      // The page also works without storage.
    }
  }, SIGNUP_POPUP_STORAGE_KEY);
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
}

/** Moves the page clock on, then lets its once-a-second check run a few times (loading the list, then showing). */
async function jump(page: Page, minutes: number) {
  await page.clock.fastForward(minutes * MINUTE);
  for (let step = 0; step < 6; step += 1) {
    await page.clock.runFor(1_000);
    if (await note(page).count()) break;
    await page.waitForTimeout(300);
  }
}

const glovePhoto = (page: Page) => note(page).locator('img');

test('appears on the home page after 30 minutes, not before', async ({ page }) => {
  await openAt(page, '/');
  await jump(page, 29);
  await expect(note(page)).toHaveCount(0);
  await jump(page, 1.2);
  await expect(note(page)).toBeVisible();
});

test('appears on a lesson page too', async ({ page }) => {
  await openAt(page, '/learn/study-skills');
  await jump(page, 31);
  await expect(note(page)).toBeVisible();
});

test('never appears on a game page', async ({ page }) => {
  await openAt(page, '/play/vialo');
  await jump(page, 31);
  await page.waitForTimeout(1_500);
  await expect(note(page)).toHaveCount(0);
  await expect(page.getByTestId('glove-note-region')).toHaveCount(0);
});

test('never appears on /privacy or /start', async ({ page }) => {
  for (const path of ['/privacy', '/start']) {
    await openAt(page, path);
    await jump(page, 31);
    await page.waitForTimeout(1_000);
    await expect(note(page), path).toHaveCount(0);
  }
});

test('is one link to the break ideas page named by the message plus "break idea", with the message as alt text', async ({ page }) => {
  await openAt(page, '/');
  await jump(page, 31);
  const photo = glovePhoto(page);
  await expect(photo).toBeVisible();
  const message = await photo.getAttribute('alt');
  expect(message).toBeTruthy();
  expect(message).not.toMatch(/break idea/i);
  const link = note(page).getByRole('link');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute('href', '/breaks');
  await expect(link).toHaveAccessibleName(`${message} break idea`);
  await expect(photo).toHaveAttribute('loading', 'lazy');
  expect(Number(await photo.getAttribute('width'))).toBeGreaterThan(0);
  expect(Number(await photo.getAttribute('height'))).toBeGreaterThan(0);
  await link.click();
  await expect(page).toHaveURL(/\/breaks$/);
});

test('is announced politely, does not take focus, and loads only the one photo', async ({ page }) => {
  const photoRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/gloves\/messages\/msg-\d+\.webp/.test(request.url())) photoRequests.push(request.url());
  });
  await openAt(page, '/');
  expect(photoRequests).toHaveLength(0);
  await jump(page, 31);
  await expect(note(page)).toBeVisible();
  await expect(page.getByTestId('glove-note-region')).toHaveAttribute('aria-live', 'polite');
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  expect(new Set(photoRequests).size).toBe(1);
});

test('closes with its button and with Escape', async ({ page }) => {
  await openAt(page, '/');
  await jump(page, 31);
  await expect(note(page)).toBeVisible();
  await note(page).getByRole('button', { name: 'close glove note' }).click();
  await expect(note(page)).toHaveCount(0);
  await jump(page, 30.2);
  await expect(note(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(note(page)).toHaveCount(0);
});

test('a second note comes 30 minutes after the first, with a different glove', async ({ page }) => {
  await openAt(page, '/');
  await jump(page, 31);
  await expect(note(page)).toBeVisible();
  const first = await glovePhoto(page).getAttribute('src');
  await note(page).getByRole('button', { name: 'close glove note' }).click();
  await jump(page, 29);
  await expect(note(page)).toHaveCount(0);
  await jump(page, 1.5);
  await expect(note(page)).toBeVisible();
  expect(await glovePhoto(page).getAttribute('src')).not.toBe(first);
});

test('counts across page loads in the same tab', async ({ page }) => {
  await openAt(page, '/');
  await jump(page, 20);
  await page.goto('/about');
  await jump(page, 5);
  await expect(note(page)).toHaveCount(0);
  await jump(page, 6);
  await expect(note(page)).toBeVisible();
});

test('waits while a dialog is open, then appears', async ({ page }) => {
  await openAt(page, '/');
  await page.getByRole('button', { name: /menu/i }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await jump(page, 31);
  await page.waitForTimeout(1_500);
  await expect(note(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'close site menu' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await jump(page, 0.2);
  await expect(note(page)).toBeVisible();
});

test('no rise animation with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAt(page, '/');
  await jump(page, 31);
  await expect(note(page)).toBeVisible();
  expect(await note(page).evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
});

test('has 44 px targets, a visible focus ring, never scrolls sideways and stays clear of the header', async ({ page }) => {
  await openAt(page, '/');
  await jump(page, 31);
  await expect(note(page)).toBeVisible();
  const close = note(page).getByRole('button', { name: 'close glove note' });
  const closeBox = (await close.boundingBox())!;
  expect(closeBox.width).toBeGreaterThanOrEqual(44);
  expect(closeBox.height).toBeGreaterThanOrEqual(44);
  const linkBox = (await note(page).getByRole('link').boundingBox())!;
  expect(linkBox.width).toBeGreaterThanOrEqual(44);
  expect(linkBox.height).toBeGreaterThanOrEqual(44);
  const view = page.viewportSize()!;
  expect(linkBox.x).toBeGreaterThanOrEqual(0);
  expect(linkBox.x + linkBox.width).toBeLessThanOrEqual(view.width);
  expect(linkBox.y + linkBox.height).toBeLessThanOrEqual(view.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const control of await page.locator('header button, header a').all()) {
    const box = await control.boundingBox();
    if (!box) continue;
    const apart = box.y + box.height <= linkBox.y || box.y >= linkBox.y + linkBox.height || box.x + box.width <= linkBox.x || box.x >= linkBox.x + linkBox.width;
    expect(apart, 'the note covers a header control').toBe(true);
  }
  // After a key press, focusing a control shows the keyboard focus ring.
  await page.keyboard.press('Shift');
  await note(page).getByRole('link').focus();
  const outline = await note(page).getByRole('link').evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe('none');
});

test('has no accessibility violations while open', async ({ page }) => {
  await openAt(page, '/');
  await jump(page, 31);
  await expect(note(page)).toBeVisible();
  // Scans the open note; the rest of the page (including the building strip) has its own sweep in a11y-sweep.spec.ts.
  const results = await new AxeBuilder({ page }).include('[data-testid="glove-note"]').analyze();
  expect(results.violations).toEqual([]);
});
