import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

/**
 * Task 178: real draft-model network races. These tests use the locked
 * draft-enabled preview and the existing BodyParts3D files, never fixture
 * labels or an invented anatomy structure.
 */
const PREVIEW = '/preview/anatomy-lab';
const structures = (page: Page) => page.getByRole('region', { name: 'structures' });

async function openWholeBody(page: Page): Promise<void> {
  await page.goto(PREVIEW);
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  // Canvas visibility alone does not mean the 3D scene has finished opening.
  await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });
  const whole = page.getByRole('group', { name: 'body system' })
    .getByRole('button', { name: 'whole body', exact: true });
  await expect(whole).toBeVisible({ timeout: 15_000 });
  await whole.click();
  await expect(page.getByTestId('anatomy-files'))
    .toContainText('model files loaded: 1 of 11', { timeout: 20_000 });
}

test.describe('anatomy whole-body network races', () => {
  test('a failed file keeps its successful layer sibling and retry requests only the failed GLB', async ({ page }) => {
    await openWholeBody(page);

    let heartRequests = 0;
    let vesselsRequests = 0;
    await page.route(/\/models\/anatomy\/(?:heart|vessels)\.glb(?:\?|$)/, async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').pop();
      if (name === 'heart.glb') heartRequests++;
      if (name === 'vessels.glb' && ++vesselsRequests === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'text/plain',
          body: 'simulated temporary model outage',
        });
        return;
      }
      await route.continue();
    });

    const files = page.getByTestId('anatomy-files');
    await page.getByRole('group', { name: 'layers, skin to bone' })
      .getByRole('button', { name: /^vessels \(/ }).click();

    // heart.glb and vessels.glb are both required for this layer. A failed
    // vessels request must not discard the successfully integrated heart.
    await expect(files).toContainText('model files loaded: 2 of 11', { timeout: 20_000 });
    const failure = page.getByRole('alert').filter({ hasText: 'Could not load vessels.' });
    await expect(failure).toBeVisible();
    await page.getByLabel('find a structure').fill('heart');
    await expect(structures(page).getByRole('button', { name: 'heart (hidden)', exact: true }))
      .toBeEnabled();

    await failure.getByRole('button', { name: 'try vessels again' }).click();
    await expect(files).toContainText('model files loaded: 3 of 11', { timeout: 20_000 });
    await expect(failure).toHaveCount(0);
    expect(heartRequests, 'the already-loaded shared heart model must be reused').toBe(1);
    expect(vesselsRequests, 'only the failed model must be retried').toBe(2);
  });

  test('a late show-all download does not undo a newer show-only-this choice', async ({ page }) => {
    // Take the name from the checked-in source file, not anatomy memory.
    const muscleManifest = JSON.parse(
      await readFile(new globalThis.URL('../../content/visuals/anatomy-muscle.json', import.meta.url), 'utf8'),
    ) as { labels: Array<{ text: string }> };
    const muscleName = muscleManifest.labels[0]?.text;
    if (!muscleName) throw new Error('The checked-in muscle source contains no label.');

    await openWholeBody(page);
    await page.getByLabel('find a structure').fill('skin');
    await structures(page).getByRole('button', { name: 'skin', exact: true }).click();
    const nameCard = page.getByRole('region', { name: 'skin' });
    await expect(nameCard.getByRole('button', { name: 'show only this' })).toBeVisible();

    const held: Array<() => void> = [];
    let muscleRequests = 0;
    // Keep precisely one successful download pending. Refuse the other GLBs
    // so the test covers intent ordering without decoding the entire large
    // whole-body model on CI phones.
    await page.route(/\/models\/anatomy\/[^/]+\.glb(?:\?|$)/, async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').pop();
      if (name === 'muscle.glb') {
        muscleRequests++;
        await new Promise<void>((resolve) => held.push(resolve));
        await route.continue();
        return;
      }
      await route.abort('failed');
    });

    try {
      await page.getByRole('button', { name: 'show all', exact: true }).click();
      // The phone safety confirmation must not be bypassed in the test.
      if ((page.viewportSize()?.width ?? 1024) < 768) {
        const confirmation = page.getByTestId('anatomy-bulk-confirm');
        await expect(confirmation).toBeVisible();
        await confirmation.getByRole('button', { name: 'load every layer' }).click();
      }
      await expect.poll(() => held.length, { timeout: 20_000 }).toBe(1);
      await nameCard.getByRole('button', { name: 'show only this' }).click();
      // The earlier show-all action is obsolete before the network completes.
      held.splice(0).forEach((release) => release());

      await expect(page.getByTestId('anatomy-files'))
        .toContainText('model files loaded: 2 of 11', { timeout: 20_000 });
      await page.getByLabel('find a structure').fill(muscleName);
      await expect(structures(page).getByRole('button', { name: `${muscleName} (hidden)`, exact: true }))
        .toBeEnabled({ timeout: 20_000 });
      await expect(nameCard).toBeVisible();
      expect(muscleRequests).toBe(1);
    } finally {
      // Never leave an intercepted GLB hanging if an assertion fails.
      held.splice(0).forEach((release) => release());
    }
  });
});
