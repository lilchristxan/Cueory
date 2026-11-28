import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';
import { openLabPanels } from './anatomy-lab-panels';

/**
 * "Choose what to focus on" (Task 178): pick structures in the lab, one link carries them to label it, and the lab
 * brings the same set back. Against the test fixture (?fixture), whose names are made up and are not anatomy.
 */

const URL = '/preview/anatomy-lab?fixture';
const axeTags = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

async function openLab(page: Page, url = URL) {
  await markPanelsSeen(page);
  await page.goto(url);
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await openLabPanels(page);
  await expect(page.getByRole('button', { name: 'fixture cube A', exact: true })).toBeEnabled({ timeout: 20_000 });
}

const panel = (page: Page) => page.getByTestId('anatomy-focus');
const row = (page: Page, name: string) => page.getByRole('region', { name: 'structures' }).getByRole('button', { name, exact: true });

async function noSidewaysScroll(page: Page) {
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect(await page.evaluate(() => document.querySelector('[data-testid="anatomy-page"]')!.scrollWidth)).toBeLessThanOrEqual(width);
}

test.describe('anatomy lab: choose what to focus on', () => {
  test('picking structures puts their ids in the label it link, and clear takes them out', async ({ page }) => {
    await openLab(page);
    // Nothing is chosen yet: the panel offers only the switch.
    await expect(panel(page).getByTestId('anatomy-focus-link')).toHaveCount(0);
    await panel(page).getByTestId('anatomy-focus-toggle').click();
    await expect(panel(page).getByTestId('anatomy-focus-count')).toContainText('none chosen');
    // With nothing chosen the link is switched off and says why; it is a link only once it can go somewhere.
    const link = panel(page).getByTestId('anatomy-focus-link');
    await expect(link).toHaveAttribute('aria-disabled', 'true');
    await expect(link).not.toHaveAttribute('href', /.+/);
    await expect(panel(page).getByTestId('anatomy-focus-why')).toContainText('choose at least one structure');

    await row(page, 'fixture cube A').click();
    await row(page, 'fixture block C').click();
    await expect(row(page, 'fixture cube A')).toHaveAttribute('aria-pressed', 'true');
    // Chosen is said in words and with a tick, not only by colour.
    await expect(row(page, 'fixture cube A')).toContainText('chosen');
    await expect(row(page, 'fixture cube A').locator('.lab-tick')).toHaveText('✓');
    await expect(panel(page).getByTestId('anatomy-focus-count')).toContainText('2 chosen');
    await expect(link).toHaveAttribute('href', '/learn/study-skills/label-it?focus=FIX001,FIX003');
    await expect(link).not.toHaveAttribute('aria-disabled', 'true');

    await row(page, 'fixture cube A').click();
    await expect(panel(page).getByTestId('anatomy-focus-count')).toContainText('1 chosen');
    await expect(link).toHaveAttribute('href', '/learn/study-skills/label-it?focus=FIX003');

    await panel(page).getByTestId('anatomy-focus-clear').click();
    await expect(panel(page).getByTestId('anatomy-focus-count')).toContainText('none chosen');
    await expect(link).toHaveAttribute('aria-disabled', 'true');
  });

  test('a group can be chosen at once', async ({ page }) => {
    await openLab(page);
    await panel(page).getByTestId('anatomy-focus-toggle').click();
    await page.getByTestId('anatomy-focus-group').first().click();
    await expect(panel(page).getByTestId('anatomy-focus-count')).toContainText('2 chosen');
    await expect(panel(page).getByTestId('anatomy-focus-link')).toHaveAttribute('href', /focus=FIX001,FIX002$/);
    await page.getByTestId('anatomy-focus-group').first().click();
    await expect(panel(page).getByTestId('anatomy-focus-count')).toContainText('none chosen');
  });

  test('the set comes back from the lab address; unknown ids are dropped', async ({ page }) => {
    await openLab(page, `${URL}&focus=FIX002,FIX004,FMA99999,%3Cb%3E`);
    await expect(panel(page).getByTestId('anatomy-focus-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(panel(page).getByTestId('anatomy-focus-count')).toContainText('2 chosen');
    await expect(row(page, 'fixture cube B')).toHaveAttribute('aria-pressed', 'true');
    await expect(panel(page).getByTestId('anatomy-focus-link')).toHaveAttribute('href', '/learn/study-skills/label-it?focus=FIX002,FIX004');
  });

  test('the whole path works from the keyboard', async ({ page }) => {
    await openLab(page);
    await panel(page).getByTestId('anatomy-focus-toggle').focus();
    await page.keyboard.press('Enter');
    await expect(panel(page).getByTestId('anatomy-focus-toggle')).toHaveAttribute('aria-pressed', 'true');
    await row(page, 'fixture cube B').focus();
    await page.keyboard.press('Space');
    await expect(row(page, 'fixture cube B')).toHaveAttribute('aria-pressed', 'true');
    await expect(panel(page).getByTestId('anatomy-focus-count')).toContainText('1 chosen');
    const link = panel(page).getByTestId('anatomy-focus-link');
    await link.focus();
    await expect(link).toBeFocused();
    await expect(link).toHaveAttribute('href', /focus=FIX002$/);
  });

  test('controls are at least 44 px, nothing scrolls sideways and the panel passes axe', async ({ page }) => {
    await openLab(page);
    await panel(page).getByTestId('anatomy-focus-toggle').click();
    await row(page, 'fixture cube A').click();
    await row(page, 'fixture cube B').click();
    for (const target of [panel(page).getByTestId('anatomy-focus-toggle'), panel(page).getByTestId('anatomy-focus-clear'), panel(page).getByTestId('anatomy-focus-link'), row(page, 'fixture cube A'), page.getByTestId('anatomy-focus-group').first()]) {
      await target.scrollIntoViewIfNeeded();
      const box = (await target.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(43.5);
      expect(box.height).toBeGreaterThanOrEqual(43.5);
    }
    await noSidewaysScroll(page);
    const results = await new AxeBuilder({ page }).withTags(axeTags).analyze();
    expect(results.violations).toEqual([]);
    // Clear, so the disabled link and its reason are checked too.
    await panel(page).getByTestId('anatomy-focus-clear').click();
    const empty = await new AxeBuilder({ page }).withTags(axeTags).analyze();
    expect(empty.violations).toEqual([]);
  });
});
