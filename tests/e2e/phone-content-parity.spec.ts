import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';

// Phone (390 x 844) pages follow the desktop designs: same sections, same visual language, comfortable to read and tap.
test.use({ viewport: { width: 390, height: 844 } });

async function open(page: Page, path: string) {
  await markPanelsSeen(page);
  await page.goto(path);
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('phone layouts follow the desktop design', () => {
  test('/about: the headline takes two or three lines', async ({ page }) => {
    await open(page, '/about');
    const lines = await page.locator('main h1').evaluate((h) => {
      const style = getComputedStyle(h);
      return h.getBoundingClientRect().height / Number.parseFloat(style.lineHeight);
    });
    expect(Math.round(lines)).toBeGreaterThanOrEqual(2);
    expect(Math.round(lines)).toBeLessThanOrEqual(3);
    await noSidewaysScroll(page);
  });

  test('/courses: "open course" is a full-width 44 px target and unavailable cards say "coming soon" once', async ({ page }) => {
    await open(page, '/courses');
    const open_ = page.getByRole('link', { name: 'open course' });
    const box = (await open_.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    // The repeated line is kept for screen readers but takes no room on a phone.
    const repeated = await page.getByText('no lessons yet · coming soon').first().locator('..').boundingBox();
    expect(repeated!.height).toBeLessThanOrEqual(1);
    await expect(page.locator('span.bg-line', { hasText: 'coming soon' })).toHaveCount(3);
    await noSidewaysScroll(page);
  });

  test('/coming-soon: the lists sit flat inside their panels, with no card inside a card', async ({ page }) => {
    await open(page, '/coming-soon');
    const item = page.locator('#planned-courses-heading + ul > li').first();
    const style = await item.evaluate((li) => {
      const s = getComputedStyle(li);
      return { border: s.borderTopWidth, bg: s.backgroundColor };
    });
    expect(style.border).toBe('0px');
    expect(style.bg).toBe('rgba(0, 0, 0, 0)');
    await noSidewaysScroll(page);
  });

  test('/learn: unopened unit rows are one plain line each, without a repeated "coming soon"', async ({ page }) => {
    await open(page, '/learn');
    const second = page.locator('[data-unit-id] summary span.max-sm\\:sr-only').first();
    const box = await second.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(1);
    await noSidewaysScroll(page);
  });

  test('/breaks: ideas read as static text rows, not buttons', async ({ page }) => {
    await open(page, '/breaks');
    const row = page.getByRole('list', { name: 'all the ideas' }).getByRole('listitem').first();
    const bg = await row.evaluate((li) => getComputedStyle(li).backgroundColor);
    expect(bg).toBe('rgba(0, 0, 0, 0)');
    const helper = page.getByText('sharing your own idea is not open yet');
    const list = page.getByRole('list', { name: 'all the ideas' });
    const gap = (await helper.boundingBox())!.y - ((await list.boundingBox())!.y + (await list.boundingBox())!.height);
    expect(gap).toBeGreaterThanOrEqual(48);
    await noSidewaysScroll(page);
  });

  test('/learn/video-sample: the placeholder caption is readable', async ({ page }) => {
    await open(page, '/learn/video-sample');
    const caption = page.getByText('Placeholder — real video coming soon');
    await expect(caption).toBeVisible();
    const size = await caption.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
    await expect(page.locator('main h1')).toHaveText('video player sample');
  });

  test('/signin: "get launch updates" is a visible 44 px button while accounts are closed', async ({ page }) => {
    // The launch configuration keeps accounts closed (src/config/accountsgate.ts), so the link must be there.
    await open(page, '/signin');
    const link = page.getByTestId('signin-unavailable').getByRole('link', { name: 'get launch updates' });
    await expect(link).toBeVisible();
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  /* The coming-soon panel sits on study screens (held-back lessons), which stay plain Lato. Held-back lessons only exist
     in the live build, so this puts the panel's own heading classes on a study-variant page and reads the computed font. */
  test('the coming-soon panel heading is Lato on a study screen, and the marketing serif is not used', async ({ page }) => {
    const source = readFileSync(new URL('../../src/components/ComingSoonPanel.astro', import.meta.url), 'utf8');
    const classes = /<h1 class="([^"]+)">coming soon<\/h1>/.exec(source)?.[1];
    expect(classes).toBeTruthy();
    expect(classes!.split(' ')).not.toContain('display');
    await open(page, '/breaks');
    const fonts = await page.evaluate((cls) => {
      const h = document.createElement('h1');
      h.className = cls;
      h.textContent = 'coming soon';
      document.querySelector('main')!.append(h);
      const serif = document.createElement('h1');
      serif.className = `display ${cls}`;
      serif.textContent = 'serif control';
      document.querySelector('main')!.append(serif);
      const cs = getComputedStyle(h);
      return { lineRatio: Number.parseFloat(cs.lineHeight) / Number.parseFloat(cs.fontSize), panel: cs.fontFamily, control: getComputedStyle(serif).fontFamily };
    }, classes!);
    expect(fonts.lineRatio).toBeGreaterThanOrEqual(1.5);
    expect(fonts.panel).toContain('Lato');
    expect(fonts.panel).not.toContain('Bodoni Moda');
    expect(fonts.control).toContain('Bodoni Moda');
  });
});
