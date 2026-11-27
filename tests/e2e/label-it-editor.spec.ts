import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The label-it editor (Christian, 2026-11-26: "make it editable for users"): covers can be added, named, moved, resized
// and deleted, by pointer and by keyboard, and a student can use a picture of their own. Nothing is saved or uploaded.
const URL = '/learn/study-skills/label-it';
const open = async (page: import('@playwright/test').Page) => {
  await page.goto(URL);
  await page.getByTestId('label-it-edit').click();
  await expect(page.getByTestId('label-editor')).toBeVisible();
};
const covers = (page: import('@playwright/test').Page) => page.getByTestId('label-editor-cover');

test('the editor opens with the page\'s covers and their words, and cancel changes nothing', async ({ page }) => {
  await open(page);
  await expect(covers(page)).toHaveCount(4);
  // One field shows the selected cover's words; nothing is selected at first.
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await covers(page).first().focus();
  await expect(page.getByRole('textbox', { name: 'words under cover 1' })).toHaveValue('roof');
  await page.getByRole('button', { name: 'cancel' }).click();
  await expect(page.getByTestId('label-editor')).toHaveCount(0);
  await expect(page.getByTestId('label-it-edit')).toBeVisible();
});

test('add, name, move and resize by keyboard, undo, then study the edited set', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'add a cover' }).click();
  await expect(covers(page)).toHaveCount(5);
  // A cover with no words blocks studying, and the page says why.
  const start = page.getByRole('button', { name: 'start studying' });
  await expect(start).toBeDisabled();
  await expect(page.getByText('type the words under every cover first.')).toBeVisible();
  await page.getByRole('textbox', { name: 'words under cover 5' }).fill('garden');
  await expect(start).toBeEnabled();

  const fifth = covers(page).nth(4);
  await fifth.focus();
  const before = (await fifth.boundingBox())!;
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  const after = (await fifth.boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x);
  expect(after.height).toBeGreaterThan(before.height);

  await page.getByRole('button', { name: 'undo' }).click();
  expect((await fifth.boundingBox())!.height).toBeCloseTo(before.height, 0);
  await page.getByRole('button', { name: 'redo' }).click();

  await start.click();
  await expect(page.getByTestId('label-editor')).toHaveCount(0);
  // The study board now has five covers, and a way back to Cueory's drawing.
  await expect(page.getByRole('button', { name: "back to cueory's drawing" })).toBeVisible();
  await page.getByRole('button', { name: "back to cueory's drawing" }).click();
  await expect(page.getByRole('button', { name: "back to cueory's drawing" })).toHaveCount(0);
});

test('a cover can be drawn and dragged with a pointer, and deleted', async ({ page }) => {
  await open(page);
  const picture = page.getByTestId('label-editor-picture');
  const box = (await picture.boundingBox())!;
  // Draw on an empty part of the picture.
  await page.mouse.move(box.x + box.width * 0.05, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.82, { steps: 4 });
  await page.mouse.up();
  await expect(covers(page)).toHaveCount(5);
  const drawn = covers(page).nth(4);
  const first = (await drawn.boundingBox())!;
  expect(first.width).toBeGreaterThan(box.width * 0.15);

  // Drag it to the right.
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2 + 80, first.y + first.height / 2, { steps: 4 });
  await page.mouse.up();
  expect((await drawn.boundingBox())!.x).toBeGreaterThan(first.x + 40);

  await page.getByRole('button', { name: 'delete the selected cover' }).click();
  await expect(covers(page)).toHaveCount(4);
});

test('a student can use a picture of their own; a file that is not a picture is refused in words', async ({ page }) => {
  await open(page);
  const input = page.getByLabel('choose your own picture');
  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByTestId('label-editor-problem')).toContainText('not a picture this page can use');
  await expect(covers(page)).toHaveCount(4);

  // A tiny real PNG (1 x 1).
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await input.setInputFiles({ name: 'mine.png', mimeType: 'image/png', buffer: png });
  await expect(covers(page)).toHaveCount(0);
  await expect(page.getByTestId('label-editor-picture').locator('img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  await expect(page.getByText('your own picture. it stays in this page and is not uploaded.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'start studying' })).toBeDisabled();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`axe finds nothing in the editor (${scheme}), and nothing scrolls sideways`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page);
    await covers(page).first().focus();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test('a selected cover can be moved and resized by tapping, with no drag and no keyboard', async ({ page }) => {
  await page.goto('/learn/study-skills/label-it');
  await page.getByTestId('label-it-edit').click();
  const cover = page.getByTestId('label-editor-cover').first();
  await cover.focus();
  const before = await cover.boundingBox();
  await page.getByTestId('label-editor-nudge').locator('summary').click();
  await page.getByRole('button', { name: 'move right' }).click();
  await page.getByRole('button', { name: 'make taller' }).click();
  const after = await cover.boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x);
  expect(after!.height).toBeGreaterThan(before!.height);
});

test('an edited set never touches the saved place of cueory\'s own drawing', async ({ page }) => {
  await page.goto('/learn/study-skills/label-it');
  await page.getByTestId('label-it-edit').click();
  await page.getByRole('button', { name: 'add a cover' }).click();
  await page.getByRole('textbox').fill('my own words');
  await page.getByRole('button', { name: 'start studying' }).click();
  const session = page.getByTestId('labelit-session');
  await session.getByRole('button', { name: 'uncover label 1', exact: true }).click();
  await session.getByRole('group', { name: 'mark label 1', exact: true }).getByRole('button', { name: 'know it', exact: true }).click();
  await expect(session.getByRole('group', { name: 'mark label 1', exact: true }).getByRole('button', { name: 'know it', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // Marking the original drawing saves a place; marking an edited set must leave storage empty.
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('label-it');
});
