import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

/** No real anatomical claims are needed: use the deliberately artificial fixture. */
test('failed WebGL keeps a searchable text-only anatomy catalog and proper credits', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one simulated WebGL failure per browser engine');
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: function (this: HTMLCanvasElement, ...args: unknown[]) {
        if (typeof args[0] === 'string' && args[0].startsWith('webgl')) return null;
        return Reflect.apply(original, this, args);
      },
    });
  });

  const glb: string[] = [];
  page.on('request', (req) => {
    if (/\\.glb(?:[?#]|$)/i.test(req.url())) glb.push(req.url());
  });
  await page.goto('/preview/anatomy-lab?fixture');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  const error = page.getByRole('alert');
  await expect(error).toContainText('the 3D anatomy lab could not open.');
  await expect(error.getByRole('heading', { name: 'the 3D anatomy lab could not open.' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'try 3D again' })).toBeVisible();

  const catalog = page.getByRole('region', { name: 'structure names: test shapes (fixture)' });
  await expect(catalog).toBeVisible();
  await expect(catalog.getByText('draft · labels waiting for review')).toBeVisible();
  await expect(catalog.getByText('name from the test fixture')).toBeVisible();
  const attribution = catalog.getByTestId('anatomy-fallback-attribution');
  await expect(attribution).toContainText('test shapes made in code for automated tests');
  await expect(attribution).toContainText('model release: fixture 1 (made in code)');
  await expect(attribution.getByRole('link', { name: 'CC Attribution 4.0 International' })).toHaveCount(0);
  await expect(catalog.getByRole('status')).toHaveText('showing 5 of 5 matching structures');

  const search = catalog.getByLabel('find a structure');
  await search.fill('cube b');
  await expect(catalog.getByRole('status')).toHaveText('showing 1 of 1 matching structures');
  await expect(catalog.getByRole('listitem')).toHaveCount(1);
  await expect(catalog.getByRole('listitem').first()).toContainText('fixture cube B');
  await search.fill('not listed');
  await expect(catalog.getByText('no structure names match this search.')).toBeVisible();

  // Switching to a real draft while 3D is unavailable keeps its original credit and license.
  const real = page.getByRole('button', { name: 'kidneys and urinary tract', exact: true });
  await expect(real).toBeVisible();
  await real.click();
  const realCatalog = page.getByRole('region', { name: 'structure names: kidneys and urinary tract' });
  await expect(realCatalog.getByTestId('anatomy-fallback-attribution')).toContainText('BodyParts3D');
  await expect(realCatalog.getByTestId('anatomy-fallback-attribution')).toContainText('draft model');
  await expect(realCatalog.getByRole('link', { name: 'CC Attribution 4.0 International' }))
    .toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
  await expect(realCatalog.getByLabel('find a structure')).toHaveValue('');
  expect(glb).toEqual([]);
});
