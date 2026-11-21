import { expect, test } from '@playwright/test';

// Home at 320px wide with 32px root text: the page never scrolls sideways, the "get launch updates" heading wraps
// inside its panel, and the study-mode carousel's arrows stay whole and on screen (the dots wrap between them).

test.use({ viewport: { width: 320, height: 700 } });

test('home fits 320px with 32px text, carousel arrows on screen', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('cueory-promo-seen', String(Date.now())); localStorage.setItem('cueory-signup-popup-seen', String(Date.now())); } catch { /* optional storage */ }
  });
  await page.goto('/');
  await page.evaluate(() => document.documentElement.style.setProperty('font-size', '32px', 'important'));
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveCSS('font-size', '32px');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) {
    // Keep this failure-only and bounded: retain likely contributors rather than a DOM-order slice of every pseudo-element.
    const geometry = await page.evaluate(() => {
      const root = document.documentElement;
      const viewport = { width: root.clientWidth, height: root.clientHeight };
      const documentRight = root.scrollWidth;
      const clipsHorizontally = (overflowX: string) => ['auto', 'scroll', 'hidden', 'clip'].includes(overflowX);
      const visiblePseudo = (element: Element, pseudo: '::before' | '::after') => {
        const style = getComputedStyle(element, pseudo);
        const content = style.content;
        if (content === 'none' || content === 'normal' || style.display === 'none') return undefined;
        return {
          pseudo,
          content,
          display: style.display,
          position: style.position,
          insetInlineStart: style.insetInlineStart,
          insetInlineEnd: style.insetInlineEnd,
          width: style.width,
          height: style.height,
          transform: style.transform,
        };
      };
      const candidates = [...document.querySelectorAll<HTMLElement>('*')].flatMap((element) => {
        const rect = element.getBoundingClientRect();
        const pseudos = [visiblePseudo(element, '::before'), visiblePseudo(element, '::after')].filter(Boolean);
        const style = getComputedStyle(element);
        const ownOverflow = Math.max(0, element.scrollWidth - element.clientWidth);
        const anchors = element === document.body || element.matches('main, footer, section');
        const outside = rect.left < -0.5 || rect.right > viewport.width + 0.5 || rect.width > viewport.width + 0.5;
        if (!anchors && !outside && ownOverflow === 0 && pseudos.length === 0) return [];

        let clippedLeft = -Infinity;
        let clippedRight = Infinity;
        const horizontalClips: { tag: string; id?: string; className?: string; overflowX: string; clientWidth: number; scrollWidth: number; left: number; right: number }[] = [];
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const ancestorStyle = getComputedStyle(ancestor);
          if (!clipsHorizontally(ancestorStyle.overflowX)) continue;
          const ancestorRect = ancestor.getBoundingClientRect();
          const left = ancestorRect.left + ancestor.clientLeft;
          const right = left + ancestor.clientWidth;
          clippedLeft = Math.max(clippedLeft, left);
          clippedRight = Math.min(clippedRight, right);
          horizontalClips.push({
            tag: ancestor.tagName.toLowerCase(),
            id: ancestor.id || undefined,
            className: ancestor.getAttribute('class') || undefined,
            overflowX: ancestorStyle.overflowX,
            clientWidth: ancestor.clientWidth,
            scrollWidth: ancestor.scrollWidth,
            left,
            right,
          });
        }
        const effectiveLeft = Math.max(rect.left, clippedLeft);
        const effectiveRight = Math.min(rect.right, clippedRight);
        const whollyClipped = rect.width > 0 && effectiveRight <= effectiveLeft;
        const edgeDistance = Math.abs(effectiveRight - documentRight);
        const score = (whollyClipped ? -100000 : 0)
          + ownOverflow * 10000
          + Math.max(0, viewport.width - edgeDistance)
          + (effectiveRight > viewport.width + 0.5 ? 1000 : 0)
          + (anchors ? 100 : 0);
        return [{
          score,
          tag: element.tagName.toLowerCase(),
          id: element.id || undefined,
          className: element.getAttribute('class') || undefined,
          rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
          effectiveLeft,
          effectiveRight,
          whollyClipped,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          position: style.position,
          overflowX: style.overflowX,
          transform: style.transform,
          horizontalClips,
          pseudos,
        }];
      });
      return {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        overflow: root.scrollWidth - root.clientWidth,
        viewport,
        candidateTotal: candidates.length,
        candidates: candidates.sort((a, b) => b.score - a.score).slice(0, 80),
        truncatedCandidates: Math.max(0, candidates.length - 80),
      };
    });
    try {
      await testInfo.attach('home-overflow-geometry.json', {
        body: JSON.stringify(geometry, null, 2),
        contentType: 'application/json',
      });
    } catch {
      // Diagnostics must never replace the original no-overflow failure below.
    }
  }
  expect(overflow).toBeLessThanOrEqual(0);

  const heading = page.locator('#signup-heading');
  const headingFits = await heading.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const box = element.getBoundingClientRect();
    return [...range.getClientRects()].every((rect) => rect.right <= box.right + 0.5);
  });
  expect(headingFits).toBe(true);

  for (const name of ['previous study mode', 'next study mode', 'pause the slideshow']) {
    const button = page.getByRole('button', { name });
    await button.scrollIntoViewIfNeeded();
    const box = (await button.boundingBox())!;
    expect(box.width, name).toBeGreaterThanOrEqual(44);
    expect(box.height, name).toBeGreaterThanOrEqual(44);
    expect(box.x, name).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, name).toBeLessThanOrEqual(320);
  }
  const before = await page.locator('[data-modes-dot][data-on]').evaluate((dot) => [...dot.parentElement!.children].indexOf(dot));
  await page.getByRole('button', { name: 'next study mode' }).click();
  await expect.poll(() => page.locator('[data-modes-dot][data-on]').evaluate((dot) => [...dot.parentElement!.children].indexOf(dot))).not.toBe(before);
});
