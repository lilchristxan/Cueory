import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';
import { openLabPanels } from './anatomy-lab-panels';

/**
 * The anatomy lab's study round (Task 178, redesign part 3): learn it / test it / find it over the selected group,
 * with typed letter cells. Against the test fixture (?fixture), whose names are made up and are not anatomy: the first
 * group is "fixture cube A" then "fixture cube B".
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

const entry = (page: Page) => page.getByTestId('anatomy-study');
const side = (page: Page) => page.getByTestId('anatomy-study-side');
const cells = (page: Page) => page.getByTestId('anatomy-cells');
const feedback = (page: Page) => page.getByTestId('anatomy-study-feedback');

async function begin(page: Page, mode: 'learn it' | 'test it' | 'find it') {
  await page.getByRole('region', { name: 'structures' }).getByRole('button', { name: 'fixture cube A', exact: true }).click();
  await expect(entry(page)).toBeVisible();
  await entry(page).getByRole('button', { name: mode, exact: true }).click();
  await entry(page).getByRole('button', { name: /^begin/ }).click();
}

async function noSidewaysScroll(page: Page) {
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

/** Types on the real keyboard, into the cells (they hold focus when a question starts). */
async function typeName(page: Page, text: string) {
  await expect(cells(page)).toBeFocused();
  await page.keyboard.type(text, { delay: 10 });
}

test.describe('anatomy lab study round', () => {
  test('the study panel offers learn it, test it and find it over the selected group', async ({ page }) => {
    await openLab(page);
    await expect(entry(page)).toHaveCount(0);
    await page.getByRole('region', { name: 'structures' }).getByRole('button', { name: 'fixture cube A', exact: true }).click();
    await expect(entry(page).getByRole('heading')).toHaveText('study this group · fixture group one');
    const choices = entry(page).getByRole('group', { name: 'how to study' }).getByRole('button');
    await expect(choices).toHaveText(['learn it', 'test it', 'find it']);
    await expect(choices.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(entry(page)).toContainText('a structure lights up with its name. type it to move on.');
    await choices.nth(1).click();
    await expect(choices.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(entry(page)).toContainText('the name is hidden. type it from memory.');
    await expect(entry(page).getByRole('button', { name: 'begin · 2 structures' })).toBeEnabled();
  });

  test('switching body system ends the round, so the old group does not hide the new system', async ({ page }) => {
    await openLab(page);
    await begin(page, 'test it');
    await expect(side(page)).toBeVisible();
    const rows = page.getByRole('group', { name: 'body system' }).getByRole('button');
    const other = rows.and(page.locator('[aria-pressed="false"]')).first();
    await other.click();
    await expect(side(page)).toHaveCount(0);
    await expect(cells(page)).toHaveCount(0);
    await expect(page.getByTestId('anatomy-study-done')).toHaveCount(0);
  });

  test('a round keeps room under the model for the answer panel on desktop, and a word of cells can wrap', async ({ page }) => {
    await openLab(page);
    const row = page.getByTestId('anatomy-views-row');
    const before = await row.evaluate((el) => getComputedStyle(el).paddingBottom);
    await begin(page, 'test it');
    await expect(cells(page)).toBeVisible();
    const reserve = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.height = 'var(--lab-study-clear)';
      document.body.append(probe);
      const value = getComputedStyle(probe).height;
      probe.remove();
      return value;
    });
    const during = await row.evaluate((el) => getComputedStyle(el).paddingBottom);
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      expect(during).toBe(reserve);
      expect(during).not.toBe(before);
    }
    expect(await cells(page).locator('.lab-word').first().evaluate((el) => getComputedStyle(el).flexWrap)).toBe('wrap');
    await noSidewaysScroll(page);
  });

  test('after a hint, a switch or skip, typing still goes to the cells', async ({ page }) => {
    await openLab(page);
    await begin(page, 'test it');
    await page.getByRole('button', { name: 'hint: next letter' }).click();
    await expect(cells(page)).toBeFocused();
    await page.keyboard.type('x');
    await expect(cells(page).locator('[data-from="typed"]')).toHaveCount(1);
    await page.keyboard.press('Backspace');
    await expect(cells(page).locator('[data-from="typed"]')).toHaveCount(0);
    await expect(cells(page).locator('[data-from="hint"]')).toHaveCount(1);
    for (const name of [/first letters/, /show nearby/]) {
      await side(page).getByRole('switch', { name }).click();
      await expect(cells(page)).toBeFocused();
      await page.keyboard.type('x');
      await expect(cells(page).locator('[data-from="typed"]')).toHaveCount(1);
      await page.keyboard.press('Backspace');
    }
    await page.getByRole('button', { name: 'skip' }).click();
    await expect(cells(page)).toBeFocused();
  });

  test('losing the 3D view and trying again ends the round', async ({ page }) => {
    await openLab(page);
    await begin(page, 'test it');
    await expect(side(page)).toBeVisible();
    await page.locator('canvas').evaluate((canvas) => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    await expect(page.getByRole('alert')).toContainText('the 3D anatomy lab could not open.');
    await page.getByRole('button', { name: 'try 3D again' }).click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'fixture cube A', exact: true })).toBeEnabled({ timeout: 20_000 });
    await expect(side(page)).toHaveCount(0);
    await expect(cells(page)).toHaveCount(0);
  });

  test('learn it: the name is shown, and typing it moves on', async ({ page }) => {
    await openLab(page);
    await begin(page, 'learn it');
    await expect(side(page).getByRole('heading', { name: 'fixture group one · learn it' })).toBeVisible();
    await expect(feedback(page)).toContainText('the name: fixture cube A');
    await typeName(page, 'fixture cube a');
    await expect(feedback(page)).toContainText('right: fixture cube A.');
    await expect(page.getByTestId('anatomy-study-status')).toHaveText('right.');
    await page.getByRole('button', { name: 'next', exact: true }).click();
    await expect(feedback(page)).toContainText('the name: fixture cube B');
    await typeName(page, 'fixturecubeb');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('anatomy-study-done')).toContainText('round done: 2 answered, 2 right on the first try.');
  });

  test('test it: names stay hidden, wrong answers are marked in words, and a hint, show answer and skip help', async ({ page }) => {
    await openLab(page);
    await begin(page, 'test it');
    const lab = page.getByTestId('anatomy-lab');
    await expect(lab).not.toContainText(/fixture (cube|block|point|slab)/i);
    await expect(page.getByTestId('anatomy-round-list').getByRole('listitem').first()).toContainText('structure 1');
    await expect(page.getByTestId('anatomy-round-list').getByRole('listitem').first()).toContainText('now');
    await expect(page.getByTestId('anatomy-round-list').getByRole('listitem').nth(1)).toContainText('next');
    await expect(page.getByTestId('anatomy-study-position')).toHaveText('structure 1 of 2');
    // A wrong answer fills the cells and says so in words, then a letter can be taken back.
    await typeName(page, 'fixturecubex');
    await expect(feedback(page)).toContainText('not quite');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('a');
    await expect(feedback(page)).toContainText('right: fixture cube A.');
    await page.getByRole('button', { name: 'next', exact: true }).click();
    // Hint fills the next cell, which takes help, so the streak stays where it was.
    await expect(page.getByTestId('anatomy-streak')).toContainText('00');
    await page.getByRole('button', { name: 'hint: next letter' }).click();
    await expect(cells(page).locator('[data-from="hint"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'show answer' }).click();
    await expect(feedback(page)).toContainText('the name is: fixture cube B. it comes back later in the round.');
    await page.getByRole('button', { name: 'next', exact: true }).click();
    // The first name was answered wrongly before it came right, and the second was shown: each comes back once, so
    // there are four questions in all, and the round is done after those.
    await expect(page.getByTestId('anatomy-study-position')).toHaveText('structure 3 of 4');
    await page.getByRole('button', { name: 'skip' }).click();
    await expect(page.getByTestId('anatomy-study-position')).toHaveText('structure 3 of 3');
    await page.getByRole('button', { name: 'skip' }).click();
    await expect(page.getByTestId('anatomy-study-done')).toBeVisible();
  });

  test('test it: first letters fills the first cell of each word, and a clean answer builds the streak', async ({ page }) => {
    await openLab(page);
    await begin(page, 'test it');
    const firstLetters = side(page).getByRole('switch', { name: /first letters/ });
    await expect(firstLetters).toHaveAttribute('aria-checked', 'false');
    await firstLetters.click();
    await expect(firstLetters).toHaveAttribute('aria-checked', 'true');
    await expect(firstLetters).toContainText('on');
    await expect(cells(page).locator('[data-from="first"]')).toHaveCount(3);
    // Only the other letters are typed: f, c and a are given. It is right, but help does not build the streak.
    await cells(page).focus();
    await page.keyboard.type('ixtureube', { delay: 5 });
    await expect(feedback(page)).toContainText('right: fixture cube A.');
    await page.getByRole('button', { name: 'next', exact: true }).click();
    await expect(page.getByTestId('anatomy-streak')).toContainText('00');
    // With the switch off again, a clean answer does.
    await firstLetters.click();
    await expect(cells(page).locator('[data-from="first"]')).toHaveCount(0);
    await cells(page).focus();
    await page.keyboard.type('fixturecubeb', { delay: 5 });
    await expect(feedback(page)).toContainText('right: fixture cube B.');
    await page.getByRole('button', { name: 'next', exact: true }).click();
    await expect(page.getByTestId('anatomy-streak')).toContainText('01');
    await expect(page.getByTestId('anatomy-timer')).toContainText(/\d\d:\d\d/);
  });

  test('test it: show nearby is a switch with a word, and the location picture marks where the structure is', async ({ page }) => {
    await openLab(page);
    await begin(page, 'test it');
    const nearby = side(page).getByRole('switch', { name: /show nearby/ });
    await expect(nearby).toHaveAttribute('aria-checked', 'false');
    await nearby.click();
    await expect(nearby).toHaveAttribute('aria-checked', 'true');
    await expect(nearby).toContainText('on');
    const location = page.getByTestId('anatomy-location');
    await expect(location).toBeVisible();
    await expect(location.getByText('anterior', { exact: true })).toBeVisible();
    await expect(page.getByTestId('anatomy-location-dot')).toBeVisible();
  });

  test('on a touch device the letter keys are on the screen and type into the cells; elsewhere there are none', async ({ page }) => {
    await openLab(page);
    const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
    await begin(page, 'test it');
    const keys = page.getByRole('group', { name: 'letter keys' });
    if (!coarse) {
      await expect(keys).toHaveCount(0);
      return;
    }
    await expect(keys).toBeVisible();
    for (const letter of 'fixture') await keys.getByRole('button', { name: letter, exact: true }).tap();
    await expect(cells(page).locator('[data-from="typed"]')).toHaveCount(7);
    await keys.getByRole('button', { name: 'backspace' }).tap();
    await expect(cells(page).locator('[data-from="typed"]')).toHaveCount(6);
    const boxes = await keys.getByRole('button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => [r.width, r.height]));
    for (const [width, height] of boxes) {
      expect(width).toBeGreaterThanOrEqual(44);
      expect(height).toBeGreaterThanOrEqual(44);
    }
  });

  test('find it starts the ordinary find it over the group', async ({ page }) => {
    await openLab(page);
    await begin(page, 'find it');
    await expect(page.getByText(/^find:/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'stop the quiz' })).toBeVisible();
    await expect(page.getByTestId('anatomy-study-side')).toHaveCount(0);
  });

  test('closing a round puts the structures back as they were', async ({ page }) => {
    await openLab(page);
    await begin(page, 'test it');
    await side(page).getByRole('button', { name: 'stop the round' }).click();
    await expect(side(page)).toHaveCount(0);
    const list = page.getByRole('region', { name: 'structures' });
    for (const name of ['fixture cube A', 'fixture cube B', 'fixture block C']) {
      await expect(list.getByRole('button', { name, exact: true })).not.toContainText('(hidden)');
    }
  });

  test('the round fits the screen: 44 px buttons, no sideways scroll, no accessibility violations', async ({ page }) => {
    await openLab(page);
    await begin(page, 'test it');
    for (const scope of [side(page), page.getByTestId('anatomy-study-answer')]) {
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
