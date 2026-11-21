import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

/**
 * Christian's crossword brief (2026-11-17): no description or sample line in the game box, no pen/pencil, the level
 * picker looks like sudoku's, blocked squares differ from the selected square by pattern too, "cue" instead of "clue"
 * wherever players read it, and the hard board fits without scrolling from tablet width up (phones still scroll it
 * inside its own box). Easy November sample.
 */
const board = (page: Page) => page.getByTestId('cueword');
/** The text players can see in an element: every text node except screen-reader-only text. */
const seenText = (page: Page, selector: string) => page.locator(selector).first().evaluate((root) => {
  const parts: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest('.sr-only')) parts.push(node.textContent ?? '');
  }
  return parts.join(' ').toLowerCase();
});
const levels = (page: Page) => page.getByTestId('crossword-levels');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
      localStorage.setItem('cueory-game-help-seen', JSON.stringify(['pulse', 'triage', 'cueword', 'suture']));
    } catch { /* optional storage */ }
  });
  await page.goto('/play/crossword');
  await expect(board(page)).toBeVisible();
});

test('the level picker is pressed buttons with a check mark, like sudoku\'s', async ({ page }) => {
  const easy = levels(page).getByRole('button', { name: 'easy, 5 by 5' });
  await expect(easy).toHaveAttribute('aria-pressed', 'true');
  await expect(easy).toContainText('✓');
  const mid = levels(page).getByRole('button', { name: 'mid, 7 by 7' });
  await mid.press('Enter');
  await expect(mid).toHaveAttribute('aria-pressed', 'true');
  await expect(mid).toContainText('✓');
  await expect(easy).toHaveAttribute('aria-pressed', 'false');
  await expect(board(page).getByRole('grid', { name: 'crossword grid' })).toHaveAttribute('aria-rowcount', '7');
  const box = (await mid.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('a blocked square is striped, the selected square is solid: they differ by pattern, not only color', async ({ page }) => {
  await levels(page).getByRole('button', { name: 'mid, 7 by 7' }).click();
  const grid = board(page).getByRole('grid', { name: 'crossword grid' });
  const blocked = grid.getByRole('gridcell', { name: 'black square' }).first();
  await expect(blocked).toBeVisible();
  const current = grid.locator('.crossword-cell-current');
  await expect(current).toHaveCount(1);
  const [blockedImage, currentImage] = await Promise.all([
    blocked.evaluate((element) => getComputedStyle(element).backgroundImage),
    current.evaluate((element) => getComputedStyle(element).backgroundImage),
  ]);
  expect(blockedImage).toContain('repeating-linear-gradient');
  expect(currentImage).toBe('none');
});

test('players read "cue", never "clue": the box, its settings and its help', async ({ page }) => {
  await board(page).getByRole('button', { name: 'show cue list' }).click();
  await expect(board(page).getByTestId('crossword-clue-list')).toBeVisible();
  expect(await seenText(page, '[data-testid="cueword"]')).not.toContain('clue');
  // The framed page owns the shared settings opener outside the crossword island.
  await page.getByTestId('game-frame-gear').click();
  const settings = page.getByRole('dialog', { name: 'crossword settings' });
  await expect(settings.getByRole('group', { name: 'cue text size' })).toBeVisible();
  expect(await seenText(page, '[data-testid="game-settings"]')).not.toContain('clue');
  await page.keyboard.press('Escape');
  await board(page).getByRole('button', { name: 'how to play crossword' }).click();
  const help = page.getByRole('dialog', { name: 'how to play crossword' });
  await expect(help).toBeVisible();
  const text = await seenText(page, '[data-testid="game-help"]');
  expect(text).not.toContain('clue');
  expect(text).not.toContain('pencil');
});

test('no description and no sample line in the game box', async ({ page }) => {
  const seen = await seenText(page, '[data-testid="cueword"]');
  // The puzzle's own placeholder cues say [sample cue]; the box itself has no sample line.
  expect(seen).not.toContain("today's puzzle is a sample");
  expect(seen).not.toContain('sample puzzle');
  expect(seen).not.toContain('type letters. arrows move.');
  // Screen readers still get the keys: the grid points at them.
  const described = await board(page).getByRole('grid', { name: 'crossword grid' }).getAttribute('aria-describedby');
  expect(described).toBeTruthy();
});

for (const [width, scrolls] of [[390, true], [820, false], [1440, false]] as const) {
  test(`the hard board at ${width} px ${scrolls ? 'scrolls inside its own box' : 'fits without any scrolling'}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await levels(page).getByRole('button', { name: 'hard, 15 by 15' }).click();
    const wrap = board(page).locator('.crossword-board-wrap');
    await expect(board(page).getByRole('grid', { name: 'crossword grid' })).toHaveAttribute('aria-rowcount', '15');
    const [scrollWidth, clientWidth] = await wrap.evaluate((element) => [element.scrollWidth, element.clientWidth]);
    if (scrolls) expect(scrollWidth).toBeGreaterThan(clientWidth);
    else expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const cell = (await board(page).locator('.crossword-cell').first().boundingBox())!;
    expect(cell.width).toBeGreaterThanOrEqual(44);
  });
}

test('a numbered square\'s name starts with the number it shows (axe label-content-name-mismatch)', async ({ page }) => {
  for (const level of ['easy, 5 by 5', 'mid, 7 by 7', 'hard, 15 by 15']) {
    await levels(page).getByRole('button', { name: level }).click();
    const numbered = board(page).locator('.crossword-cell:has(.crossword-number)');
    expect(await numbered.count()).toBeGreaterThan(0);
    for (const [shown, name] of await numbered.evaluateAll((cells) => cells.map((cell) => [cell.querySelector('.crossword-number')!.textContent, cell.getAttribute('aria-label')]))) {
      expect(name, level).toMatch(new RegExp('^' + shown + ', row '));
    }
    const results = await new AxeBuilder({ page }).include('[data-testid="cueword"]').withRules(['label-content-name-mismatch']).analyze();
    expect(results.violations.map((violation) => violation.id), level).toEqual([]);
  }
});
