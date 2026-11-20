import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

type CarouselDiagnosticEntry = {
  phase: string;
  t: number;
  open: boolean | null;
  activeIndex: number;
  detail?: Record<string, boolean | number | string | null>;
};

/** Test-only WebKit lifecycle observation. It records IDs and event state, never DOM contents or user text. */
async function installCarouselDiagnostic(page: Page) {
  await page.addInitScript(() => {
    type Entry = {
      phase: string;
      t: number;
      open: boolean | null;
      activeIndex: number;
      detail?: Record<string, boolean | number | string | null>;
    };
    type ProbeWindow = Window & { __cueoryCarouselDiagnostic?: Entry[] };
    const state = window as ProbeWindow;
    const entries: Entry[] = [];
    state.__cueoryCarouselDiagnostic = entries;
    const identity = (node: EventTarget | null) => {
      const element = node instanceof Element ? node : null;
      return { tag: element?.tagName ?? null, id: element?.id ?? null };
    };
    const snapshot = () => {
      const dialog = document.querySelector<HTMLDialogElement>('[data-mode-preview]');
      const cards = [...document.querySelectorAll<HTMLElement>('[data-mode-card]')];
      return { dialog, activeIndex: cards.findIndex((card) => card.hasAttribute('data-active')) };
    };
    const note = (phase: string, detail?: Entry['detail']) => {
      const { dialog, activeIndex } = snapshot();
      entries.push({ phase, t: performance.now(), open: dialog?.open ?? null, activeIndex, detail });
    };

    let pointerDownOnOpener = false;
    document.addEventListener('pointerdown', (event) => {
      pointerDownOnOpener = event.target instanceof Element && !!event.target.closest('[data-mode-open]');
    }, true);

    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (type === 'click' && listener && this instanceof HTMLButtonElement && this.matches('[data-mode-open]') && typeof listener === 'function') {
        const button = this;
        const wrapped = function (this: EventTarget, event: Event) {
          const cards = [...document.querySelectorAll<HTMLElement>('[data-mode-card]')];
          const index = cards.findIndex((card) => card.contains(button));
          const before = snapshot();
          // Playwright's pointerdown reaches the track first, where the application resets `swiped` for a click.
          note('opener:entry', { index, activeAtEntry: before.activeIndex, swipedAtEntry: pointerDownOnOpener ? 'false-after-pointerdown' : 'not-observed', ...identity(button) });
          const result = listener.call(this, event);
          queueMicrotask(() => {
            const after = snapshot();
            const branch = after.dialog?.open ? 'preview' : before.activeIndex !== index && after.activeIndex === index ? 'rotate' : 'suppressed-or-unresolved';
            note('opener:outcome', { index, activeBefore: before.activeIndex, branch, ...identity(button) });
          });
          return result;
        };
        return originalAddEventListener.call(this, type, wrapped, options);
      }
      return originalAddEventListener.call(this, type, listener, options);
    };

    const originalShowModal = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function (...args) {
      note('showModal:enter', identity(this));
      try {
        const result = originalShowModal.apply(this, args);
        note('showModal:return', identity(this));
        return result;
      } catch (error) {
        note('showModal:throw', { ...identity(this), name: error instanceof Error ? error.name : 'non-error' });
        throw error;
      }
    };
    const originalClose = HTMLDialogElement.prototype.close;
    HTMLDialogElement.prototype.close = function (...args) {
      note('dialog.close:enter', identity(this));
      try {
        const result = originalClose.apply(this, args);
        note('dialog.close:return', identity(this));
        return result;
      } catch (error) {
        note('dialog.close:throw', { ...identity(this), name: error instanceof Error ? error.name : 'non-error' });
        throw error;
      }
    };
    const originalFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (...args) {
      note('focus', identity(this));
      return originalFocus.apply(this, args);
    };
    const originalAnimate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = originalAnimate.apply(this, args);
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

test.beforeEach(async ({ page }) => {
  // Prevent the one-time welcome panel from taking focus during a carousel test.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch {
      // Storage may be unavailable. The carousel must still use the plain links.
    }
  });
});

const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

for (const viewport of viewports) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`no showModal: ${viewport.name}, ${colorScheme}, links remain usable by keyboard and tap`, async ({ page }, testInfo) => {
      await page.addInitScript(() => {
        Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
          configurable: true,
          value: undefined,
        });
      });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/');

      const section = page.locator('#ways-to-study');
      await section.scrollIntoViewIfNeeded();
      await expect(section).not.toHaveAttribute('data-ring', '');
      await expect(section.locator('[data-modes-controls]')).toHaveClass(/invisible/);
      await expect(section.locator('[data-mode-open]:visible')).toHaveCount(0);

      const link = section.getByRole('link', { name: 'try the cards' });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', '/learn/study-skills/cards');
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      const audit = await new AxeBuilder({ page })
        .include('#ways-to-study')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(audit.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);

      // The track is keyboard-focusable in the plain carousel; the first available link follows it.
      await section.locator('[data-modes-track]').focus();
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      expect(await link.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
      // Navigation on a slow engine can take longer than an assertion's 5 s; wait for the navigation itself.
      await Promise.all([page.waitForURL(/\/learn\/study-skills\/cards\/?$/), page.keyboard.press('Enter')]);

      // Re-enter the fallback carousel and confirm pointer/touch navigation too.
      await page.goto('/');
      const again = page.locator('#ways-to-study').getByRole('link', { name: 'try the cards' });
      await expect(again).toBeVisible();
      await Promise.all([
        page.waitForURL(/\/learn\/study-skills\/cards\/?$/),
        testInfo.project.use.hasTouch ? again.tap() : again.click(),
      ]);
    });
  }
}

test('with native preview support, the original ring and its modal still work', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.name));
  await installCarouselDiagnostic(page);
  try {
    await page.goto('/');
    const section = page.locator('#ways-to-study');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toHaveAttribute('data-ring', '');
    await expect(section.locator('[data-modes-controls]')).not.toHaveClass(/invisible/);
    const opening = section.locator('#mode-video [data-mode-open]');
    await expect(opening).toBeVisible();
    // Scrolling this section may let the carousel's ordinary auto-advance select a side card.
    // Use its public keyboard control to take over and select Video before verifying one click opens it.
    await section.locator('[data-modes-track]').focus();
    await page.keyboard.press('Home');
    await expect(section.locator('#mode-video')).toHaveAttribute('data-active', '');
    await opening.click();
    await expect(page.getByRole('dialog', { name: 'video' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#mode-preview')).toBeHidden();
  } finally {
    const entries = await page.evaluate(() => {
      const state = window as Window & { __cueoryCarouselDiagnostic?: CarouselDiagnosticEntry[] };
      return state.__cueoryCarouselDiagnostic ?? [];
    }).catch(() => []);
    const payload = JSON.stringify({ entries, pageErrors }, null, 2);
    await testInfo.attach('carousel-webkit-event-path', { body: payload, contentType: 'application/json' });
    if (process.env.CUEORY_CAROUSEL_DIAG_PATH) await writeFile(`${process.env.CUEORY_CAROUSEL_DIAG_PATH}.fallback.json`, payload);
  }
});

test('without Web Animations, the ordinary study links stay visible', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: undefined });
  });
  await page.goto('/');
  const section = page.locator('#ways-to-study');
  await expect(section).not.toHaveAttribute('data-ring', '');
  await expect(section.getByRole('link', { name: 'try the cards' })).toBeVisible();
});
