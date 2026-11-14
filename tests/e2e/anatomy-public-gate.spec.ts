import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// The same source records used at build time determine which state this
// release-gate regression must observe. It keeps working after a founder
// explicitly approves the first system, without changing any draft here.
const sourceDir = resolve('content/visuals');
const manifests = readdirSync(sourceDir)
  .filter((name) => /^anatomy-[a-z0-9-]+\.json$/.test(name))
  .map((name) => JSON.parse(readFileSync(resolve(sourceDir, name), 'utf8')) as {
    status: string;
    labels: { id: string }[];
  });
const approved = manifests.filter((record) => record.status === 'approved');
const draftIds = manifests
  .filter((record) => record.status === 'draft')
  .flatMap((record) => record.labels.map((label) => label.id));

test('public /anatomy stays behind approval, without leaking previews or triggering model downloads', async ({ page }) => {
  const modelRequests: string[] = [];
  page.on('request', (request) => {
    if (/\.glb(?:[?#]|$)/i.test(request.url())) modelRequests.push(request.url());
  });

  const response = await page.goto('/anatomy');
  expect(response?.status()).toBe(200);
  const html = await page.content();
  for (const id of draftIds) expect(html, 'draft ID must never be public: ' + id).not.toContain(id);

  await expect(page.getByRole('heading', { name: 'anatomy lab' })).toBeVisible();
  if (approved.length === 0) {
    await expect(page.getByText('the anatomy lab is coming soon.')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByRole('button', { name: 'open the anatomy lab' })).toHaveCount(0);
  } else {
    await expect(page.getByRole('button', { name: 'open the anatomy lab' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  }
  expect(modelRequests).toEqual([]);

  await page.getByRole('button', { name: 'open site menu' }).click();
  const menu = page.getByRole('dialog', { name: 'site menu' });
  const anatomyLink = menu.getByRole('link', { name: 'anatomy lab', exact: true });
  if (approved.length === 0) await expect(anatomyLink).toHaveCount(0);
  else await expect(anatomyLink).toHaveAttribute('href', '/anatomy');
});

test('public anatomy route fits phone, tablet, and desktop widths in both palettes', async ({ page }) => {
  for (const width of [320, 390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/anatomy');
    const widths = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(widths.page, 'horizontal page scrolling at ' + width + ' px')
      .toBeLessThanOrEqual(widths.viewport + 1);
  }
});
