import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

// Christian, 2026-11-24: the game settings' theme choice is one three-position slider (light, dark, device), not three rows.
// Pages that open the shared settings panel are listed with how each one opens it.

async function open(page: Page, path = '/play/word-path') {
  await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
  await markPanelsSeen(page);
  await page.goto(path);
  await page.getByTestId('game-settings-button').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)).then(() => true));

test('the theme choice is one slider of three segments, each at least 44 px, with the old rows gone', async ({ page }) => {
  const dialog = await open(page);
  const theme = dialog.getByRole('group', { name: 'theme' });
  await expect(theme.getByRole('radio')).toHaveCount(3);
  await expect(theme.getByRole('radio', { name: 'light mode' })).toBeAttached();
  await expect(theme.getByRole('radio', { name: 'dark mode' })).toBeAttached();
  await expect(theme.getByRole('radio', { name: 'follow device' })).toBeChecked();
  await expect(theme.locator('.game-settings-option')).toHaveCount(0);
  await expect(theme.locator('.theme-slider-option')).toHaveText(['light', 'dark', 'device']);
  for (const option of await theme.locator('.theme-slider-option').all()) {
    const box = await option.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  await expect(theme.getByTestId('theme-detail')).toHaveText('match your device setting.');
  expect(await theme.getByTestId('theme-detail').getAttribute('aria-live')).toBe('polite');
});

test('tapping a segment picks it, moves the thumb, shows the detail and is remembered', async ({ page }) => {
  const dialog = await open(page);
  const theme = dialog.getByRole('group', { name: 'theme' });
  const slider = theme.getByTestId('theme-slider');
  const thumbX = () => slider.evaluate((element) => {
    const transform = getComputedStyle(element, '::before').transform;
    return transform === 'none' ? 0 : new DOMMatrix(transform).m41;
  });
  // Starts on "device", the third position.
  const trackWidth = (await slider.boundingBox())!.width;
  expect(await thumbX()).toBeGreaterThan(trackWidth * 2 / 3 - 20);
  await theme.locator('.theme-slider-option', { hasText: 'light' }).click();
  await settled(page);
  expect(await thumbX()).toBe(0);
  await theme.locator('.theme-slider-option', { hasText: 'dark' }).click();
  await settled(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(theme.getByRole('radio', { name: 'dark mode' })).toBeChecked();
  await expect(theme.getByTestId('theme-detail')).toHaveText('always use dark mode, whatever your device is set to.');
  expect(await thumbX()).toBeGreaterThan(trackWidth / 3 - 20);
  expect(await thumbX()).toBeLessThan(trackWidth / 3 + 20);
  // Selection is not color alone: the chosen word is bold.
  expect(await theme.locator('.theme-slider-option', { hasText: 'dark' }).evaluate((element) => getComputedStyle(element).fontWeight)).toBe('700');
  expect(await theme.locator('.theme-slider-option', { hasText: 'light' }).evaluate((element) => getComputedStyle(element).fontWeight)).not.toBe('700');
  expect(await page.evaluate(() => localStorage.getItem('cueory-theme'))).toBe('dark');
  await theme.locator('.theme-slider-option', { hasText: 'device' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  await expect(theme.getByTestId('theme-detail')).toHaveText('match your device setting.');
});

test('the panel does not change height or width when the choice changes', async ({ page }) => {
  const dialog = await open(page);
  const card = dialog.locator('.game-settings');
  const before = await card.boundingBox();
  for (const word of ['light', 'dark', 'device']) {
    await dialog.locator('.theme-slider-option', { hasText: word }).click();
    await settled(page);
    const after = await card.boundingBox();
    expect(after!.height).toBe(before!.height);
    expect(after!.width).toBe(before!.width);
  }
});

test('keyboard: Tab enters the slider once, arrows move and pick, Space and Enter keep the pick, Tab leaves', async ({ page }) => {
  const dialog = await open(page);
  const theme = dialog.getByRole('group', { name: 'theme' });
  await dialog.getByRole('button', { name: 'close settings' }).focus();
  await page.keyboard.press('Tab');
  // device is the checked one, so the group's single tab stop lands on it.
  await expect(theme.getByRole('radio', { name: 'follow device' })).toBeFocused();
  await expect(theme.locator('.theme-slider-option', { hasText: 'device' })).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('ArrowLeft');
  await expect(theme.getByRole('radio', { name: 'dark mode' })).toBeFocused();
  await expect(theme.getByRole('radio', { name: 'dark mode' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('ArrowLeft');
  await expect(theme.getByRole('radio', { name: 'light mode' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.keyboard.press('Space');
  await expect(theme.getByRole('radio', { name: 'light mode' })).toBeChecked();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // Tab leaves the three segments in one step: focus is no longer in the slider.
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.theme-slider')))).toBe(false);
  await page.keyboard.press('Shift+Tab');
  await expect(theme.getByRole('radio', { name: 'light mode' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.theme-slider')))).toBe(false);
});

test('the choice is remembered after a reload and shown in the footer switch both ways', async ({ page }) => {
  const dialog = await open(page);
  await dialog.locator('.theme-slider-option', { hasText: 'dark' }).click();
  await expect(page.locator('[data-theme-picker] input[value="dark"]')).toBeChecked();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByTestId('game-settings-button').click();
  await expect(page.getByRole('dialog').getByRole('radio', { name: 'dark mode' })).toBeChecked();
  await page.keyboard.press('Escape');
  // Footer to panel: pick light in the footer, then open the panel again.
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('[data-theme-picker] input[value="light"]')!;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByTestId('game-settings-button').click();
  await expect(page.getByRole('dialog').getByRole('radio', { name: 'light mode' })).toBeChecked();
});

test('device follows the system setting', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const dialog = await open(page);
  await expect(dialog.getByRole('group', { name: 'theme' }).getByRole('radio', { name: 'follow device' })).toBeChecked();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  const page_ = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(page_);
});

test('the thumb slides in a short transition, and not at all under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let dialog = await open(page);
  const thumb = (selector: string) => dialog.locator(selector).evaluate((element) => {
    const style = getComputedStyle(element, '::before');
    return { property: style.transitionProperty, duration: style.transitionDuration };
  });
  const moving = await thumb('.theme-slider');
  expect(moving.property).toContain('transform');
  expect(parseFloat(moving.duration) * (moving.duration.endsWith('ms') ? 1 : 1000)).toBeLessThanOrEqual(400);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const still = await thumb('.theme-slider');
  expect(still.property).toBe('none');
  await dialog.locator('.theme-slider-option', { hasText: 'dark' }).click();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

for (const scheme of ['light', 'dark'] as const) {
  for (const word of ['light', 'dark', 'device']) {
    test(`axe passes on the open panel with "${word}" chosen (${scheme} device)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const dialog = await open(page);
      await dialog.locator('.theme-slider-option', { hasText: word }).click();
      await settled(page);
      const results = await new AxeBuilder({ page }).include('[data-testid="game-settings"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((violation) => violation.id + ': ' + violation.help)).toEqual([]);
    });
  }
}

test('no sideways scroll at 320 px with 32 px root text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addInitScript(() => { document.documentElement.style.fontSize = '32px'; });
  const dialog = await open(page);
  const card = dialog.locator('.game-settings');
  expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await dialog.locator('.theme-slider-option', { hasText: 'device' }).click();
  await expect(dialog.getByRole('group', { name: 'theme' }).getByRole('radio', { name: 'follow device' })).toBeChecked();
});

const GAME_PAGES = ['/play/vialo', '/play/sudoku', '/play/word-path', '/play/crossword', '/play/tachyyy', '/play/hello-cards', '/play/pillo', '/play/stat'];
for (const path of GAME_PAGES) {
  test(`${path} opens the panel with the slider`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-01T15:00:00'));
    await markPanelsSeen(page);
    const response = await page.goto(path);
    expect(response!.status()).toBeLessThan(400);
    const gear = page.getByTestId('game-settings-button').or(page.getByTestId('game-frame-gear'));
    await gear.first().click();
    const theme = page.getByRole('dialog').getByRole('group', { name: 'theme' });
    await expect(theme.getByRole('radio')).toHaveCount(3);
    await expect(theme.getByTestId('theme-slider')).toBeVisible();
  });
}
