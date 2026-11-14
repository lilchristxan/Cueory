import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Synthetic fixture IDs only: this does not assert or publish real clinical anatomy. */
const URL = '/preview/anatomy-lab?fixture';

async function openFixture(page: Page) {
  await page.goto(URL);
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.getByRole('region', { name: 'structures' })
    .getByRole('button', { name: 'fixture cube A', exact: true }))
    .toBeEnabled({ timeout: 20_000 });
}

test('each selected structure has an accessible flag button and the existing patient warning', async ({ page }) => {
  await openFixture(page);
  await page.getByRole('region', { name: 'structures' })
    .getByRole('button', { name: 'fixture cube A', exact: true }).click();

  const card = page.getByRole('region', { name: 'fixture cube A' });
  const trigger = card.getByRole('button', { name: 'flag or comment', exact: true });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  // The footer is a separate React island. Contextual and footer aria-controls
  // must never point at the same panel even if both roots start with useId().
  const footer = page.locator('[data-footer-flag] button[aria-label="flag or comment"]');
  await expect(footer).toBeVisible();
  const cardPanelId = await trigger.getAttribute('aria-controls');
  const footerPanelId = await footer.getAttribute('aria-controls');
  expect(cardPanelId).toBeTruthy();
  expect(footerPanelId).toBeTruthy();
  expect(cardPanelId).not.toBe(footerPanelId);

  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(card.getByTestId('flag-report-context')).toHaveText(
    'this report is about anatomy structure FIX001 in test shapes (fixture).',
  );
  // The signed-out fallback is the existing form, not a separate unprotected endpoint.
  await expect(card).toContainText('a free account is needed to send a report');
  await expect(card.getByTestId('flag-patient-warning')).toContainText('patient names, dates of birth, medical record numbers');

  const access = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(access.violations.map((entry) => `${entry.id}: ${entry.help}`)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test('changing structures closes the old report and shows only the newly selected source ID', async ({ page }) => {
  await openFixture(page);
  const list = page.getByRole('region', { name: 'structures' });
  await list.getByRole('button', { name: 'fixture cube A', exact: true }).click();

  const cardA = page.getByRole('region', { name: 'fixture cube A' });
  await cardA.getByRole('button', { name: 'flag or comment', exact: true }).click();
  await expect(cardA.getByTestId('flag-report-context')).toContainText('FIX001');

  await list.getByRole('button', { name: 'fixture cube B', exact: true }).click();
  await expect(cardA).toHaveCount(0);

  const cardB = page.getByRole('region', { name: 'fixture cube B' });
  const next = cardB.getByRole('button', { name: 'flag or comment', exact: true });
  await expect(next).toHaveAttribute('aria-expanded', 'false');
  await next.click();
  await expect(cardB.getByTestId('flag-report-context')).toContainText('FIX002');
  await expect(cardB.getByTestId('flag-report-context')).not.toContainText('FIX001');
});
