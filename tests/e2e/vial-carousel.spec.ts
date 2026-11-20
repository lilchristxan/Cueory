import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { studyModes } from '../../src/config/modes';
import { markPanelsSeen } from './clock';
import { isDesktopOfEachEngine, sizeOf } from './projects';

/*
  Task 109: the "ways to study" ring drawn as Christian's vials, as in the prototype he approved on 2026-11-01
  (docs/screenshots/approved-2026-11-01/vial-carousel-*). The ring's turning, announcements, swipes and the preview's
  focus handling are tested in pages.spec.ts; this file covers what the vials add.
*/

test.beforeEach(async ({ page }) => {
  // The once-only promo panel (D-59) would take focus part-way: start as if it had been shown.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch {
      // Storage is blocked: the panel never shows then anyway.
    }
  });
});

const section = (page: Page) => page.locator('#ways-to-study');
/** Longer than any grow, shrink or glide may take before the carousel finishes it itself (SETTLE_GRACE_MS). */
const SETTLE_WAIT = 1_000;
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

async function showRing(page: Page) {
  await page.goto('/');
  await section(page).scrollIntoViewIfNeeded();
  await expect(section(page)).toHaveClass(/modes-p6/);
  await expect(section(page).getByText('one lesson, multiple ways to study', { exact: true })).toBeVisible();
  await expect(section(page).getByText('pick the method that fits your brain today.', { exact: true })).toBeVisible();
  await expect(section(page)).toHaveAttribute('data-ring', '');
  await expect(section(page).locator('[data-modes-controls]')).not.toHaveClass(/invisible/);
  // The section's first fade-in (D-62) has finished, so nothing is still rising while it is measured.
  await expect
    .poll(() => section(page).locator('[data-reveal-section]').evaluate((el) => getComputedStyle(el).translate))
    .toMatch(/^(none|0px)$/);
}

test('every vial is a blank bottle with its label in live text: name and time, with "best for" read aloud too', async ({
  page,
}) => {
  await showRing(page);
  for (const mode of studyModes) {
    const card = page.locator(`#mode-${mode.id}`);
    // The bottle image has a blank label (public/vials/README.txt); the words are text in the page.
    await expect(card.locator('img.vial-img')).toHaveAttribute('src', `/vials/vial-${mode.vial}.webp`);
    await expect(card.locator('img.vial-img')).toHaveAttribute('alt', '');
    // Nothing on the label restates what the name and the section heading say (Christian, 2026-11-02).
    await expect(card.locator('.vial-kicker')).toHaveCount(0);
    await expect(card.locator('.vial-name')).toHaveText(mode.name);
    await expect(card.locator('.vial-meta')).toHaveText(`time${mode.time} min`);
    // The logo is Christian's artwork, not typed.
    await expect(card.locator('img.vial-logo')).toHaveAttribute('src', '/brand/v1/logo-full-light-480.png');
  }
  // Screen readers hear the method and its two lines: "cards, best for recall, about 5 minutes". The checks above can
  // outlast the six-second auto-advance on a slow machine, so first bring the first vial to the front by keyboard
  // (which also takes over from the auto-advance), then one step to cards.
  const cards = section(page).locator('#mode-cards [data-mode-open]');
  await section(page).locator('[data-modes-track]').press('Home');
  await expect(section(page).locator('#mode-video')).toHaveAttribute('data-active', '');
  await section(page).getByRole('button', { name: 'next study mode' }).click();
  await expect(cards).toHaveAccessibleName('preview cards');
  await expect(cards).toHaveAccessibleDescription('best for recall, about 5 minutes');
});

test('no medication wording anywhere on the vials or in their preview', async ({ page }) => {
  await showRing(page);
  const banned = /\bdose\b|\bdosage\b|mg\/ml|\bmg\b|\bml\b|wellness shot|prescription|\brx\b/i;
  expect(await section(page).evaluate((el) => el.textContent ?? '')).not.toMatch(banned);
  for (const mode of studyModes) expect(mode.features.map((feature) => feature.text).join(' ')).not.toMatch(banned);
});

test('the dots follow the vial in front, with no caption repeating its name; the dot is a pill, not only a color', async ({ page }) => {
  await showRing(page);
  const on = () => section(page).locator('[data-modes-dot][data-on]');
  await expect(on()).toHaveCount(1);
  await expect(section(page).locator('[data-modes-caption]')).toHaveCount(0);
  await section(page).getByRole('button', { name: 'next study mode' }).click();
  const widths = () =>
    section(page)
      .locator('[data-modes-dot]')
      .evaluateAll((dots) => dots.map((dot) => dot.getBoundingClientRect().width));
  // The pill moves over (a 400 ms change of width).
  await expect.poll(async () => (await widths()).map((w) => Math.round(w)).indexOf(Math.round(Math.max(...(await widths()))))).toBe(1);
  await expect.poll(async () => Math.max(...(await widths())) / Math.min(...(await widths()))).toBeGreaterThan(2);
});

test('phones put the arrows under the pedestal, either side of the dots; wider screens put them beside the vials', async ({
  page,
}, testInfo) => {
  await showRing(page);
  const track = (await section(page).locator('[data-modes-track]').boundingBox())!;
  const prev = (await section(page).locator('[data-modes-prev]').boundingBox())!;
  const next = (await section(page).locator('[data-modes-next]').boundingBox())!;
  const dots = (await section(page).locator('.modes-dots').boundingBox())!;
  if (sizeOf(testInfo) === 'phone') {
    expect(prev.y).toBeGreaterThanOrEqual(track.y + track.height - 2);
    expect(prev.x + prev.width).toBeLessThanOrEqual(dots.x);
    expect(next.x).toBeGreaterThanOrEqual(dots.x + dots.width);
  } else {
    const middle = track.y + track.height / 2;
    expect(Math.abs(prev.y + prev.height / 2 - middle)).toBeLessThan(2);
    expect(prev.x).toBeLessThan(track.width / 4);
    expect(next.x).toBeGreaterThan((track.width * 3) / 4);
  }
  // Nothing scrolls sideways (D-48): the outer vials end at the window's edges.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

/** Waits until no vial is still gliding: a turn, or the row laid out again, has finished. */
async function settled(page: Page) {
  await expect
    .poll(() =>
      section(page)
        .locator('[data-mode-card]')
        .evaluateAll((cards) => cards.some((card) => card.getAnimations().some((a) => a.playState === 'running'))),
    )
    .toBe(false);
}

/** Read selection, presentation and geometry together. During resize, require two matching idle frames. */
function measureRow(page: Page, waitForPair = false) {
  return section(page).evaluate(async (root, waitForPair) => {
    const track = root.querySelector('[data-modes-track]')!;
    const cards = [...track.querySelectorAll<HTMLElement>('[data-mode-card]')];
    const box = (el: Element) => {
      const { left, right, top, bottom } = el.getBoundingClientRect();
      return { left, right, top, bottom };
    };
    const read = () => {
      const stage = box(track);
      const view = window.innerWidth;
      const shown = cards.filter(card => getComputedStyle(card).visibility === 'visible').map(card => ({
        name: card.dataset.name!, vial: box(card.querySelector('[data-vial]')!),
        label: box(card.querySelector('.vial-label')!), stage, view,
      })).sort((a, b) => a.vial.left - b.vial.left);
      return {
        active: cards.find(card => card.hasAttribute('data-active'))?.dataset.name,
        intended: cards.filter(card => !card.hasAttribute('data-far')).map(card => card.dataset.name!),
        shown,
      };
    };
    if (!waitForPair) return read();
    const measured = track.querySelectorAll('[data-mode-card], [data-mode-card] [data-vial], [data-mode-card] .vial-label');
    const elements = [...measured];
    let previous: string | undefined;
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const row = read();
      const moving = elements.some(el => el.getAnimations().some(a => a.pending || a.playState === 'running'));
      const current = JSON.stringify(row);
      if (!moving && previous === current) return row;
      previous = moving ? undefined : current;
    }
    throw new Error('Vial selection, visible labels and bottle bounds did not settle across two animation frames');
  }, waitForPair);
}

/** Every label whole, inside the window and the stage (which clips what passes its edges), and no bottle over the next. */
function expectWhole(shown: Awaited<ReturnType<typeof measureRow>>['shown']) {
  for (const [i, item] of shown.entries()) {
    expect(item.label.left, `${item.name} label left`).toBeGreaterThanOrEqual(Math.max(0, item.stage.left) - 0.5);
    expect(item.label.right, `${item.name} label right`).toBeLessThanOrEqual(Math.min(item.view, item.stage.right) + 0.5);
    expect(item.label.right - item.label.left).toBeGreaterThan(0);
    // No bottle overlaps the next one, so nothing covers any part of a label.
    const next = shown[i + 1];
    if (next) expect(next.vial.left, `${item.name} and ${next.name} overlap`).toBeGreaterThanOrEqual(item.vial.right);
  }
}

/** The names of the vials the row shows (the ones it has not hidden as not fitting whole), left to right. */
function onShow(page: Page) {
  return section(page)
    .locator('[data-mode-card]:not([data-far])')
    .evaluateAll((cards) => cards.map((card) => (card as HTMLElement).dataset.name));
}

test('every vial on show has its whole label in view, and no two vials overlap, in Light and Evening (P6)', async ({
  page,
}) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await showRing(page);
    // Check the row where it starts and after one turn each way, once each glide has finished.
    for (const turn of [undefined, 'next', 'previous'] as const) {
      if (turn) await section(page).getByRole('button', { name: `${turn} study mode` }).click();
      await settled(page);
      const { shown } = await measureRow(page);
      // The front vial and at least one neighbour on each side.
      expect(shown.length, `${colorScheme} ${turn ?? 'start'}`).toBeGreaterThanOrEqual(3);
      expectWhole(shown);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('larger text lays the row out again without a turn: a neighbour that no longer fits whole is hidden (P6)', async ({
  page,
}) => {
  await showRing(page);
  const carousel = section(page);
  await carousel.getByRole('button', { name: 'pause the slideshow' }).click();
  await expect(carousel).toHaveAttribute('data-paused', '');
  await carousel.locator('[data-modes-track]').press('Home');
  for (const front of ['video', 'cards']) {
    if (front === 'cards') await carousel.getByRole('button', { name: 'next study mode' }).click();
    const checkRow = async () => {
      const row = await measureRow(page, true);
      expect(row.active).toBe(front);
      expect(row.intended).toContain(front);
      expect(row.shown.map(card => card.name)).toEqual(expect.arrayContaining(row.intended));
      expectWhole(row.shown);
      return row.intended;
    };
    const before = await checkRow();
    expect(before.length).toBeGreaterThanOrEqual(3);
    await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
    await expect.poll(() => onShow(page)).not.toEqual(before);
    expect((await checkRow()).length).toBeLessThan(before.length);
    await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
    await expect.poll(() => onShow(page)).toEqual(before);
    expect(await checkRow()).toEqual(before);
  }
});

test('Enter on the vial in front grows that same bottle into the preview, in two stages; Escape puts it back', async ({
  page,
}) => {
  await showRing(page);
  const front = section(page).locator('#mode-video [data-mode-open]');
  await front.focus();
  // A clear focus ring on the vial.
  expect(await front.evaluate((el) => [getComputedStyle(el).outlineStyle, getComputedStyle(el).outlineWidth])).toEqual([
    'solid',
    '3px',
  ]);
  // The focus lift (220 ms) has finished, so the vial is measured where the grow will start from.
  await settled(page);
  const vial = (await section(page).locator('#mode-video [data-vial]').boundingBox())!;
  // The grow lasts 320 ms, less than one round trip to a busy browser can take (770 ms seen), so the page keeps each
  // animation as it is made, and the checks below read those same animations whenever they get there.
  await page.evaluate(() => {
    const made: Array<{ target: Element; animation: Animation }> = [];
    (window as Window & { __madeAnimations?: typeof made }).__madeAnimations = made;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
      const animation = original.apply(this, args);
      made.push({ target: this, animation });
      return animation;
    };
  });
  await page.keyboard.press('Enter');
  const grow = await page.evaluate(() => {
    const made = (window as Window & { __madeAnimations?: Array<{ target: Element; animation: Animation }> }).__madeAnimations ?? [];
    const bottle = document.querySelector<HTMLElement>('[data-mode-preview-vial]')!;
    const move = made.find((entry) => entry.target === bottle)?.animation;
    if (!move) return undefined;
    move.pause();
    move.currentTime = 0;
    const box = bottle.getBoundingClientRect();
    move.currentTime = 160;
    const settled = getComputedStyle(bottle).transform;
    move.play();
    const details = document.querySelector<HTMLElement>('.mode-preview-details')!;
    const words = made.find((entry) => entry.target === details)!.animation;
    const frames = words.effect!.getComputedTiming();
    return {
      box: [box.left, box.top, box.width, box.height],
      settled,
      duration: frames.duration,
      wordsHidden: (words.effect as KeyframeEffect).getKeyframes()[1],
    };
  });
  expect(grow).toBeDefined();
  // Stage 1 starts exactly on the vial in the ring and has the bottle in place by 160 ms...
  const start = grow!.box;
  for (const [a, b] of [
    [start[0], vial.x],
    [start[1], vial.y],
    [start[2], vial.width],
    [start[3], vial.height],
  ]) {
    expect(Math.abs(a! - b!)).toBeLessThan(2);
  }
  expect(grow!.settled).toBe('none');
  // ...and stage 2, from 160 to 320 ms, fades the words in.
  expect(grow!.duration).toBe(320);
  expect(grow!.wordsHidden).toMatchObject({ offset: 0.5, opacity: '0' });
  // The ring's own bottle steps out while the preview shows it.
  await expect(page.locator('#mode-video')).toHaveAttribute('data-lent', '');

  const preview = page.getByRole('dialog', { name: 'video' });
  await expect(preview).toBeVisible();
  // The feature rows wait behind the ⓘ beside the name.
  await expect(preview.locator('[data-mode-preview-features="video"]')).toBeHidden();
  await preview.getByRole('button', { name: 'more about video' }).click();
  await expect(preview.locator('[data-mode-preview-features="video"] li')).toHaveText([
    'a short video for each lesson',
    'starts with one tap on its cover',
    'nothing loads before you tap',
    'read-along text in the lesson',
  ]);
  await expect(preview.getByText('coming soon')).toBeVisible();
  await expect(preview.getByRole('link', { name: 'join the launch list', exact: true })).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('#mode-preview').withTags(axeTags).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // The ⓘ has focus, so the first Escape closes it and the second the preview.
  await page.keyboard.press('Escape');
  await expect(preview.locator('[data-mode-preview-features="video"]')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#mode-preview')).toBeHidden();
  await expect(front).toBeFocused();
  await expect(page.locator('#mode-video')).not.toHaveAttribute('data-lent', '');
});

test('wider screens show the preview in two columns, phones stacked with the vial on top', async ({ page }, testInfo) => {
  await showRing(page);
  await section(page).locator('#mode-video [data-mode-open]').click();
  const preview = page.getByRole('dialog', { name: 'video' });
  await expect(preview).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.querySelector('[data-mode-preview]')!.getAnimations({ subtree: true }).length)).toBe(0);
  const bottle = (await preview.locator('[data-mode-preview-vial]').boundingBox())!;
  const words = (await preview.locator('.mode-preview-details').boundingBox())!;
  if (sizeOf(testInfo) === 'phone') expect(words.y).toBeGreaterThanOrEqual(bottle.y + bottle.height);
  else expect(words.x).toBeGreaterThanOrEqual(bottle.x + bottle.width);
});

test('with a mouse, the front vial lifts to 104% with brighter glass; its neighbours stay exactly as they are', async ({
  page,
}, testInfo) => {
  test.skip(!isDesktopOfEachEngine(testInfo), 'hover needs a mouse');
  await showRing(page);
  // The ring has settled once no finite animation or transition is still running (an endless shimmer doesn't count).
  await expect
    .poll(() =>
      page.evaluate(
        () => document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity && a.playState === 'running').length,
      ),
    )
    .toBe(0);
  const look = (id: string) =>
    page.locator(`#mode-${id}`).evaluate((card) => ({
      scale: getComputedStyle(card).scale,
      translate: getComputedStyle(card).translate,
      shine: getComputedStyle(card.querySelector('.vial-shine')!).opacity,
      glass: getComputedStyle(card.querySelector('.vial-img')!).filter,
    }));
  const sideBefore = await look('cards');
  await page.locator('#mode-video [data-mode-open]').hover();
  await expect.poll(async () => (await look('video')).scale).toBe('1.04');
  await expect.poll(async () => (await look('video')).shine).toBe('1');
  await expect.poll(async () => (await look('video')).translate).toBe('0px -6px');
  expect(await look('cards')).toEqual(sideBefore);
  // Back smoothly on leave.
  await page.mouse.move(0, 0);
  await expect.poll(async () => (await look('video')).scale).toBe('none');
});

test('auto-advance gives the vial in front its full six seconds from when the ring comes into view or the pointer leaves', async ({
  page,
}, testInfo) => {
  test.skip(!isDesktopOfEachEngine(testInfo), 'rests a mouse on the vials: once per engine, at desktop size');
  // The page's own timers run on Playwright's clock and move only when the test moves them, so a busy test machine
  // cannot shift a countdown.
  await page.clock.install({ time: new Date('2026-11-20T07:00:00') });
  await markPanelsSeen(page);
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-11-20T07:05:00'));
  const carousel = section(page);
  await expect(carousel).toHaveAttribute('data-ring', '');
  await expect(carousel).toHaveAttribute('data-autoplay', 'off');
  await expect(carousel).toHaveAttribute('data-autoplay-hold', 'offscreen');
  // Below the window for a while: nothing counts down, so no advance is owed when the ring comes into view.
  await page.clock.runFor(20_000);
  await expect(carousel.locator('#mode-video')).toHaveAttribute('data-active', '');
  await page.mouse.move(0, 0);
  await carousel.scrollIntoViewIfNeeded();
  await expect(carousel).toHaveAttribute('data-autoplay', 'on');
  await expect(carousel).not.toHaveAttribute('data-autoplay-hold');
  await page.clock.runFor(5_900);
  await expect(carousel.locator('#mode-video')).toHaveAttribute('data-active', '');
  await page.clock.runFor(200);
  await expect(carousel.locator('#mode-cards')).toHaveAttribute('data-active', '');
  await expect(carousel).toHaveAttribute('data-carousel-state', 'settled');

  // A mouse resting on the vials stops the countdown at once, however long it stays.
  await page.clock.runFor(3_000);
  await carousel.locator('[data-modes-track]').hover();
  await expect(carousel).toHaveAttribute('data-autoplay', 'off');
  await expect(carousel).toHaveAttribute('data-autoplay-hold', 'hover');
  await page.clock.runFor(20_000);
  await expect(carousel.locator('#mode-cards')).toHaveAttribute('data-active', '');
  // Moving off starts a fresh six seconds, not whatever was left before the pause.
  await page.mouse.move(0, 0);
  await expect(carousel).toHaveAttribute('data-autoplay', 'on');
  await expect(carousel).not.toHaveAttribute('data-autoplay-hold');
  await page.clock.runFor(5_900);
  await expect(carousel.locator('#mode-cards')).toHaveAttribute('data-active', '');
  await page.clock.runFor(200);
  await expect(carousel.locator('#mode-learn')).toHaveAttribute('data-active', '');

  // The open preview holds it too, and so does taking over.
  await carousel.locator('#mode-learn [data-mode-open]').click();
  await expect(carousel).toHaveAttribute('data-carousel-state', /^(opening|open)$/);
  await expect(carousel).toHaveAttribute('data-autoplay', 'off');
  // Opening a preview is also a visitor action, so the established takeover hold wins this diagnostic's priority.
  await expect(carousel).toHaveAttribute('data-autoplay-hold', 'takeover');
  await page.clock.runFor(SETTLE_WAIT);
  await expect(carousel).toHaveAttribute('data-carousel-state', 'open');
  await page.keyboard.press('Escape');
  await page.clock.runFor(SETTLE_WAIT);
  await expect(page.locator('#mode-preview')).toBeHidden();
  await expect(carousel).toHaveAttribute('data-carousel-state', 'settled');
  await expect(carousel.locator('#mode-learn [data-mode-open]')).toBeFocused();
  await page.mouse.move(0, 0);
  await page.clock.runFor(20_000);
  await expect(carousel.locator('#mode-learn')).toHaveAttribute('data-active', '');
  await expect(carousel).toHaveAttribute('data-autoplay', 'off');
  await expect(carousel).toHaveAttribute('data-autoplay-hold', 'takeover');
});

test('touch screens never get the hover lift; reduced motion never lifts either', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'a touch-screen check');
  await showRing(page);
  expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(false);
  await page.locator('#mode-video [data-mode-open]').hover();
  await page.waitForTimeout(300);
  expect(await page.locator('#mode-video').evaluate((card) => getComputedStyle(card).scale)).toBe('none');
});

test('reduced motion: no glide, and the preview opens and closes at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await showRing(page);
  const durations = await page.locator('#mode-cards').evaluate((card) =>
    [card, card.querySelector('.vial-img')!, card.querySelector('.vial-shine')!].map((el) =>
      Math.max(...getComputedStyle(el).transitionDuration.split(',').map((d) => parseFloat(d))),
    ),
  );
  for (const duration of durations) expect(duration).toBeLessThan(0.001);
  await page.locator('#mode-video [data-mode-open]').click();
  await expect(page.getByRole('dialog', { name: 'video' })).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('[data-mode-preview]')!.getAnimations({ subtree: true }).length)).toBe(0);
  await page.keyboard.press('Escape');
  expect(await page.locator('#mode-preview').evaluate((el) => (el as HTMLDialogElement).open)).toBe(false);
});

test('the vials pass axe', async ({ page }) => {
  await showRing(page);
  const axe = await new AxeBuilder({ page }).include('#ways-to-study').withTags(axeTags).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('the ⓘ in the preview opens and closes by keyboard, says whether it is open, and passes axe', async ({ page }) => {
  await showRing(page);
  await section(page).locator('#mode-video [data-mode-open]').click();
  const preview = page.getByRole('dialog', { name: 'video' });
  await expect(preview.getByRole('button', { name: 'close preview' })).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.querySelector('[data-mode-preview]')!.getAnimations({ subtree: true }).length))
    .toBe(0);
  const info = preview.getByRole('button', { name: 'more about video' });
  const rows = preview.locator('[data-mode-preview-features="video"]');
  await expect(info).toHaveAttribute('aria-expanded', 'false');
  await expect(info).toHaveAttribute('aria-controls', 'mode-preview-info');
  await expect(rows).toBeHidden();
  // The tap target is at least 44 px, though the icon is small.
  const box = await info.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);

  // Tab reaches it straight after the close button; Enter opens it, Space closes it.
  await page.keyboard.press('Tab');
  await expect(info).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(info).toHaveAttribute('aria-expanded', 'true');
  await expect(rows).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('#mode-preview').withTags(axeTags).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  await page.keyboard.press('Space');
  await expect(info).toHaveAttribute('aria-expanded', 'false');
  await expect(rows).toBeHidden();

  // Escape closes the ⓘ first and leaves the preview open; a second Escape closes the preview.
  await page.keyboard.press('Space');
  await expect(rows).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(info).toHaveAttribute('aria-expanded', 'false');
  await expect(rows).toBeHidden();
  await expect(info).toBeFocused();
  await expect(page.locator('#mode-preview')).toBeVisible();

  // The next method gets its own name, closed again.
  await info.click();
  await expect(info).toHaveAttribute('aria-expanded', 'true');
  await preview.getByRole('button', { name: 'next study mode' }).click();
  const cardsInfo = page.getByRole('dialog', { name: 'cards' }).getByRole('button', { name: 'more about cards' });
  await expect(cardsInfo).toHaveAttribute('aria-expanded', 'false');
  await cardsInfo.click();
  await expect(page.locator('[data-mode-preview-features="cards"]')).toBeVisible();
  await expect(page.locator('[data-mode-preview-features="video"]')).toBeHidden();

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#mode-preview')).toBeHidden();
});
