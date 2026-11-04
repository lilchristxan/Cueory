import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

// This test uses only the synthetic five-shape fixture. No clinical content.
async function openFixtureLab(page: import('@playwright/test').Page) {
  await page.goto('/preview/anatomy-lab?fixture');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'fixture cube A', exact: true }))
    .toBeEnabled({ timeout: 20_000 });
}

test.describe('anatomy lab: late WebGL context loss', () => {
  test('keeps the names searchable and lets the student retry 3D', async ({ page }) => {
    await openFixtureLab(page);
    await page.locator('canvas').dispatchEvent('pointerdown', { pointerId: 71, clientX: 12, clientY: 12 });
    const prevented = await page.locator('canvas').evaluate((canvas) => {
      const event = new Event('webglcontextlost', { cancelable: true });
      canvas.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);

    await expect(page.getByRole('heading', { name: 'the 3D anatomy lab could not open.' })).toBeFocused();
    const catalog = page.getByRole('region', { name: 'structure names: test shapes (fixture)' });
    await expect(catalog.getByRole('status')).toHaveText('showing 5 of 5 matching structures');
    await catalog.getByLabel('find a structure').fill('cube a');
    await expect(catalog.getByRole('listitem')).toHaveCount(1);
    await expect(catalog.getByRole('listitem')).toContainText('fixture cube A');
    await expect(catalog.getByTestId('anatomy-fallback-attribution'))
      .toContainText('not anatomy, not from BodyParts3D');

    await page.getByRole('button', { name: 'try 3D again' }).click();
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
    const cubeA = page.getByRole('region', { name: 'structures' })
      .getByRole('button', { name: 'fixture cube A', exact: true });
    await expect(cubeA).toBeEnabled({ timeout: 20_000 });
    await cubeA.click();
    await expect(cubeA).toHaveAttribute('aria-pressed', 'true');
  });

  test('cancels a PNG that finishes after context loss in the same browser task', async ({ page }, info) => {
    test.skip(!isDesktopOfEachEngine(info), 'one delayed-export regression per browser engine');
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
        if (this.width === 1080 && this.height === 1080 && type === 'image/png') {
          (window as Window & { __finishLostContextPicture?: () => void }).__finishLostContextPicture =
            () => callback(new Blob(['synthetic PNG test bytes'], { type: 'image/png' }));
          return;
        }
        return original.call(this, callback, type, quality);
      };
    });
    await openFixtureLab(page);
    const downloads: string[] = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));
    await page.getByRole('button', { name: 'square 1080×1080' }).click();
    await expect.poll(
      () => page.evaluate(
        () => typeof (window as Window & { __finishLostContextPicture?: () => void }).__finishLostContextPicture,
      ),
    ).toBe('function');

    // Context loss and a held PNG callback complete before React's effect cleanup.
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const finish = (window as Window & { __finishLostContextPicture?: () => void }).__finishLostContextPicture;
      if (!canvas || !finish) throw new Error('Missing active 3D canvas or held test export');
      const event = new Event('webglcontextlost', { cancelable: true });
      canvas.dispatchEvent(event);
      if (!event.defaultPrevented) throw new Error('Context loss was not handled');
      finish();
    });
    await expect(page.getByRole('heading', { name: 'the 3D anatomy lab could not open.' })).toBeVisible();
    await page.waitForTimeout(100);
    expect(downloads).toEqual([]);
  });
});
