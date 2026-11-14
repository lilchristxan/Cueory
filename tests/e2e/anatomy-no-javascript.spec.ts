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
  // Source-only Find It does not require scripts, WebGL, or any model fetch.
  const practice = first.getByRole('region', { name: 'find it in words' });
  await expect(practice).toBeVisible();
  const prompts = practice.locator('details');
  await expect(prompts).toHaveCount(5);
  // A source ID beyond the five practice prompts must still be findable with no JavaScript.
  const catalogItems = first.locator('div.space-y-2 li');
  expect(await catalogItems.count()).toBeGreaterThan(5);
  const later = catalogItems.nth(5);
  await expect(later).toContainText(/ID: [A-Za-z0-9_-]+/);
  const laterId = (await later.textContent())?.match(/ID: ([A-Za-z0-9_-]+)/)?.[1];
  expect(laterId).toBeTruthy();
  await expect(first.getByText(`(ID: ${laterId})`, { exact: true })).toBeVisible();
  const firstPrompt = prompts.first();
  const sourceId = await firstPrompt.locator('summary').textContent();
  expect(sourceId).toMatch(/which structure has ID [A-Za-z0-9_-]+\? show answer/);
  const answer = firstPrompt.locator('p').first();
  await expect(answer).toBeHidden();
  await firstPrompt.locator('summary').click();
  await expect(firstPrompt).toHaveAttribute('open', '');
  await expect(answer).toBeVisible();
  expect((await answer.textContent())?.trim()).toBeTruthy();
  await firstPrompt.locator('summary').click();
  await expect(answer).toBeHidden();
  expect(modelRequests).toEqual([]);
});
