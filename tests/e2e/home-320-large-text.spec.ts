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
    // Temporary, failure-only evidence for the residual WebKit width. Keep every candidate at the document edge as
    // well as the ranked contributors, so a fixed cap cannot omit the actual 323px owner.
    const geometry = await page.evaluate(() => {
      const root = document.documentElement;
      const documentRight = root.scrollWidth;
      const viewport = { width: root.clientWidth, height: root.clientHeight };
      const clipsHorizontally = (overflowX: string) =>
        ["auto", "scroll", "hidden", "clip"].includes(overflowX);
      const pins = new Set([
        "html",
        "body",
        "main",
        "#ways-to-study",
        "#modes-heading",
        "#modes-track",
      ]);
      const visiblePseudo = (
        element: Element,
        pseudo: "::before" | "::after",
      ) => {
        const style = getComputedStyle(element, pseudo);
        if (
          style.content === "none" ||
          style.content === "normal" ||
          style.display === "none"
        )
          return undefined;
        return {
          pseudo,
          content: style.content.slice(0, 160),
          display: style.display,
          position: style.position,
          insetInlineStart: style.insetInlineStart,
          insetInlineEnd: style.insetInlineEnd,
          width: style.width,
          transform: style.transform,
        };
      };
      const candidates = [
        ...document.querySelectorAll<HTMLElement>("*"),
      ].flatMap((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const ownOverflow = Math.max(
          0,
          element.scrollWidth - element.clientWidth,
        );
        const selector = element.id
          ? `#${element.id}`
          : element.tagName.toLowerCase();
        const pinned = pins.has(selector);
        const scrollRight = rect.left + element.scrollWidth;
        const nearDocumentRight =
          Math.max(rect.right, scrollRight) >= documentRight - 2;
        const anchors =
          element === document.body || element.matches("main, footer, section");
        const pseudos = [
          visiblePseudo(element, "::before"),
          visiblePseudo(element, "::after"),
        ].filter(Boolean);
        if (
          !pinned &&
          !anchors &&
          ownOverflow === 0 &&
          !nearDocumentRight &&
          pseudos.length === 0
        )
          return [];

        const horizontalClips: {
          tag: string;
          id?: string;
          className?: string;
          overflowX: string;
          clientWidth: number;
          scrollWidth: number;
          left: number;
          right: number;
        }[] = [];
        for (
          let ancestor = element.parentElement;
          ancestor;
          ancestor = ancestor.parentElement
        ) {
          const ancestorStyle = getComputedStyle(ancestor);
          if (!clipsHorizontally(ancestorStyle.overflowX)) continue;
          const ancestorRect = ancestor.getBoundingClientRect();
          const left = ancestorRect.left + ancestor.clientLeft;
          horizontalClips.push({
            tag: ancestor.tagName.toLowerCase(),
            id: ancestor.id || undefined,
            className: ancestor.getAttribute("class") || undefined,
            overflowX: ancestorStyle.overflowX,
            clientWidth: ancestor.clientWidth,
            scrollWidth: ancestor.scrollWidth,
            left,
            right: left + ancestor.clientWidth,
          });
        }
        const range = document.createRange();
        range.selectNodeContents(element);
        const allTextRanges = [...range.getClientRects()];
        const textRanges = allTextRanges.slice(0, 40).map((textRect) => ({
          left: textRect.left,
          right: textRect.right,
          width: textRect.width,
        }));
        const score =
          ownOverflow * 10_000 +
          Math.max(0, Math.max(rect.right, scrollRight) - viewport.width) *
            1_000 +
          (nearDocumentRight ? 500 : 0) +
          (pinned ? 100 : 0);
        return [
          {
            score,
            selector,
            tag: element.tagName.toLowerCase(),
            className: element.getAttribute("class") || undefined,
            text: element.textContent?.trim().slice(0, 160) || undefined,
            rect: { left: rect.left, right: rect.right, width: rect.width },
            scrollRight,
            nearDocumentRight,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            ownOverflow,
            whiteSpace: style.whiteSpace,
            overflowWrap: style.overflowWrap,
            minInlineSize: style.minInlineSize,
            overflowX: style.overflowX,
            transform: style.transform,
            textRangeTotal: allTextRanges.length,
            textRanges,
            horizontalClips,
            pseudos,
          },
        ];
      });
      const edge = candidates.filter(
        (candidate) =>
          candidate.nearDocumentRight || pins.has(candidate.selector),
      );
      const ranked = candidates.sort((a, b) => b.score - a.score);
      const retained = [...edge];
      for (const candidate of ranked) {
        if (
          retained.includes(candidate) ||
          retained.length >= edge.length + 120
        )
          continue;
        retained.push(candidate);
      }
      return {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        overflow: root.scrollWidth - root.clientWidth,
        viewport,
        candidateTotal: candidates.length,
        edgeCandidateTotal: edge.length,
        rankedCandidateLimit: 120,
        candidates: retained,
      };
    });
    try {
      await testInfo.attach("home-overflow-geometry.json", {
        body: JSON.stringify(geometry, null, 2),
        contentType: "application/json",
      });
    } catch {
      // This diagnostic must never replace the original width assertion below.
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

  const modesHeading = page.locator('#modes-heading');
  const modesHeadingFits = await modesHeading.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const box = element.getBoundingClientRect();
    return [...range.getClientRects()].every((rect) => rect.right <= box.right + 0.5);
  });
  expect(modesHeadingFits).toBe(true);

  const gamesHeading = page.locator('#games-heading');
  const gamesHeadingFits = await gamesHeading.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const box = element.getBoundingClientRect();
    return [...range.getClientRects()].every((rect) => rect.right <= box.right + 0.5);
  });
  expect(gamesHeadingFits).toBe(true);

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
