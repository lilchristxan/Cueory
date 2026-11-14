import { expect, test } from '@playwright/test';

/**
 * Task 178 release QA: switching twice while initial GLBs are in flight.
 * An obsolete decoded system must not appear as the newer system is loading.
 * These are only the existing, draft-enabled source models; no model is released.
 */
test('two rapid system switches discard the older in-flight 3D model', async ({ page }) => {
  test.setTimeout(90_000);

  // Load the code-made fixture first. Neither real source GLB is cached.
  await page.goto('/preview/anatomy-lab?fixture');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.getByRole('button', { name: 'fixture cube A', exact: true }))
    .toBeEnabled({ timeout: 20_000 });

  const pendingKidneys: Array<() => void> = [];
  const pendingHeart: Array<() => void> = [];
  const finishedKidneys: string[] = [];
  let kidneyRequests = 0;
  let heartRequests = 0;
  const isKidney = (url: string) => new URL(url).pathname === '/models/anatomy/kidneys.glb';

  // Observe both successful completion and a browser-initiated cancellation.
  // Either outcome is safe, as long as B never becomes the ready C system.
  page.on('requestfinished', (request) => {
    if (isKidney(request.url())) finishedKidneys.push('finished');
  });
  page.on('requestfailed', (request) => {
    if (isKidney(request.url())) finishedKidneys.push('cancelled');
  });

  await page.route('**/models/anatomy/kidneys.glb', async (route) => {
    kidneyRequests++;
    await new Promise<void>((resolve) => pendingKidneys.push(resolve));
    await route.continue();
  });
  await page.route('**/models/anatomy/heart.glb', async (route) => {
    heartRequests++;
    await new Promise<void>((resolve) => pendingHeart.push(resolve));
    await route.continue();
  });

  const picker = page.getByRole('group', { name: 'body system' });
  const kidneys = picker.getByRole('button', { name: 'kidneys and urinary tract', exact: true });
  const heartSystem = picker.getByRole('button', { name: 'heart and great vessels', exact: true });

  try {
    // A: fixture is ready. B: kidneys starts but its GLB cannot finish.
    await kidneys.click();
    await expect.poll(() => pendingKidneys.length, { timeout: 20_000 }).toBe(1);
    await expect(kidneys).toHaveAttribute('aria-pressed', 'true');

    // C: heart starts while B is still downloading.
    await heartSystem.click();
    await expect.poll(() => pendingHeart.length, { timeout: 20_000 }).toBe(1);
    await expect(heartSystem).toHaveAttribute('aria-pressed', 'true');
    await expect(kidneys).toHaveAttribute('aria-pressed', 'false');
    const loadingHeart = page.getByText('loading heart and great vessels…', { exact: true });
    await expect(loadingHeart).toBeVisible();
    const catalog = page.getByRole('region', { name: 'structures' });
    await expect(catalog.getByRole('button', { name: 'heart', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'square 1080×1080' })).toBeDisabled();

    // B arrives after C became current. The old GLB must be ignored, not
    // replace the pending heart or display kidney structure names.
    pendingKidneys.splice(0).forEach((resume) => resume());
    await expect.poll(() => finishedKidneys.length, { timeout: 20_000 }).toBe(1);
    // A completed network request can precede asynchronous GLB decoding.
    // Keep C's request blocked during a bounded settling window so a late
    // obsolete integration cannot temporarily publish B as the ready view.
    await page.waitForTimeout(400);
    await expect(loadingHeart).toBeVisible();
    await expect(heartSystem).toHaveAttribute('aria-pressed', 'true');
    await expect(catalog.getByRole('button', { name: /kidney/i })).toHaveCount(0);
    await expect(catalog.getByRole('button', { name: 'heart', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'start the quiz' })).toBeDisabled();
    await expect(page.getByRole('alert').filter({ hasText: 'could not load' })).toHaveCount(0);

    // Only C becomes ready. The old B must not restore its controls, quiz
    // state, error, names, or loaded-status announcement.
    pendingHeart.splice(0).forEach((resume) => resume());
    await expect(catalog.getByRole('button', { name: 'heart', exact: true }))
      .toBeEnabled({ timeout: 20_000 });
    await expect(page.getByText(/^heart and great vessels: \d+ structures loaded\.$/))
      .toHaveCount(1, { timeout: 20_000 });
    await expect(catalog.getByRole('button', { name: /kidney/i })).toHaveCount(0);
    await expect(heartSystem).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'square 1080×1080' })).toBeEnabled();
    expect(kidneyRequests).toBe(1);
    expect(heartRequests).toBe(1);
  } finally {
    // A failed assertion must never strand the intercepted requests.
    pendingKidneys.splice(0).forEach((resume) => resume());
    pendingHeart.splice(0).forEach((resume) => resume());
  }
});
