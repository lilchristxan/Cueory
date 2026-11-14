import { expect, test } from '@playwright/test';

// The static catalog is the lab's genuine no-JavaScript route, not a simulated WebGL error.
test.use({ javaScriptEnabled: false });

test('anatomy structure names remain reachable and credited without JavaScript', async ({ page }) => {
  const modelRequests: string[] = [];
  page.on('request', (request) => {
    if (/\.glb(?:[?#]|$)/i.test(request.url())) modelRequests.push(request.url());
  });
  await page.goto('/preview/anatomy-lab');
  const textLink = page.getByRole('link', { name: 'read structure names without JavaScript' });
  await expect(textLink).toBeVisible();
  await textLink.click();
  await expect(page).toHaveURL(/\/preview\/anatomy-text$/);
  await expect(page.getByRole('heading', { name: 'anatomy lab: structure names' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

  // E2E builds explicitly enable the draft source systems; fixture shapes never stand in for real labels here.
  const systems = page.locator('section[data-anatomy-system]');
  expect(await systems.count()).toBeGreaterThan(0);
  const first = systems.first();
  expect(await first.locator('li').count()).toBeGreaterThan(0);
  await expect(first.getByText('name from the BodyParts3D parts list')).toBeVisible();
  await expect(first).toContainText("Male's Anatomy (BodyParts3D reference model, adult human male)");
  await expect(first.getByRole('link', { name: 'source details' })).toHaveAttribute(
    'href', 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html',
  );
  await expect(first.getByRole('link', { name: 'CC Attribution 4.0 International' })).toHaveAttribute(
    'href',
    'https://creativecommons.org/licenses/by/4.0/',
  );
  // The source-ID catalog and the keyboard-operable, source-only Find It both
  // work without JavaScript, WebGL or a model request.
  const practice = first.locator('[data-anatomy-text-practice]');
  const practiceToggle = practice.locator(':scope > summary');
  await expect(practice).toBeVisible();
  await practiceToggle.focus();
  await page.keyboard.press('Enter');
  await expect(practice).toHaveAttribute('open', '');
  await expect(practice.locator('ol > li')).toHaveCount(5);

  // A real source ID beyond the first five prompts remains available in the
  // full catalog with its exact source name.
  const heart = page.locator('[data-anatomy-system="heart"]');
  await expect(heart).toBeVisible();
  await expect(heart.getByText('(ID: FMA7098)', { exact: true })).toBeVisible();

  const check = practice.locator('ol > li details').first();
  await check.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(check).toHaveAttribute('open', '');
  await expect(check.getByText(/^trail:/)).toBeVisible();
  const link = check.getByRole('link', { name: 'go to catalog entry' });
  const target = await link.getAttribute('href');
  expect(target).toMatch(/^#structure-/);
  await link.click();
  await expect(page.locator(target!)).toBeVisible();

  await check.locator('summary').click();
  await expect(check).not.toHaveAttribute('open', '');
  expect(modelRequests).toEqual([]);
});