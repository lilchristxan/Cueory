import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

// Christian, 2026-11-24: "do it for all pages". The footer corner panel's theme choice is the same three-position slider
// as the game settings panel (.theme-slider), with the same semantics, and the two stay in sync.

const chevron = (page: Page) => page.getByRole('contentinfo').locator('[data-footer-toggle]');
const picker = (page: Page) => page.getByRole('group', { name: 'Theme' });

async function openFooter(page: Page, path = '/privacy') {
  await markPanelsSeen(page);
  await page.goto(path);
  await chevron(page).scrollIntoViewIfNeeded();
  if ((await chevron(page).getAttribute('aria-expanded')) !== 'true') await chevron(page).click();
  await expect(picker(page)).toBeVisible();
}

const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)).then(() => true));

test('the footer theme choice is one slider of three segments, each at least 44 px, with the old names kept', async ({ page }) => {
  await openFooter(page);
  const group = picker(page);
  await expect(group.getByRole('radio')).toHaveCount(3);
  await expect(group.locator('.theme-slider')).toBeVisible();
  await expect(group.locator('.segmented')).toHaveCount(0);
  await expect(group.locator('.theme-slider-option')).toHaveText(['light', 'dark', 'device']);
  await expect(group.getByRole('radio', { name: 'light', exact: true })).toBeAttached();
  await expect(group.getByRole('radio', { name: 'dark', exact: true })).toBeAttached();
  await expect(group.getByRole('radio', { name: 'follow device', exact: true })).toBeChecked();
  for (const option of await group.locator('.theme-slider-option').all()) {
    const box = await option.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});

test('tapping a segment picks it, moves the thumb, bolds the word and is remembered', async ({ page }) => {
  await openFooter(page);
  const slider = picker(page).locator('.theme-slider');
  const thumbX = () => slider.evaluate((element) => {
    const transform = getComputedStyle(element, '::before').transform;
    return transform === 'none' ? 0 : new DOMMatrix(transform).m41;
  });
  const width = (await slider.boundingBox())!.width;
  expect(await thumbX()).toBeGreaterThan(width * 2 / 3 - 20);
  await picker(page).locator('.theme-slider-option', { hasText: 'dark' }).click();
  await settled(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(Math.abs((await thumbX()) - width / 3)).toBeLessThan(20);
  expect(await picker(page).locator('.theme-slider-option', { hasText: 'dark' }).evaluate((element) => getComputedStyle(element).fontWeight)).toBe('700');
  expect(await page.evaluate(() => localStorage.getItem('cueory-theme'))).toBe('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await chevron(page).scrollIntoViewIfNeeded();
  await chevron(page).click();
  await expect(picker(page).getByRole('radio', { name: 'dark', exact: true })).toBeChecked();
});

test('keyboard: one Tab stop, arrows move and pick, Space and Enter keep the pick', async ({ page }) => {
  await openFooter(page);
  const group = picker(page);
  await group.getByRole('radio', { name: 'follow device', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  // Focus set by a key press shows the ring on the segment.
  await expect(group.locator('.theme-slider-option', { hasText: 'dark' })).toHaveCSS('outline-style', 'solid');
  await expect(group.getByRole('radio', { name: 'dark', exact: true })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('ArrowLeft');
  await expect(group.getByRole('radio', { name: 'light', exact: true })).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await expect(group.getByRole('radio', { name: 'light', exact: true })).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: 'follow device', exact: true })).toBeChecked();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  // One Tab stop: a single Shift+Tab leaves the three segments. (The slider is the last control on the page, so a
  // forward Tab has nowhere in the document to land: Firefox then keeps reporting the radio as the active element.)
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.theme-slider')))).toBe(false);
  await expect(page.locator(':focus')).toHaveCount(1);
});

test('the footer slider and the game settings slider stay in sync both ways', async ({ page }) => {
  await openFooter(page, '/play/word-path');
  await picker(page).locator('.theme-slider-option', { hasText: 'dark' }).click();
  await page.getByTestId('game-frame-gear').click();
  const panel = page.getByRole('dialog').getByRole('group', { name: 'theme' });
  await expect(panel.getByRole('radio', { name: 'dark mode' })).toBeChecked();
  await panel.locator('.theme-slider-option', { hasText: 'light' }).click();
  await expect(page.locator('[data-theme-picker] input[value="light"]')).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.keyboard.press('Escape');
  await expect(picker(page).getByRole('radio', { name: 'light', exact: true })).toBeChecked();
});

test('the thumb eases in a short transition and not at all under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openFooter(page);
  const style = () => picker(page).locator('.theme-slider').evaluate((element) => {
    const computed = getComputedStyle(element, '::before');
    return { property: computed.transitionProperty, duration: computed.transitionDuration };
  });
  expect((await style()).property).toContain('transform');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect((await style()).property).toBe('none');
  await picker(page).locator('.theme-slider-option', { hasText: 'dark' }).click();
  expect(await page.evaluate(() => document.querySelector('footer')!.getAnimations({ subtree: true }).length)).toBe(0);
});

test('the open footer panel does not change size when the choice changes', async ({ page, browserName }) => {
  await openFooter(page);
  const footer = page.getByRole('contentinfo');
  const before = await footer.boundingBox();
  for (const word of ['light', 'dark', 'device']) {
    await picker(page).locator('.theme-slider-option', { hasText: word }).click();
    await settled(page);
    const after = await footer.boundingBox();
    // Firefox reports sizes in 1/60 px steps, so the same height can read 566.9999 and 567: allow that in Firefox only.
    if (browserName === 'firefox') expect(Math.abs(after!.height - before!.height)).toBeLessThan(0.01);
    else expect(after!.height).toBe(before!.height);
    expect(after!.width).toBe(before!.width);
  }
});

for (const scheme of ['light', 'dark'] as const) {
  test(`axe passes on the open footer panel (${scheme} chosen)`, async ({ page }) => {
    await openFooter(page);
    await picker(page).locator('.theme-slider-option', { hasText: scheme }).click();
    await settled(page);
    const results = await new AxeBuilder({ page }).include('footer').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
  });
}

test('no sideways scroll at 320 px with 32 px root text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addInitScript(() => { document.documentElement.style.fontSize = '32px'; });
  await openFooter(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await picker(page).locator('.theme-slider-option', { hasText: 'dark' }).click();
  await expect(picker(page).getByRole('radio', { name: 'dark', exact: true })).toBeChecked();
});
