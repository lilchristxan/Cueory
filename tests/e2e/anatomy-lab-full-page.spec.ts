import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';
import { sizeOf } from './projects';

/**
 * The open anatomy lab is the whole page (Christian, 2026-11-27): it fills the window edge to edge, the site's header,
 * footer and the page's own heading are hidden and take no focus, the top bar is pinned to the top edge, and one
 * button leaves the lab again. Against the test fixture (?fixture); nothing here depends on a structure's name.
 */

const URL = '/preview/anatomy-lab?fixture';

async function openLab(page: Page) {
  await markPanelsSeen(page);
  await page.goto(URL);
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.getByTestId('anatomy-stage')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'labels', exact: true })).toBeEnabled({ timeout: 20_000 });
}

test.describe('anatomy lab: full page', () => {
  test('the lab fills the window and nothing else on the page shows or takes focus', async ({ page }) => {
    await openLab(page);
    const viewport = page.viewportSize()!;
    const box = (await page.getByTestId('anatomy-page').boundingBox())!;
    expect(Math.round(box.x)).toBe(0);
    expect(Math.round(box.y)).toBe(0);
    expect(Math.round(box.width)).toBe(viewport.width);
    expect(Math.round(box.height)).toBe(viewport.height);
    await expect(page.locator('[data-site-footer]')).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'anatomy lab' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'start text name it', exact: true })).toBeHidden();
    // The lab's own top edge starts at the top of the window: no site header above it.
    const lab = (await page.getByTestId('anatomy-lab').boundingBox())!;
    expect(Math.round(lab.y)).toBe(0);
    // The window itself never scrolls, sideways or down: the lab scrolls inside itself when it must.
    const scroll = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      labWidth: document.querySelector('[data-testid="anatomy-page"]')!.scrollWidth,
      overflow: getComputedStyle(document.documentElement).overflowY,
    }));
    expect(scroll.pageWidth).toBeLessThanOrEqual(viewport.width);
    expect(scroll.labWidth).toBeLessThanOrEqual(viewport.width);
    expect(scroll.overflow).toBe('hidden');
    // Every focus stop is inside the lab (past the last one, focus rests on the page itself, never on hidden chrome).
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body) return 'page';
        return active.closest('[data-testid="anatomy-page"]') ? 'lab' : 'outside';
      });
      expect(where).not.toBe('outside');
    }
  });

  test('the credits stay on screen with the model', async ({ page }) => {
    await openLab(page);
    await expect(page.getByTestId('anatomy-credits')).toBeVisible();
  });

  test('"model only" clears the side panels on desktop and brings them back', async ({ page }, testInfo) => {
    test.skip(sizeOf(testInfo) !== 'desktop', 'below the desktop width the side panels are closed until asked for');
    await openLab(page);
    const focus = page.getByTestId('anatomy-focus');
    await expect(page.getByTestId('anatomy-rail')).toBeVisible();
    await expect(page.getByTestId('anatomy-inspector')).toBeVisible();
    await focus.click();
    await expect(focus).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('anatomy-rail')).toBeHidden();
    await expect(page.getByTestId('anatomy-inspector')).toBeHidden();
    await expect(page.getByRole('button', { name: 'labels', exact: true })).toBeVisible();
    await focus.click();
    await expect(focus).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'reset view' })).toBeVisible();
  });

  test('more opens the other tools in view, and its close button shuts them', async ({ page }) => {
    await openLab(page);
    await page.getByRole('button', { name: 'more', exact: true }).click();
    const more = page.getByTestId('anatomy-more');
    await expect(more).toBeVisible();
    await expect(more.getByRole('heading', { name: 'more' })).toBeInViewport();
    await page.getByTestId('anatomy-more-close').click();
    await expect(more).toBeHidden();
  });

  test('the back button leaves the lab: the page, its header and footer come back', async ({ page }) => {
    await openLab(page);
    const exit = page.getByRole('button', { name: 'leave the anatomy lab' });
    const size = (await exit.boundingBox())!;
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
    await exit.click();
    await expect(page.getByTestId('anatomy-page')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'open the anatomy lab' })).toBeVisible();
    await expect(page.locator('[data-site-footer]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'anatomy lab' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.classList.contains('lab-open'))).toBe(false);
  });
});

test.describe('anatomy lab: the view remote, the stage and the tree', () => {
  test('a real body system starts out turning, and the play button in the arrows stops and starts it', async ({ page }) => {
    await markPanelsSeen(page);
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(page.getByTestId('anatomy-stage')).toBeVisible({ timeout: 20_000 });
    const drawer = page.getByRole('group', { name: 'panels' }).getByRole('button', { name: 'orientation', exact: true });
    if (await drawer.isVisible()) await drawer.click();
    const spin = page.getByRole('button', { name: 'turn the model by itself', exact: true });
    await expect(spin).toBeEnabled({ timeout: 30_000 });
    await expect(spin).toHaveAttribute('aria-pressed', 'true');
    const box = (await spin.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await spin.click();
    await expect(spin).toHaveAttribute('aria-pressed', 'false');
    await spin.click();
    await expect(spin).toHaveAttribute('aria-pressed', 'true');
    // Asking for a set view stops the turning.
    await page.getByRole('button', { name: 'reset view' }).click();
    await expect(spin).toHaveAttribute('aria-pressed', 'false');
  });

  test('with reduced motion the model starts still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await markPanelsSeen(page);
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(page.getByTestId('anatomy-stage')).toBeVisible({ timeout: 20_000 });
    const drawer = page.getByRole('group', { name: 'panels' }).getByRole('button', { name: 'orientation', exact: true });
    if (await drawer.isVisible()) await drawer.click();
    const spin = page.getByRole('button', { name: 'turn the model by itself', exact: true });
    await expect(spin).toBeEnabled({ timeout: 30_000 });
    await expect(spin).toHaveAttribute('aria-pressed', 'false');
  });

  test('the black / white switch changes the stage, and keeps the panels brown', async ({ page }) => {
    await openLab(page);
    const orientation = page.getByRole('group', { name: 'panels' }).getByRole('button', { name: 'orientation', exact: true });
    if (await orientation.isVisible()) await orientation.click();
    const stage = () => page.getByTestId('anatomy-lab').evaluate((lab) => getComputedStyle(lab).backgroundColor);
    const bar = () => page.getByTestId('anatomy-credits').evaluate((strip) => getComputedStyle(strip).backgroundColor);
    const choices = page.getByRole('group', { name: 'background' });
    await expect(choices.getByRole('button', { name: 'black' })).toHaveAttribute('aria-pressed', 'true');
    expect(await stage()).toBe('rgb(28, 25, 23)');
    const brown = await bar();
    await choices.getByRole('button', { name: 'white' }).click();
    await expect(choices.getByRole('button', { name: 'white' })).toHaveAttribute('aria-pressed', 'true');
    expect(await stage()).toBe('rgb(249, 245, 239)');
    expect(await bar()).toBe(brown);
    await choices.getByRole('button', { name: 'black' }).click();
    expect(await stage()).toBe('rgb(28, 25, 23)');
  });

  test('each group heading folds with its arrow, and the − button hides the whole box', async ({ page }) => {
    await openLab(page);
    const systems = page.getByRole('group', { name: 'panels' }).getByRole('button', { name: 'body systems', exact: true });
    if (await systems.isVisible()) await systems.click();
    const list = page.getByRole('region', { name: 'structures' });
    const heading = list.getByRole('heading', { level: 4 }).first().getByRole('button');
    await expect(heading).toHaveAttribute('aria-expanded', 'true');
    const rows = await list.locator('li').count();
    expect(rows).toBeGreaterThan(0);
    await heading.click();
    await expect(heading).toHaveAttribute('aria-expanded', 'false');
    expect(await list.locator('li:visible').count()).toBeLessThan(rows);
    await heading.click();
    await expect(list.locator('li:visible')).toHaveCount(rows);
    // A structure's dot hides and shows it; the dot is a 44 px target named for what it does.
    const dot = list.getByRole('button', { name: /^hide /u }).first();
    const size = (await dot.boundingBox())!;
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);

    const min = page.getByRole('button', { name: 'hide the body systems box' });
    await min.click();
    await expect(list).toBeHidden();
    await page.getByRole('button', { name: 'show the body systems box' }).click();
    await expect(list).toBeVisible();
  });
});
