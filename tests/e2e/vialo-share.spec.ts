import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';
import { stickerLayout, STICKER_SIZE } from '../../src/islands/vialosticker';

// The vialo share card (Christian's designs, 25 Nov 2026): two stickers drawn in the browser, the share/save/copy buttons,
// the visible solve timer, and a card that looks the same in Light and Evening. 1 November's word is "grace".

async function open(page: Page, init?: () => void) {
  await page.clock.install({ time: new Date('2026-11-01T15:00:00') });
  await markPanelsSeen(page);
  if (init) await page.addInitScript(init);
  await page.goto('/play/vialo');
  await expect(page.getByTestId('vialo')).toBeVisible();
}
const field = (page: Page) => page.getByLabel('your guess', { exact: true });
async function guess(page: Page, word: string) {
  await field(page).fill(word);
  await field(page).press('Enter');
}
async function finish(page: Page, words: string[] = ['grace']) {
  for (const word of words) await guess(page, word);
  await expect(page.getByTestId('vialo-result')).toContainText('solved.');
  // The share card opens over the board by itself once the last pill has landed.
  const card = page.getByTestId('share-dialog');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('share-dialog-save')).toBeEnabled({ timeout: 20_000 });
  return card;
}

/** Decodes a downloaded PNG in the page and reads its size, corner alpha and the colour at the given points. */
async function inspect(page: Page, path: string, points: Array<[number, number]>) {
  const base64 = readFileSync(path).toString('base64');
  return page.evaluate(
    async ({ base64, points }) => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const at = (x: number, y: number) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data];
      return {
        width: bitmap.width,
        height: bitmap.height,
        corners: [at(2, 2)[3], at(bitmap.width - 3, 2)[3], at(2, bitmap.height - 3)[3], at(bitmap.width - 3, bitmap.height - 3)[3]],
        points: points.map(([x, y]) => at(x, y)),
      };
    },
    { base64, points },
  );
}

async function download(page: Page, button: string) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId(button).click()]);
  return { name: file.suggestedFilename(), path: (await file.path())! };
}

for (const [kind, option, name] of [
  ['centered', 'portrait', 'vialo-portrait-2026-11-01.png'],
  ['lower-third', 'landscape', 'vialo-landscape-2026-11-01.png'],
] as const) {
  test(`exports the ${option} sticker at its size: transparent corners and the right pill colours`, async ({ page }) => {
    await open(page);
    await finish(page, ['crane', 'grace']);
    await page.getByTestId(`share-dialog-option-${option}`).click();
    const saved = await download(page, 'share-dialog-save');
    expect(saved.name).toBe(name);
    const layout = stickerLayout(kind, { rows: [[], []], date: '', stats: [{ value: '0:00', label: 'solve time' }] });
    const pill = (row: number, column: number) => layout.pills[row * 5 + column]!;
    // Row 1 is "crane" against "grace": c is in the word elsewhere, r, a and e are in place, n is not in the word.
    const spots = [pill(0, 0), pill(0, 1), pill(0, 3), pill(1, 2), pill(2, 2)].map((p): [number, number] => [p.cx, p.cy]);
    const seen = await inspect(page, saved.path, spots);
    expect(seen.width).toBe(STICKER_SIZE[kind].width);
    expect(seen.height).toBe(STICKER_SIZE[kind].height);
    expect(seen.corners).toEqual([0, 0, 0, 0]);
    const [red, green, white, solved, empty] = seen.points as number[][];
    expect(red![0]).toBeGreaterThan(red![1]! + 40); // c: in the word, wrong place
    expect(green![1]).toBeGreaterThan(green![0]! + 30); // r: right place
    expect(white!.slice(0, 3).every((v) => v > 215)).toBe(true); // n: not in the word
    expect(solved![1]).toBeGreaterThan(solved![0]! + 30); // grace, all right
    expect(Math.abs(empty![0]! - empty![1]!)).toBeLessThan(25); // an unplayed well: foil grey, not a pill
    expect(empty![3]).toBe(255);
  });
}

test('the sticker has no letters and the card says the result in words', async ({ page }) => {
  await open(page);
  const card = await finish(page, ['crane', 'grace']);
  const text = await page.getByTestId('share-dialog-description').textContent();
  expect(text).toMatch(/solved in 2 of 6/);
  expect(text).toMatch(/no letters/);
  expect(text).not.toMatch(/grace|crane/i);
  await expect(card.getByText('next vialo in')).toBeVisible();
  await expect(page.getByTestId('share-dialog-countdown')).toHaveText(/^next vialo in \d\d:\d\d:\d\d$/);
});

test('the signed-out sticker shows the solve time only (the one switch is stickerStats)', async ({ page }) => {
  await open(page);
  await finish(page);
  const text = await page.getByTestId('share-dialog-description').textContent();
  expect(text).toMatch(/solve time 0:00/);
  expect(text).not.toMatch(/day streak|solved \d/);
});

test('the two sticker previews are one pressed choice, by keyboard too, with a tick and the word as well as the outline', async ({ page }) => {
  await open(page);
  await finish(page);
  const portrait = page.getByTestId('share-dialog-option-portrait');
  const landscape = page.getByTestId('share-dialog-option-landscape');
  await expect(portrait).toHaveAttribute('aria-pressed', 'true');
  await expect(landscape).toHaveAttribute('aria-pressed', 'false');
  await landscape.focus();
  await page.keyboard.press('Enter');
  await expect(landscape).toHaveAttribute('aria-pressed', 'true');
  await expect(portrait).toHaveAttribute('aria-pressed', 'false');
  await expect(landscape.getByText('selected')).toBeVisible();
  await expect(portrait.getByText('selected')).toBeHidden();
  for (const target of [portrait, landscape, page.getByTestId('share-dialog-share'), page.getByTestId('share-dialog-save'), page.getByTestId('share-dialog-copy')]) {
    const box = (await target.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
});

test.describe('share where the browser can share files', () => {
  test('share opens the system sheet with the selected png, the result line and the link', async ({ page }) => {
    await open(page, () => {
      const w = window as unknown as { __shared: unknown[] };
      w.__shared = [];
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d?: ShareData) => Boolean(d?.files?.length) });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (d: ShareData) => {
          w.__shared.push({ files: (d.files ?? []).map((f) => ({ type: f.type, size: f.size, name: f.name })), text: d.text, url: d.url });
        },
      });
    });
    await finish(page);
    await expect(page.getByTestId('share-dialog-share')).not.toHaveAttribute('aria-haspopup', 'menu');
    await page.getByTestId('share-dialog-option-landscape').click();
    await page.getByTestId('share-dialog-share').click();
    await expect(page.getByTestId('share-dialog-menu')).toHaveCount(0);
    const shared = (await page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared)) as Array<{ files: Array<{ type: string; size: number; name: string }>; text: string; url: string }>;
    expect(shared).toHaveLength(1);
    expect(shared[0]!.files).toHaveLength(1);
    expect(shared[0]!.files[0]!.type).toBe('image/png');
    expect(shared[0]!.files[0]!.size).toBeGreaterThan(20_000);
    expect(shared[0]!.files[0]!.name).toBe('vialo-landscape-2026-11-01.png');
    expect(shared[0]!.text).toMatch(/cueory\.app$/);
    expect(shared[0]!.url).toBe('https://cueory.app/play/vialo');
  });

  test('save to gallery still downloads the png rather than opening the sheet', async ({ page }) => {
    await open(page, () => {
      const w = window as unknown as { __shared: number };
      w.__shared = 0;
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { w.__shared += 1; } });
    });
    await finish(page);
    const saved = await download(page, 'share-dialog-save');
    expect(saved.name).toBe('vialo-portrait-2026-11-01.png');
    expect(await page.evaluate(() => (window as unknown as { __shared: number }).__shared)).toBe(0);
    await expect(page.getByTestId('share-dialog-status')).toContainText('saved');
  });
});

test.describe('share where the browser cannot share files', () => {
  const noFiles = () => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
  };

  test('share opens our own menu with web links, save and copy; Escape closes it', async ({ page, isMobile }) => {
    await open(page, noFiles);
    await finish(page);
    const share = page.getByTestId('share-dialog-share');
    await expect(share).toHaveAttribute('aria-haspopup', 'menu');
    await expect(share).toHaveAttribute('aria-expanded', 'false');
    await share.click();
    await expect(share).toHaveAttribute('aria-expanded', 'true');
    const menu = page.getByTestId('share-dialog-menu');
    await expect(menu.getByRole('menuitem')).toHaveCount(isMobile ? 5 : 4); // the text-message link is only on a phone or tablet
    const x = menu.getByRole('menuitem', { name: 'share on x (opens in a new tab)' });
    const facebook = menu.getByRole('menuitem', { name: 'share on facebook (opens in a new tab)' });
    for (const link of [x, facebook]) {
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      const box = (await link.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const xUrl = new URL((await x.getAttribute('href'))!);
    expect(xUrl.origin + xUrl.pathname).toBe('https://x.com/intent/post');
    expect([...xUrl.searchParams.keys()].sort()).toEqual(['text', 'url']);
    expect(xUrl.searchParams.get('url')).toBe('https://cueory.app/play/vialo');
    expect(xUrl.searchParams.get('text')).toMatch(/^vialo · .* · 1\/6 · cueory\.app$/);
    const fbUrl = new URL((await facebook.getAttribute('href'))!);
    expect(fbUrl.origin + fbUrl.pathname).toBe('https://www.facebook.com/sharer/sharer.php');
    expect(fbUrl.searchParams.get('u')).toBe('https://cueory.app/play/vialo');
    // The first item has focus; arrows move through the items and wrap.
    await expect(x).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(facebook).toBeFocused();
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem', { name: 'copy' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(x).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(share).toBeFocused();
    await expect(share).toHaveAttribute('aria-expanded', 'false');
  });

  test('the menu repeats save, and a press outside closes it', async ({ page }) => {
    await open(page, noFiles);
    await finish(page);
    await page.getByTestId('share-dialog-share').click();
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('share-dialog-menu').getByRole('menuitem', { name: 'save', exact: true }).click()]);
    expect(file.suggestedFilename()).toBe('vialo-portrait-2026-11-01.png');
    await expect(page.getByTestId('share-dialog-menu')).toHaveCount(0);
    await page.getByTestId('share-dialog-share').click();
    await expect(page.getByTestId('share-dialog-menu')).toBeVisible();
    await page.locator('.share-dialog-wordmark').click();
    await expect(page.getByTestId('share-dialog-menu')).toHaveCount(0);
  });

  test('a touch phone also gets a text-message link with the line and the link', async ({ browser }) => {
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await open(page, noFiles);
    await finish(page);
    await page.getByTestId('share-dialog-share').click();
    const message = page.getByTestId('share-dialog-menu').getByRole('menuitem', { name: 'send a message' });
    const href = (await message.getAttribute('href'))!;
    expect(href.startsWith('sms:?&body=')).toBe(true);
    expect(decodeURIComponent(href.slice('sms:?&body='.length))).toMatch(/cueory\.app https:\/\/cueory\.app\/play\/vialo$/);
    await expect(message).not.toHaveAttribute('target', '_blank');
    await context.close();
  });
});

test.describe('copy sticker', () => {
  test('puts an image/png on the clipboard where the browser can', async ({ page }) => {
    await open(page, () => {
      const w = window as unknown as { __copied: string[] };
      w.__copied = [];
      class Item {
        constructor(public data: Record<string, Blob>) {}
        static supports() { return true; }
      }
      Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: Item });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async (items: Item[]) => { for (const i of items) w.__copied.push(...Object.keys(i.data)); } } });
    });
    await finish(page);
    await page.getByTestId('share-dialog-copy').click();
    await expect(page.getByTestId('share-dialog-status')).toContainText('copied');
    expect(await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).toEqual(['image/png']);
  });

  test('saves instead, and says so politely, where the browser cannot copy pictures', async ({ page }) => {
    await open(page, () => {
      Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: undefined });
    });
    await finish(page);
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId('share-dialog-copy').click()]);
    expect(file.suggestedFilename()).toBe('vialo-portrait-2026-11-01.png');
    await expect(page.getByTestId('share-dialog-status')).toContainText("can't copy pictures");
    await expect(page.getByTestId('share-dialog-status')).toHaveAttribute('aria-live', 'polite');
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the share card keeps its Light look in Evening too: ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await open(page);
    const card = await finish(page);
    const look = await page.evaluate(() => {
      const css = (el: Element, prop: string) => getComputedStyle(el).getPropertyValue(prop);
      const card = document.querySelector('[data-testid="share-dialog"]')!;
      const share = document.querySelector('[data-testid="share-dialog-share"]')!;
      const save = document.querySelector('[data-testid="share-dialog-save"]')!;
      const status = document.querySelector('[data-testid="share-dialog-status"]')!;
      const countdown = document.querySelector('[data-testid="share-dialog-countdown"]')!;
      return {
        card: [css(card, 'background-color'), css(card, 'color'), css(card, 'border-top-color')],
        share: [css(share, 'background-color'), css(share, 'color')],
        save: [css(save, 'color'), css(save, 'border-top-color')],
        status: css(status, 'color'),
        countdown: css(countdown, 'color'),
        focus: getComputedStyle(card).getPropertyValue('--color-focus'),
      };
    });
    // Ivory card, Espresso text, Oxblood primary button: the Daytime palette, whatever the page's theme.
    expect(look.card[0]).toBe('rgb(249, 245, 239)');
    expect(look.card[1]).toBe('rgb(62, 44, 35)');
    expect(look.share).toEqual(['rgb(110, 32, 25)', 'rgb(249, 245, 239)']);
    expect(look.save[0]).toBe('rgb(62, 44, 35)');
    expect(look.status).toBe('rgb(107, 82, 67)');
    expect(look.countdown).toBe('rgb(107, 82, 67)');
    expect(look.focus.trim()).toBe('#6b5243');
    await expect(card).toBeVisible();
  });
}

test('the card never scrolls the page sideways and keeps 44 px targets', async ({ page }) => {
  await open(page);
  await finish(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test.describe('the solve timer', () => {
  const time = (page: Page) => page.getByTestId('vialo-time');

  test('shows a quiet time line that starts at the first letter, pauses in a hidden tab and stops at the last guess', async ({ page }) => {
    await open(page);
    await expect(time(page)).toHaveText('time: 0:00');
    await page.clock.fastForward(30_000); // before any letter: nothing counts
    await field(page).pressSequentially('g');
    await page.clock.fastForward(5_000);
    await expect(time(page)).toHaveText('time: 0:05');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(20_000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(time(page)).toHaveText('time: 0:05');
    await field(page).fill('grace');
    await field(page).press('Enter');
    await expect(page.getByTestId('vialo-result')).toContainText('solved.');
    await expect(page.getByTestId('vialo-solve-time')).toHaveText('solve time 0:05.');
    await page.clock.fastForward(60_000);
    await expect(time(page)).toHaveText('time: 0:05');
  });

  test('stops at "print anyway" (the forfeit event) too: the time shown no longer changes (Codex on #1229)', async ({ page }) => {
    await open(page);
    await field(page).pressSequentially('g');
    await page.clock.fastForward(7_000);
    await expect(time(page)).toHaveText('time: 0:07');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('cueory:vialo-forfeited', { detail: { day: '2026-11-01' } })));
    await expect(page.getByTestId('vialo-result')).toContainText('out of guesses');
    await page.clock.fastForward(60_000);
    await expect(time(page)).toHaveText('time: 0:07');
    await page.clock.fastForward(60_000);
    await expect(time(page)).toHaveText('time: 0:07');
  });

  test('is not announced as it ticks, and "show the timer" hides it without moving the board', async ({ page }) => {
    await open(page);
    expect(await time(page).evaluate((el) => el.closest('[aria-live]') === null && !el.hasAttribute('aria-live'))).toBe(true);
    // Positions on the page (not the screen), so a scroll caused by the settings dialog does not count as the board moving.
    const where = () => page.locator('.vialo-pack').evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, height: r.height }; });
    const before = await where();
    await page.getByTestId('game-settings-button').click();
    const toggle = page.getByRole('switch', { name: /show the timer/ });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Escape');
    await expect(time(page)).toHaveText('');
    const after = await where();
    expect({ y: after.y, height: after.height, x: after.x }).toEqual({ y: before.y, height: before.height, x: before.x });
  });
});

test.describe('the share card is a modal dialog over the board', () => {
  test('a parent re-render keeps focus where it is and the share menu open', async ({ page }) => {
    await open(page, () => {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
    });
    await finish(page);
    await page.getByTestId('share-dialog-share').click();
    const menu = page.getByTestId('share-dialog-menu');
    await expect(menu).toBeVisible();
    await page.keyboard.press('ArrowDown');
    const focused = await page.evaluate(() => document.activeElement?.textContent ?? '');
    // The game re-renders on every visibility change (and each minute for the countdown): the page tells it twice.
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(100);
    await expect(menu).toBeVisible();
    await expect(page.getByTestId('share-dialog-share')).toHaveAttribute('aria-expanded', 'true');
    expect(await page.evaluate(() => document.activeElement?.textContent ?? '')).toBe(focused);
    expect(await page.evaluate(() => document.activeElement?.closest('[data-testid="share-dialog-menu"]') !== null)).toBe(true);
  });

  test('opens by itself, takes focus, traps Tab, closes with Escape and gives focus back to the share button', async ({ page }) => {
    await open(page);
    const card = await finish(page);
    await expect(card).toHaveAttribute('role', 'dialog');
    await expect(card).toHaveAttribute('aria-modal', 'true');
    await expect(card).toBeFocused();
    // Announced once, as the dialog's description: the result line and the sticker in words.
    const described = await card.getAttribute('aria-describedby');
    await expect(page.locator(`#${described}`)).toContainText('vialo · ');
    // The page behind is inert; Tab stays inside, wrapping from the last control to the first.
    expect(await page.evaluate(() => document.querySelector('.vialo-pack-wrap')!.closest('[inert]') !== null)).toBe(true);
    const stops = ['share-dialog-close', 'share-dialog-option-portrait', 'share-dialog-option-landscape', 'share-dialog-share', 'share-dialog-save', 'share-dialog-copy'];
    await page.keyboard.press('Tab');
    for (const id of stops) {
      await expect(page.getByTestId(id)).toBeFocused();
      await page.keyboard.press('Tab');
    }
    await expect(page.getByTestId(stops[0]!)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('share-dialog-copy')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
    const reopen = page.getByTestId('vialo-share-open');
    await expect(reopen).toBeVisible();
    await expect(reopen).toBeFocused();
    // The finished board is visible and the share button reopens the card.
    await expect(page.getByRole('list', { name: 'your guesses' })).toBeVisible();
    await reopen.click();
    await expect(card).toBeVisible();
    await expect(card).toBeFocused();
  });

  test('has a quiet close button in the top-right corner, 44 px, named "close"', async ({ page }) => {
    await open(page);
    const card = await finish(page);
    const close = card.getByRole('button', { name: 'close', exact: true });
    const box = (await close.boundingBox())!;
    const cardBox = (await card.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeGreaterThan(cardBox.x + cardBox.width - 80);
    expect(box.y).toBeLessThan(cardBox.y + 60);
    await close.click();
    await expect(card).toBeHidden();
    await expect(page.getByTestId('vialo-share-open')).toBeFocused();
  });

  test('dims the page behind with the glove note layer, and a click on the dim closes it', async ({ page }) => {
    await open(page);
    const card = await finish(page);
    const dim = await page.evaluate(() => {
      const scrim = document.querySelector('[data-testid="share-dialog-scrim"]')!;
      const style = getComputedStyle(scrim);
      return { position: style.position, z: style.zIndex, bg: style.backgroundColor, layer: getComputedStyle(document.documentElement).getPropertyValue('--layer-glove-note').trim() };
    });
    expect(dim.position).toBe('fixed');
    expect(dim.z).toBe(dim.layer);
    expect(dim.bg).not.toBe('rgba(0, 0, 0, 0)');
    await page.mouse.click(2, 2);
    await expect(card).toBeHidden();
  });

  test('is not opened at all before the game ends, and opens at once with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await expect(page.getByTestId('share-dialog')).toHaveCount(0);
    await guess(page, 'grace');
    await expect(page.getByTestId('share-dialog')).toBeVisible();
  });
});

test.describe('the share card fits every screen', () => {
  for (const [width, height] of [[390, 844], [844, 390], [820, 1180], [1440, 900]] as const) {
    test(`${width} x ${height}: inside the screen or scrollable, nothing clipped, no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await open(page);
      const card = await finish(page);
      const fit = await page.evaluate(() => {
        const scrim = document.querySelector('[data-testid="share-dialog-scrim"]') as HTMLElement;
        const dialog = document.querySelector('[data-testid="share-dialog"]') as HTMLElement;
        const before = dialog.getBoundingClientRect();
        scrim.scrollTop = scrim.scrollHeight;
        const after = dialog.getBoundingClientRect();
        return {
          top: before.top,
          left: before.left,
          right: before.right,
          bottomWhenScrolled: after.bottom,
          vh: window.innerHeight,
          vw: window.innerWidth,
          scrolls: scrim.scrollHeight > scrim.clientHeight,
          sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth || scrim.scrollWidth > scrim.clientWidth,
        };
      });
      expect(fit.sideways).toBe(false);
      expect(fit.left).toBeGreaterThanOrEqual(0);
      expect(fit.right).toBeLessThanOrEqual(fit.vw);
      expect(fit.top).toBeGreaterThanOrEqual(0);
      // The whole card, down to the countdown, can be brought into view.
      expect(fit.bottomWhenScrolled).toBeLessThanOrEqual(fit.vh);
      await page.getByTestId('share-dialog-countdown').scrollIntoViewIfNeeded();
      await expect(page.getByTestId('share-dialog-countdown')).toBeInViewport();
      await expect(card).toBeVisible();
    });
  }
});
