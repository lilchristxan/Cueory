import { expect, test } from '@playwright/test';

const games = [
  { path: '/play/pillo', name: 'pillo', framed: false, bridge: false },
  { path: '/play/stat', name: 'stat', framed: true, bridge: false },
  { path: '/play/word-path', name: 'piccline', framed: false, bridge: false },
  { path: '/play/crossword', name: 'crossword', framed: true, bridge: true },
  { path: '/play/hello-cards', name: 'hello cards', framed: true, bridge: false },
] as const;

test.describe('GameFrame shared layout (Scope 1)', () => {
  for (const game of games) {
    test(`${game.name}: keeps the explicit Frame control ownership`, async ({ page }) => {
      await page.goto(game.path);
      await page.waitForLoadState('domcontentloaded');

      // Left panel elements
      const backLink = page.getByRole('link', { name: 'all games' });
      await expect(backLink).toBeVisible();
      await expect(backLink).toHaveAttribute('href', '/play');

      const logo = page.locator('.game-frame-logo:visible');
      await expect(logo).toHaveCount(1);
      await expect(logo).toBeVisible();

      // Stats
      const stats = page.locator('.game-frame-stats');
      // Every game page shows its four stats in the left panel (Games v2, 23 Nov), framed controls or not.
      await expect(stats).toBeVisible();
      await expect(stats).toContainText(game.name === 'hello cards' ? 'questions asked' : '% solved');
      await expect(stats).toContainText('played');
      const statsIsland = page.locator('astro-island[component-url*="GameFrameStats"]');
      if (game.name === 'hello cards') {
        await expect(stats).toHaveText(/0\s*questions asked\s*0\s*current streak\s*0\s*best streak\s*0\s*played/);
        await expect(statsIsland).toHaveCount(0);
      } else {
        await expect(statsIsland).toHaveCount(1);
      }

      // Date line
      const dateLine = page.locator('.game-frame-dateline');
      await expect(dateLine).toBeVisible();

      // Only opted-in routes use the Frame controls; held routes retain their legacy island controls.
      const gear = page.getByTestId('game-frame-gear');
      const helpBtn = page.getByTestId('game-frame-help-button');
      if (!game.framed) {
        await expect(gear).toHaveCount(0);
        await expect(helpBtn).toHaveCount(0);
        return;
      }
      await expect(gear).toBeVisible();
      const gearBox = await gear.boundingBox();
      expect(gearBox?.width).toBeGreaterThanOrEqual(44);
      expect(gearBox?.height).toBeGreaterThanOrEqual(44);

      await expect(helpBtn).toBeVisible();
      const helpBox = await helpBtn.boundingBox();
      expect(helpBox?.width).toBeGreaterThanOrEqual(44);
      expect(helpBox?.height).toBeGreaterThanOrEqual(44);

      if (game.bridge) {
        // The one visible shared opener delegates to the island's established dialog and returns focus to this button.
        await expect(page.getByRole('button', { name: `${game.name} settings` })).toHaveCount(1);
        await expect(page.getByRole('button', { name: `how to play ${game.name}` })).toHaveCount(1);
        await expect(page.getByTestId('game-settings-button')).toHaveCount(0);
        await expect(page.getByTestId('game-help-button')).toHaveCount(0);
        await helpBtn.click();
        const dialog = page.getByRole('dialog', { name: `how to play ${game.name}` });
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(helpBtn).toBeFocused();
      } else {
        await helpBtn.click();
        await expect(page.locator('.game-frame-popover')).toBeVisible();
      }
    });
  }

  // Responsive and Evening checks
  for (const [size, width, height] of [['390', 390, 844], ['820', 820, 1180], ['1440', 1440, 900]] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`no horizontal overflow at ${size}px in ${scheme}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto('/play/pillo');
        await page.waitForLoadState('domcontentloaded');

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      });
    }
  }
});

test.describe('game page frame (Games v2, 23 Nov)', () => {
  for (const path of ['/play/vialo', '/play/sudoku', '/play/piccline']) {
    test(`${path}: no site menu bar or building strip, the other open games as deck cards, a skip link`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('header')).toHaveCount(0);
      await expect(page.getByTestId('building-notice')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'skip to content' })).toHaveCount(1);
      const links = page.locator('.game-deck-card');
      // The test build opens every game, the live build only these three; either way no card is a dead end.
      expect(await links.count()).toBeGreaterThanOrEqual(2);
      await expect(page.locator('.game-deck-item')).toHaveCount(await links.count());
      for (const link of await links.all()) await expect(link).toHaveAttribute('href', /^\/play\/[a-z-]+$/);
    });
  }
});

// The fanned deck fits only from 70rem (1120 px; --game-deck-breakpoint). Below it the other games are a plain row of
// cards under the board, and nothing lies over the game; from it the deck sits at the right edge.
test.describe('deck or plain row by width (--breakpoint-deck)', () => {
  for (const path of ['/play/vialo', '/play/sudoku', '/play/word-path']) {
    for (const [width, deck] of [[1024, false], [1056, false], [1100, false], [1119, false], [1120, true], [1280, true]] as const) {
      test(`${path} at ${width} px shows ${deck ? 'the deck' : 'the plain row'}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const slot = page.locator('.game-frame-deck-slot');
        await expect(slot).toHaveCSS('position', deck ? 'absolute' : 'static');
        const overlap = await page.evaluate(() => {
          const board = document.querySelector('.game-frame-board')!.getBoundingClientRect();
          return [...document.querySelectorAll('.game-deck-item')].some((item) => {
            const box = item.getBoundingClientRect();
            return box.left < board.right && box.right > board.left && box.top < board.bottom && box.bottom > board.top;
          });
        });
        // The deck's cards are tilted and hang over the frame's empty margin, so their upright boxes may touch the board's
        // box. What matters is that no tilted card covers part of the game itself: game-deck.spec.ts checks that with the
        // cards' real outlines. The plain row has no tilt, so its boxes must stay clear of the board.
        if (!deck) expect(overlap, 'no card lies over the game').toBe(false);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      });
    }
  }
});

// Same spot on every game page (Christian's canvas comment): at 1440 the frame spans the whole window, so the deck slot's
// right edge is the window's right edge on all six games, tachyyy and hello cards included (drafts build).
test.describe('the frame spans the window on every game page', () => {
  for (const path of ['/play/vialo', '/play/sudoku', '/play/piccline', '/play/crossword', '/play/tachyyy', '/play/hello-cards']) {
    test(`${path} at 1440 px: the deck slot ends at the window's right edge`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      const slot = page.locator('.game-frame-deck-slot');
      await expect(slot).toHaveCount(1);
      const box = await slot.boundingBox();
      expect(Math.round(box!.x + box!.width)).toBe(1440);
    });
  }
});

// Firefox loses about 0.00003 px on a control that sits at a fractional page offset, which makes a 44 px control read as
// 43.99997. On the sudoku page the pause button therefore lands on whole pixels (the status row above it is 2rem tall).
test.describe('sudoku controls land on whole pixels', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`the pause button at 1440 px in ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/play/sudoku');
      const box = await page.getByRole('button', { name: 'pause puzzle' }).evaluate((el) => {
        const b = el.getBoundingClientRect();
        return [b.left + window.scrollX, b.top + window.scrollY, b.width, b.height];
      });
      for (const value of box) expect(Number.isInteger(value), `${box}`).toBe(true);
    });
  }
});

// Between 64rem and 70rem the sidebar and the column are side by side and the deck is a plain row. The row gets its own
// full-width line under them, so the game keeps the width it has at 1120 and the cards never sit beside it (review on #1145).
test.describe('plain row of cards under the game, game keeps its size (1024 to 1119 px)', () => {
  for (const path of ['/play/vialo', '/play/sudoku', '/play/piccline']) {
    test(`${path}: the board is as wide as at 1120 px and the cards are below it`, async ({ page }) => {
      await page.setViewportSize({ width: 1120, height: 900 });
      await page.goto(path);
      const reference = (await page.locator('.game-frame-board').boundingBox())!.width;
      expect(reference).toBeGreaterThan(300);
      for (const width of [1024, 1056, 1100, 1119]) {
        await page.setViewportSize({ width, height: 900 });
        const board = (await page.locator('.game-frame-board').boundingBox())!;
        expect(board.width, `${path} at ${width}: the game keeps its width`).toBe(reference);
        const cards = await page.locator('.game-deck-item').evaluateAll((items) => items.map((item) => item.getBoundingClientRect()).map((box) => ({ top: box.top, left: box.left, right: box.right })));
        expect(cards.length).toBeGreaterThanOrEqual(2);
        for (const card of cards) {
          expect(card.top, `${path} at ${width}: cards start under the game`).toBeGreaterThanOrEqual(board.y + board.height);
          expect(card.left).toBeGreaterThanOrEqual(0);
          expect(card.right).toBeLessThanOrEqual(width);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      }
    });
  }
});

// Evening: the left panel shows each game's dark-background art, chosen the way the site chooses its other Light/Evening
// art (device setting, or the footer's Light/Dark pick), never by recolouring (review of the Evening picture).
test.describe('the left panel wordmark in Evening', () => {
  const wordmarks = [
    { path: '/play/vialo', day: '/design/games-v2/assets/vialo-wordmark-oxblood-v3.svg', evening: '/brand/games/vialo-wordmark-dark.svg' },
    { path: '/play/tachyyy', day: '/design/games-v2/assets/tachyyy-wordmark-light-bar.svg', evening: '/brand/games/tachyyy-wordmark-dark.svg' },
    { path: '/play/piccline', day: '/brand/games/piccline-wordmark-dark.svg', evening: '/brand/games/piccline-wordmark-dark.svg' },
  ];
  for (const { path, day, evening } of wordmarks) {
    test(`${path}: dark shows ${evening}, light shows ${day}`, async ({ page }) => {
      for (const [scheme, expected] of [['dark', evening], ['light', day]] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(path);
        const visible = await page.locator('.game-frame-wordmark-img:visible').evaluateAll((imgs) => imgs.map((img) => new URL((img as HTMLImageElement).src).pathname));
        expect(visible, `${path} in ${scheme}`).toEqual([expected]);
      }
      // The footer's Dark pick wins over a light device.
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(path);
      await page.evaluate(() => { localStorage.setItem('cueory-theme', 'dark'); document.documentElement.dataset.theme = 'dark'; });
      const picked = await page.locator('.game-frame-wordmark-img:visible').evaluateAll((imgs) => imgs.map((img) => new URL((img as HTMLImageElement).src).pathname));
      expect(picked).toEqual([evening]);
    });
  }
  test('crossword, sudoku and hello cards name themselves in ink text, which follows the theme', async ({ page }) => {
    for (const path of ['/play/crossword', '/play/sudoku', '/play/hello-cards']) {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(path);
      await expect(page.locator('.game-frame-wordmark-img:visible'), path).toHaveCount(0);
    }
  });
});
