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
