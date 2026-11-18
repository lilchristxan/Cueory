import { expect, test, type Page } from '@playwright/test';

// Finished-game cards and their share actions for all four daily games, at 320px wide with 32px root text, in Light
// and Evening. Each card mirrors the shape its game sends (src/islands/PulseGame.tsx, CuewordGame.tsx, SuturePathBoard.tsx
// and sudokuResultCard in gameresults.ts), with made-up sample values. The card never scrolls sideways, nothing on it
// leaves the screen, and its close button stays whole and on screen while the card scrolls and after share or copy.

const cards = [
  {
    game: 'pulse', name: 'pillo', date: 'nov 11, 2026', result: '4 / 6', shareResult: '4 / 6 · hard mode',
    summary: 'you found today\'s word.', stats: [{ label: 'guesses', value: '4' }],
    nextMessage: 'next word in 9 hours and 41 minutes.', path: '/play/pillo',
  },
  {
    game: 'triage', name: 'sudoku', date: 'nov 11, 2026', level: 'hard', result: 'solved', shareResult: 'hard · 12:48 · 2 errors',
    summary: 'hard completed in 12:48 with 2 errors.', stats: [{ label: 'time', value: '12:48' }, { label: 'errors', value: '2' }],
    path: '/play/sudoku',
  },
  {
    game: 'cueword', name: 'crossword', date: 'nov 11, 2026', level: 'medium', result: 'solved', shareResult: 'medium · solved in 6:05 with help',
    summary: 'you completed today\'s crossword with help.',
    stats: [{ label: 'level', value: 'medium' }, { label: 'time', value: '6:05' }, { label: 'help', value: 'used' }],
    path: '/play/crossword',
  },
  {
    game: 'suture', name: 'word path', date: 'nov 11, 2026', result: '8 / 8', shareResult: '8 of 8 answers, 1 cue',
    summary: 'you found every answer on today\'s board.',
    stats: [{ label: 'answers found', value: '8' }, { label: 'cues used', value: '1' }, { label: 'the thread found first', value: 'yes' }],
    path: '/play/word-path',
  },
];

async function expectFits(page: Page, step: string) {
  const dialog = page.getByTestId('game-result-dialog');
  const findings = await dialog.evaluate((card) => {
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    const box = card.getBoundingClientRect();
    const outside = [...card.querySelectorAll<HTMLElement>('*')]
      .filter((element) => element.getClientRects().length > 0 && !element.closest('.sr-only'))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && (rect.left < box.left - 0.5 || rect.right > box.right + 0.5))
      .map(({ element, rect }) => `${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim().slice(0, 20)}" ${Math.round(rect.left)}-${Math.round(rect.right)}`);
    const close = card.querySelector('[aria-label="close results"]')!.getBoundingClientRect();
    return {
      sideways: card.scrollWidth - card.clientWidth,
      onScreen: box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height,
      outside,
      close: { left: close.left, right: close.right, top: close.top, bottom: close.bottom, width: close.width, height: close.height },
      width,
      height,
    };
  });
  expect(findings.sideways, step).toBeLessThanOrEqual(1);
  expect(findings.onScreen, step).toBe(true);
  expect(findings.outside, step).toEqual([]);
  expect(findings.close.width, step).toBeGreaterThanOrEqual(44);
  expect(findings.close.height, step).toBeGreaterThanOrEqual(44);
  expect(findings.close.left, step).toBeGreaterThanOrEqual(0);
  expect(findings.close.top, step).toBeGreaterThanOrEqual(0);
  expect(findings.close.right, step).toBeLessThanOrEqual(findings.width);
  expect(findings.close.bottom, step).toBeLessThanOrEqual(findings.height);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`finished-game cards at 320px with 32px text (${colorScheme === 'light' ? 'Light' : 'Evening'})`, () => {
    test.use({ viewport: { width: 320, height: 700 }, colorScheme });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional storage */ }
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } },
        });
      });
      // A game page has the result dialog (each game on its own page, 2026-11-17).
      await page.goto('/play/pillo');
      await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
      await page.waitForLoadState('networkidle');
      await expect(page.locator('html')).toHaveCSS('font-size', '32px');
    });

    for (const card of cards) {
      test(`${card.name}: the card, share and copy fit, close stays on screen`, async ({ page }) => {
        await page.evaluate((detail) => window.dispatchEvent(new CustomEvent('cueory:game-result-card', { detail })), card);
        const dialog = page.getByTestId('game-result-dialog');
        await expect(dialog).toContainText(card.summary);
        await expectFits(page, 'opened');

        await dialog.evaluate((element) => { element.scrollTop = element.scrollHeight; });
        await expectFits(page, 'scrolled to the end');

        await dialog.getByRole('button', { name: 'share', exact: true }).click();
        await expect(dialog.getByRole('status')).not.toBeEmpty();
        await expectFits(page, 'after share');

        await dialog.getByRole('button', { name: 'copy', exact: true }).click();
        await expect.poll(() => page.evaluate(() => (window as unknown as { copied?: string }).copied)).toContain(card.name);
        await expectFits(page, 'after copy');

        for (const link of await dialog.getByRole('navigation', { name: 'share result on a website' }).getByRole('link').all()) {
          await link.scrollIntoViewIfNeeded();
          const box = (await link.boundingBox())!;
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }

        await dialog.getByRole('button', { name: 'close results' }).click();
        await expect(dialog).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      });
    }
  });
}
