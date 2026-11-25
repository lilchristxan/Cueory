import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { accountLaunch, accountsOpen, newsletter, showsHeroJoin, socials } from '../../src/config/site';
import { REST_MS } from '../../src/scripts/carousel';
import { isDesktopOfEachEngine, sizeOf } from './projects';
import { lessonRoutes } from '../lessonroutes';

// The once-only promo panel (D-59) slides down after 5 seconds and takes keyboard focus, and the launch-updates pop-up
// (lane 14) opens as a modal after 10, either of which would interrupt these tests part-way, so every page here starts
// as if both had just been shown. tests/e2e/promo.spec.ts and tests/e2e/signup-popup.spec.ts test them.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch {
      // Storage is blocked: the panel never shows then anyway.
    }
  });
});

/** The footer's links panel (motto, links, socials, theme switch) is closed until its chevron opens it (Task 85). */
async function openFooterLinks(page: Page) {
  const chevron = page.getByRole('contentinfo').locator('[data-footer-toggle]');
  await expect(chevron).toBeVisible();
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(chevron).toHaveAttribute('aria-expanded', 'true');
}

// Firefox reports sizes in 1/60 px steps, so a 44 px box can read 43.99994. Allow that rounding in Firefox only.
const FIREFOX_ROUNDING_PX = 0.01;

/** The name of the card in the middle of the "ways to study" merry-go-round (D-60). */
const middleCard = (page: Page) =>
  page.locator('#ways-to-study [data-mode-card][data-offset="0"]').getAttribute('data-name');

/**
 * Puts the ring in manual mode on the first vial (video): Home on the card group is a keyboard use, which takes the
 * ring over (data-autoplay turns off), so the six-second slideshow cannot move the vial in front while a slow machine
 * is still scrolling or waiting for a button. The tests that start from "video in front" call this first.
 */
async function holdOnVideo(page: Page) {
  const carousel = page.locator('#ways-to-study');
  await carousel.getByRole('group', { name: 'study mode cards' }).press('Home');
  await expect(carousel).toHaveAttribute('data-autoplay', 'off');
  await expect.poll(() => middleCard(page)).toBe('video');
}

/** Failure-only Firefox and WebKit desktop evidence for the carousel autoplay assertion. */
async function installAutoplayPointerParkDiagnostic(page: Page) {
  await page.addInitScript(() => {
    type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number } | null;
    type Target = { tag: string | null; id: string | null; mode: string | null };
    type Detail = {
      event?: string;
      eventT?: number;
      trusted?: boolean;
      pointerType?: string;
      x?: number;
      y?: number;
      target?: Target;
      related?: Target;
      hit?: Target;
      trackHover?: boolean;
      controlsHover?: boolean;
    };
    type Entry = {
      phase: string;
      t: number;
      autoplay: string | null;
      hold: string | null;
      active: string | null;
      track: Rect;
      viewport: { width: number; height: number };
      intersection: number | null;
      visibility: string;
      reducedMotion: boolean;
      detail?: Detail;
    };
    type ProbeWindow = Window & { __cueoryAutoplayPointerParkDiagnostic?: { entries: Entry[]; mark: (phase: string) => void } };
    const entries: Entry[] = [];
    const cap = 120;
    let intersection: number | null = null;
    let postHover = false;
    let lastMouse: { x: number; y: number } | undefined;
    const target = (value: EventTarget | null): Target => {
      const element = value instanceof Element ? value : null;
      return {
        tag: element?.tagName.toLowerCase() ?? null,
        id: element?.id ?? null,
        mode: element?.closest<HTMLElement>('[data-mode-card]')?.dataset.name ?? null,
      };
    };
    const push = (entry: Entry) => {
      entries.push(entry);
      if (entries.length > cap) entries.splice(0, entries.length - cap);
    };
    const sample = () => {
      const root = document.querySelector<HTMLElement>('[data-modes]');
      const track = root?.querySelector<HTMLElement>('[data-modes-track]') ?? null;
      const rect = track?.getBoundingClientRect();
      return {
        autoplay: root?.dataset.autoplay ?? null,
        hold: root?.dataset.autoplayHold ?? null,
        active: root?.querySelector<HTMLElement>('[data-mode-card][data-offset="0"]')?.dataset.name ?? null,
        track: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        intersection,
        visibility: document.visibilityState,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      };
    };
    const note = (phase: string, detail?: Detail) => {
      push({ phase, t: performance.now(), ...sample(), detail });
    };
    const notePostDispatch = (phase: string, detail: Detail, track: HTMLElement, controls: HTMLElement | null) => {
      window.setTimeout(() => {
        const hit = lastMouse ? document.elementFromPoint(lastMouse.x, lastMouse.y) : null;
        note(`${phase}:post-dispatch`, {
          ...detail,
          hit: target(hit),
          trackHover: track.matches(':hover'),
          controlsHover: controls?.matches(':hover') ?? false,
        });
      }, 0);
    };
    (window as ProbeWindow).__cueoryAutoplayPointerParkDiagnostic = {
      entries,
      mark: (phase) => {
        if (phase === 'intentional-hover:before') postHover = true;
        note(phase);
      },
    };
    document.addEventListener('DOMContentLoaded', () => {
      const root = document.querySelector<HTMLElement>('[data-modes]');
      const track = root?.querySelector<HTMLElement>('[data-modes-track]');
      if (!root || !track) return note('carousel:missing');
      const controls = root.querySelector<HTMLElement>('[data-modes-controls]');
      const isPauseArea = (value: EventTarget | null) =>
        value instanceof Node && [track, controls].some((area) => area?.contains(value));
      // Event capture must not force layout ahead of the carousel's own listener.
      const eventState = () => ({
        autoplay: root.dataset.autoplay ?? null,
        hold: root.dataset.autoplayHold ?? null,
        active: root.querySelector<HTMLElement>('[data-mode-card][data-offset="0"]')?.dataset.name ?? null,
        track: null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        intersection,
        visibility: document.visibilityState,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      });
      const recordPointer = (event: PointerEvent) => {
        if (!postHover || event.pointerType !== 'mouse' || (!isPauseArea(event.target) && !isPauseArea(event.relatedTarget))) return;
        lastMouse = { x: event.clientX, y: event.clientY };
        const detail: Detail = {
          event: event.type,
          eventT: event.timeStamp,
          trusted: event.isTrusted,
          pointerType: event.pointerType,
          x: event.clientX,
          y: event.clientY,
          target: target(event.target),
          related: target(event.relatedTarget),
        };
        // Capture only event fields synchronously. Geometry and hit testing run after the carousel's listener.
        push({ phase: `pointer:${event.type}`, t: performance.now(), ...eventState(), detail });
        notePostDispatch(`pointer:${event.type}`, detail, track, controls);
      };
      const recordMouseOut = (event: MouseEvent) => {
        if (!postHover || (!isPauseArea(event.target) && !isPauseArea(event.relatedTarget))) return;
        const detail: Detail = {
          event: event.type,
          eventT: event.timeStamp,
          trusted: event.isTrusted,
          x: event.clientX,
          y: event.clientY,
          target: target(event.target),
          related: target(event.relatedTarget),
        };
        push({ phase: 'mouse:mouseout', t: performance.now(), ...eventState(), detail });
        notePostDispatch('mouse:mouseout', detail, track, controls);
      };
      note('carousel:ready');
      new MutationObserver((mutations) => {
        for (const mutation of mutations) note(`attribute:${mutation.attributeName}`);
      }).observe(root, { attributes: true, attributeFilter: ['data-autoplay', 'data-autoplay-hold'] });
      new IntersectionObserver((observations) => {
        for (const observation of observations) {
          intersection = observation.intersectionRatio;
          note('intersection');
        }
      }, { threshold: [0, 0.01, 1] }).observe(track);
      for (const type of ['pointerenter', 'pointerleave', 'pointermove', 'pointerover', 'pointerout'] as const) {
        window.addEventListener(type, recordPointer, { capture: true, passive: true });
      }
      window.addEventListener('mouseout', recordMouseOut, { capture: true, passive: true });
      window.addEventListener('scroll', (event) => {
        if (!postHover) return;
        const detail: Detail = { event: 'scroll', eventT: event.timeStamp, trusted: event.isTrusted };
        // The product's capture listener reconciles hover from elementFromPoint. Sample only after it has returned.
        push({ phase: 'scroll', t: performance.now(), ...eventState(), detail });
        notePostDispatch('scroll', detail, track, controls);
      }, { capture: true, passive: true });
    });
  });
}

async function markAutoplayPointerParkDiagnostic(page: Page, phase: string) {
  await page.evaluate((label) => {
    type ProbeWindow = Window & { __cueoryAutoplayPointerParkDiagnostic?: { mark: (phase: string) => void } };
    (window as ProbeWindow).__cueoryAutoplayPointerParkDiagnostic?.mark(label);
  }, phase).catch(() => {});
}

async function attachAutoplayPointerParkDiagnostic(page: Page, testInfo: TestInfo) {
  const entries = await page.evaluate(() => {
    type ProbeWindow = Window & { __cueoryAutoplayPointerParkDiagnostic?: { entries: unknown[] } };
    return (window as ProbeWindow).__cueoryAutoplayPointerParkDiagnostic?.entries ?? [];
  }).catch(() => []);
  await testInfo.attach('carousel-autoplay-pointer-park-path', {
    body: JSON.stringify({ entries }, null, 2),
    contentType: 'application/json',
  });
}
/** Test-only D-51 close observation; it captures IDs and event state, never DOM content or user text. */
async function installPreviewCloseDiagnostic(page: Page) {
  await page.addInitScript(() => {
    type Entry = { phase: string; t: number; open: boolean | null; detail?: Record<string, boolean | string | null> };
    type ProbeWindow = Window & { __cueoryD51Diagnostic?: Entry[] };
    const state = window as ProbeWindow;
    const entries: Entry[] = [];
    state.__cueoryD51Diagnostic = entries;
    const identity = (node: EventTarget | null) => {
      const element = node instanceof Element ? node : null;
      return { tag: element?.tagName ?? null, id: element?.id ?? null };
    };
    const note = (phase: string, detail?: Entry['detail']) => {
      entries.push({ phase, t: performance.now(), open: document.querySelector<HTMLDialogElement>('[data-mode-preview]')?.open ?? null, detail });
    };
    const showModal = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function (...args) {
      note('showModal:enter', identity(this));
      try { const result = showModal.apply(this, args); note('showModal:return', identity(this)); return result; }
      catch (error) { note('showModal:throw', { ...identity(this), name: error instanceof Error ? error.name : 'non-error' }); throw error; }
    };
    const close = HTMLDialogElement.prototype.close;
    HTMLDialogElement.prototype.close = function (...args) {
      note('dialog.close:enter', identity(this));
      try { const result = close.apply(this, args); note('dialog.close:return', identity(this)); return result; }
      catch (error) { note('dialog.close:throw', { ...identity(this), name: error instanceof Error ? error.name : 'non-error' }); throw error; }
    };
    const focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (...args) { note('focus', identity(this)); return focus.apply(this, args); };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      const element = identity(this);
      note('animation:created', element);
      void animation.finished.then(() => note('animation:fulfilled', element), () => note('animation:rejected', element));
      return animation;
    };
    document.addEventListener('DOMContentLoaded', () => {
      const dialog = document.querySelector<HTMLDialogElement>('[data-mode-preview]');
      if (!dialog) return note('dialog:missing');
      for (const type of ['keydown', 'cancel', 'close']) {
        dialog.addEventListener(type, (event) => note(`dialog:${type}`, { key: event instanceof KeyboardEvent ? event.key : null, defaultPrevented: event.defaultPrevented, ...identity(event.target) }), true);
      }
      note('dialog:observed', identity(dialog));
    });
  });
}

/** Failure-only D-51 navigation evidence. The assertions and timing remain the test's existing contract. */
async function capturePreviewNavigationFailure(page: Page, lastAction: string) {
  return page.evaluate((lastAction) => {
    const describe = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return null;
      const bounds = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        classes: [...element.classList],
        previewPart: element.getAttribute('data-mode-preview') ?? null,
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      };
    };
    const dialog = document.querySelector<HTMLDialogElement>('[data-mode-preview]');
    const animations = dialog?.getAnimations({ subtree: true }).map((animation, index) => {
      const effect = animation.effect;
      const timing = effect?.getComputedTiming();
      const localTime = typeof timing?.localTime === 'number' ? timing.localTime : null;
      const delay = typeof timing?.delay === 'number' ? timing.delay : null;
      const endTime = typeof timing?.endTime === 'number' ? timing.endTime : null;
      const phase = localTime === null || delay === null || endTime === null ? null :
        localTime < delay ? 'before' : localTime >= endTime ? 'after' : 'active';
      return {
        index,
        playState: animation.playState,
        pending: animation.pending,
        currentTime: animation.currentTime,
        phase,
        progress: timing?.progress ?? null,
        duration: timing?.activeDuration ?? null,
        delay,
        endTime,
        target: describe(effect instanceof KeyframeEffect ? effect.target : null),
      };
    }) ?? [];
    return {
      lastAction,
      activeElement: describe(document.activeElement),
      preview: {
        open: dialog?.open ?? false,
        bounds: describe(dialog)?.bounds ?? null,
        carouselState: document.querySelector<HTMLElement>('[data-modes]')?.dataset.carouselState ?? null,
      },
      animations,
    };
  }, lastAction);
}

/** Measure cards only after their turn transitions finish, including on a loaded runner. */
const waitForCardTurn = async (page: Page) => {
  await expect.poll(() => page.locator('#ways-to-study [data-mode-card]').evaluateAll((cards) =>
    cards.flatMap((card) => card.getAnimations()).filter((animation) =>
      animation.playState === 'running' || animation.pending,
    ).length,
  )).toBe(0);
};

const pages = [
  '/',
  '/learn/study-skills',
  '/learn/study-skills/cards',
  '/learn/study-skills/learn-mode',
  '/learn/study-skills/matching',
  '/learn/study-skills/organizer',
  '/learn/study-skills/fill-in',
  '/learn/study-skills/label-it',
  '/learn/study-skills/questions',
  '/privacy',
  '/terms',
  '/disclaimer',
  '/support',
  '/subscribed',
  '/play',
  '/start',
  '/progress',
  '/learn/video-sample',
  // Every lesson page generated from /content (Task 300), so a new lesson is checked without editing this list.
  ...lessonRoutes,
];

for (const path of [...new Set(pages)]) {
  test(`${path} loads, shows the notice, and passes accessibility checks`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));

    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    const notice = page.getByTestId('building-notice');
    await expect(notice).toHaveText("we're still building. please support (opens in a new tab) our development. more coming soon!");
    const support = notice.getByRole('link', { name: /^support/ });
    await expect(support).toHaveAttribute('href', 'https://ko-fi.com/cueory');
    await expect(support).toHaveAttribute('target', '_blank');
    await expect(support).toHaveAttribute('rel', 'noopener noreferrer');
    expect(await support.evaluate((el) => ({ weight: getComputedStyle(el).fontWeight, line: getComputedStyle(el).textDecorationLine, h: el.getBoundingClientRect().height })))
      .toMatchObject({ weight: '700', line: 'underline' });
    expect((await support.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(notice.locator('.building-strip-icon')).toHaveCount(2);
    await expect(page.locator('h1')).toHaveCount(1);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(errors).toEqual([]);
    // Nothing scrolls sideways, on any screen size (D-48).
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('lesson can be stepped through with the keyboard', async ({ page }) => {
  await page.goto('/learn/study-skills');
  await expect(page.getByText('sentence 1 of')).toBeVisible();

  const nextButton = page.getByRole('button', { name: 'next sentence' });
  await nextButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('sentence 2 of')).toBeVisible();

  await page.getByRole('button', { name: 'show all' }).click();
  await expect(page.getByText("that's the whole lesson for now.")).toBeVisible();
});

test('cards can be sorted with the keyboard, and "Still learning" cards come back next round', async ({ page }) => {
  await page.goto('/learn/study-skills');
  await page.getByRole('link', { name: 'practice this lesson with cards' }).click();
  await expect(page).toHaveURL(/\/learn\/study-skills\/cards$/);
  await expect(page.getByText('Card 1 of 3 · Know it: 0 · Still learning: 0')).toBeVisible();
  await expect(page.getByText('Question', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Show answer' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Answer', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Still learning' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Card 2 of 3 · Know it: 0 · Still learning: 1')).toBeVisible();

  // Back undoes the last sort.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByText('Card 1 of 3 · Know it: 0 · Still learning: 0')).toBeVisible();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Still learning' }).click();

  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: 'Know it' }).click();
  }
  await expect(page.getByText('Round 1 done.')).toBeVisible();
  await expect(page.getByText('Know it: 2 · Still learning: 1')).toBeVisible();

  await page.getByRole('button', { name: 'Study the 1 still learning' }).click();
  await expect(page.getByText('Round 2 · Card 1 of 1 · Know it: 0 · Still learning: 0')).toBeVisible();
  await expect(page.getByText('Placeholder card 1, front.')).toBeVisible();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Know it' }).click();
  await expect(page.getByText("That's every card for now.")).toBeVisible();

  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.getByText('Card 1 of 3 · Know it: 0 · Still learning: 0')).toBeVisible();
});

test('starred cards are remembered in this browser and can be studied on their own', async ({ page }) => {
  await page.goto('/learn/study-skills/cards');
  const star = page.getByRole('button', { name: 'Star', exact: true });
  const onlyStarred = page.getByRole('checkbox', { name: /Only starred cards/ });
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await expect(onlyStarred).toBeDisabled();

  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Know it' }).click();
  await star.focus();
  await page.keyboard.press('Space'); // star card 2
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('checkbox', { name: 'Only starred cards (1)' })).toBeEnabled();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cueory-progress') ?? '{}'));
  expect(saved.decks['study-skills-01'].starred).toEqual(['ss01-c02']);

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await page.reload();
  await onlyStarred.check();
  await expect(page.getByText('Card 1 of 1 · Know it: 0 · Still learning: 0')).toBeVisible();
  await expect(page.getByText('Placeholder card 2, front.')).toBeVisible();
  await expect(star).toHaveAttribute('aria-pressed', 'true');

  // Removing the last star turns "Only starred cards" off; the next start uses every card again.
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('checkbox', { name: 'Only starred cards (0)' })).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('cueory-stars-study-skills-01'))).toBeNull();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Know it' }).click();
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.getByText('Card 1 of 3 · Know it: 0 · Still learning: 0')).toBeVisible();
});

test('shuffle keeps every card in the round exactly once', async ({ page }) => {
  await page.goto('/learn/study-skills/cards');
  await page.getByRole('checkbox', { name: 'Shuffle' }).check();
  const fronts: string[] = [];
  for (let i = 0; i < 3; i++) {
    fronts.push((await page.getByTestId('card-text').textContent()) ?? '');
    await page.getByRole('button', { name: 'Show answer' }).click();
    await page.getByRole('button', { name: 'Know it' }).click();
  }
  expect([...fronts].sort()).toEqual([
    'Placeholder card 1, front.',
    'Placeholder card 2, front.',
    'Placeholder card 3, front.',
  ]);
  await expect(page.getByText("That's every card for now.")).toBeVisible();
});

test('Learn mode brings back what you miss until you know every card', async ({ page }) => {
  const deck: Record<string, { back: string; blank?: string }> = {
    'Placeholder card 1, front.': { back: "Placeholder card 1, back. Christian's reviewed card text replaces this." },
    'Placeholder card 2, front.': { back: 'Placeholder card 2, back.', blank: 'card 2' },
    'Placeholder card 3, front.': { back: 'Placeholder card 3, back.' },
  };
  await page.goto('/learn/study-skills');
  await page.getByRole('link', { name: "learn this lesson's cards in learn mode" }).click();
  await expect(page).toHaveURL(/\/learn\/study-skills\/learn-mode$/);
  await expect(page.getByText('recalled today 0 of 3')).toBeVisible();

  const steps: string[] = [];
  let missedOnce = false;
  let typoOnce = false;
  for (let turn = 0; turn < 20; turn++) {
    if (await page.getByText('You know all 3 cards.').isVisible()) break;
    const step = (await page.getByTestId('learn-step').textContent())!;
    const card = deck[(await page.getByTestId('learn-prompt').textContent())!]!;
    steps.push(step);

    if (step === 'New card') {
      // By keyboard: the answer, then the next card.
      await page.getByRole('button', { name: 'Show answer' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByText(card.back)).toBeVisible();
      await page.getByRole('button', { name: 'Next card' }).focus();
      await page.keyboard.press('Enter');
    } else if (step === 'Choose the answer') {
      const answers = await page.getByRole('list', { name: 'Answers' }).getByRole('button').allTextContents();
      expect(answers).toContain(card.back);
      const pick = missedOnce ? card.back : answers.find((a) => a !== card.back)!;
      await page.getByRole('button', { name: pick, exact: true }).click();
      await expect(page.getByText(missedOnce ? 'Correct.' : 'Not quite.')).toBeVisible();
      if (!missedOnce) await expect(page.getByText('The answer', { exact: true })).toBeVisible();
      missedOnce = true;
      await page.getByRole('button', { name: 'Continue' }).click();
    } else if (step === 'Fill in the blank') {
      await expect(page.getByText('Placeholder ______blank, back.')).toBeVisible();
      await page.getByLabel('The missing words').fill(card.blank!);
      await page.keyboard.press('Enter');
      await expect(page.getByText('Correct.')).toBeVisible();
      await page.getByRole('button', { name: 'Continue' }).click();
    } else {
      expect(step).toBe('Type the answer');
      // The first typed answer has a typo, and the student counts it as right.
      await page.getByLabel('Your answer').fill(typoOnce ? card.back.toUpperCase() : `${card.back}x`);
      await page.keyboard.press('Enter');
      if (typoOnce) await expect(page.getByText('Correct.')).toBeVisible();
      else {
        await expect(page.getByText('Not quite.')).toBeVisible();
        await page.getByRole('button', { name: 'I was right' }).click();
        await expect(page.getByText('Counted as right.')).toBeVisible();
      }
      typoOnce = true;
      await page.getByRole('button', { name: 'Continue' }).click();
    }
  }

  await expect(page.getByText('You know all 3 cards.')).toBeVisible();
  expect(steps.filter((s) => s === 'New card')).toHaveLength(3);
  expect(steps.filter((s) => s === 'Choose the answer')).toHaveLength(4);
  expect(steps).toContain('Fill in the blank');
  expect(steps.filter((s) => s === 'Type the answer')).toHaveLength(2);

  await page.getByRole('button', { name: 'Start again' }).click();
  await expect(page.getByText('recalled today 0 of 3')).toBeVisible();
});

test('Matching pairs terms with meanings by keyboard, counting misses', async ({ page }) => {
  await page.goto('/learn/study-skills');
  await page.getByRole('link', { name: "match this lesson's terms and meanings" }).click();
  await expect(page).toHaveURL(/\/learn\/study-skills\/matching$/);
  await expect(page.getByText('Matched 0 of 3 · Misses: 0')).toBeVisible();

  const terms = page.getByRole('region', { name: 'Terms' });
  const meanings = page.getByRole('region', { name: 'Meanings' });

  // A wrong pair, by keyboard.
  await terms.getByRole('button', { name: 'Placeholder card 1, front.' }).focus();
  await page.keyboard.press('Enter');
  await expect(terms.getByRole('button', { name: /Placeholder card 1, front\./ })).toHaveAttribute('aria-pressed', 'true');
  await meanings.getByRole('button', { name: 'Placeholder card 2, back.' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Not a match. Try again.')).toBeVisible();
  await expect(page.getByText('Matched 0 of 3 · Misses: 1')).toBeVisible();

  // A right pair by keyboard: the button just used keeps focus once it is matched.
  await terms.getByRole('button', { name: 'Placeholder card 1, front.' }).focus();
  await page.keyboard.press('Enter');
  const meaningOne = meanings.getByRole('button', { name: /^Placeholder card 1, back\./ });
  await meaningOne.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Matched: Placeholder card 1, front.')).toBeVisible();
  await expect(meaningOne).toBeFocused();
  await expect(meaningOne).toHaveAttribute('aria-disabled', 'true');
  // Pressing a matched item again changes nothing.
  await page.keyboard.press('Enter');
  await expect(page.getByText('Matched 1 of 3 · Misses: 1')).toBeVisible();

  // Right pairs by tap, starting from either side.
  await meanings.getByRole('button', { name: 'Placeholder card 2, back.' }).click();
  await terms.getByRole('button', { name: 'Placeholder card 2, front.' }).click();
  await terms.getByRole('button', { name: 'Placeholder card 3, front.' }).click();
  await meanings.getByRole('button', { name: 'Placeholder card 3, back.' }).click();

  await expect(page.getByText('All 3 matched.')).toBeVisible();
  await expect(page.getByText('Matched 3 of 3 · Misses: 1')).toBeVisible();
  const finished = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(finished.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  await expect(terms.getByRole('button', { name: /Matched$/ })).toHaveCount(3);
  await expect(terms.getByRole('button', { disabled: true })).toHaveCount(3);

  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByText('Matched 0 of 3 · Misses: 0')).toBeVisible();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the lesson shows every sentence once and no stepper controls', async ({ page }) => {
    await page.goto('/learn/study-skills');
    await expect(page.getByText('sentence 1 of')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'next sentence' })).toHaveCount(0);
    const items = page.locator('ol > li');
    const texts = await items.allTextContents();
    expect(texts.length).toBeGreaterThan(1);
    expect(new Set(texts).size).toBe(texts.length);
  });

  test('the cards page lists every card with its answer and no controls', async ({ page }) => {
    await page.goto('/learn/study-skills/cards');
    await expect(page.getByRole('button')).toHaveCount(0);
    expect(await page.locator('dl dt').count()).toBe(3);
    expect(await page.locator('dl dd').count()).toBe(3);
  });

  test('Learn mode says it needs JavaScript and points to the cards', async ({ page }) => {
    await page.goto('/learn/study-skills/learn-mode');
    await expect(page.getByRole('button')).toHaveCount(0);
    // Playwright's text matching skips <noscript>, so these use CSS.
    await expect(page.locator('noscript p')).toHaveText(
      'learn mode needs JavaScript. you can read every card and its answer on the cards page.',
    );
    await page.locator('noscript a[href="/learn/study-skills/cards"]').click();
    await expect(page).toHaveURL(/\/learn\/study-skills\/cards$/);
  });

  test('Matching says it needs JavaScript and points to the cards', async ({ page }) => {
    await page.goto('/learn/study-skills/matching');
    await expect(page.getByRole('button')).toHaveCount(0);
    // Playwright's text matching skips <noscript>, so these use CSS.
    await expect(page.locator('noscript p')).toHaveText(
      'matching needs JavaScript. you can read every card and its answer on the cards page.',
    );
    await page.locator('noscript a[href="/learn/study-skills/cards"]').click();
    await expect(page).toHaveURL(/\/learn\/study-skills\/cards$/);
  });

  test('home page sections are there at once, with nothing waiting to fade in', async ({ page }) => {
    await page.goto('/');
    for (const section of await page.locator('[data-reveal-section]').all()) {
      expect(await section.evaluate((el) => [el.getAttribute('data-reveal'), getComputedStyle(el).opacity])).toEqual([
        null,
        '1',
      ]);
    }
  });

  test('"ways to study" is the vial platter: all eleven vials are built and the front one shows without scripts', async ({
    page,
  }) => {
    await page.goto('/');
    const platter = page.locator('#ways-to-study');
    await expect(platter.locator('[data-platter-vial]')).toHaveCount(11);
    await platter.scrollIntoViewIfNeeded();
    await expect(platter.getByRole('heading', { level: 2, name: 'one lesson, multiple ways to study' })).toBeVisible();
    await expect(platter.locator('[data-platter-vial][data-active]')).toBeVisible();
  });
});

test('keyboard focus is visible', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    return getComputedStyle(el).outlineStyle;
  });
  expect(outline).not.toBe('none');
});

test('home page has a launch-updates signup that works by keyboard', async ({ page }) => {
  await page.goto('/');
  const signup = page.locator('#signup');
  await expect(signup.getByRole('heading', { name: 'coming soon', exact: true })).toBeVisible();
  const form = page.getByTestId('soon-form');
  if ((await form.count()) === 0) {
    // Before the Kit form exists: a link to Kit's landing page, or the pending line when there is none.
    if (await page.getByTestId('soon-landing').count()) await expect(page.getByTestId('soon-landing')).toBeVisible();
    else await expect(page.getByTestId('soon-pending')).toBeVisible();
    return;
  }
  const email = form.getByLabel('Email address');
  await expect(email).toHaveAttribute('type', 'email');
  await expect(email).toHaveAttribute('required', '');
  await email.focus();
  await page.keyboard.press('Tab');
  await expect(form.getByRole('button', { name: 'join the list', exact: true })).toBeFocused();
});

test.describe('theme switch', () => {
  const pageBackground = (page: import('@playwright/test').Page) =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const charcoal = 'rgb(28, 25, 23)'; // #1C1917, brand v1.0 (D-55)
  const ivory = 'rgb(249, 245, 239)';

  test('Light, Dark and Follow device change the palette and are remembered', async ({ page }, testInfo) => {
    const deviceIsDark = testInfo.project.use.colorScheme === 'dark';
    // Not the home page: since the home boards (2026-11-24) its Light ground is one even Linen-and-Mocha beige rather than
    // the Ivory page colour, so the palette check starts on a page that still uses the plain page colour.
    await page.goto('/privacy');
    await openFooterLinks(page);
    const picker = page.getByRole('group', { name: 'Theme' });
    await expect(picker.getByRole('radio', { name: 'Follow device' })).toBeChecked();
    expect(await pageBackground(page)).toBe(deviceIsDark ? charcoal : ivory);

    await picker.getByRole('radio', { name: 'Dark' }).check();
    expect(await pageBackground(page)).toBe(charcoal);

    // The pick carries over to other pages and survives a reload.
    await page.goto('/privacy');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await openFooterLinks(page);
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(await pageBackground(page)).toBe(charcoal);

    await page.getByRole('radio', { name: 'Light' }).check();
    expect(await pageBackground(page)).toBe(ivory);
    // The footer slider's thumb eases over a short moment; check contrast once it has settled.
    await page.waitForFunction(() => document.querySelector('footer')!.getAnimations({ subtree: true }).every((a) => a.playState !== 'running'));
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    await page.getByRole('radio', { name: 'Follow device' }).check();
    await page.reload();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    expect(await pageBackground(page)).toBe(deviceIsDark ? charcoal : ivory);
  });

  test('can be used with the keyboard', async ({ page }) => {
    await page.goto('/');
    await openFooterLinks(page);
    const followDevice = page.getByRole('radio', { name: 'Follow device' });
    await followDevice.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('marketing look (D-41)', () => {
  test('the home hero: logo, motto, a serif headline (two lines on phone and one on larger screens) with a copper accent, the start link (P5)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const height = page.viewportSize()!.height;
    const headline = page.getByRole('heading', { level: 1 });
    await expect(headline).toHaveText('nursing school made simpler.');
    await expect(page.getByText('Short, clear lessons')).toHaveCount(0);
    const hero = page.locator('.scene-hero');
    await expect(hero.getByText('by nursing students, for nursing students')).toBeVisible();
    // The call to action follows the draft gate: this build may show drafts, so it is a copper link to the open sample
    // lesson. (The live build's closed, "coming soon" button is checked in tests/unit/home-sections.test.ts.)
    const button = hero.getByTestId('hero-start');
    await expect(button).toHaveAttribute('href', '/learn/study-skills');
    await expect(button).toHaveText(/start studying for free/);
    await expect(button).toHaveClass(/copper-button/);
    // The old quiet join link and play button went away with the old hero; the explore row and the Ko-fi card remain.
    await expect(page.getByTestId('hero-join')).toHaveCount(0);
    await expect(hero.getByTestId('hero-play')).toHaveCount(0);
    await expect(hero.locator('.glass-button')).toHaveCount(0);
    await expect(hero.locator('.logo')).toHaveCount(0);
    await expect(page.locator('.home-board-header .logo')).toHaveCount(1);
    for (const element of [headline, button]) {
      const box = (await element.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(height);
    }
    // The 390 board wraps into two lines; the wide board fits the headline on one.
    const fit = await headline.evaluate((el) => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        lines: box.height / parseFloat(style.lineHeight),
        clipped: el.scrollWidth > el.clientWidth + 1,
        inside: box.left >= 0 && box.right <= window.innerWidth,
      };
    });
    expect(Math.round(fit.lines)).toBe(page.viewportSize()!.width < 640 ? 2 : 1);
    expect(fit.clipped).toBe(false);
    expect(fit.inside).toBe(true);
    expect(await headline.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Bodoni Moda/);
    // "simpler." is copper (Copper Deep in Daytime), not just heavier: its colour differs from the headline's.
    const colours = await headline.evaluate((el) => ({ own: getComputedStyle(el).color, accent: getComputedStyle(el.querySelector('.hero-accent')!).color }));
    expect(colours.accent).not.toBe(colours.own);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('the logo is the brand v1.0 artwork in the palette\'s color, and the motto is in the footer (D-55)', async ({
    page,
  }) => {
    const shown = (scope: import('@playwright/test').Locator) =>
      scope.locator('.logo img').evaluateAll((imgs) =>
        imgs
          .filter((img) => img.getClientRects().length > 0)
          .map((img) => ({ src: (img as HTMLImageElement).currentSrc, alt: img.getAttribute('alt') })),
      );
    await page.goto('/');
    const hero = page.locator('.home-board-header .home-brand');
    await openFooterLinks(page);
    await page.getByRole('radio', { name: 'Light' }).check();
    // The Home header renders the official full logo in the selected palette at each board width.
    const heroWide = page.viewportSize()!.width >= 640;
    const heroFile = (palette: 'light' | 'dark') =>
      new RegExp(`\\/brand\\/v1\\/logo-full-${palette}-\\d+\\.png$`);
    let images = await shown(hero);
    expect(images).toHaveLength(1);
    expect(images[0]!.src).toMatch(heroFile('light'));
    expect(images[0]!.alt).toBe('');
    expect(await hero.locator('.logo img').first().evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const width = (await hero.locator('.logo:visible').boundingBox())!.width;
    const font = await page.locator('html').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(width).toBeCloseTo(font * (heroWide ? 10.25 : 7.5), 0);

    await page.getByRole('radio', { name: 'Dark' }).check();
    images = await shown(hero);
    expect(images).toHaveLength(1);
    expect(images[0]!.src).toMatch(heroFile('dark'));

    await expect(page.locator('footer').getByText('by nursing students, for nursing students.')).toBeVisible();
    await expect(page.locator('link[rel="icon"][sizes="32x32"]')).toHaveAttribute('href', '/brand/v1/icon-32.png');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/brand/v1/icon-180.png');
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');

    // Other pages: the logo in the header, named by its link. The full logo where it fits (640px and wider), the
    // emblem on phones, and the header never wider than the screen.
    await page.goto('/support');
    const home = page.getByRole('link', { name: 'cueory home' });
    await expect(home).toBeVisible();
    const header = await shown(home);
    expect(header).toHaveLength(1);
    const wide = page.viewportSize()!.width >= 640;
    expect(header[0]!.src).toMatch(wide ? /\/brand\/v1\/logo-full-dark-\d+\.png$/ : /\/brand\/v1\/emblem-dark-\d+\.png$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const account = (await page.getByRole('button', { name: /account/i }).first().boundingBox())!;
    expect(account.x + account.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });

  test('canonical and Open Graph URLs match the public extensionless routes', async ({ page }) => {
    // Check nested generated lesson pages as well as root and top-level static HTML files.
    for (const route of ['/', '/privacy', '/support', '/learn', '/learn/study-skills', '/learn/study-skills/cards']) {
      await page.goto(route);
      const expected = new URL(route, 'https://cueory.app').href;
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', expected);
      await expect(page.locator('head meta[property="og:url"]')).toHaveAttribute('content', expected);
    }
  });
  test('Open Graph and Twitter previews use the same page identity', async ({ page }) => {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      for (const [route, status] of [['/', 200], ['/about', 200], ['/support', 200], ['/social-preview-page-does-not-exist', 404]] as const) {
        // The second pass visits the same pages again. WebKit then revalidates them and reports the conditional
        // answer's 304 as the navigation's status (webkit-desktop: "Expected: 200, Received: 304"), though the page is
        // the same. A different query makes each visit a fresh fetch, so the 200 or 404 is the page's own answer.
        const response = await page.goto(route + (colorScheme === 'dark' ? '?scheme=dark' : ''));
        expect(response?.status()).toBe(status);
        const title = await page.title();
        const description = await page.locator('head meta[name="description"]').getAttribute('content');
        const canonical = await page.locator('head link[rel="canonical"]').getAttribute('href');
        const image = 'https://cueory.app/share/study-ivory.png';
        expect(description).toBeTruthy();
        expect(canonical).toBeTruthy();
        for (const [property, content] of [
          ['og:type', 'website'],
          ['og:title', title],
          ['og:description', description],
          ['og:url', canonical],
          ['og:image', image],
        ]) {
          const tag = page.locator(`head meta[property="${property}"]`);
          await expect(tag).toHaveCount(1);
          await expect(tag).toHaveAttribute('content', content!);
        }
        for (const [name, content] of [
          ['twitter:card', 'summary_large_image'],
          ['twitter:title', title],
          ['twitter:description', description],
          ['twitter:image', image],
        ]) {
          const tag = page.locator(`head meta[name="${name}"]`);
          await expect(tag).toHaveCount(1);
          await expect(tag).toHaveAttribute('content', content!);
        }
      }
    }
  });

  test('the copper call to action is an opaque copper gradient with Charcoal ink, and its text stays readable', async ({ page }) => {
    await page.goto('/');
    const button = page.locator('.scene-hero').getByTestId('hero-start');
    const look = await button.evaluate((el) => {
      const style = getComputedStyle(el);
      return { image: style.backgroundImage, ink: style.color, opacity: style.opacity };
    });
    // One shared class (.copper-button): the copper gradient, the Charcoal ink and no opacity at all.
    expect(look.image).toContain('linear-gradient(');
    expect(look.image).toContain('rgb(184, 115, 72)');
    expect(look.ink).toBe('rgb(28, 25, 23)');
    expect(look.opacity).toBe('1');
    const results = await new AxeBuilder({ page }).include('#hero-heading ~ *').withRules(['color-contrast']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('the serif comes from our own site and is ready once the page has loaded', async ({ page }) => {
    const fonts: string[] = [];
    page.on('request', (r) => r.resourceType() === 'font' && fonts.push(r.url()));
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.fonts.check('500 44px "Bodoni Moda"'))).toBe(true);
    expect(fonts.length).toBeGreaterThan(0);
    for (const url of fonts) expect(new URL(url).origin).toBe(new URL(page.url()).origin);
  });

  test('nothing on the home page jumps while it loads', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    // Only Chromium measures layout shift today; elsewhere the count would be an empty zero, so say so instead.
    const measured = await page.evaluate(() => PerformanceObserver.supportedEntryTypes.includes('layout-shift'));
    test.skip(!measured, 'this browser does not report layout-shift entries (Chromium runs it on every pull request)');
    await page.evaluate(() => document.fonts.ready);
    const shift = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
              if (!entry.hadRecentInput) total += entry.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => resolve(total), 300);
        }),
    );
    expect(shift).toBeLessThan(0.02);
  });

  test('sections below the first screen fade in with a small rise the first time they come into view (D-62)', async ({
    page,
  }) => {
    await page.goto('/');
    const sections = page.locator('[data-reveal-section]');
    // Home v3: the games row and the coming-soon panel fade in; the vial platter and the social row do not wait.
    await expect(sections).toHaveCount(2);
    expect(await sections.evaluateAll((items) => items.map((item) => item.closest('section')?.id))).toEqual([
      'daily-games', 'signup',
    ]);
    const all = [0, 1];
    const lower = 1;
    const look = (index: number) =>
      sections.nth(index).evaluate((el) => [el.getAttribute('data-reveal'), getComputedStyle(el).opacity, getComputedStyle(el).translate]);
    // The ones that start below the first screen wait, lowered and clear. The Home v3 hero is compact, so on a tall
    // tablet screen (820 x 1180) the first games row already begins inside the first screen and is simply there, never waiting.
    const belowFirstScreen = await sections.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top >= window.innerHeight));
    expect(belowFirstScreen[lower]).toBe(true);
    for (const index of all) {
      expect(await look(index)).toEqual(belowFirstScreen[index] ? ['waiting', '0', '0px 10px'] : [null, '1', 'none']);
    }
    await page.locator('#signup').scrollIntoViewIfNeeded();
    await expect.poll(() => look(lower)).toEqual(['shown', '1', 'none']);
    // Once only: scrolling away and back changes nothing.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('#signup').scrollIntoViewIfNeeded();
    expect(await look(lower)).toEqual(['shown', '1', 'none']);

    // With reduced motion nothing waits or moves.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    for (const index of all) expect(await look(index)).toEqual([null, '1', 'none']);
  });

  test('study screens stay plain, with no texture behind lesson text', async ({ page }) => {
    await page.goto('/learn/study-skills');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).toBe('none');
    await page.goto('/privacy');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).not.toBe('none');
  });
});

test.describe('silk scenes down the home page (D-53)', () => {
  test('the scenes in order, each its own layer behind its section, with no section numbers or decorative lines', async ({
    page,
  }) => {
    await page.goto('/');
    const scenes = await page.locator('.scene').evaluateAll((sections) =>
      sections.map((section) => {
        const layer = getComputedStyle(section, '::before');
        return {
          kind: [...section.classList].find((name) => name.startsWith('scene-')),
          drawn: layer.backgroundImage !== 'none',
          behind: layer.zIndex,
          fades: (layer.maskImage || layer.getPropertyValue('-webkit-mask-image')).includes('linear-gradient'),
        };
      }),
    );
    // Home v3: the hero, daily games and the vial platter are silk scenes; the coming-soon panel and the social row sit on the page itself.
    expect(scenes.map((scene) => scene.kind)).toEqual([
      'scene-hero', 'scene-play', 'scene-tint',
    ]);
    for (const scene of scenes) expect(scene).toMatchObject({ drawn: true, behind: '-20', fades: true });

    // Calm, not a template (D-60): no numbered labels, no figure caption, no rhythm line.
    await expect(page.locator('[data-section-label], [data-rhythm]')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(/fig\. |\b0\d — /);
  });

  test('every fade between scenes lies in empty space, never over words', async ({ page }) => {
    // Measured where everything has settled: with reduced motion no section waits, lowered, to fade in (D-62).
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const covered = await page.evaluate(() => {
      // Each scene fades in over the space above it and the last one fades out at its bottom: measure those bands.
      const length = (section: Element, name: string) => {
        const probe = document.createElement('div');
        probe.style.blockSize = `var(${name})`;
        section.append(probe);
        const size = probe.getBoundingClientRect().height;
        probe.remove();
        return size;
      };
      const bands: Array<{ scene: string; edge: 'top' | 'bottom'; from: number; to: number }> = [];
      for (const section of document.querySelectorAll('.scene')) {
        const box = section.getBoundingClientRect();
        const top = length(section, '--scene-fade-top');
        const bottom = length(section, '--scene-fade-bottom');
        const scene = [...section.classList].find((name) => name.startsWith('scene-'))!;
        if (top > 0) bands.push({ scene, edge: 'top', from: box.top - top, to: box.top });
        if (bottom > 0) bands.push({ scene, edge: 'bottom', from: box.bottom - bottom, to: box.bottom });
      }
      const hits: string[] = [];
      // Text that is clipped away (the keyboard-only "play today's" button and the screen-reader date line, which the
      // boards draw nothing for) is not on screen, so no word of it can sit in a fade. The focused button is checked below.
      const drawn = (node: Node) => {
        for (let el = node.parentElement; el && el.tagName !== 'MAIN'; el = el.parentElement) {
          if (getComputedStyle(el).clipPath === 'inset(50%)') return false;
        }
        return true;
      };
      const walker = document.createTreeWalker(document.querySelector('main')!, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim() || !drawn(node)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width === 0 || rect.height === 0) continue;
          if (bands.some(({ from, to }) => rect.bottom > from && rect.top < to)) hits.push(node.textContent.trim());
        }
      }
      return { bands, hits };
    });
    expect(covered.bands.map(({ scene, edge }) => [scene, edge])).toEqual([
      ['scene-play', 'top'], ['scene-tint', 'top'],
    ]); // Two top fades between the three scenes (Home v3: the coming-soon panel is not a scene).
    expect(covered.hits).toEqual([]);

    // The one drawn exception: Tab reveals the "play today's" button over the dots' row, which lies in the fade above the
    // next scene. Its words must then sit on the button's own solid page-colour fill, never on the fading silk.
    await page.getByTestId('games-link').focus();
    const revealed = await page.getByTestId('games-link').evaluate((el) => {
      const style = getComputedStyle(el);
      return { clip: style.clipPath, fill: style.backgroundColor, order: style.zIndex };
    });
    expect(revealed.clip).toBe('none');
    expect(revealed.fill).toMatch(/^rgb\(\d+, \d+, \d+\)$/); // fully opaque (no alpha channel)
    expect(Number(revealed.order)).toBeGreaterThan(0);
  });
});

export function homeMenuOpener(page: Page) {
  const name = page.viewportSize()!.width >= 640 ? 'search the site' : 'open site menu';
  return page.getByRole('button', { name, exact: true });
}

test.describe('☰ side panel and account corner (D-46)', () => {
  for (const path of ['/', '/privacy', '/learn/study-skills']) {
    test(`☰ opens the side panel on ${path}, keeps focus inside, and Escape brings focus back`, async ({ page }) => {
      await page.goto(path);
      const open = path === '/' ? homeMenuOpener(page) : page.getByRole('button', { name: 'open site menu', exact: true });
      await expect(open).toHaveAttribute('aria-expanded', 'false');
      await open.click();
      const panel = page.getByTestId('site-menu');
      await expect(panel).toBeVisible();
      await expect(open).toHaveAttribute('aria-expanded', 'true');
      const initialFocus = path === '/' && page.viewportSize()!.width >= 640
        ? panel.getByRole('searchbox', { name: 'search the site' })
        : panel.getByRole('button', { name: 'close site menu' });
      await expect(initialFocus).toBeFocused();

      const nav = panel.getByRole('navigation', { name: 'site' });
      // The bar holds exactly study, anatomy lab (drafts builds only), games, support and about; the other pages,
      // legal pages included, are linked from the about page (checked in about.spec.ts).
      for (const name of ['study', 'games', 'support', 'about']) {
        await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
      }
      await expect(nav.getByRole('link')).toHaveCount(5); // the drafts build also shows the anatomy lab
      await expect(panel.getByRole('link', { name: 'privacy' })).toHaveCount(0);

      // Tab never leaves the panel while it is open.
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => document.activeElement?.closest('#site-menu') !== null)).toBe(true);
      }

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(open).toBeFocused();
      await expect(open).toHaveAttribute('aria-expanded', 'false');
    });
  }

  test('the current page is marked in the side panel by more than color', async ({ page }) => {
    await page.goto('/support');
    await page.getByRole('button', { name: 'open site menu', exact: true }).click();
    const current = page.getByTestId('site-menu').locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText('support');
    // A short line beside the link, drawn by ::before.
    expect(await current.evaluate((el) => getComputedStyle(el, '::before').content)).not.toBe('none');
  });

  test('the close button and a tap on the dimmed page close the side panel', async ({ page }) => {
    await page.goto('/');
    const open = homeMenuOpener(page);
    const panel = page.getByTestId('site-menu');
    await open.click();
    await panel.getByRole('button', { name: 'close site menu' }).click();
    await expect(panel).toBeHidden();
    await expect(open).toBeFocused();

    await open.click();
    await expect(panel).toBeVisible();
    const viewport = page.viewportSize()!;
    await page.mouse.click(viewport.width - 8, viewport.height / 2);
    await expect(panel).toBeHidden();
  });

  test('a side-panel row opens its page (the bar has no links to spots on the home page any more)', async ({ page }) => {
    await page.goto('/');
    await homeMenuOpener(page).click();
    const panel = page.getByTestId('site-menu');
    await expect(panel.locator('a[href*="#"]')).toHaveCount(0);
    await panel.getByRole('navigation', { name: 'site' }).getByRole('link', { name: 'about', exact: true }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('the account corner offers "create free account" and "sign in", both coming soon', async ({ page }) => {
    await page.goto('/');
    const account = page.locator('[data-account-toggle]');
    const menu = page.getByTestId('account-menu');
    await expect(menu).toBeHidden();
    await expect(account).toHaveAttribute('aria-label', 'sign in, open account menu');
    await account.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await expect(account).toHaveAttribute('aria-expanded', 'true');
    await expect(account).toHaveAttribute('aria-label', 'sign in, close account menu');
    await expect(menu.getByRole('link', { name: /create free account/ })).toHaveAttribute('href', '/#signup');
    await expect(menu.getByRole('link', { name: /sign in/ })).toHaveAttribute('href', '/#signup');
    await expect(menu.getByText('coming soon')).toHaveCount(2);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    // Hovering a row underlines it but never lightens it, so the "coming soon" note keeps the AA contrast that
    // tests/unit/tokens.test.ts checks on the panel glass (Codex review of #24). axe can't judge text on see-through
    // glass over silk, so this checks the hover layer directly.
    for (const name of [/create free account/, /sign in/]) {
      const link = menu.getByRole('link', { name });
      await link.hover();
      expect(await link.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
      expect(await link.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('underline');
    }
    await account.focus();

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(account).toBeFocused();
    await expect(account).toHaveAttribute('aria-label', 'sign in, open account menu');

    // A tap anywhere else closes it too.
    await account.click();
    await expect(menu).toBeVisible();
    await expect(account).toHaveAttribute('aria-label', 'sign in, close account menu');
    // The headline's top-left corner: on a phone the open account menu now covers the rest of the (higher) headline.
    await page.getByRole('heading', { level: 1 }).click({ position: { x: 5, y: 5 } });
    await expect(menu).toBeHidden();
    await expect(account).toHaveAttribute('aria-label', 'sign in, open account menu');
  });

  test('corner buttons are at least 44 by 44 px', async ({ page }) => {
    for (const path of ['/', '/learn/study-skills']) {
      await page.goto(path);
      // The Home v3 header opens the menu from search on screens 640 px and wider (see homeMenuOpener).
      const menuOpener = path === '/' ? homeMenuOpener(page).first() : page.getByRole('button', { name: 'open site menu', exact: true });
      for (const opener of [menuOpener, page.getByRole('button', { name: path === '/' ? 'sign in, open account menu' : 'open account menu', exact: true })]) {
        const box = (await opener.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
});

test.describe('site search in the ☰ panel (D-49)', () => {
  test('finds pages as you type, works by keyboard, and goes to the result', async ({ page }) => {
    await page.goto('/');
    await homeMenuOpener(page).click();
    const panel = page.getByTestId('site-menu');
    const field = panel.getByRole('searchbox', { name: 'search the site' });
    await expect(field).toHaveAttribute('placeholder', 'search');

    await field.fill('support');
    const results = panel.getByRole('list', { name: 'search results' });
    const support = results.getByRole('link', { name: /^support/ });
    await expect(support).toBeVisible();
    await expect(support).toHaveAttribute('href', '/support');
    await expect(panel.locator('#site-search-status')).toHaveText(/^(1 result|\d+ results|\d+ of \d+ results)$/);
    // The matched word is marked by weight, not color alone.
    const mark = results.locator('mark').first();
    await expect(mark).toBeVisible();
    expect(Number(await mark.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThan(500);

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    // Down from the field goes to the first result; Up goes back.
    await field.press('ArrowDown');
    await expect(results.getByRole('link').first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(field).toBeFocused();

    await support.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/support$/);
  });

  test('a new search while a result has keyboard focus keeps focus in the panel', async ({ page }) => {
    await page.goto('/');
    await homeMenuOpener(page).click();
    const panel = page.getByTestId('site-menu');
    const field = panel.getByRole('searchbox', { name: 'search the site' });
    const results = panel.getByRole('list', { name: 'search results' });
    const search = (term: string) =>
      field.evaluate((el, value) => {
        const input = el as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, term);

    await field.fill('card');
    await expect(results.getByRole('link').nth(1)).toBeVisible();
    // Focus moves onto a result before the next search's results arrive (Codex review on #27).
    await results.getByRole('link').nth(1).focus();
    await search('support');
    // Confirm the latest indexed result arrived without depending on the ranking order.
    await expect(results.getByRole('link', { name: /^support/ })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest('[aria-label="search results"]') !== null))
      .toBe(true);

    await search('zzqxv');
    await expect(panel.locator('#site-search-status')).toHaveText('no results for “zzqxv”');
    await expect(field).toBeFocused();
  });

  test('says "no results" plainly, and clearing the field clears the results', async ({ page }) => {
    await page.goto('/learn/study-skills');
    await page.getByRole('button', { name: 'open site menu', exact: true }).click();
    const panel = page.getByTestId('site-menu');
    const field = panel.getByRole('searchbox', { name: 'search the site' });
    const status = panel.locator('#site-search-status');

    await field.fill('zzqxv');
    await expect(status).toHaveText('no results for “zzqxv”');
    await expect(panel.getByRole('list', { name: 'search results' })).toBeHidden();

    await field.fill('placeholder card');
    await expect(panel.getByRole('list', { name: 'search results' }).getByRole('link').first()).toBeVisible();
    await field.fill('');
    await expect(status).toBeHidden();
    await expect(panel.getByRole('list', { name: 'search results' })).toBeHidden();
  });
});

test.describe('social links (D-54)', () => {
  test("the footer and the ☰ panel link to cueory's profiles in a new tab, only where an address is set", async ({
    page,
    browserName,
  }) => {
    const minimum = browserName === 'firefox' ? 44 - FIREFOX_ROUNDING_PX : 44;
    await page.goto('/privacy');
    await openFooterLinks(page);
    const footer = page.getByRole('contentinfo');
    const expected = Object.fromEntries(socials.filter((social) => social.href).map((social) => [social.id, social.href]));
    await expect(footer.locator('[data-social]')).toHaveCount(Object.keys(expected).length);
    for (const [id, href] of Object.entries(expected)) {
      const link = footer.locator(`[data-social="${id}"]`);
      await expect(link).toHaveAttribute('href', href);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      // The mark is drawn inline from our own page, never loaded from the platform.
      await expect(link.locator('svg path')).toHaveCount(1);
      const box = (await link.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(minimum);
      expect(box.height).toBeGreaterThanOrEqual(minimum);
    }
    await expect(footer.getByRole('link', { name: 'cueory on Instagram (opens in a new tab)' })).toBeVisible();

    await page.getByRole('button', { name: 'open site menu' }).click();
    await expect(page.getByTestId('site-menu').locator('[data-social]')).toHaveCount(Object.keys(expected).length);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

test.describe('without JavaScript, the corners', () => {
  test.use({ javaScriptEnabled: false });

  test('stay hidden but keep their space, so nothing moves', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('button', { name: 'open site menu', exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: 'open account menu', exact: true })).toBeHidden();
    // Without scripts the footer's extras panel is simply open (its chevron stays hidden), so its links are all there.
    await expect(page.getByRole('navigation', { name: 'more pages' }).getByRole('link', { name: 'support cueory' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'footer' }).getByRole('link', { name: 'privacy', exact: true })).toBeVisible();
  });
});

test.describe('organizer at 320 px', () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test('sorts by keyboard, number keys and tap; check returns wrong items to the tray', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
    // The lesson page links here; the test then opens the page itself, because the lesson's reader grows while it
    // loads and a tap during that shift can land beside the link.
    await page.goto('/learn/study-skills');
    await expect(page.getByRole('link', { name: 'sort ideas into groups with the organizer' })).toHaveAttribute(
      'href',
      '/learn/study-skills/organizer',
    );
    await page.goto('/learn/study-skills/organizer');
    await expect(page.getByTestId('organizer-sample-note')).toBeVisible();

    const board = page.getByTestId('organizer');
    const live = page.getByTestId('organizer-live');
    const item = (name: string) => board.getByRole('button', { name: new RegExp(`^${name}`) });
    const group = (name: string) => board.getByRole('button', { name });
    const axe = async () => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    };
    await axe();
    await expect(board.getByRole('button', { name: 'check' })).toBeDisabled();

    // Keyboard: pick with Enter, which moves focus to the first group, then place with Enter.
    await item('apple').focus();
    await page.keyboard.press('Enter');
    await expect(group('1. fruit')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(live).toHaveText('apple moved to fruit.');
    await expect(board.getByRole('list', { name: 'fruit' }).getByRole('button', { name: /^apple/ })).toBeFocused();

    // Number keys on an item: 2 is the second group. A wrong one on purpose: plum is fruit, not vegetable.
    await item('carrot').focus();
    await page.keyboard.press('2');
    await expect(live).toHaveText('carrot moved to vegetable.');
    await item('plum').focus();
    await page.keyboard.press('2');
    await expect(live).toHaveText('plum moved to vegetable.');

    // Tap: the item, then its group.
    await item('rice').click();
    await group('3. grain').click();
    await expect(live).toHaveText('rice moved to grain.');

    // Nothing is marked until check; the wrong one goes back to the tray, in words.
    await board.getByRole('button', { name: 'check' }).click();
    await expect(live).toHaveText('3 right, 1 back in the tray to try again.');
    await expect(board.getByRole('list', { name: 'tray' }).getByRole('button', { name: /^plum/ })).toContainText(
      'back in the tray to try again',
    );
    await expect(item('apple')).toContainText('✓ right');
    await expect(item('apple')).toHaveAttribute('aria-disabled', 'true');
    await axe();

    // Sort the rest by number keys, then check: the summary takes focus.
    for (const [name, key] of [['plum', '1'], ['pear', '1'], ['spinach', '2'], ['onion', '2'], ['oats', '3']] as const) {
      await item(name).focus();
      await page.keyboard.press(key);
    }
    await board.getByRole('button', { name: 'check' }).click();
    await expect(page.getByTestId('organizer-result')).toBeFocused();
    await expect(page.getByTestId('organizer-result')).toContainText('all 8 sorted in 2 tries.');
    await axe();

    await board.getByRole('button', { name: 'sort again' }).click();
    await expect(board.getByRole('list', { name: 'tray' }).getByRole('button')).toHaveCount(8);
    expect(errors).toEqual([]);
  });
});

test.describe('fill-in at 320 px', () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test('recalls by keyboard: right, a hint, almost, wrong, then a second round of the missed ones', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
    await page.goto('/learn/study-skills');
    await expect(page.getByRole('link', { name: 'recall the missing word with fill-in' })).toHaveAttribute(
      'href',
      '/learn/study-skills/fill-in',
    );
    await page.goto('/learn/study-skills/fill-in');
    await expect(page.getByTestId('fill-in-sample-note')).toBeVisible();

    const board = page.getByTestId('fill-in');
    // Switch to type mode to test typing and keyboard flow
    await board.getByRole('button', { name: 'type instead' }).click();
    const field = board.getByRole('textbox', { name: 'the missing word' });
    const next = board.getByRole('button', { name: 'next' });
    const axe = async () => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    };
    const answer = async (words: string) => {
      await field.fill(words);
      await field.press('Enter');
    };

    await expect(board.getByText('round 1 · item 1 of 4')).toBeVisible();
    // The answer is never shown in the sentence.
    await expect(board.getByText(/Bees make/)).not.toContainText('honey');
    await axe();

    // Right: focus moves to "next", and Enter moves on with focus back in the field.
    await answer('Honey.');
    await expect(board.getByText('right.', { exact: true })).toBeVisible();
    await expect(next).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(board.getByText('round 1 · item 2 of 4')).toBeVisible();
    await expect(field).toBeFocused();

    // A hint gives the first letter; a right answer after a hint comes back next round.
    await board.getByRole('button', { name: 'hint' }).click();
    await expect(board.getByText('starts with d.')).toBeVisible();
    await answer('days');
    await expect(board.getByText("right. you'll see this one again because you used a hint.")).toBeVisible();
    await next.click();

    // One letter off is "almost", and the field stays open; a wrong answer shows the word.
    await answer('pencl');
    await expect(board.getByText('almost. check the spelling.')).toBeVisible();
    await expect(field).toBeFocused();
    await answer('pen');
    await expect(board.getByText('the word was pencil.')).toBeVisible();
    await axe();
    await next.click();

    await answer('umbrella');
    await next.click();

    // Round 2 is only the hinted and the missed ones.
    await expect(board.getByText('round 2 · item 1 of 2')).toBeVisible();
    await answer('days');
    await next.click();
    await answer('pencil');
    await next.click();
    await expect(board.getByText('all 4 recalled in 2 rounds.')).toBeVisible();
    await axe();
    expect(errors).toEqual([]);
  });
});

test.describe('label it at 320 px', () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test('uncovers by keyboard and tap, marks each label, and covers only "still learning" again', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
    await page.goto('/learn/study-skills');
    await expect(page.getByRole('link', { name: "uncover a diagram's labels with label it" })).toHaveAttribute(
      'href',
      '/learn/study-skills/label-it',
    );
    await page.goto('/learn/study-skills/label-it');
    await expect(page.getByTestId('label-it-sample-note')).toBeVisible();

    const board = page.getByTestId('labelit');
    await expect(board).toBeVisible();
    const live = page.getByTestId('labelit-live');
    const status = page.getByTestId('labelit-status');
    const axe = async () => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    };

    // The drawing loads, with its credit, and nothing in the board names a covered label.
    await expect.poll(() => board.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(board).toContainText('drawing: cueory');
    await expect(board).not.toContainText(/roof|chimney|window|door/);
    await expect(status).toHaveText('4 covered · know it: 0 · still learning: 0');
    await expect(page.getByTestId('cover-1')).toHaveAccessibleName('label 1, covered');
    await axe();

    // Keyboard on the drawing: the cover keeps focus and says what it was.
    await page.getByTestId('cover-1').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('cover-1')).toHaveAccessibleName('label 1: roof');
    await expect(page.getByTestId('cover-1')).toBeFocused();
    await expect(live).toHaveText('label 1: roof.');

    // "uncover" in the list hands focus to that label's "know it".
    await board.getByRole('button', { name: 'uncover label 2' }).click();
    await expect(board.getByRole('group', { name: 'mark label 2' }).getByRole('button', { name: 'know it' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(live).toHaveText('chimney: know it. 3 left to mark.');

    // Tap: reveal all, then mark the rest; roof and door are still learning.
    await board.getByRole('button', { name: 'reveal all' }).click();
    for (const [n, mark] of [[1, 'still learning'], [3, 'know it'], [4, 'still learning']] as const) {
      await board.getByRole('group', { name: `mark label ${n}` }).getByRole('button', { name: mark }).click();
    }
    await axe();

    await board.getByRole('button', { name: 'study the 2 still learning' }).click();
    await expect(status).toHaveText('round 2 · 2 covered · know it: 2 · still learning: 0');
    await expect(page.getByTestId('cover-1')).toHaveAccessibleName('label 1, covered');
    await expect(page.getByTestId('cover-4')).toHaveAccessibleName('label 4, covered');
    await expect(page.getByTestId('cover-2')).toHaveAccessibleName('label 2: chimney');
    expect(errors).toEqual([]);
  });
});

test.describe('questions at 320 px', () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test('checks single and select-all answers, shows each choice in words with its rationale, and retries the missed', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
    await page.goto('/learn/study-skills');
    await expect(page.getByRole('link', { name: 'practice questions with rationales' })).toHaveAttribute(
      'href',
      '/learn/study-skills/questions',
    );
    await page.goto('/learn/study-skills/questions');
    await expect(page.getByTestId('questions-sample-note')).toBeVisible();

    const board = page.getByTestId('questions');
    const check = board.getByRole('button', { name: 'check' });
    const next = board.getByRole('button', { name: 'next question' });
    const axe = async () => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    };

    await expect(board.getByText('question 1 of 3')).toBeVisible();
    await expect(board).not.toContainText('Apples are fruit.');
    await expect(check).toBeDisabled();
    await axe();

    // A wrong single answer: the verdict, then every choice marked in words, with its rationale.
    await board.getByRole('radio', { name: 'a carrot' }).check();
    await check.click();
    await expect(board.getByText('not quite.', { exact: true }).first()).toBeVisible();
    await expect(board.getByRole('group', { name: 'Which of these is a fruit?' })).toContainText(
      "you picked this, but it's not right",
    );
    await expect(board).toContainText("this is right, and you didn't pick it");
    await expect(board).toContainText('Apples are fruit.');
    await expect(board).toContainText('Carrots are vegetables.');
    await axe();
    await next.click();

    // Select all that apply, by keyboard: Space ticks each box.
    await expect(board.getByText('question 2 of 3')).toBeVisible();
    await expect(board.getByText('select all that apply')).toBeVisible();
    await board.getByRole('checkbox', { name: 'Monday' }).focus();
    await page.keyboard.press('Space');
    await board.getByRole('checkbox', { name: 'Friday' }).focus();
    await page.keyboard.press('Space');
    await check.focus();
    await page.keyboard.press('Enter');
    await expect(board.getByText('right.', { exact: true }).first()).toBeVisible();
    await next.click();

    await board.getByRole('radio', { name: '60' }).check();
    await check.click();
    await next.click();

    await expect(board.getByText('right on 2 of 3.')).toBeVisible();
    await board.getByRole('button', { name: 'try the missed ones again' }).click();
    await expect(board.getByText('question 1 of 1')).toBeVisible();
    await expect(board.getByRole('radio', { name: 'an apple' })).not.toBeChecked();
    await axe();
    expect(errors).toEqual([]);
  });
});
