import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openLabPanels } from './anatomy-lab-panels';

/**
 * The anatomy lab's study tools, part A (Task 178): tap modes, visibility history, fading, camera presets and recall
 * mode. Against the test fixture (?fixture): five shapes made in code, "fixture cube A" and so on, never anatomy.
 */

const URL = '/preview/anatomy-lab?fixture';
const NAMES = ['fixture cube A', 'fixture cube B', 'fixture block C', 'fixture point D', 'fixture slab E'];
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

async function openLab(page: Page) {
  await page.goto(URL);
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await openLabPanels(page);
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'fixture cube A', exact: true })).toBeEnabled({ timeout: 20_000 });
}

const list = (page: Page) => page.getByRole('region', { name: 'structures' });
const tools = (page: Page) => page.getByTestId('anatomy-tools');
const live = (page: Page) => page.getByTestId('anatomy-announce');

async function tapCenter(page: Page) {
  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('the fixture canvas is not visible');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test.describe('anatomy lab study tools', () => {
  test('starts in navigate mode: a tap selects and never hides; hide mode hides the tapped structure', async ({ page }) => {
    await openLab(page);
    const navigate = tools(page).getByRole('button', { name: 'navigate: tap selects' });
    const hide = tools(page).getByRole('button', { name: 'hide: tap hides' });
    await expect(navigate).toHaveAttribute('aria-pressed', 'true');
    await expect(hide).toHaveAttribute('aria-pressed', 'false');

    const cubeA = list(page).getByRole('button', { name: /^fixture cube A/ });
    await tapCenter(page);
    await expect(cubeA).toHaveAttribute('aria-pressed', 'true');
    await expect(cubeA).not.toContainText('(hidden)');

    await hide.click();
    await expect(hide).toHaveAttribute('aria-pressed', 'true');
    await expect(navigate).toHaveAttribute('aria-pressed', 'false');
    await expect(live(page)).toHaveText('hide: tap hides.');
    await page.getByRole('region', { name: 'fixture cube A' }).getByRole('button', { name: 'clear selection' }).click();
    await tapCenter(page);
    await expect(cubeA).toContainText('(hidden)');
    // A hide-mode tap selects nothing: no name card appears.
    await expect(page.getByRole('region', { name: 'fixture cube A' })).toHaveCount(0);
    await expect(live(page)).toContainText('hid fixture cube A');
    // Undo brings it back.
    await tools(page).getByRole('button', { name: 'undo' }).click();
    await expect(cubeA).not.toContainText('(hidden)');
  });

  test('undo and redo over hide, fade and restore all, by button and by keyboard', async ({ page }) => {
    await openLab(page);
    const undo = tools(page).getByRole('button', { name: 'undo' });
    const redo = tools(page).getByRole('button', { name: 'redo' });
    await expect(undo).toHaveAttribute('aria-disabled', 'true');
    await expect(redo).toHaveAttribute('aria-disabled', 'true');

    const cubeB = list(page).getByRole('button', { name: /^fixture cube B/ });
    await page.getByRole('button', { name: 'hide fixture cube B' }).click();
    await expect(cubeB).toContainText('(hidden)');
    await expect(undo).toHaveAttribute('aria-disabled', 'false');

    await undo.click();
    await expect(cubeB).not.toContainText('(hidden)');
    await expect(undo).toHaveAttribute('aria-disabled', 'true');
    await expect(redo).toHaveAttribute('aria-disabled', 'false');
    await redo.click();
    await expect(cubeB).toContainText('(hidden)');
    await expect(redo).toHaveAttribute('aria-disabled', 'true');

    // Keyboard: Ctrl+Z with focus inside the lab (on the canvas) undoes; Shift+Ctrl+Z redoes.
    await page.locator('canvas').focus();
    await page.keyboard.press('Control+z');
    await expect(cubeB).not.toContainText('(hidden)');
    await page.keyboard.press('Shift+Control+z');
    await expect(cubeB).toContainText('(hidden)');
    await expect(live(page)).toContainText('redid the last change: 1 hidden, 0 faded.');

    // The search field keeps its own undo: Ctrl+Z there changes nothing in the lab.
    const search = page.getByLabel('find a structure');
    await search.focus();
    await page.keyboard.press('Control+z');
    await expect(cubeB).toContainText('(hidden)');

    // Fade C, then restore all: both the hide and the fade go, and one undo brings both back.
    const blockC = list(page).getByRole('button', { name: /^fixture block C/ });
    await blockC.click();
    await page.getByRole('region', { name: 'fixture block C' }).getByRole('button', { name: 'fade this' }).click();
    await expect(blockC).toContainText('(faded)');
    await tools(page).getByRole('button', { name: 'restore all' }).click();
    await expect(cubeB).not.toContainText('(hidden)');
    await expect(blockC).not.toContainText('(faded)');
    await undo.click();
    await expect(cubeB).toContainText('(hidden)');
    await expect(blockC).toContainText('(faded)');
  });

  test('fade: a faded structure says so in the list, stays selectable in 3D, and hiding it drops the fade', async ({ page }) => {
    await openLab(page);
    const opacity = await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--anatomy-faded-opacity')),
    );
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);

    const cubeA = list(page).getByRole('button', { name: /^fixture cube A/ });
    await cubeA.click();
    const card = page.getByRole('region', { name: 'fixture cube A' });
    const fade = card.getByRole('button', { name: 'fade this' });
    await expect(fade).toHaveAttribute('aria-pressed', 'false');
    await fade.click();
    await expect(cubeA).toContainText('(faded)');
    await expect(card.getByRole('button', { name: 'unfade' })).toHaveAttribute('aria-pressed', 'true');
    await expect(live(page)).toHaveText('fixture cube A faded.');

    // Still there to tap: clear the selection, then tap the middle of the view, where cube A is.
    await card.getByRole('button', { name: 'clear selection' }).click();
    await tapCenter(page);
    await expect(cubeA).toHaveAttribute('aria-pressed', 'true');
    await expect(cubeA).toContainText('(faded)');

    // Faded structures are still labeled.
    await page.getByRole('button', { name: 'labels', exact: true }).click();
    const overlay = page.getByTestId('anatomy-labels');
    await expect(overlay.locator(':scope > span', { hasText: 'fixture cube A' })).toHaveCount(1);

    // Hiding drops the fade; "show it" brings it back in full.
    await card.getByRole('button', { name: 'hide it' }).click();
    await expect(cubeA).toContainText('(hidden)');
    await expect(cubeA).not.toContainText('(faded)');
    await card.getByRole('button', { name: 'show it' }).click();
    await expect(cubeA).not.toContainText('(hidden)');
    await expect(cubeA).not.toContainText('(faded)');
  });

  test('camera presets: six views (anterior, posterior, lateral, lateral opposite, top, bottom), focus on selected, and lying down, with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLab(page);
    await page.getByRole('button', { name: 'labels', exact: true }).click();
    const overlay = page.getByTestId('anatomy-labels');
    const pointD = overlay.locator(':scope > span', { hasText: 'fixture point D' });
    await expect(pointD).not.toContainText('(behind)');

    // The lab's words for the views: anterior, posterior and lateral (Christian's), then "lateral, opposite", top, bottom.
    for (const name of ['anterior', 'posterior', 'lateral', 'lateral, opposite', 'top', 'bottom']) {
      await tools(page).getByRole('button', { name, exact: true }).click();
      await expect(live(page)).toHaveText(`view: ${name}.`);
    }
    // From below, the eight-sided shape D (above cube A) is hidden behind A: marked in words.
    await expect(pointD).toContainText('(behind)');
    await tools(page).getByRole('button', { name: 'anterior', exact: true }).click();
    await expect(pointD).not.toContainText('(behind)');

    const focus = tools(page).getByRole('button', { name: 'focus on selected' });
    await expect(focus).toBeDisabled();
    await list(page).getByRole('button', { name: 'fixture cube B', exact: true }).click();
    await expect(focus).toBeEnabled();
    await focus.click();
    await expect(live(page)).toHaveText('focused on fixture cube B.');
    // Hiding the selected structure leaves nothing to focus on.
    await page.getByRole('button', { name: 'hide fixture cube B' }).click();
    await expect(focus).toBeDisabled();

    const lying = tools(page).getByRole('button', { name: 'lying down' });
    const standing = tools(page).getByRole('button', { name: 'standing' });
    await expect(standing).toHaveAttribute('aria-pressed', 'true');
    await lying.click();
    await expect(lying).toHaveAttribute('aria-pressed', 'true');
    await expect(standing).toHaveAttribute('aria-pressed', 'false');
    await expect(live(page)).toHaveText('the model lies down, seen from above.');
    // Lying on its back and seen from above, the model shows its front: every shape is labeled, nothing is behind.
    await expect(overlay.locator(':scope > span')).toHaveCount(NAMES.length - 1);
    await expect(overlay.locator(':scope > span[data-behind]')).toHaveCount(0);
    await standing.click();
    await expect(standing).toHaveAttribute('aria-pressed', 'true');
  });

  test('camera presets move the view with animation too (no reduced motion)', async ({ page }) => {
    await openLab(page);
    await page.getByRole('button', { name: 'labels', exact: true }).click();
    const pointD = page.getByTestId('anatomy-labels').locator(':scope > span', { hasText: 'fixture point D' });
    await tools(page).getByRole('button', { name: 'bottom', exact: true }).click();
    await expect(pointD).toContainText('(behind)', { timeout: 10_000 });
    await page.getByRole('button', { name: 'reset view' }).click();
    await expect(pointD).not.toContainText('(behind)', { timeout: 10_000 });
  });

  test('recall mode: numbered labels, a legend without names, reveal, and the quiz is unaffected', async ({ page }) => {
    await openLab(page);
    const blank = tools(page).getByRole('button', { name: 'recall mode' });
    await expect(blank).toHaveAttribute('aria-pressed', 'false');
    await blank.click();
    await expect(blank).toHaveAttribute('aria-pressed', 'true');
    // Turning recall on turns the labels on too.
    await expect(page.getByRole('button', { name: 'labels', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const overlay = page.getByTestId('anatomy-labels');
    await expect(overlay.locator(':scope > span')).toHaveCount(NAMES.length);
    const texts = await overlay.locator(':scope > span').allTextContents();
    expect([...texts].map((t) => t.trim()).sort()).toEqual(['1', '2', '3', '4', '5']);
    // Leader lines and dots stay.
    await expect(overlay.locator('line')).toHaveCount(NAMES.length);

    const legend = tools(page).getByRole('list', { name: 'legend' });
    await expect(legend.getByRole('listitem')).toHaveCount(NAMES.length);
    await expect(legend).not.toContainText('fixture');
    const reveal = tools(page).getByRole('button', { name: 'reveal' });
    await reveal.click();
    await expect(legend).toContainText('1: fixture cube A');
    await expect(legend).toContainText('5: fixture slab E');
    await expect(tools(page).getByRole('button', { name: 'hide names' })).toHaveAttribute('aria-pressed', 'true');
    // The labels on the model keep their numbers.
    expect((await overlay.locator(':scope > span').allTextContents()).map((t) => t.trim()).sort()).toEqual(['1', '2', '3', '4', '5']);

    // Numbers are stable: hiding cube A leaves the other numbers as they were.
    await page.getByRole('button', { name: 'hide fixture cube A' }).click();
    // Wait for the overlay to drop the hidden part's label (as the first read above waits for the count), then read.
    await expect(overlay.locator(':scope > span')).toHaveCount(NAMES.length - 1);
    expect((await overlay.locator(':scope > span').allTextContents()).map((t) => t.trim()).sort()).toEqual(['2', '3', '4', '5']);
    await expect(legend.getByRole('listitem')).toHaveCount(NAMES.length - 1);

    // The find-it quiz: no labels, no legend, and the recall switch waits.
    await page.getByRole('button', { name: 'start the quiz' }).click();
    await expect(overlay).toHaveCount(0);
    await expect(legend).toHaveCount(0);
    await expect(blank).toBeDisabled();
    await expect(page.getByText(/^find:/)).toBeVisible();
    await page.getByRole('button', { name: 'stop the quiz' }).click();
    await expect(overlay.locator(':scope > span')).toHaveCount(NAMES.length - 1);

    await blank.click();
    await expect(blank).toHaveAttribute('aria-pressed', 'false');
    await expect(legend).toHaveCount(0);
    const names = await overlay.locator(':scope > span').allTextContents();
    expect([...names].map((t) => t.trim()).sort()).toEqual(NAMES.filter((n) => n !== 'fixture cube A').sort());
  });

  test('the tools fit the screen: no sideways scrolling, every control at least 44 px, and no accessibility violations', async ({ page }) => {
    await openLab(page);
    const width = page.viewportSize()?.width ?? 1440;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await tools(page).getByRole('button', { name: 'recall mode' }).click();
    await list(page).getByRole('button', { name: 'fixture cube A', exact: true }).click();
    const buttons = tools(page).getByRole('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(10);
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box, `tools button ${i}`).not.toBeNull();
      expect(box!.width, `tools button ${i} width`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `tools button ${i} height`).toBeGreaterThanOrEqual(44);
    }
    const summary = tools(page).locator('summary');
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations).toEqual([]);
    // The group collapses from the keyboard and opens again.
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(tools(page).getByRole('button', { name: 'undo' })).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(tools(page).getByRole('button', { name: 'undo' })).toBeVisible();
  });
});
