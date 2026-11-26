import { expect, test, type Page } from '@playwright/test';

/**
 * The printer button and its "print a copy for your patients!" bubble (Christian, 25 Nov). The button sits in the Frame's
 * corner between the gear and the "?" on every game page that can print, and announces `cueory:print` for the game's own
 * code to answer. The bubble shows once per page load, fades after ten seconds, closes on x or Escape, waits while it is
 * hovered or focused, and never covers the date line, the game or the other corner buttons. It is a pure overlay: nothing
 * on the page moves because of it, and where it would not fit without covering something it is not shown at all.
 */
const printing = [
  { path: '/play/vialo', id: 'vialo' },
  { path: '/play/sudoku', id: 'sudoku' },
  { path: '/play/crossword', id: 'crossword' },
  { path: '/play/piccline', id: 'suture' },
  { path: '/play/word-path', id: 'suture' },
] as const;
const notPrinting = ['/play/pillo', '/play/tachyyy', '/play/stat', '/play/hello-cards'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cueory-game-help-seen', JSON.stringify(['pulse', 'triage', 'cueword', 'suture', 'stat', 'vialo']));
      localStorage.setItem('cueory-promo-seen', String(Date.now()));
      localStorage.setItem('cueory-signup-popup-seen', String(Date.now()));
    } catch { /* storage blocked */ }
  });
});

const hint = (page: Page) => page.getByTestId('print-hint');

/** The page's clock stands still until the test moves it, so a slow machine cannot run the bubble's ten seconds out. */
async function freezeClock(page: Page) {
  await page.clock.install({ time: new Date('2026-11-25T15:00:00') });
  await page.clock.pauseAt(new Date('2026-11-25T15:00:01'));
}

/** Both the printer button and the bubble's timer belong to the Frame's island, which must be awake before time moves. */
async function awake(page: Page) {
  await expect(page.locator('astro-island[component-url*="GameFrameControls"]')).not.toHaveAttribute('ssr', '');
}

/**
 * Loads the page on a clock the test drives, and lets the bubble appear. The bubble only shows where it fits without
 * covering anything or moving anything, which is not on a phone-sized screen, so these tests look at it on a wide window.
 */
async function openWithClock(page: Page, path: string, size = { width: 1440, height: 900 }, mustShow = true) {
  await page.setViewportSize(size);
  await freezeClock(page);
  await page.goto(path);
  await expect(page.getByTestId('game-frame-print')).toBeVisible();
  await awake(page);
  await page.clock.runFor(1100);
  if (mustShow) await expect(hint(page)).toBeVisible();
}

for (const { path, id } of printing) {
  test(`${path}: the printer button sits between the gear and the "?" and announces the print for ${id}`, async ({ page }) => {
    // The press reaches the game, which prints; the house pattern is to stand in for window.print and count the calls
    // (Firefox blocks the page on a real call).
    await page.addInitScript(() => { window.print = () => { (window as unknown as { printed: number }).printed = ((window as unknown as { printed?: number }).printed ?? 0) + 1; }; });
    await page.goto(path);
    const print = page.getByTestId('game-frame-print');
    await expect(print).toBeVisible();
    await expect(print).toHaveAccessibleName('print');
    await expect(print.locator('svg')).toHaveCount(1);
    await expect(print).toHaveText('');
    const [gear, p, help] = await Promise.all([
      page.getByTestId('game-frame-gear').boundingBox(),
      print.boundingBox(),
      page.getByTestId('game-frame-help-button').boundingBox(),
    ]);
    expect(gear!.x + gear!.width).toBeLessThanOrEqual(p!.x);
    expect(p!.x + p!.width).toBeLessThanOrEqual(help!.x);
    expect(p!.width).toBeGreaterThanOrEqual(43.9);
    expect(p!.height).toBeGreaterThanOrEqual(43.9);
    expect(Math.abs(p!.width - gear!.width)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(p!.y - gear!.y)).toBeLessThanOrEqual(0.5);
    // One printer control per game: no second print button anywhere in the game.
    await expect(page.getByRole('button', { name: /^print( this puzzle)?$/ })).toHaveCount(1);
    const heard = await page.evaluate(() => new Promise<{ game: string }[]>((resolve) => {
      const seen: { game: string }[] = [];
      document.addEventListener('cueory:print', (event) => seen.push((event as CustomEvent<{ game: string }>).detail));
      (document.querySelector('[data-testid="game-frame-print"]') as HTMLButtonElement).click();
      setTimeout(() => resolve(seen), 50);
    }));
    expect(heard).toEqual([{ game: id }]);
    // Vialo's unfinished game asks first, so it has not printed; the others print once, from the press.
    const printed = () => page.evaluate(() => (window as unknown as { printed?: number }).printed ?? 0);
    if (id === 'vialo') expect(await printed()).toBe(0);
    else if (path === '/play/piccline') {
      // Piccline's unfinished board asks first too (its two-page sheet shows the answers): the warning shows once, nothing
      // prints until "print anyway", then it prints exactly once.
      const warning = page.getByRole('dialog', { name: 'print before you finish?' });
      await expect(warning).toBeVisible();
      expect(await printed()).toBe(0);
      await warning.getByRole('button', { name: 'print anyway' }).click();
      await expect.poll(printed).toBe(1);
    } else await expect.poll(printed).toBe(1);
  });

  test(`${path}: the bubble appears after the page loads, says its words once and takes no focus`, async ({ page }) => {
    await openWithClock(page, path);
    await expect(hint(page)).toContainText('print a copy for your patients!');
    await expect(page.getByTestId('print-hint-status')).toHaveText('print a copy for your patients!');
    await expect(page.getByTestId('print-hint-status')).toHaveAttribute('role', 'status');
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    const close = page.getByTestId('print-hint-close');
    await expect(close).toHaveAccessibleName('close');
    const box = (await close.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(43.9);
    expect(box.height).toBeGreaterThanOrEqual(43.9);
    // The x is at the bubble's top right corner.
    const bubble = (await hint(page).boundingBox())!;
    expect(bubble.x + bubble.width - (box.x + box.width)).toBeLessThanOrEqual(4);
    expect(box.y - bubble.y).toBeLessThanOrEqual(4);
    // Clicking the words does nothing.
    await hint(page).locator('.game-frame-hint-text').click({ force: true });
    await expect(hint(page)).toBeVisible();
  });
}

for (const path of notPrinting) {
  test(`${path}: no printer button and no bubble where the game cannot print`, async ({ page }) => {
    await freezeClock(page);
    await page.goto(path);
    await expect(page.getByTestId('game-frame-gear')).toBeVisible();
    await page.clock.runFor(3000);
    await expect(page.getByTestId('game-frame-print')).toHaveCount(0);
    await expect(hint(page)).toHaveCount(0);
  });
}

test('x closes the bubble at once, and it does not come back', async ({ page }) => {
  await openWithClock(page, '/play/vialo');
  await page.getByTestId('print-hint-close').click();
  await expect(hint(page)).toHaveCount(0);
  await page.clock.runFor(30_000);
  await expect(hint(page)).toHaveCount(0);
});

test('Escape closes the bubble at once', async ({ page }) => {
  await openWithClock(page, '/play/vialo');
  await page.keyboard.press('Escape');
  await expect(hint(page)).toHaveCount(0);
});

test('the bubble fades by itself after ten seconds', async ({ page }) => {
  await openWithClock(page, '/play/vialo');
  await page.clock.runFor(9500);
  await expect(hint(page)).toHaveAttribute('data-phase', 'shown');
  await page.clock.runFor(600);
  await expect(hint(page)).toHaveAttribute('data-phase', 'fading');
  await page.clock.runFor(500);
  await expect(hint(page)).toHaveCount(0);
});

test('hovering the bubble pauses the countdown, leaving it carries on', async ({ page }) => {
  await openWithClock(page, '/play/vialo');
  await page.clock.runFor(4000);
  await hint(page).hover();
  await page.clock.runFor(30_000);
  await expect(hint(page)).toHaveAttribute('data-phase', 'shown');
  await page.mouse.move(5, 5);
  await page.clock.runFor(5500);
  await expect(hint(page)).toHaveAttribute('data-phase', 'shown');
  await page.clock.runFor(1000);
  await expect(hint(page)).toHaveAttribute('data-phase', 'fading');
});

test('keyboard focus on the x pauses the countdown, so it does not vanish under someone tabbing to it', async ({ page }) => {
  await openWithClock(page, '/play/vialo');
  await page.clock.runFor(3000);
  await page.getByTestId('print-hint-close').focus();
  await page.clock.runFor(30_000);
  await expect(hint(page)).toHaveAttribute('data-phase', 'shown');
  await page.getByTestId('print-hint-close').blur();
  await page.clock.runFor(7500);
  await expect(hint(page)).toHaveAttribute('data-phase', 'fading');
});

test('focus on the x outlasts hover: un-hovering does not let it vanish under the focused button', async ({ page }) => {
  await openWithClock(page, '/play/vialo');
  const close = page.getByTestId('print-hint-close');
  await page.clock.runFor(2000);
  await close.focus();
  await hint(page).hover();
  await page.mouse.move(5, 5);
  await page.clock.runFor(30_000);
  await expect(hint(page)).toHaveAttribute('data-phase', 'shown');
  await expect(close).toBeFocused();
  // When focus finally leaves, the countdown carries on and the bubble goes.
  await page.getByTestId('game-frame-gear').focus();
  await page.clock.runFor(8100);
  await expect(hint(page)).toHaveAttribute('data-phase', 'fading');
  await page.clock.runFor(500);
  await expect(hint(page)).toHaveCount(0);
});

test('closing with the x moves focus to the printer button, not the page', async ({ page }) => {
  await openWithClock(page, '/play/vialo');
  await page.getByTestId('print-hint-close').focus();
  await page.keyboard.press('Enter');
  await expect(hint(page)).toHaveCount(0);
  await expect(page.getByTestId('game-frame-print')).toBeFocused();
});

test('reduced motion: the bubble just disappears, with no fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openWithClock(page, '/play/vialo');
  // The site's reduced-motion rule makes every transition instant (a hair above zero).
  expect(await hint(page).evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration))).toBeLessThan(0.001);
  await page.clock.runFor(10_100);
  await expect(hint(page)).toHaveCount(0);
});

test('the bubble remembers nothing: no storage key is added, and it shows again on the next load', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await freezeClock(page);
  await page.goto('/play/vialo');
  await expect(page.getByTestId('game-frame-print')).toBeVisible();
  const keys = () => page.evaluate(() => [Object.keys(localStorage).sort(), Object.keys(sessionStorage).sort()]);
  await awake(page);
  const before = await keys();
  await page.clock.runFor(1100);
  await expect(hint(page)).toBeVisible();
  await page.getByTestId('print-hint-close').click();
  await page.clock.runFor(12_000);
  expect(await keys()).toEqual(before);
  await page.reload();
  await awake(page);
  await page.clock.runFor(1100);
  await expect(hint(page)).toBeVisible();
});

for (const [width, height] of [[390, 844], [820, 1180], [1440, 900]] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    for (const { path } of printing) {
      test(`${path} at ${width}x${height} (${scheme === 'light' ? 'light' : 'evening'}): the bubble covers neither the date line, the game nor the other buttons, and stays on screen`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await openWithClock(page, path, { width, height }, false);
        // Where it would not fit it is not shown (the next block of tests); where it is shown, it covers nothing.
        if (await hint(page).count() === 0) return;
        const found = await page.evaluate(() => {
          const rect = (node: Element) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
          const bubble = rect(document.querySelector('[data-testid="print-hint"]')!);
          const range = document.createRange();
          range.selectNodeContents(document.querySelector('.game-frame-dateline')!);
          const obstacles: Record<string, { left: number; right: number; top: number; bottom: number }[]> = {
            'date line': [...range.getClientRects()].map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })),
            buttons: [...document.querySelectorAll('.game-frame-corner > button, .game-frame-corner .game-frame-how-wrap > button')].map(rect),
            game: [...document.querySelectorAll('.game-frame-board [role="grid"], .game-frame-board [role="gridcell"], .game-frame-board button, .game-frame-board .vialo-pack')].map(rect),
            cue: [...document.querySelectorAll('.game-frame-cue-slot > *')].map(rect),
          };
          return { bubble, obstacles, vw: document.documentElement.clientWidth, noSideways: document.documentElement.scrollWidth <= document.documentElement.clientWidth };
        });
        const hit = (a: typeof found.bubble, b: typeof found.bubble) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        for (const [name, boxes] of Object.entries(found.obstacles)) {
          for (const box of boxes) expect(hit(found.bubble, box), `bubble over ${name}`).toBe(false);
        }
        expect(found.bubble.left).toBeGreaterThanOrEqual(0);
        expect(found.bubble.right).toBeLessThanOrEqual(found.vw);
        expect(found.noSideways).toBe(true);
      });
    }
  }
}

test('no bubble if the player has already started playing, so nothing moves under their finger', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await freezeClock(page);
  await page.goto('/play/vialo');
  await awake(page);
  await expect(page.getByTestId('print-hint-status')).toBeAttached();
  await page.mouse.click(300, 400);
  await page.clock.runFor(1500);
  await expect(hint(page)).toHaveCount(0);
  await expect(page.getByTestId('print-hint-status')).toHaveText('');
});

for (const { path, script } of [
  { path: '/play/sudoku', script: /\/_astro\/SudokuGame\.[\w-]+\.js$/ },
  { path: '/play/crossword', script: /\/_astro\/CuewordToday\.[\w-]+\.js$/ },
] as const) {
  test(`${path}: a printer press before the game has loaded is answered once the game arrives`, async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(script, async (route) => { await held; await route.continue(); });
    await page.addInitScript(() => { window.print = () => { (window as unknown as { printed: number }).printed = ((window as unknown as { printed?: number }).printed ?? 0) + 1; }; });
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await awake(page);
    await page.getByTestId('game-frame-print').click();
    expect(await page.evaluate(() => (window as unknown as { printed?: number }).printed ?? 0)).toBe(0);
    release();
    await expect.poll(() => page.evaluate(() => (window as unknown as { printed?: number }).printed ?? 0)).toBe(1);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => (window as unknown as { printed?: number }).printed ?? 0)).toBe(1);
  });
}

test('/play/piccline: a printer press before the game has loaded is answered once the game arrives (warning once, then one print)', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/_astro\/SutureToday\.[\w-]+\.js$/, async (route) => { await held; await route.continue(); });
  await page.addInitScript(() => { window.print = () => { (window as unknown as { printed: number }).printed = ((window as unknown as { printed?: number }).printed ?? 0) + 1; }; });
  const printed = () => page.evaluate(() => (window as unknown as { printed?: number }).printed ?? 0);
  await page.goto('/play/piccline', { waitUntil: 'domcontentloaded' });
  await awake(page);
  await page.getByTestId('game-frame-print').click();
  expect(await printed()).toBe(0);
  release();
  // Today's board is not finished, so the answer is the warning, shown once, and nothing prints until "print anyway".
  const warning = page.getByRole('dialog', { name: 'print before you finish?' });
  await expect(warning).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  expect(await printed()).toBe(0);
  await warning.getByRole('button', { name: 'print anyway' }).click();
  await expect.poll(printed).toBe(1);
  await page.waitForLoadState('networkidle');
  expect(await printed()).toBe(1);
});

test('/play/vialo: a printer press before the game has loaded is answered once it arrives (finished game prints once)', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/_astro\/VialoPrint\.[\w-]+\.js$/, async (route) => { await held; await route.continue(); });
  await page.addInitScript(() => {
    window.print = () => { (window as unknown as { printed: number }).printed = ((window as unknown as { printed?: number }).printed ?? 0) + 1; };
  });
  await page.goto('/play/vialo', { waitUntil: 'domcontentloaded' });
  await awake(page);
  await page.getByTestId('game-frame-print').click();
  expect(await page.evaluate(() => (window as unknown as { printed?: number }).printed ?? 0)).toBe(0);
  release();
  // Today's game is not finished here, so the answer is the warning, shown once, and nothing prints until "print anyway".
  const warning = page.getByRole('dialog');
  await expect(warning).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as { printed?: number }).printed ?? 0)).toBe(0);
});

test('narrowing the window to the phone layout while the bubble shows: it closes or stays clear, and nothing is added to the page for it', async ({ page }) => {
  await openWithClock(page, '/play/vialo');
  await page.setViewportSize({ width: 390, height: 844 });
  // The page's resize observer does the re-checking on its own; the clock only has to carry the bubble's close on.
  await expect.poll(async () => {
    await page.clock.runFor(500);
    return page.evaluate(() => {
      const bubble = document.querySelector('[data-testid="print-hint"]');
      if (!bubble) return false;
      const rect = (node: Element) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
      const mine = rect(bubble);
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('.game-frame-dateline')!);
      const boxes = [...range.getClientRects()].map((r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }));
      boxes.push(rect(document.querySelector('.vialo-pack')!));
      return boxes.some((b) => mine.left < b.right && mine.right > b.left && mine.top < b.bottom && mine.bottom > b.top);
    });
  }).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('where the bubble would have to cover something it is not shown at all, and the printer button stays', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await freezeClock(page);
  await page.goto('/play/vialo');
  await expect(page.getByTestId('game-frame-print')).toBeVisible();
  await awake(page);
  // Something the bubble must never lie over, right where it would hang (fixed, so nothing else moves).
  await page.evaluate(() => {
    const print = document.querySelector('[data-testid="game-frame-print"]')!.getBoundingClientRect();
    const block = document.createElement('h2');
    block.textContent = 'in the way';
    block.style.cssText = `position:fixed;left:0;right:0;top:${print.bottom}px;height:200px;margin:0;pointer-events:none`;
    document.querySelector('.game-frame-board')!.append(block);
  });
  await page.clock.runFor(1500);
  await expect(hint(page)).toHaveCount(0);
  await expect(page.getByTestId('game-frame-print')).toBeVisible();
  await page.clock.runFor(12_000);
  await expect(hint(page)).toHaveCount(0);
});

for (const [width, height] of [[390, 844], [820, 1180], [1440, 900]] as const) {
  for (const { path } of printing) {
    test(`${path} at ${width}x${height}: nothing on the page moves before, while or after the bubble shows`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await freezeClock(page);
      await page.goto(path);
      await expect(page.getByTestId('game-frame-print')).toBeVisible();
      await awake(page);
      await page.waitForLoadState('networkidle');
      const boxes = () => page.evaluate(() => {
        const rect = (node: Element | null) => { if (!node) return null; const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
        return {
          board: rect(document.querySelector('.game-frame-board')),
          pack: rect(document.querySelector('.vialo-pack')),
          dateline: rect(document.querySelector('.game-frame-dateline')),
          corner: rect(document.querySelector('.game-frame-corner')),
          main: rect(document.querySelector('.game-frame-main')),
          height: document.documentElement.scrollHeight,
        };
      });
      const before = await boxes();
      await page.clock.runFor(1100);
      await page.clock.runFor(500);
      expect(await boxes()).toEqual(before);
      await page.clock.runFor(10_000);
      await page.clock.runFor(1000);
      await expect(hint(page)).toHaveCount(0);
      expect(await boxes()).toEqual(before);
    });
  }
}
