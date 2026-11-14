import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

/** A completed old-system network response must never enter the new system. */
test('a late successful old-system GLB cannot replace the newly selected body system', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one late-success network race per browser engine');
  test.setTimeout(60_000);
  await page.goto('/preview/anatomy-lab');
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.locator('canvas')).toBeFocused({ timeout: 20_000 });
  const picker = page.getByRole('group', { name: 'body system' });
  const whole = picker.getByRole('button', { name: 'whole body', exact: true });
  await expect(whole).toBeVisible();
  await whole.click();
  await expect(page.getByTestId('anatomy-files')).toContainText('model files loaded: 1 of 11', { timeout: 20_000 });

  // Use the actual heart GLB. Fetch it successfully, but withhold the
  // resolved Response until after the student changes systems. Ignore only
  // the intercepted fetch's abort signal so the *late success* is exercised.
  await page.evaluate(() => {
    const state = window as Window & {
      __cueoryHeldHeart?: boolean;
      __cueoryReleaseHeart?: () => void;
      __cueoryHeartDelivered?: boolean;
    };
    state.__cueoryHeldHeart = false;
    state.__cueoryHeartDelivered = false;
    const originalFetch = window.fetch.bind(window);
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const address = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (new URL(address, window.location.href).pathname !== '/models/anatomy/heart.glb') {
        return originalFetch(input, init);
      }
      return new Promise<Response>((resolve, reject) => {
        originalFetch(address).then((response) => {
          if (!response.ok) { reject(new Error('test heart GLB must load successfully')); return; }
          state.__cueoryHeldHeart = true;
          state.__cueoryReleaseHeart = () => {
            state.__cueoryHeartDelivered = true;
            resolve(response);
          };
        }, reject);
      });
    }) as typeof window.fetch;
  });

  let released = false;
  try {
    const vessels = page.getByRole('group', { name: 'layers, skin to bone' })
      .getByRole('button', { name: /^vessels \(/ });
    await vessels.click();
    await expect.poll(() => page.evaluate(() =>
      (window as Window & { __cueoryHeldHeart?: boolean }).__cueoryHeldHeart),
    { timeout: 20_000 }).toBe(true);

    const kidneys = picker.getByRole('button', { name: 'kidneys and urinary tract', exact: true });
    await kidneys.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (window as Window & { __cueoryReleaseHeart?: () => void }).__cueoryReleaseHeart?.();
    });
    released = true;
    await expect(kidneys).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() =>
      (window as Window & { __cueoryHeartDelivered?: boolean }).__cueoryHeartDelivered)).toBe(true);

    // Kidney names come from the actual checked-in system's source records.
    const list = page.getByRole('region', { name: 'structures' });
    await expect(list.getByRole('button', { name: 'right kidney', exact: true }))
      .toBeEnabled({ timeout: 20_000 });
    await expect(list.getByRole('button', { name: 'heart', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('anatomy-files')).toHaveCount(0);
    await expect(page.getByRole('alert').filter({ hasText: 'could not load' })).toHaveCount(0);
    await page.waitForTimeout(250); // allow the obsolete promise and model decoder to settle
    await expect(kidneys).toHaveAttribute('aria-pressed', 'true');
    await expect(list.getByRole('button', { name: 'right kidney', exact: true })).toBeEnabled();
    await expect(list.getByRole('button', { name: 'heart', exact: true })).toHaveCount(0);
  } finally {
    // An assertion failure must never leave the old system's fetch pending.
    if (!released) await page.evaluate(() =>
      (window as Window & { __cueoryReleaseHeart?: () => void }).__cueoryReleaseHeart?.());
  }
});
