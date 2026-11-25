import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

/**
 * Piccline's board autosaves every move on this device, and shows a three-pip meter beside the cue button. The clock is
 * set to 1 November 2026, so today's puzzle is the first sample (content/games/suture/sample-01.json); 6 November is the
 * same sample on another day, which must start fresh.
 */
type Cell = [number, number];
const sample = JSON.parse(readFileSync(new URL('../../content/games/suture/sample-01.json', import.meta.url), 'utf8')) as {
  grid: string[];
  words: { answer: string; path: Cell[] }[];
  extras: string[];
};
const total = sample.words.length;

function trace(word: string): Cell[] {
  const go = (path: Cell[]): Cell[] | null => {
    if (path.length === word.length) return path;
    const options: Cell[] = path.length === 0
      ? sample.grid.flatMap((row, r) => [...row].map((_, c): Cell => [r, c]))
      : [-1, 0, 1].flatMap((dr) => [-1, 0, 1].map((dc): Cell => [path.at(-1)![0] + dr, path.at(-1)![1] + dc]));
    for (const [r, c] of options) {
      if (sample.grid[r]?.[c] !== word[path.length] || path.some(([pr, pc]) => pr === r && pc === c)) continue;
      const found = go([...path, [r, c]]);
      if (found) return found;
    }
    return null;
  };
  return go([])!;
}

const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
const game = (page: Page) => page.getByTestId('suture');
const cell = (page: Page, [row, col]: Cell) => game(page).locator(`button[data-cell="${row},${col}"]`);
const meter = (page: Page) => page.getByTestId('suture-hint-meter');
const play = async (page: Page, path: Cell[]) => {
  for (const at of path) await cell(page, at).click();
  await game(page).getByRole('button', { name: 'submit' }).click();
};
const open = async (page: Page, day: string) => {
  await page.clock.setFixedTime(new Date(`${day}T15:00:00`));
  await page.goto('/play/piccline');
  await expect(game(page)).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* storage blocked: no panel */ }
  });
  await markPanelsSeen(page);
  await open(page, '2026-11-01');
});

test.describe('piccline: autosave and cue meter', () => {
  test('the meter fills as other words are found, with filled and outlined pips, and the line of words is its label', async ({ page }) => {
    await expect(meter(page)).toHaveAttribute('data-filled', '0');
    await expect(meter(page).locator('[data-pip="empty"]')).toHaveCount(3);
    const progress = page.getByTestId('suture-hint-progress');
    await expect(meter(page)).toHaveAccessibleName(/0 of 3 words toward a cue/);
    for (const [i, word] of sample.extras.slice(0, 3).entries()) {
      await play(page, trace(word));
      await expect(meter(page)).toHaveAttribute('data-filled', String(i + 1));
      await expect(meter(page).locator('[data-pip="filled"]')).toHaveCount(i + 1);
    }
    await expect(progress).toHaveText('1 cue ready.');
    await expect(meter(page)).toHaveAccessibleName('1 cue ready.');
    // Filled and outlined pips differ in fill, not only in color.
    const fills = await meter(page).locator('[data-pip]').evaluateAll((pips) => pips.map((pip) => getComputedStyle(pip).backgroundColor));
    expect(new Set(fills).size).toBe(1);
    await game(page).getByRole('button', { name: /^cue/ }).click();
    await expect(meter(page)).toHaveAttribute('data-filled', '0');
    await expect(meter(page).locator('[data-pip="empty"]')).toHaveCount(3);
    const empty = await meter(page).locator('[data-pip="empty"]').first().evaluate((pip) => getComputedStyle(pip).backgroundColor);
    await play(page, trace(sample.extras[3]!));
    const filled = await meter(page).locator('[data-pip="filled"]').first().evaluate((pip) => getComputedStyle(pip).backgroundColor);
    expect(filled).not.toBe(empty);
    const results = await axe(page);
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('reloading mid-game keeps found words, other words, the meter and cues used', async ({ page }) => {
    for (const word of sample.extras.slice(0, 4)) await play(page, trace(word));
    await game(page).getByRole('button', { name: /^cue/ }).click();
    await play(page, sample.words[2]!.path);
    await expect(page.getByTestId('suture-count')).toHaveText(`1 of ${total} words found · teal line: the word you are tracing`);
    await page.reload();
    await expect(game(page)).toBeVisible();
    await expect(page.getByTestId('suture-count')).toHaveText(`1 of ${total} words found · teal line: the word you are tracing`);
    await expect(page.getByTestId('suture-found')).toContainText(sample.words[2]!.answer.toLowerCase());
    await expect(meter(page)).toHaveAttribute('data-filled', '1');
    await expect(page.getByTestId('suture-hint-progress')).toHaveText('1 of 3 words toward a cue. other words of 4 letters or more count.');
    await expect(game(page).locator('button[data-look="hinted"]').first()).toBeVisible();
    await expect(page.getByTestId('suture-hint')).toBeEnabled();
  });

  test('a finished board reopens finished and cannot be played again that day, and a new day starts fresh', async ({ page }) => {
    for (const word of sample.words) await play(page, word.path);
    await expect(page.getByTestId('suture-result')).toBeVisible();
    await page.reload();
    await expect(game(page)).toBeVisible();
    await expect(page.getByTestId('suture-result')).toBeVisible();
    await expect(page.getByTestId('suture-count')).toHaveText(`${total} of ${total} words found · teal line: the word you are tracing`);
    await expect(cell(page, [0, 0])).toBeDisabled();
    await expect(game(page).getByRole('button', { name: 'submit' })).toBeDisabled();
    await expect(game(page).getByRole('button', { name: /^cue/ })).toBeDisabled();
    // Nothing leaves the device: the record is in this browser's storage and holds no answer text.
    const saved = await page.evaluate(() => localStorage.getItem('cueory-piccline-save'));
    expect(saved).toContain('"day":"2026-11-01"');
    for (const word of sample.words) expect(saved).not.toContain(word.answer);

    await open(page, '2026-11-06');
    await expect(page.getByTestId('suture-count')).toHaveText(`0 of ${total} words found · teal line: the word you are tracing`);
    await expect(page.getByTestId('suture-result')).toHaveCount(0);
    await expect(cell(page, [0, 0])).toBeEnabled();
  });

  test('blocked storage still lets the game play', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    });
    await open(page, '2026-11-01');
    await play(page, trace(sample.words[0]!.answer));
    await expect(page.getByTestId('suture-count')).toHaveText(`1 of ${total} words found · teal line: the word you are tracing`);
  });
});
