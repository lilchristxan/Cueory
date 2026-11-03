import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

/**
 * Check the words actually sent to the PNG canvas, not just the pure credit builder.
 * Geometry in this test is the existing code-made fixture or an existing draft model.
 */
test('exported anatomy pictures print a license URI only for real models', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one PNG export check per browser engine');

  await page.addInitScript(() => {
    const state = window as typeof window & { __cueoryPictureText?: string[] };
    state.__cueoryPictureText = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (value, x, y, maxWidth) {
      state.__cueoryPictureText!.push(String(value));
      if (maxWidth === undefined) return original.call(this, value, x, y);
      return original.call(this, value, x, y, maxWidth);
    };
  });

  const exportSquare = async () => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'square 1080×1080' }).click();
    await download;
    return page.evaluate(() => (window as typeof window & { __cueoryPictureText?: string[] })
      .__cueoryPictureText?.join(' ') ?? '');
  };

  await page.goto('/preview/anatomy-lab?fixture');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.getByRole('button', { name: 'fixture cube A', exact: true }))
    .toBeEnabled({ timeout: 20_000 });

  const fixtureWords = await exportSquare();
  expect(fixtureWords).toContain('test shapes made in code for automated tests');
  expect(fixtureWords).not.toContain('https://creativecommons.org/licenses/by/4.0/');
  expect(fixtureWords).not.toContain('© The Database Center for Life Science');

  // The actual kidney GLB is small. This checks the real-data credit path in the
  // draft-only preview without placing an unreviewed anatomical label in a test.
  const kidney = page.getByRole('group', { name: 'body system' })
    .getByRole('button', { name: 'kidneys and urinary tract', exact: true });
  await expect(kidney).toBeVisible();
  await kidney.click();
  await expect(page.getByRole('button', { name: 'square 1080×1080' }))
    .toBeEnabled({ timeout: 20_000 });
  await page.evaluate(() => {
    (window as typeof window & { __cueoryPictureText?: string[] }).__cueoryPictureText = [];
  });

  const anatomyWords = await exportSquare();
  expect(anatomyWords).toContain('BodyParts3D');
  expect(anatomyWords).toContain('© The Database Center for Life Science');
  expect(anatomyWords).toContain('https://creativecommons.org/licenses/by/4.0/');
  expect(anatomyWords).toContain('draft model, built from BodyParts3D 4.0');
  expect(anatomyWords).not.toContain('test shapes made in code');
});
