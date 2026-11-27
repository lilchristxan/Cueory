import { expect, test } from '@playwright/test';
import { markPanelsSeen } from './clock';

for (const theme of ['light', 'dark'] as const) {
  test.describe(`adaptive sample in ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('a labeled sample advances by keyboard and touch and schedules the next review', async ({ page, browserName }) => {
      // On macOS WebKit, Option-Tab includes buttons when plain Tab visits text fields only.
      const nextControl = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
      await page.clock.setFixedTime(new Date(2028, 1, 28, 12));
      await markPanelsSeen(page);
      await page.addInitScript(palette => localStorage.setItem('cueory-theme', palette), theme);
      await page.goto('/preview/adaptive-learning');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      await expect(page.getByText('labeled sample cards only.', { exact: false })).toBeVisible();
      const exam = page.getByLabel('exam date (optional)');
      const start = page.getByRole('button', { name: 'start sample session' });
      await exam.focus();
      // Engines may expose each date segment as a separate tab stop.
      for (let tab = 0; tab < 6; tab++) {
        await page.keyboard.press(nextControl);
        if (await start.evaluate(button => button === document.activeElement)) break;
      }
      await expect(start).toBeFocused();
      await page.keyboard.press('Enter');

      const heading = page.getByRole('heading', { level: 2 });
      const reveal = page.getByRole('button', { name: 'show answer' });
      await expect(heading).toBeFocused();
      const first = await heading.innerText();
      await page.keyboard.press(nextControl);
      await expect(reveal).toBeFocused();
      await page.keyboard.press('Space');
      await page.getByRole('button', { name: 'i missed it' }).tap();
      await expect(heading).toBeFocused();
      await expect(heading).not.toHaveText(first);

      for (let number = 0; number < 2; number++) {
        await reveal.tap();
        const knew = page.getByRole('button', { name: 'i knew it' });
        await expect(knew).toBeVisible();
        const box = await knew.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
        expect(box?.width).toBeGreaterThanOrEqual(44);
        await knew.tap();
      }
      await expect(heading).toHaveText('nothing else due now');
      await expect(page.getByText('3 cards answered this session.')).toBeVisible();
      await expect(page.locator('time')).toHaveAttribute('datetime', '2028-02-29');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await page.getByRole('button', { name: 'jump to that review day' }).tap();
      await expect(page.getByText('sample day 2028-02-29')).toBeVisible();
      await expect(page.getByText('due review · card 1')).toBeVisible();
      for (let number = 0; number < 3; number++) {
        await reveal.tap();
        await page.getByRole('button', { name: 'i knew it' }).tap();
      }
      await page.getByRole('button', { name: 'restart the sample' }).tap();
      await expect(start).toBeFocused();
    });
  });
}


test('a backwards device clock keeps the sample session on the last accepted day', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2028, 1, 28, 12));
  await markPanelsSeen(page);
  await page.goto('/preview/adaptive-learning');
  await page.getByRole('button', { name: 'start sample session' }).click();
  const reveal = page.getByRole('button', { name: 'show answer' });
  const knew = page.getByRole('button', { name: 'i knew it' });
  await reveal.click();
  await knew.click();

  await page.clock.setFixedTime(new Date(2028, 1, 27, 12));
  for (let remaining = 2; remaining > 0; remaining--) {
    await reveal.click();
    await knew.click();
  }
  await expect(page.getByText('3 cards answered this session.')).toBeVisible();
  await expect(page.getByText('0 of 3 cards meet the spaced mastery rule.')).toBeVisible();
  await expect(page.locator('time')).toHaveAttribute('datetime', '2028-02-29');
});
