import { expect, test, type Locator, type Page } from '@playwright/test';

// Issue #743: at 320px wide with 32px root text, every game dialog on /play fits the screen (nothing scrolls
// sideways inside it) and its 44px close button stays fully on screen, before and after the dialog scrolls.

test.use({ viewport: { width: 320, height: 700 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); } catch { /* optional storage */ }
  });
  await page.goto('/play/sudoku');
  await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveCSS('font-size', '32px');
});

async function expectOnScreen(page: Page, close: Locator) {
  const viewport = page.viewportSize()!;
  const box = (await close.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function expectCloseStaysVisible(page: Page, card: Locator, close: Locator) {
  // The card scrolls only up and down.
  const sideways = await card.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(sideways).toBeLessThanOrEqual(1);
  // The page behind the dialog must not scroll sideways either. On failure, name what sticks out past the right edge.
  const page_ = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const scrolls = (node: Element | null) => {
      for (let at = node; at && at !== document.body; at = at.parentElement) if (getComputedStyle(at).overflowX !== 'visible') return true;
      return false;
    };
    const past: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (scrolls(node.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if ([...range.getClientRects()].some((rect) => rect.right > width)) past.push(`${node.parentElement?.className}: ${node.textContent?.trim().slice(0, 30)}`);
    }
    // Boxes too, including ones within a pixel of the edge, which can round over it on a phone's pixel density.
    for (const element of document.body.querySelectorAll('*')) {
      if (scrolls(element.parentElement) || !element.getClientRects().length) continue;
      const box = element.getBoundingClientRect();
      if (box.right > width - 1 && box.right !== width) past.push(`box ${element.tagName.toLowerCase()}.${String(element.getAttribute('class')).slice(0, 40)}: right ${box.right.toFixed(2)}`);
    }
    return { sideways: document.documentElement.scrollWidth - width, past };
  });
  expect(page_.sideways, JSON.stringify(page_.past)).toBeLessThanOrEqual(0);
  await expectOnScreen(page, close);
  // Scrolled to the end, the close button is still on screen and still the topmost thing where it sits.
  await card.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect.poll(() => card.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expectOnScreen(page, close);
  const onTop = await close.evaluate((button) => {
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && button.contains(hit);
  });
  expect(onTop).toBe(true);
  await close.click();
}

test('finished-game result card keeps its close button on screen', async ({ page }) => {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('cueory:game-result-card', {
      detail: {
        game: 'cueword',
        name: 'crossword',
        date: 'nov 11, 2026',
        level: 'easy',
        result: 'solved',
        summary: 'sample result for a layout check.',
        stats: [{ label: 'time', value: '4:12' }, { label: 'checks', value: '0' }, { label: 'streak', value: '2' }],
        path: '/play/crossword',
      },
    }));
  });
  const dialog = page.getByTestId('game-result-dialog');
  await expectCloseStaysVisible(page, dialog, dialog.getByRole('button', { name: 'close results' }));
  await expect(dialog).toHaveCount(0);
});

test('shared game settings keep their close button on screen', async ({ page }) => {
  await page.getByTestId('game-settings-button').click();
  const dialog = page.getByRole('dialog', { name: 'game settings' });
  await expectCloseStaysVisible(page, page.locator('.game-settings'), dialog.getByRole('button', { name: 'close settings' }));
  await expect(dialog).toBeHidden();
});

test('sudoku settings keep their close button on screen', async ({ page }) => {
  await page.getByTestId('sudoku-section').getByRole('button', { name: 'settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'settings', exact: true });
  await expectCloseStaysVisible(page, page.locator('.sudoku-settings'), dialog.getByRole('button', { name: 'close settings' }));
  await expect(dialog).toBeHidden();
});
