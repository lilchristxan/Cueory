import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';
import { openLabPanels } from './anatomy-lab-panels';
import { sizeOf } from './projects';

/**
 * The anatomy lab's selected-structure inspector (Task 178, redesign part 2): the card (name, system, group, dataset,
 * source id), isolate / hide / flag or comment, the index of the selected structure's group, and the ring and leader
 * line. Against the test fixture (?fixture), whose names are made up and are not anatomy.
 */

const URL = '/preview/anatomy-lab?fixture';
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

async function openLab(page: Page) {
  await markPanelsSeen(page);
  await page.goto(URL);
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await openLabPanels(page);
  await expect(page.getByRole('button', { name: 'fixture cube A', exact: true })).toBeEnabled({ timeout: 20_000 });
}

const card = (page: Page) => page.getByRole('region', { name: 'fixture cube A' });
const index = (page: Page) => page.getByTestId('anatomy-index');

async function select(page: Page, name: string) {
  await page.getByRole('region', { name: 'structures' }).getByRole('button', { name, exact: true }).click();
}

test.describe('anatomy lab inspector', () => {
  test('the card names the structure with its system, group, dataset and source id', async ({ page }) => {
    await openLab(page);
    await expect(page.getByTestId('anatomy-card-rows')).toHaveCount(0);
    await select(page, 'fixture cube A');
    await expect(card(page).getByRole('heading', { name: 'fixture cube A' })).toBeVisible();
    await expect(card(page).getByText('selected structure', { exact: true })).toBeVisible();
    await expect(page.getByTestId('anatomy-card-id')).toHaveText('FIX001');
    const rows = await page.getByTestId('anatomy-card-rows').locator('.lab-kv').evaluateAll((els) =>
      els.map((el) => [el.querySelector('dt')?.textContent, el.querySelector('dd')?.textContent]));
    expect(rows).toEqual([
      ['system', 'organs'],
      ['group', 'fixture group one'],
      ['dataset', 'fixture 1 (made in code)'],
      ['source id', 'FIX001'],
    ]);
  });

  test('isolate, hide and show work from the card', async ({ page }) => {
    await openLab(page);
    await select(page, 'fixture cube A');
    const hide = card(page).getByRole('button', { name: 'hide', exact: true });
    await hide.click();
    await expect(card(page).getByRole('button', { name: 'show', exact: true })).toBeVisible();
    await card(page).getByRole('button', { name: 'show', exact: true }).click();
    await expect(card(page).getByRole('button', { name: 'hide', exact: true })).toBeVisible();
    await card(page).getByRole('button', { name: 'isolate', exact: true }).click();
    await expect(page.getByRole('region', { name: 'structures' }).getByRole('button', { name: 'show fixture cube B' })).toBeVisible();
  });

  test('the index lists the selected structure\'s group with ids, and picking a row selects it', async ({ page }) => {
    await openLab(page);
    await expect(index(page)).toHaveCount(0);
    await select(page, 'fixture cube A');
    await expect(index(page).getByRole('heading')).toHaveText('index · fixture group one · 2 structures');
    const rows = index(page).getByRole('button');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('fixture cube A');
    await expect(rows.nth(0)).toContainText('FIX001');
    await expect(rows.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await rows.nth(1).click();
    await expect(rows.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('anatomy-card-id')).toHaveText('FIX002');
    // A structure with no group has no index.
    await select(page, 'fixture slab E');
    await expect(index(page)).toHaveCount(0);
  });

  test('the index is keyboard navigable: arrows and Home/End move focus, Enter selects', async ({ page }) => {
    await openLab(page);
    await select(page, 'fixture cube A');
    const rows = index(page).getByRole('button');
    await rows.nth(0).focus();
    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(rows.nth(0)).toBeFocused();
    await page.keyboard.press('End');
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('anatomy-card-id')).toHaveText('FIX002');
  });

  test('a ring marks the selection, and on desktop a leader line runs from it to the card', async ({ page }, info) => {
    await openLab(page);
    const ring = page.getByTestId('anatomy-selection-ring');
    await expect(ring).toBeHidden();
    await select(page, 'fixture cube A');
    await expect(ring).toBeVisible();
    const canvas = (await page.locator('canvas').first().boundingBox())!;
    const box = (await ring.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    // The ring sits on the canvas, round the structure.
    expect(box.x + box.width / 2).toBeGreaterThan(canvas.x);
    expect(box.x + box.width / 2).toBeLessThan(canvas.x + canvas.width);
    const leader = page.getByTestId('anatomy-leader').locator('line');
    if (sizeOf(info) === 'desktop') {
      await expect(leader).toHaveAttribute('data-on', '');
      const cardBox = (await card(page).boundingBox())!;
      const x2 = Number(await leader.getAttribute('x2'));
      const stage = (await page.getByTestId('anatomy-stage').boundingBox())!;
      expect(Math.abs(stage.x + x2 - cardBox.x)).toBeLessThanOrEqual(2);
    } else {
      await expect(page.getByTestId('anatomy-leader')).toBeHidden();
    }
    await card(page).getByRole('button', { name: 'clear selection' }).click();
    await expect(ring).toBeHidden();
  });

  test('flag or comment on the card opens the page\'s flag form, and focus comes back to it on close, Escape and send', async ({ page }) => {
    await openLab(page);
    await select(page, 'fixture cube A');
    const trigger = card(page).getByRole('link', { name: 'flag or comment' });
    // The footer is hidden while the lab is the whole page, so its flag button is found by its markup, not its role.
    const pageFlag = page.locator('#footer-flag button[aria-label="flag or comment"]');
    await expect(pageFlag).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await expect(pageFlag).toHaveAttribute('aria-expanded', 'true');
    const form = page.getByTestId('flag-form');
    await expect(form.getByRole('button', { name: 'close' })).toBeVisible();
    // Escape, from inside the form, puts focus back on the card's own link.
    await page.keyboard.press('Escape');
    await expect(pageFlag).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
    // The close button does the same.
    await trigger.click();
    await expect(pageFlag).toHaveAttribute('aria-expanded', 'true');
    await form.getByRole('button', { name: 'close' }).click();
    await expect(trigger).toBeFocused();
  });

  test('the inspector fits the screen: 44 px buttons, no sideways scroll, no accessibility violations', async ({ page }) => {
    await openLab(page);
    await select(page, 'fixture cube A');
    for (const scope of [card(page), index(page)]) {
      const buttons = scope.getByRole('button');
      const count = await buttons.count();
      for (let i = 0; i < count; i++) {
        const box = (await buttons.nth(i).boundingBox())!;
        expect(box.height, `button ${i} height`).toBeGreaterThanOrEqual(44);
        expect(box.width, `button ${i} width`).toBeGreaterThanOrEqual(44);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations).toEqual([]);
  });
});
