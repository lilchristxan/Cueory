import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The anatomy lab's study tools, integration (Task 178): breadcrumb and siblings on the name card, show nearby,
 * ranked search, say it, and the compare view. Against the test fixture (?fixture): five shapes made in code,
 * "fixture cube A" and so on, never anatomy. The review queue and saved views need a signed-in student, so they are
 * covered by unit tests (anatomylab-integration, anatomystudy) and the pgTAP suite, not here.
 */

// Keep browser coverage on the synthetic fixture route.
const URL = '/preview/anatomy-lab?fixture';
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

async function openLab(page: Page) {
  await page.goto(URL);
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'fixture cube A', exact: true })).toBeEnabled({ timeout: 20_000 });
}

const list = (page: Page) => page.getByRole('region', { name: 'structures' });
const tools = (page: Page) => page.getByTestId('anatomy-tools');
const live = (page: Page) => page.getByTestId('anatomy-announce');
const card = (page: Page, name: string) => page.getByRole('region', { name });

test.describe('anatomy lab study tools, integration', () => {
  test('the name card shows where a structure sits and lists no siblings when there is only one', async ({ page }) => {
    await openLab(page);
    await list(page).getByRole('button', { name: 'fixture cube A', exact: true }).click();
    const crumbs = card(page, 'fixture cube A').getByRole('navigation', { name: 'where it sits' });
    await expect(crumbs).toBeVisible();
    await expect(crumbs.getByRole('listitem')).toHaveCount(2);
    await expect(crumbs.getByRole('listitem').nth(0)).toHaveText(/fixture group one/);
    await expect(crumbs.getByRole('listitem').nth(1)).toHaveText(/fixture cube A/);
    // The group heading is not a structure, so it is plain text, not a button; the current name is marked.
    await expect(crumbs.getByRole('button')).toHaveCount(0);
    await expect(crumbs.locator('[aria-current="location"]')).toHaveText('fixture cube A');
    // Cube A has one sibling (cube B): no siblings list, which starts at two.
    await expect(page.getByTestId('anatomy-siblings')).toHaveCount(0);
    // A structure without a group shows no breadcrumb at all.
    await list(page).getByRole('button', { name: 'fixture slab E', exact: true }).click();
    await expect(card(page, 'fixture slab E').getByRole('navigation', { name: 'where it sits' })).toHaveCount(0);
  });

  test('show nearby brings hidden neighbours back as one undoable step', async ({ page }) => {
    await openLab(page);
    await list(page).getByRole('button', { name: 'fixture cube A', exact: true }).click();
    const cardA = card(page, 'fixture cube A');
    await cardA.getByRole('button', { name: 'show only this' }).click();
    await expect(list(page).getByRole('button', { name: /^fixture cube B/ })).toContainText('(hidden)');
    await expect(list(page).getByRole('button', { name: /^fixture slab E/ })).toContainText('(hidden)');

    await cardA.getByRole('button', { name: 'show nearby' }).click();
    await expect(live(page)).toHaveText('showed 4 nearby structures.');
    await expect(list(page).getByText('(hidden)')).toHaveCount(0);

    await tools(page).getByRole('button', { name: 'undo' }).click();
    await expect(list(page).getByRole('button', { name: /^fixture cube B/ })).toContainText('(hidden)');
    await expect(list(page).getByRole('button', { name: /^fixture cube A/ })).not.toContainText('(hidden)');
  });

  test('the structure search ranks and forgives plurals and word order, and still finds source ids', async ({ page }) => {
    await openLab(page);
    const search = page.getByLabel('find a structure');
    await search.fill('cubes');
    await expect(list(page).getByText('2 structures', { exact: true })).toBeVisible();
    const names = list(page).getByRole('button', { name: /^fixture cube/ });
    await expect(names).toHaveCount(2);
    // The exact name comes first, whatever the word order typed.
    await search.fill('b cube fixture');
    await expect(list(page).getByText('1 structure', { exact: true })).toBeVisible();
    await expect(list(page).getByRole('button', { name: 'fixture cube B', exact: true })).toBeVisible();
    // A word the name does not hold lists nothing: "cube" alone is not enough for "fixture cube A" when "z" is asked too.
    await search.fill('cube z');
    await expect(list(page).getByText('0 structures', { exact: true })).toBeVisible();
    await search.fill('FIX-003');
    await expect(list(page).getByRole('button', { name: 'fixture block C', exact: true })).toBeVisible();
    await expect(list(page).getByText('1 structure', { exact: true })).toBeVisible();
  });

  test('say it is present only where the browser can speak, and never breaks the card', async ({ page }) => {
    await openLab(page);
    await list(page).getByRole('button', { name: 'fixture point D', exact: true }).click();
    const cardD = card(page, 'fixture point D');
    const canSpeak = await page.evaluate(() => typeof window.speechSynthesis?.speak === 'function' && typeof SpeechSynthesisUtterance === 'function');
    const sayIt = cardD.getByRole('button', { name: 'say it' });
    await expect(sayIt).toHaveCount(canSpeak ? 1 : 0);
    if (canSpeak) {
      await sayIt.click();
      // The card is unchanged and selection still works afterwards.
      await expect(cardD).toBeVisible();
      await list(page).getByRole('button', { name: 'fixture cube A', exact: true }).click();
      await expect(card(page, 'fixture cube A')).toBeVisible();
    }
  });

  test('compare with… shows a second model that turns with the main view, and closes cleanly', async ({ page }) => {
    await openLab(page);
    const width = page.viewportSize()?.width ?? 1440;
    const pick = tools(page).getByLabel('compare with…');
    await expect(pick).toBeEnabled();
    const options = await pick.locator('option').allTextContents();
    expect(options[0]).toBe('nothing');
    expect(options).not.toContain('whole body');
    expect(options.length).toBeGreaterThan(1);
    await pick.selectOption({ index: 1 });
    const compare = page.getByTestId('anatomy-compare');
    await expect(compare).toBeVisible();
    await expect(compare.getByRole('img')).toHaveAccessibleName(/^compare: 3D model of /);
    await expect(live(page)).toHaveText(/^comparing with .*: \d+ structures loaded\.$/, { timeout: 30_000 });
    await expect(compare.locator('figcaption')).toContainText('turns with the main view');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    // Turning the main view keeps the page responsive and both canvases on screen.
    await page.getByRole('button', { name: 'turn left' }).click();
    await expect(page.locator('canvas')).toHaveCount(2);
    expect((await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations).toEqual([]);

    await tools(page).getByRole('button', { name: 'close comparison' }).click();
    await expect(compare).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(pick).toHaveValue('');
  });

  test('switching to whole body disposes comparison and does not offer a second WebGL view', async ({ page }) => {
    await openLab(page);
    const comparison = tools(page).getByLabel('compare with…');
    await comparison.selectOption({ index: 1 });
    await expect(page.getByTestId('anatomy-compare')).toBeVisible();
    await page.getByRole('button', { name: 'whole body', exact: true }).click();
    await expect(page.getByTestId('anatomy-compare')).toHaveCount(0);
    await expect(tools(page).getByLabel('compare with…')).toHaveCount(0);
    await expect(page.locator('canvas')).toHaveCount(1);
  });

  test('the new controls are at least 44 px and the card has no accessibility violations', async ({ page }) => {
    await openLab(page);
    const width = page.viewportSize()?.width ?? 1440;
    await list(page).getByRole('button', { name: 'fixture cube A', exact: true }).click();
    const buttons = card(page, 'fixture cube A').getByRole('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box, `card button ${i}`).not.toBeNull();
      expect(box!.width, `card button ${i} width`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `card button ${i} height`).toBeGreaterThanOrEqual(44);
    }
    const pick = tools(page).getByLabel('compare with…');
    expect((await pick.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(axeTags).analyze()).violations).toEqual([]);
  });
});
