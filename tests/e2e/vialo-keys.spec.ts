import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fixClock } from './clock';

test.beforeEach(async ({ page }) => {
  await fixClock(page, new Date('2026-11-01T15:00:00'));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-game-help-seen', JSON.stringify(['vialo']));
    } catch {
      // If storage is unavailable, the game still provides its visible help control.
    }
  });
  await page.goto('/play/wordpill');
  await expect(page.getByTestId('vialo')).toBeVisible();
});

// The keys are a three-row keyboard (Christian, 23 Nov 2026). Tablet and desktop keys keep the 44 px rule. On a phone
// ten keys share one row, so a letter key may be narrower than 44 px, as on the phone's own keyboard: Christian
// approved at least 32 px wide and at least 52 px tall there, with at least 4 px between keys (D-pending in
// docs/status/in-review/task-games-v2-vialo-keys.md). This replaces the earlier single 44 px check on purpose.
test('vialo keys are a three-row keyboard with comfortable targets, and they type, delete and submit a guess', async ({ page }, info) => {
  const vialo = page.getByTestId('vialo');
  const keys = vialo.getByRole('group', { name: 'letters' });
  const buttons = keys.getByRole('button');

  await expect(buttons).toHaveCount(28);
  const rows = await keys.locator('.vialo-key-row').evaluateAll((nodes) =>
    nodes.map((row) =>
      Array.from(row.querySelectorAll('button'), (key) => {
        const box = key.getBoundingClientRect();
        return { name: key.getAttribute('aria-label') ?? key.textContent!.trim(), x: box.x, y: box.y, width: box.width, height: box.height };
      }),
    ),
  );
  expect(rows.map((row) => row.map((key) => key.name).join(' '))).toEqual([
    'q w e r t y u i o p',
    'a s d f g h j k l',
    'enter z x c v b n m delete',
  ]);

  const phone = info.project.name.includes('phone');
  const viewport = page.viewportSize()!.width;
  for (const row of rows) {
    for (const [index, key] of row.entries()) {
      const wide = key.name === 'enter' || key.name === 'delete';
      expect(key.width, `${key.name} width`).toBeGreaterThanOrEqual(phone && !wide ? 32 : 44);
      expect(key.height, `${key.name} height`).toBeGreaterThanOrEqual(phone ? 52 : 44);
      const next = row[index + 1];
      // Neighbours never touch, so a thumb lands on one key.
      if (next) expect(next.x - (key.x + key.width), `gap after ${key.name}`).toBeGreaterThanOrEqual(3.99);
    }
    // No row runs off the screen.
    expect(row[0].x).toBeGreaterThanOrEqual(0);
    expect(row.at(-1)!.x + row.at(-1)!.width).toBeLessThanOrEqual(viewport + 0.01);
  }
  // Enter and delete widen the last row to the first row's width, and the middle row sits inside both.
  const span = (row: (typeof rows)[number]) => row.at(-1)!.x + row.at(-1)!.width - row[0].x;
  expect(Math.abs(span(rows[2]) - span(rows[0]))).toBeLessThanOrEqual(1);
  expect(rows[1][0].x).toBeGreaterThan(rows[0][0].x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const guess = vialo.getByLabel('your guess', { exact: true });
  await keys.getByRole('button', { name: 'x', exact: true }).click();
  await expect(guess).toHaveValue('x');
  await keys.getByRole('button', { name: 'delete', exact: true }).click();
  await expect(guess).toHaveValue('');

  for (const letter of 'crane') await keys.getByRole('button', { name: letter, exact: true }).click();
  await expect(guess).toHaveValue('crane');
  await keys.getByRole('button', { name: 'enter', exact: true }).click();
  await expect(vialo.getByRole('list', { name: 'your guesses' }).getByRole('listitem')).toHaveAccessibleName(/^guess 1: crane\./);
});

// Narrower phones (phone projects only): the keyboard runs edge to edge, so a letter key keeps the approved 32 px
// down to a 360 px screen. Below that ten keys of 32 px and nine 4 px gaps (356 px) no longer fit, so the keys share
// the width, as that phone's own keyboard does: 28 px at 320 px (D-pending in the status note). Enter and delete stay
// at least 44 px wide, every key stays at least 52 px tall and 4 px from its neighbour, and nothing scrolls sideways.
test('vialo keys keep their size on narrower phones without sideways scrolling', async ({ page }, info) => {
  test.skip(!info.project.name.includes('phone'), 'phone keyboards only');
  const keys = page.getByTestId('vialo').getByRole('group', { name: 'letters' });
  await expect(keys.getByRole('button')).toHaveCount(28);
  for (const [width, letterMin] of [[375, 32], [360, 32], [320, 27.9]] as const) {
    await page.setViewportSize({ width, height: 844 });
    const rows = await keys.locator('.vialo-key-row').evaluateAll((nodes) =>
      nodes.map((row) =>
        Array.from(row.querySelectorAll('button'), (key) => {
          const box = key.getBoundingClientRect();
          return { wide: key.classList.contains('vialo-key-wide'), x: box.x, width: box.width, height: box.height };
        }),
      ),
    );
    expect(rows.map((row) => row.length)).toEqual([10, 9, 9]);
    for (const row of rows) {
      for (const [index, key] of row.entries()) {
        expect(key.width, `${width} px screen, key width`).toBeGreaterThanOrEqual(key.wide ? 44 : letterMin);
        expect(key.height, `${width} px screen, key height`).toBeGreaterThanOrEqual(52);
        const next = row[index + 1];
        if (next) expect(next.x - (key.x + key.width), `${width} px screen, gap`).toBeGreaterThanOrEqual(3.99);
      }
      expect(row[0].x).toBeGreaterThanOrEqual(0);
      expect(row.at(-1)!.x + row.at(-1)!.width).toBeLessThanOrEqual(width + 0.01);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width} px screen, no sideways scroll`).toBe(true);
  }
});

// A key's mark shows without colour: "in place" is a solid cap, "elsewhere" carries a ring inside its edge, and a
// letter that is not in the word is struck through and sits down flat. Each key's name says the mark in words.
test('vialo keys show each mark by finish and by name, never by colour alone', async ({ page }) => {
  const vialo = page.getByTestId('vialo');
  const keys = vialo.getByRole('group', { name: 'letters' });
  await expect(keys.getByRole('button')).toHaveCount(28);
  for (const letter of 'crane') await keys.getByRole('button', { name: letter, exact: true }).click();
  await keys.getByRole('button', { name: 'enter', exact: true }).click();
  await expect(vialo.getByRole('list', { name: 'your guesses' }).getByRole('listitem')).toHaveCount(1);

  const marked = await keys.locator('button[class*="vialo-here"], button[class*="vialo-elsewhere"], button[class*="vialo-absent"]').evaluateAll((nodes) =>
    nodes.map((key) => {
      const style = getComputedStyle(key);
      const ring = getComputedStyle(key, '::after');
      return {
        name: key.getAttribute('aria-label')!,
        kind: ['here', 'elsewhere', 'absent'].find((mark) => key.classList.contains(`vialo-${mark}`))!,
        struck: style.textDecorationLine.includes('line-through'),
        ringed: ring.content !== 'none' && Number.parseFloat(ring.borderTopWidth) >= 2,
        lifted: style.boxShadow !== 'none',
      };
    }),
  );
  // Every letter of the guess got a mark, whatever today's sample word is.
  expect(marked).toHaveLength(5);
  for (const key of marked) {
    expect(key.name).toMatch(/^[a-z], \S/);
    expect(key.struck, `${key.name} struck through`).toBe(key.kind === 'absent');
    expect(key.ringed, `${key.name} ringed`).toBe(key.kind === 'elsewhere');
    expect(key.lifted, `${key.name} raised`).toBe(key.kind !== 'absent');
  }
  // The marked keys stay readable in this project's palette (Light, or Evening on the phone-evening project).
  const scan = await new AxeBuilder({ page }).include('.vialo-keys').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(scan.violations).toEqual([]);
});

// Christian saw the blister pack against the left edge of the game column while the keyboard sat in the middle
// (about 812 px wide). The pack and the keyboard must share one centre line at every width.
for (const width of [390, 700, 812, 1024, 1440]) {
  test(`vialo board and keyboard share a centre line at ${width} px wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const pack = page.locator('.vialo-pack');
    const keyRow = page.locator('.vialo-keys .vialo-key-row').first();
    await expect(keyRow).toBeVisible();
    const centres = await page.evaluate(() => {
      const centre = (node: Element) => {
        const box = node.getBoundingClientRect();
        return box.left + box.width / 2;
      };
      const packNode = document.querySelector('.vialo-pack')!;
      // The pack is clipped to the foil card (the artwork's uneven ivory mat is hidden), so the centre that matters
      // is the visible card's: the box's centre moved by half the difference of the left and right clip insets.
      const [, right, , left] = [...getComputedStyle(packNode).clipPath.matchAll(/(-?\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]) / 100);
      const visible = (node: Element) => {
        const box = node.getBoundingClientRect();
        return box.left + box.width * (left + (1 - right)) / 2;
      };
      return {
        pack: visible(packNode),
        keys: centre(document.querySelector('.vialo-keys .vialo-key-row')!),
        column: centre(packNode.parentElement!),
      };
    });
    expect(Math.abs(centres.pack - centres.keys)).toBeLessThanOrEqual(1);
    expect(Math.abs(centres.pack - centres.column)).toBeLessThanOrEqual(1);
    await expect(pack).toBeVisible();
  });
}
