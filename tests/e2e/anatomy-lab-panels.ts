import { type Page } from '@playwright/test';

/**
 * The lab keeps its side panels and the "more" drawer closed below the desktop width, and the "more" drawer closed at
 * every width. Tests that use what is inside them open them first, the way a student would: with the buttons.
 * Safe to call when the lab did not open (the 3D-unavailable text route): it then does nothing.
 */
export async function openLabPanels(page: Page): Promise<void> {
  const stage = page.getByTestId('anatomy-stage');
  await stage.or(page.getByRole('alert')).first().waitFor({ timeout: 20_000 });
  if ((await stage.count()) === 0) return;
  const dock = page.getByRole('group', { name: 'panels' });
  for (const name of ['controls', 'body systems']) {
    const button = dock.getByRole('button', { name, exact: true });
    if ((await button.isVisible()) && (await button.getAttribute('aria-expanded')) === 'false') await button.click();
  }
  const more = page.getByRole('button', { name: 'more', exact: true });
  if ((await more.getAttribute('aria-expanded')) === 'false') await more.click();
  // Opening a lab puts focus on the 3D view; the clicks above moved it, so put it back for the test that follows.
  await page.locator('canvas').first().focus();
}
