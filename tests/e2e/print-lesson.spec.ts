import { expect, test } from '@playwright/test';

test('the lesson prints its complete reader without site navigation', async ({ page }) => {
  await page.goto('/learn/study-skills');
  await page.emulateMedia({ media: 'print' });

  await expect(page.locator('[data-scroll-header]')).toBeHidden();
  await expect(page.locator('[data-site-footer]')).toBeHidden();
  await expect(page.locator('[data-testid="mode-grid"]')).toBeHidden();
  await expect(page.locator('[data-print-lesson-content]')).toBeVisible();
  await expect(page.locator('[data-print-lesson-content] li')).toHaveCount(3);
  await expect(page.locator('[data-print-lesson-content] li').first()).toHaveText(/study/);
  await expect(page.locator('[data-print-lesson-content] li').last()).toHaveText(/one idea/);
});
