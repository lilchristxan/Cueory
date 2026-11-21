import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { site } from '../../src/config/site';

// The welcome promo takes focus after 5 seconds; its own spec tests it. Keep these page checks independent of it.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch {
      // With storage blocked, the welcome promo does not appear.
    }
  });
});

/**
 * Task 200: the legal pages. Each is a plain Prose page with one h1, the sections a reader needs, a working contact
 * address and, where facts are still Christian's to supply, a visible [[CHRISTIAN: …]] mark (never silently blank).
 */
const pages = [
  {
    path: '/terms',
    title: 'terms · cueory',
    h1: 'terms of use',
    sections: [
      'Who may use the site', 'Study help, not medical advice', 'No promises about exams or licensure', 'Accounts',
      'Acceptable use', 'What you send us', 'Free service, as is', 'Limits on our liability',
      'Your responsibility to us', 'Ending access', 'Changes to these terms', 'Disputes', 'Governing law and venue',
    ],
  },
  {
    path: '/copyright',
    title: 'copyright · cueory',
    h1: 'copyright and takedown requests',
    sections: [
      'No public posting', 'Reporting a copyright problem', 'What we do with a notice',
      'If your material was removed: counter-notice', 'Repeat infringers',
    ],
  },
  {
    path: '/accessibility',
    title: 'accessibility · cueory',
    h1: 'accessibility',
    sections: ['Our goal', 'What we build in', 'How we check', 'Known limits', 'Tell us'],
  },
  {
    path: '/licenses',
    title: 'licences · cueory',
    h1: 'licences and credits',
    sections: ["Cueory's own work", 'Open content we adapt', 'Fonts', 'Software'],
  },
] as const;

for (const legal of pages) {
  test.describe(legal.path, () => {
    test('shows its sections, contact address and open facts', async ({ page }) => {
      const response = await page.goto(legal.path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(legal.title);
      const main = page.getByRole('main');
      await expect(main.getByRole('heading', { level: 1 })).toHaveText(legal.h1);
      for (const name of legal.sections) {
        await expect(main.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
      }
      await expect(main.locator(`a[href="mailto:${site.contactEmail}"]`).first()).toBeVisible();
      // Every open fact is a visible [[CHRISTIAN: …]] mark, and the approval line is one of them until Christian sets
      // the page's date in src/config/legal.ts (then it reads "Effective …. Approved by Christian, founder, on …").
      const approval = main.locator('[data-legal-approval]');
      await expect(approval).toHaveCount(1);
      const approvalText = (await approval.textContent()) ?? '';
      if ((await approval.getAttribute('data-legal-approval')) === 'approved') {
        expect(approvalText).toMatch(/Effective \d{4}-\d{2}-\d{2}\. Approved by Christian, founder, on \d{4}-\d{2}-\d{2}\./);
      } else {
        expect(approvalText.trim()).toMatch(/^\[\[CHRISTIAN: not yet approved/);
      }
      const marks = main.locator('[data-placeholder="CHRISTIAN-TEXT"]');
      for (const text of await marks.allTextContents()) expect(text.trim()).toMatch(/^\[\[CHRISTIAN: .+\]\]$/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    test('passes the page accessibility check', async ({ page }) => {
      await page.goto(legal.path);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
    });
  });
}

test('the licences page credits every allowed source with the licence named in the code', async ({ page }) => {
  await page.goto('/licenses');
  const main = page.getByRole('main');
  await expect(main).toContainText('BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International');
  await expect(main).toContainText('Nursing Fundamentals, 2nd Edition');
  await expect(main.locator('a[href="/fonts/lato-OFL.txt"]')).toBeVisible();
  await expect(main).toContainText('SIL Open Font License, Version 1.1');
});

test('the terms and privacy pages link to each other, the disclaimer, the copyright page and the licences', async ({ page }) => {
  await page.goto('/terms');
  const main = page.getByRole('main');
  for (const href of ['/privacy', '/disclaimer', '/copyright', '/licenses']) {
    await expect(main.locator(`a[href="${href}"]`).first()).toBeVisible();
  }
  await page.goto('/privacy');
  await expect(page.getByRole('main').locator('a[href="/terms"]').first()).toBeVisible();
});
