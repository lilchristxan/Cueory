import { expect, test } from '@playwright/test';
import { markGameRulesSeen } from './clock';

test.beforeEach(async ({ page }) => { await markGameRulesSeen(page); });

const MOTTO = 'by nursing students, for nursing students.';

// Link previews (Open Graph and X cards) name the site and give the share card's size and words, on the served pages
// and on the not-found page a missing address returns.
test('served pages give link previews a site name and a sized, described image', async ({ page }) => {
  for (const [route, status, image, alt] of [
    ['/', 200, 'study-ivory', `cueory · study skills · ${MOTTO}`],
    ['/support', 200, 'study-ivory', `cueory · study skills · ${MOTTO}`],
    ['/play/pillo', 200, 'games-scene', `cueory · daily games · ${MOTTO}`],
    ['/social-meta-page-does-not-exist', 404, 'study-ivory', `cueory · study skills · ${MOTTO}`],
  ] as const) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(status);
    for (const [property, content] of [
      ['og:site_name', 'cueory'],
      ['og:locale', 'en_US'],
      ['og:image', `https://cueory.app/share/${image}.png`],
      ['og:image:type', 'image/png'],
      ['og:image:width', '1200'],
      ['og:image:height', '630'],
      ['og:image:alt', alt],
    ]) {
      const tag = page.locator(`head meta[property="${property}"]`);
      await expect(tag, `${route} ${property}`).toHaveCount(1);
      await expect(tag, `${route} ${property}`).toHaveAttribute('content', content);
    }
    const twitterAlt = page.locator('head meta[name="twitter:image:alt"]');
    await expect(twitterAlt).toHaveCount(1);
    await expect(twitterAlt).toHaveAttribute('content', alt);
    const card = await page.request.get(`/share/${image}.png`);
    expect(card.status(), `${route} card`).toBe(200);
    expect(card.headers()['content-type']).toBe('image/png');
  }
});
