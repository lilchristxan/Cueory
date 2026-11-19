import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { isDesktopOfEachEngine } from './projects';

type FontLoadSpy = {
  requests: string[];
  load?: FontFaceSet['load'];
  supported: boolean;
};

/** Only synthetic fixture geometry, never actual clinical or unpublished anatomy. */
test('exports an Anatomy Lab PNG when both browser font requests stall', async ({ page }, info) => {
  test.skip(!isDesktopOfEachEngine(info), 'one image export per desktop browser engine');

  // Intercept only FontFaceSet.load(). CSS fonts and the 3D model still load normally.
  // The browser intentionally never settles either promise to reproduce an offline font stall.
  await page.addInitScript(() => {
    const requests: string[] = [];
    const spy: FontLoadSpy = { requests, supported: false };
    // WebKit did not route the application call through an own property on document.fonts. Find the prototype that
    // owns the standard FontFaceSet.load method and replace that descriptor instead. The assertion after navigation
    // proves that the page still resolves document.fonts.load to this exact spy before the export starts.
    let prototype: object | null = Object.getPrototypeOf(document.fonts);
    while (prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'load');
      if (descriptor) {
        if (typeof descriptor.value !== 'function' || !descriptor.configurable) break;
        const nativeLoad = descriptor.value as FontFaceSet['load'];
        const load: FontFaceSet['load'] = function (this: FontFaceSet, ...args: Parameters<FontFaceSet['load']>) {
          if (this === document.fonts) {
            requests.push(args[0]);
            return new Promise<FontFace[]>(() => {});
          }
          return nativeLoad.call(this, ...args);
        };
        Object.defineProperty(prototype, 'load', { ...descriptor, value: load });
        spy.load = load;
        spy.supported = true;
        break;
      }
      prototype = Object.getPrototypeOf(prototype);
    }
    (window as Window & { __anatomyFontSpy?: FontLoadSpy }).__anatomyFontSpy = spy;
  });

  await page.goto('/preview/anatomy-lab?fixture');
  const fontSpyInstalled = await page.evaluate(() => {
    const spy = (window as Window & { __anatomyFontSpy?: FontLoadSpy }).__anatomyFontSpy;
    return spy?.supported === true && document.fonts.load === spy.load;
  });
  expect(fontSpyInstalled, 'FontFaceSet.load spy stays installed after navigation').toBe(true);
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.getByRole('button', { name: 'fixture cube A', exact: true }))
    .toBeEnabled({ timeout: 20_000 });

  // Without the deadline, no download fires and this test fails instead of hanging indefinitely.
  const downloadEvent = page.waitForEvent('download', { timeout: 15_000 });
  await page.getByRole('button', { name: 'phone 1080×1920' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('cueory-fixture-phone.png');
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1920);
  await expect(page.getByText('saved cueory-fixture-phone.png.')).toBeVisible();

  const requests = await page.evaluate(
    () => (window as Window & { __anatomyFontSpy?: FontLoadSpy }).__anatomyFontSpy?.requests ?? [],
  );
  expect(requests).toHaveLength(2);
  expect(requests[0]).toMatch(/^700 /);
  expect(requests[1]).toMatch(/^400 /);
});
