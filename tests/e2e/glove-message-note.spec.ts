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

test('waits while a question is open and unanswered, then appears once it is answered', async ({ page }) => {
  await page.route('**/learn/study-skills/questions/study-skills-01.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'sample',
      items: [{
        id: 'sample-one', status: 'sample', type: 'single', stem: '[sample question 1]',
        choices: [{ id: 'a', text: '[sample choice A]' }, { id: 'b', text: '[sample choice B]' }],
        key: ['a'], rationales: { a: '[sample rationale A]', b: '[sample rationale B]' },
      }],
    }),
  }));
  await openAt(page, '/learn/study-skills/questions');
  await expect(page.getByTestId('sample-questions-ready')).toBeVisible();
  await expect(page.locator('[data-note-busy]')).toHaveCount(1);
  // Radio buttons are not text entry, so only the unanswered-question mark keeps the note away.
  await jump(page, 31);
  await page.waitForTimeout(4_000);
  await page.clock.runFor(5_000);
  await expect(note(page)).toHaveCount(0);
  await page.getByLabel('[sample choice A]').check();
  await page.getByRole('button', { name: 'check' }).click();
  await expect(page.getByText('next question')).toBeVisible();
  await expect(page.locator('[data-note-busy]')).toHaveCount(0);
  await jump(page, 0.2);
  await page.clock.runFor(5_000);
  await expect(note(page)).toBeVisible();
});

test('a slow photo starts only one selection and requests one glove image', async ({ page }) => {
  const photoRequests: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/gloves\/messages\/msg-\d+\.webp/, async (route) => {
    photoRequests.push(route.request().url());
    await gate;
    await route.continue();
  });
  await openAt(page, '/');
  await jump(page, 31);
  // Ten more once-a-second checks while the first photo is still loading.
  await page.clock.runFor(10_000);
  await page.waitForTimeout(500);
  expect(new Set(photoRequests).size).toBe(1);
  expect(photoRequests).toHaveLength(1);
  await expect(note(page)).toHaveCount(0);
  release();
  await page.clock.runFor(1_000);
  await expect(note(page)).toBeVisible();
  expect(photoRequests).toHaveLength(1);
  await expect(page.locator('[data-glove-note]')).toHaveCount(1);
});

test('a photo that fails to load is not shown or recorded, and a later try shows a working one', async ({ page }) => {
  let calls = 0;
  await page.route(/\/gloves\/messages\/msg-\d+\.webp/, async (route) => {
    calls += 1;
    if (calls === 1) await route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing' });
    else await route.continue();
  });
  await openAt(page, '/');
  await jump(page, 31);
  // Keep the once-a-second check running until the list has loaded and the first photo has been asked for.
  for (let step = 0; step < 20 && calls === 0; step += 1) {
    await page.clock.runFor(1_000);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(800);
  expect(calls).toBe(1);
  await expect(note(page)).toHaveCount(0);
  // Nothing was recorded, and the retry waits about a minute rather than hammering the server.
  await page.clock.runFor(20_000);
  await page.waitForTimeout(300);
  expect(calls).toBe(1);
  await jump(page, 1);
  await expect(note(page)).toBeVisible();
  expect(calls).toBe(2);
  await expect(page.locator('[data-glove-note]')).toHaveCount(1);
});

test('a visitor who starts scrolling or moving while the photo loads gets the note only after a new pause', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/gloves\/messages\/msg-\d+\.webp/, async (route) => {
    await gate;
    await route.continue();
  });
  await openAt(page, '/');
  await jump(page, 31);
  await page.mouse.move(200, 200);
  await page.mouse.move(260, 240);
  release();
  await page.waitForTimeout(800);
  await expect(note(page)).toHaveCount(0);
  await page.clock.runFor(4_000);
  await expect(note(page)).toBeVisible();
});

// The dim behind the note (Christian, 25 Nov 2026): the page dims while a note shows, and goes with it.
const dim = (page: Page) => page.getByTestId('glove-note-dim');

test('the page dims while the note shows and covers the whole window, header included', async ({ page }) => {
  await openAt(page, '/');
  await expect(dim(page)).toHaveCount(0);
  await jump(page, 31);
  await expect(note(page)).toBeVisible();
  await expect(dim(page)).toHaveCount(1);
  const view = page.viewportSize()!;
  const box = (await dim(page).boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.y).toBe(0);
  expect(box.width).toBe(view.width);
  expect(box.height).toBe(view.height);
  await expect(dim(page)).toHaveAttribute('aria-hidden', 'true');
  const background = await dim(page).evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).not.toBe('rgba(0, 0, 0, 0)');
  expect(background).not.toBe('transparent');
  // The note and its close button stay above the dim, fully bright, and the dim is not announced or focusable.
  // (The rise animation takes a moment, so wait for it to finish before reading the opacity.)
  await expect.poll(() => note(page).evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
  const closeButton = note(page).getByRole('button', { name: 'close glove note' });
  const closeBox = (await closeButton.boundingBox())!;
  expect(closeBox.width).toBeGreaterThanOrEqual(44);
  expect(closeBox.height).toBeGreaterThanOrEqual(44);
  const topAtClose = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid') ?? document.elementFromPoint(x, y)?.tagName, {
    x: closeBox.x + closeBox.width / 2,
    y: closeBox.y + closeBox.height / 2,
  });
  expect(topAtClose).toBe('glove-note');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

test('the close button removes the note and the dim', async ({ page }) => {
  await openAt(page, '/');
  await jump(page, 31);
  await expect(dim(page)).toHaveCount(1);
  await note(page).getByRole('button', { name: 'close glove note' }).click();
  await expect(note(page)).toHaveCount(0);
  await expect(dim(page)).toHaveCount(0);
});

test('Escape removes the note and the dim', async ({ page }) => {
  await openAt(page, '/');
  await jump(page, 31);
  await expect(dim(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(note(page)).toHaveCount(0);
  await expect(dim(page)).toHaveCount(0);
});

test('keyboard users can still reach the page behind the dim', async ({ page }) => {
  await openAt(page, '/');
  await jump(page, 31);
  await expect(dim(page)).toHaveCount(1);
  const menuButton = page.getByRole('button', { name: /menu/i }).first();
  // Tab until the header's menu button has focus: a named control of the page, not the glove, so focus is not trapped.
  for (let step = 0; step < 15; step += 1) {
    await page.keyboard.press('Tab');
    if (await menuButton.evaluate((element) => element === document.activeElement)) break;
  }
  await expect(menuButton).toBeFocused();
  await expect(note(page)).toBeVisible();
  await expect(dim(page)).toHaveCount(1);
  // Shift+Tab goes back to the control before it, and Tab returns to the menu button.
  await page.keyboard.press('Shift+Tab');
  await expect(menuButton).not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement !== document.body && !document.activeElement?.closest('[data-testid="glove-note"]'))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(menuButton).toBeFocused();
  await expect(note(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dim(page)).toHaveCount(0);
});

test('clicking the dimmed page removes the note and the dim, and does not follow a link underneath', async ({ page }) => {
  await openAt(page, '/');
  await jump(page, 31);
  await expect(dim(page)).toHaveCount(1);
  // A link in the top-left corner of the page, under the dim; the click must not reach it.
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/about';
    link.dataset.testid = 'under-dim-link';
    link.textContent = 'under the dim';
    link.style.cssText = 'position:fixed;left:0;top:0;width:120px;height:60px;z-index:1;background:white;color:black';
    document.body.append(link);
  });
  await page.mouse.click(40, 30);
  await expect(dim(page)).toHaveCount(0);
  await expect(note(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/\/about/);
  expect(new URL(page.url()).pathname).toBe('/');
});

test('clicking the glove goes to the break ideas page', async ({ page }) => {
  await openAt(page, '/');
  await jump(page, 31);
  await expect(dim(page)).toHaveCount(1);
  await note(page).getByRole('link').click();
  await expect(page).toHaveURL(/\/breaks$/);
  await expect(dim(page)).toHaveCount(0);
});

test('there is no dim without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('glove-note-dim')).toHaveCount(0);
  await expect(page.getByTestId('glove-note')).toHaveCount(0);
  await context.close();
});

test('the dim has no fade with reduced motion, and fades in otherwise', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAt(page, '/');
  await jump(page, 31);
  await expect(dim(page)).toHaveCount(1);
  expect(await dim(page).evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await dim(page).evaluate((element) => getComputedStyle(element).animationName)).not.toBe('none');
});

test('has no accessibility violations with the dim showing', async ({ page }) => {
  await openAt(page, '/');
  await jump(page, 31);
  await expect(dim(page)).toHaveCount(1);
  const results = await new AxeBuilder({ page }).include('[data-testid="glove-note"]').include('[data-testid="glove-note-dim"]').analyze();
  expect(results.violations).toEqual([]);
});

// The glove sits in the middle of the window at every size and orientation (Christian, 25 Nov 2026).
const centredSizes = [
  { name: 'phone portrait', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 },
  { name: 'tablet portrait', width: 820, height: 1180 },
  { name: 'tablet landscape', width: 1180, height: 820 },
  { name: 'desktop', width: 1440, height: 900 },
];

for (const size of centredSizes) {
  test(`the glove is centred, fully inside the window and never scrolls sideways: ${size.name} ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openAt(page, '/');
    await jump(page, 31);
    await expect(note(page)).toBeVisible();
    // Wait for the rise animation to finish so the box is at rest (reduced motion has none).
    await expect.poll(() => note(page).evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
    await page.waitForTimeout(600);
    const box = (await note(page).boundingBox())!;
    const centreX = box.x + box.width / 2;
    const centreY = box.y + box.height / 2;
    // 1 px across; 2 px down, because the photo's height is a fraction of a pixel and the window's own rounding adds up to one more.
    expect(Math.abs(centreX - size.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(centreY - size.height / 2)).toBeLessThanOrEqual(2);
    // Fully inside, with a margin (the 1 rem token is 16 px; at least 12 px is demanded here).
    expect(box.x).toBeGreaterThanOrEqual(12);
    expect(box.y).toBeGreaterThanOrEqual(12);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width - 12);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height - 12);
    // The close button is whole, at least 44 x 44, inside the window and inside the glove's box.
    const closeBox = (await note(page).getByRole('button', { name: 'close glove note' }).boundingBox())!;
    expect(closeBox.width).toBeGreaterThanOrEqual(44);
    expect(closeBox.height).toBeGreaterThanOrEqual(44);
    expect(closeBox.x).toBeGreaterThanOrEqual(box.x - 1);
    expect(closeBox.y).toBeGreaterThanOrEqual(box.y - 1);
    expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(box.x + box.width + 1);
    expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(box.y + box.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Big enough to read: at least the token's share of the window's shorter side, unless the token's width limit
    // (lower on a sharp screen, so the 720 px photo is never blurred) is reached first. 2 px for rounding.
    const { share, cap } = await page.getByTestId('glove-note-region').evaluate((region) => {
      const probe = document.createElement('div');
      probe.style.inlineSize = getComputedStyle(region).getPropertyValue('--glove-note-cap');
      region.append(probe);
      const capPx = probe.getBoundingClientRect().width;
      probe.remove();
      return { share: Number(getComputedStyle(region).getPropertyValue('--glove-note-min-share')), cap: capPx };
    });
    expect(share).toBeGreaterThan(0.5);
    const expected = Math.min(share * Math.min(size.width, size.height), cap);
    expect(box.width).toBeGreaterThanOrEqual(expected - 2);
  });
}
