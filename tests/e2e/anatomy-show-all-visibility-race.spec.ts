import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine, sizeOf } from './projects';

/**
 * Issue #662 / Anatomy Lab QA section 2, "Conflicting actions".
 * A delayed whole-body download must add geometry without undoing the
 * student's newer visibility choice. This uses real draft-preview models
 * because a one-file fixture cannot reproduce the lazy multi-layer race.
 */
test('show all cannot undo a newer show-only selection when a deeper model arrives late', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one full-body download race per browser engine');
  test.setTimeout(120_000);

  await page.goto('/preview/anatomy-lab');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });
  const whole = page.getByRole('group', { name: 'body system' })
    .getByRole('button', { name: 'whole body', exact: true });
  await expect(whole).toBeVisible({ timeout: 15_000 });
  await whole.click();

  const files = page.getByTestId('anatomy-files');
  await expect(files).toContainText('model files loaded: 1 of 11', { timeout: 20_000 });
  const structures = page.getByRole('region', { name: 'structures' });
  const search = page.getByLabel('find a structure');
  await search.fill('skin');
  const skin = structures.getByRole('button', { name: 'skin', exact: true });
  await expect(skin).toBeEnabled({ timeout: 20_000 });
  await skin.click();
  await expect(skin).toHaveAttribute('aria-pressed', 'true');
  const nameCard = page.getByRole('region', { name: 'skin' });
  await expect(nameCard).toBeVisible();

  // The outer skin file is already loaded. Hold one deeper GLB while the
  // initial "show all" request starts fetching the remaining layers.
  const held: Array<() => void> = [];
  await page.route(/\/models\/anatomy\/muscle\.glb(?:[?#]|$)/, async (route) => {
    await new Promise<void>((resolve) => held.push(resolve));
    await route.continue();
  });
  try {
    await page.getByRole('button', { name: 'show all', exact: true }).click();
    await expect.poll(() => held.length, { timeout: 20_000 }).toBe(1);
    await expect(page.getByTestId('anatomy-layer-loading')).toBeVisible();

    // The student's newer decision must supersede every pending layer reveal.
    await nameCard.getByRole('button', { name: 'show only this' }).press('Enter');
    await expect(skin).toHaveAttribute('aria-pressed', 'true');
    // This exact BodyParts3D source label belongs to muscle.glb, the held
    // request. It cannot become visible or even selectable until that GLB
    // finishes. Checking heart alone would not prove the delayed-file race.
    await search.fill('diaphragm');
    await expect(structures.getByRole('button', { name: 'diaphragm (not loaded yet)', exact: true }))
      .toBeDisabled();
  } finally {
    // Always unblock the network, including on assertion failure.
    held.splice(0).forEach((release) => release());
  }

  // All real GLBs may still arrive. They must be retained and searchable
  // without making any hidden non-skin structure visible again.
  await expect(files).toContainText('model files loaded: 11 of 11', { timeout: 80_000 });
  await expect(page.getByTestId('anatomy-layer-loading')).toHaveCount(0);
  // The delayed muscle file has now been integrated, but its source-backed
  // structure must remain hidden under the newer show-only choice.
  await expect(structures.getByRole('button', { name: 'diaphragm (hidden)', exact: true }))
    .toBeEnabled({ timeout: 20_000 });
  await search.fill('heart');
  await expect(structures.getByRole('button', { name: 'heart (hidden)', exact: true }))
    .toBeEnabled({ timeout: 20_000 });
  await expect(nameCard).toBeVisible();
  await search.fill('skin');
  await expect(structures.getByRole('button', { name: 'skin', exact: true }))
    .toHaveAttribute('aria-pressed', 'true');
});

/**
 * Issue #662 / Anatomy Lab QA section 3, "Phone layout".
 * Exercise the real 1,255-name catalog, not just the five-name fixture.
 * Avoid downloading any deeper GLBs while checking both narrow widths.
 */
test('the real whole-body catalog remains searchable without horizontal overflow at 320 and 390 px', async ({ page }, info) => {
  test.skip(sizeOf(info) !== 'phone', 'narrow source-catalog check on both phone themes');
  test.setTimeout(90_000);

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: width === 320 ? 700 : 844 });
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(page.locator('canvas')).toBeFocused({ timeout: 15_000 });
    const whole = page.getByRole('group', { name: 'body system' })
      .getByRole('button', { name: 'whole body', exact: true });
    await expect(whole).toBeVisible({ timeout: 15_000 });
    await whole.click();
    await expect(page.getByTestId('anatomy-files'))
      .toContainText('model files loaded: 1 of 11', { timeout: 20_000 });

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `initial catalog overflow at ${width}px`,
    ).toBeLessThanOrEqual(width);
    const search = page.getByLabel('find a structure');
    await search.focus();
    await expect(search).toBeFocused();
    await search.fill('heart');
    const heart = page.getByRole('region', { name: 'structures' })
      .getByRole('button', { name: 'heart (not loaded yet)', exact: true });
    await expect(heart).toBeVisible();
    await expect(heart).toBeDisabled();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(width);
  }
});
