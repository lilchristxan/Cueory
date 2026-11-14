import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

const PATH = '/preview/anatomy-review/kidneys';
const sourceFile = new URL('../../content/visuals/anatomy-kidneys.json', import.meta.url);

test('the preview gives each source system an independent, unindexed phone review sheet', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const raw = JSON.parse(await readFile(sourceFile, 'utf8')) as {
    title: string;
    labels: Array<{ id: string; text: string; group: string; layer: string; source: string }>;
    sources: Array<{ id: string; quote: string; url: string; section: string }>;
  };
  await page.goto('/preview/anatomy-review');
  await expect(page.getByRole('link', { name: raw.title, exact: true })).toBeVisible();
  await page.getByRole('link', { name: raw.title, exact: true }).click();
  await expect(page).toHaveURL(/\/preview\/anatomy-review\/kidneys$/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(raw.title);

  const items = page.locator('[data-review-structure]');
  await expect(items).toHaveCount(raw.labels.length);
  const first = raw.labels[0]!;
  const original = raw.sources.find((s) => s.id === first.source)!;
  await expect(items.first()).toContainText(first.text);
  await expect(items.first()).toContainText(first.group);
  await expect(items.first()).toContainText(first.layer);
  await expect(items.first()).toContainText(original.quote);
  await expect(items.first().getByRole('link', { name: 'original BodyParts3D source file' }))
    .toHaveAttribute('href', original.url);

  const reviewed = items.first().getByRole('checkbox');
  await reviewed.check();
  await expect(reviewed).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(320);

  // Reviewer checkmarks are never stored, and cannot grant model approval.
  await page.reload();
  await expect(items.first().getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByText('draft · labels waiting for review')).toBeVisible();
});

test('a credited front and side picture is generated on request, from one GLB', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one actual export per browser engine');
  test.setTimeout(90_000);
  const glbs: string[] = [];
  page.on('request', (request) => {
    if (/\.glb(?:[?#]|$)/.test(request.url())) glbs.push(request.url());
  });
  await page.goto(PATH);
  await expect(page.getByRole('button', { name: 'make front and side pictures' })).toBeVisible();
  expect(glbs).toEqual([]);

  await page.getByRole('button', { name: 'make front and side pictures' }).click();
  const front = page.getByRole('img', { name: 'kidneys and urinary tract: front view, model review only' });
  const side = page.getByRole('img', { name: 'kidneys and urinary tract: side view, model review only' });
  await expect(front).toBeVisible({ timeout: 60_000 });
  await expect(side).toBeVisible();
  await expect(front).toHaveAttribute('src', /^data:image\/png;base64,/);
  await expect(side).toHaveAttribute('src', /^data:image\/png;base64,/);
  const credits = page.locator('figure figcaption');
  await expect(credits).toHaveCount(2);
  for (const credit of await credits.all()) {
    await expect(credit).toContainText('BodyParts3D');
    await expect(credit).toContainText('CC Attribution 4.0 International');
  }
  expect(glbs.length).toBe(1);
  expect(new URL(glbs[0]!).pathname).toBe('/models/anatomy/kidneys.glb');
});


test('review pictures wait for a nonzero canvas layout before requesting the model', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one canvas-layout race per browser engine');
  test.setTimeout(90_000);
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/\\.glb(?:[?#]|$)/.test(request.url())) requests.push(request.url());
  });
  await page.goto(PATH);
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await canvas.evaluate((element) => {
    element.style.setProperty('width', '0px', 'important');
    element.style.setProperty('height', '0px', 'important');
  });
  expect(await canvas.evaluate((element) => element.clientWidth)).toBe(0);
  await page.getByRole('button', { name: 'make front and side pictures' }).click();
  await expect(page.getByRole('status')).toContainText('loading the model and making pictures');

  // A frame or a timer must never start Three.js using a 1px canvas.
  await page.waitForTimeout(250);
  expect(requests).toEqual([]);
  await canvas.evaluate((element) => {
    element.style.removeProperty('width');
    element.style.removeProperty('height');
  });
  await expect.poll(() => canvas.evaluate((element) => element.clientWidth))
    .toBeGreaterThan(0);
  await expect(page.getByRole('img', { name: 'kidneys and urinary tract: front view, model review only' }))
    .toBeVisible({ timeout: 60_000 });
  expect(requests).toHaveLength(1);
});

test('a failed model request shows a retry and a new renderer can export both pictures', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one real WebGL failure/retry per browser engine');
  test.setTimeout(90_000);
  let attempts = 0;
  await page.route('**/models/anatomy/kidneys.glb', async (route) => {
    attempts += 1;
    if (attempts === 1) await route.abort('failed');
    else await route.continue();
  });
  await page.goto(PATH);
  await page.getByRole('button', { name: 'make front and side pictures' }).click();
  await expect(page.getByRole('alert')).toContainText('pictures could not be made');
  await expect(page.getByRole('img', { name: /model review only/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'try making pictures again' }).click();
  await expect(page.getByRole('img', { name: 'kidneys and urinary tract: front view, model review only' }))
    .toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('img', { name: 'kidneys and urinary tract: side view, model review only' }))
    .toBeVisible();
  expect(attempts).toBe(2);
});

test('the anatomy review sheet is keyboard accessible without serious or critical violations', async ({ page }) => {
  await page.goto(PATH);
  const first = page.locator('[data-review-structure]').first().getByRole('checkbox');
  await first.focus();
  await expect(first).toBeFocused();
  await page.keyboard.press('Space');
  await expect(first).toBeChecked();
  const results = await new AxeBuilder({ page }).withTags([
    'wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa',
  ]).analyze();
  expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical'))
    .toEqual([]);
});

test.describe('no JavaScript review', () => {
  test.use({ javaScriptEnabled: false });
  test('keeps every source name, source line and reviewer checkbox accessible without scripts', async ({ page }) => {
    const glbs: string[] = [];
    page.on('request', (request) => {
      if (/\.glb(?:[?#]|$)/.test(request.url())) glbs.push(request.url());
    });
    await page.goto(PATH);
    await expect(page.getByRole('heading', { name: /kidneys and urinary tract: model review sheet/ })).toBeVisible();
    await expect(page.locator('[data-review-structure]')).toHaveCount(6);
    const first = page.locator('[data-review-structure]').first();
    await expect(first).toContainText('FMA15900 BP9803 urinary bladder');
    await first.getByRole('checkbox').check();
    await expect(first.getByRole('checkbox')).toBeChecked();
    await expect(page.getByText('front and side pictures need JavaScript')).toBeVisible();
    expect(glbs).toEqual([]);
  });
});
