import { expect, test } from '@playwright/test';

/**
 * A file can download and decode successfully while a listed mesh is absent.
 * Distinguish that proven absence from the "not loaded yet" state of a file
 * that was never fetched. This modifies only the code-made test fixture's
 * node IDs in an intercepted response, never any source anatomy data.
 */
test('a fully downloaded fixture reports its unmatched ID as not in this model', async ({ page }) => {
  let changed = 0;

  await page.route('**/preview/anatomy-fixture/fixture.glb', async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);

    // The fixture GLB has FIX001 in both a mesh and a node entry. A same-length
    // replacement keeps its GLB chunk lengths and all other meshes intact.
    const bytes = Buffer.from(await response.body());
    const oldId = Buffer.from('FIX001');
    for (let pos = bytes.indexOf(oldId); pos !== -1; pos = bytes.indexOf(oldId, pos + oldId.length)) {
      bytes.write('FIX901', pos, 'ascii');
      changed++;
    }
    expect(changed, 'the code-made fixture must include the named mesh and node').toBe(2);
    await route.fulfill({ response, body: bytes });
  });

  await page.goto('/preview/anatomy-lab?fixture');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();

  const catalog = page.getByRole('region', { name: 'structures' });
  await expect(catalog.getByRole('button', { name: 'fixture cube B', exact: true }))
    .toBeEnabled({ timeout: 20_000 });
  const unmatched = catalog.getByRole('button', {
    name: 'fixture cube A (not in this model)', exact: true,
  });
  await expect(unmatched).toBeVisible();
  await expect(unmatched).toBeDisabled();

  // The successful file is not "not loaded yet", and one missing ID does not
  // disable the four matching names or misreport the entire GLB as a failure.
  await expect(catalog.getByRole('button', {
    name: 'fixture cube A (not loaded yet)', exact: true,
  })).toHaveCount(0);
  await expect(page.getByTestId('anatomy-missing-count')).toContainText(
    '1 listed structures were not found in the loaded model files.',
  );
  await expect(page.getByRole('button', { name: 'try loading again' })).toHaveCount(0);
  expect(changed).toBe(2);
});
