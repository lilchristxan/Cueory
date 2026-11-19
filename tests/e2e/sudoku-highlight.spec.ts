import { expect, test, type Page } from '@playwright/test';
import { dailySudokuSeed, generateSudoku } from '../../src/islands/sudoku';
import { markPanelsSeen } from './clock';

// Christian, 2026-11-12: "Make sure all related boxes are highlighted well." In Light and Evening, at every project size
// (390 / 820 / 1440), the selected square, its row / column / box tint, the givens and the matching numbers must be
// told apart, and every number stays readable.
const daily = generateSudoku(dailySudokuSeed('2026-11-01', 'easy'), 'easy');
const rowOf = (index: number) => Math.floor(index / 9);
const colOf = (index: number) => index % 9;
const boxOf = (index: number) => Math.floor(rowOf(index) / 3) * 3 + Math.floor(colOf(index) / 3);
const sees = (a: number, b: number) => rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b);
const given = (index: number) => daily.puzzle[index] !== 0;

// A given square whose number also appears as a given outside its row, column and box.
const chosen = daily.puzzle.findIndex((value, index) => value !== 0 &&
  daily.puzzle.some((other, j) => j !== index && other === value && !sees(index, j)))!;
const value = daily.puzzle[chosen]!;
const match = daily.puzzle.findIndex((other, j) => j !== chosen && other === value && !sees(chosen, j));
const related = daily.puzzle.findIndex((other, j) => j !== chosen && rowOf(j) === rowOf(chosen) && !given(j));
const overlap = daily.puzzle.findIndex((other, j) => j !== chosen && j !== related && rowOf(j) === rowOf(chosen) && !given(j));
const plain = daily.puzzle.findIndex((other, j) => !sees(chosen, j) && !given(j));
const quietGiven = daily.puzzle.findIndex((other, j) => !sees(chosen, j) && given(j) && other !== value);

const game = (page: Page) => page.getByTestId('sudoku');
const cell = (page: Page, index: number) => game(page).getByRole('grid', { name: 'sudoku grid' }).getByRole('gridcell').nth(index);

/** Colors of one square, read in the page (Chromium reports color-mix results as `color(srgb …)`). */
async function look(page: Page, index: number) {
  return cell(page, index).evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color, border: style.borderRightColor, weight: style.fontWeight, outline: style.outlineColor, outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle, shadow: style.boxShadow };
  });
}
function channels(color: string): number[] {
  const srgb = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(color);
  if (srgb) return srgb.slice(1, 4).map((part) => Number(part) * 255);
  const rgb = /rgba?\((\d+(?:\.\d+)?),?\s*(\d+(?:\.\d+)?),?\s*(\d+(?:\.\d+)?)/.exec(color);
  if (!rgb) throw new Error('unreadable color ' + color);
  return rgb.slice(1, 4).map(Number);
}
function luminance(color: string): number {
  const [r, g, b] = channels(color).map((part) => {
    const c = part / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high! + 0.05) / (low! + 0.05);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional */ }
  });
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`sudoku highlights are easy to tell apart and numbers stay readable (${scheme})`, async ({ page }, testInfo) => {
    expect([chosen, match, related, overlap, plain, quietGiven].every((index) => index >= 0)).toBe(true);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/play/sudoku');
    await expect(cell(page, 80)).toBeVisible();

    // Tap on touch projects, mouse click elsewhere.
    if (testInfo.project.use.hasTouch) await cell(page, chosen).tap();
    else await cell(page, chosen).click();
    await expect(cell(page, chosen)).toHaveClass(/is-selected/);
    await expect(cell(page, related)).toHaveClass(/is-related/);
    await expect(cell(page, match)).toHaveClass(/is-identical/);
    await expect(cell(page, plain)).not.toHaveClass(/is-related|is-box-related|is-identical/);
    await expect(cell(page, quietGiven)).toHaveClass(/is-given/);

    // An entered duplicate in the selected row is related, identical and conflicting. The route tint cannot replace
    // the identical-number fill/ink, while the conflict ring remains a non-colour cue.
    if (testInfo.project.use.hasTouch) await cell(page, overlap).tap();
    else await cell(page, overlap).click();
    await page.keyboard.press(String(value));
    await expect(cell(page, overlap)).toHaveClass(/is-conflict/);
    if (testInfo.project.use.hasTouch) await cell(page, chosen).tap();
    else await cell(page, chosen).click();
    await expect(cell(page, overlap)).toHaveClass(/is-related/);
    await expect(cell(page, overlap)).toHaveClass(/is-identical/);

    // The highlights fade in over a near-zero (reduced motion) transition; a color read in the same frame as the class
    // change can still see the old color, so wait until no transition is running before reading them.
    await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
    const [selected, tint, same, overlapping, quiet, givenLook] = await Promise.all([chosen, related, match, overlap, plain, quietGiven].map((index) => look(page, index)));

    // 1. The selected square (Sudoku.png, P10): a solid 3 px deep-copper outline around a Copper Shine fill, no extra
    //    inset ring. The outline is a shape cue, not colour alone, and reaches 3:1 (WCAG non-text contrast) against
    //    every square it touches: the row / column / box tint, given and plain squares, and its own fill.
    //    Changed on purpose (P10): the old check wanted 4.5:1 for a thick dark ring; the rendering draws a thin copper
    //    outline, so the floor is the WCAG 3:1 for a state indicator, now measured against the tint, givens and plain
    //    squares as well as the fill.
    expect(selected.outlineStyle).toBe('solid');
    expect(parseFloat(selected.outlineWidth)).toBeGreaterThanOrEqual(3);
    expect(selected.shadow).toBe('none');
    for (const [name, square] of [['tint', tint], ['given', givenLook], ['plain', quiet], ['own fill', selected]] as const) {
      expect(contrast(selected.outline, square.background), `${scheme} selected outline vs ${name}`).toBeGreaterThanOrEqual(3);
    }

    // 2. The row / column / box tint is pale, as drawn, but stands apart from plain squares and is darker than the
    //    given-number shading. Changed on purpose (P10): the floors were 2.5:1 (Light) / 3:1 (Evening) against plain
    //    squares and 2.3:1 / 2.8:1 against givens, which forced the heavy Taupe tint the rendering replaces; the
    //    rendering's own tint is about 1.4:1 against its plain squares. The tint is a helper, never the only cue: the
    //    selected square has the 3:1 outline above, givens are bold, and matching numbers are bold on the strongest fill.
    expect(contrast(tint.background, quiet.background), `${scheme} tint vs plain`).toBeGreaterThanOrEqual(1.3);
    expect(luminance(tint.background)).toBeLessThan(luminance(givenLook.background));
    expect(contrast(tint.background, givenLook.background), `${scheme} tint vs given`).toBeGreaterThanOrEqual(1.2);
    expect(givenLook.weight, `${scheme} givens are bold`).toBe('700');

    // The board is never inverted: in Light and Evening alike the squares are light and the numbers and lines dark.
    expect(luminance(quiet.background), `${scheme} light squares`).toBeGreaterThan(luminance(givenLook.color));
    expect(luminance(quiet.background), `${scheme} dark lines`).toBeGreaterThan(luminance(quiet.border));

    // 3. Matching numbers get the strongest fill plus bold, so the match isn't shown by color alone.
    expect(same.weight).toBe('700');
    expect(contrast(same.background, tint.background)).toBeGreaterThanOrEqual(2.4);
    expect(contrast(same.background, quiet.background)).toBeGreaterThan(contrast(tint.background, quiet.background));
    expect(overlapping.background).toBe(same.background);
    expect(overlapping.color).toBe(same.color);
    expect(overlapping.weight).toBe('700');

    // Grid lines and given/entered digits stay readable on the actual board in both themes.
    expect(contrast(quiet.border, quiet.background), `${scheme} grid line`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(givenLook.color, givenLook.background), `${scheme} given digit`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(overlapping.color, overlapping.background), `${scheme} entered digit`).toBeGreaterThanOrEqual(4.5);
    for (const square of [selected, tint, same, overlapping, quiet, givenLook]) {
      expect(contrast(square.color, square.background)).toBeGreaterThanOrEqual(4.5);
    }

    // Keyboard moves the same highlights.
    await page.keyboard.press(colOf(chosen) === 8 ? 'ArrowLeft' : 'ArrowRight');
    const next = colOf(chosen) === 8 ? chosen - 1 : chosen + 1;
    await expect(cell(page, next)).toBeFocused();
    await expect(cell(page, next)).toHaveClass(/is-selected/);
    await expect(cell(page, chosen)).toHaveClass(/is-related/);
    await expect(cell(page, chosen)).not.toHaveClass(/is-selected/);
    await expect(cell(page, next)).toHaveCSS('outline-style', 'solid');

    // 4. A wrong entry keeps its dashed ring, which isn't color.
    if (testInfo.project.use.hasTouch) await cell(page, related).tap();
    else await cell(page, related).click();
    await page.keyboard.press(String(value));
    await expect(cell(page, related)).toHaveClass(/is-conflict/);
    expect(await cell(page, related).evaluate((element) => getComputedStyle(element, '::before').borderTopStyle)).toBe('dashed');
  });
}
