import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { isDesktopOfEachEngine } from './projects';

const INDEX = '/preview/anatomy-review';
const SHEET = '/preview/anatomy-review/kidneys';

test.describe('founder anatomy review sheets', () => {
  test('index lists the draft-gated sheets with counts and no 3D download', async ({ page }) => {
    const models: string[] = [];
    page.on('request', (request) => {
      if (/\.glb(?:\?|$)/.test(request.url())) models.push(request.url());
    });
    await page.goto(INDEX);
    await expect(page.getByRole('heading', { name: 'anatomy lab review sheets' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'kidneys and urinary tract' }))
      .toHaveAttribute('href', SHEET);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    expect(models).toEqual([]);
  });

  test('each sheet shows original names, counts, source lines, layer, group and checkboxes', async ({ page }) => {
    const models: string[] = [];
    page.on('request', (request) => {
      if (/\.glb(?:\?|$)/.test(request.url())) models.push(request.url());
    });
    await page.goto(SHEET);
    await expect(page.getByRole('heading', { name: /kidneys and urinary tract: model review sheet/i })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByText('6 structures · draft · BodyParts3D 4.0')).toBeVisible();
    const records = page.getByTestId('anatomy-review-checklist');
    await expect(records.locator('li')).toHaveCount(6);
    const kidney = records.getByRole('checkbox', { name: 'reviewed FMA7204: right kidney' });
    await expect(kidney).not.toBeChecked();
    await expect(records.getByText('source line: FMA7204 BP10046 right kidney')).toBeVisible();
    const row = records.locator('li').filter({ has: kidney });
    await expect(row).toContainText('group: urinary system');
    await expect(row).toContainText('layer: organs');
    await expect(row.getByRole('link')).toHaveAttribute('href', /^https:\/\/dbarchive\.biosciencedbc\.jp\/data\/bodyparts3d\/LATEST\//);
    await expect(page.getByText(/BodyParts3D reference model, adult human male/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'CC Attribution 4.0 International' }))
      .toHaveAttribute('rel', 'license noopener');
    await kidney.check();
    await expect(kidney).toBeChecked();
    // A checked box is just a local note, never stored as publication approval.
    await page.reload();
    await expect(records.getByRole('checkbox', { name: 'reviewed FMA7204: right kidney' })).not.toBeChecked();
    expect(models).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('a real model produces credited front and side pictures on demand', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one actual WebGL screenshot check per engine');
    test.setTimeout(120_000);
    await page.goto(SHEET);
    await page.getByRole('button', { name: 'make front and side pictures' }).click();
    const front = page.getByRole('img', { name: /^Front view of kidneys and urinary tract/ });
    const side = page.getByRole('img', { name: /^Side view of kidneys and urinary tract/ });
    await expect(front).toBeVisible({ timeout: 90_000 });
    await expect(side).toBeVisible();
    const pictureSizes = await Promise.all([
      front.evaluate((image: HTMLImageElement) => ({ width: image.naturalWidth, height: image.naturalHeight })),
      side.evaluate((image: HTMLImageElement) => ({ width: image.naturalWidth, height: image.naturalHeight })),
    ]);
    for (const size of pictureSizes) {
      expect(size.width).toBe(1080);
      expect(size.height).toBe(1080);
    }
    await expect(page.getByRole('link', { name: 'CC Attribution 4.0 International' }))
      .toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
  });

  test('the founder sheet is keyboard accessible and has no serious axe violations', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one complete accessibility scan per engine');
    await page.goto(SHEET);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations).toEqual([]);
    const first = page.getByTestId('anatomy-review-checklist').getByRole('checkbox').first();
    await first.focus();
    await page.keyboard.press('Space');
    await expect(first).toBeChecked();
  });
});

test.describe('anatomy review without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('keeps complete source records and manual checkboxes in the HTML', async ({ page }) => {
    await page.goto(SHEET);
    await expect(page.getByText('model pictures need JavaScript and 3D.')).toBeVisible();
    await expect(page.getByTestId('anatomy-review-checklist').getByRole('checkbox')).toHaveCount(6);
    await expect(page.getByText('source line: FMA7204 BP10046 right kidney')).toBeVisible();
  });
});
