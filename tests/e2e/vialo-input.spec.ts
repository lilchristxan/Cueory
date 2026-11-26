import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { fixClock } from './clock';

// Christian (25 Nov 2026): backspace and enter must work on vialo from every focus position, by physical keyboard,
// mouse, touch and keyboard activation of the on-screen keys.
test.beforeEach(async ({ page }) => {
  await fixClock(page, new Date('2026-11-01T15:00:00'));
  await page.goto('/play/vialo');
  await expect(page.getByTestId('vialo')).toBeVisible();
});

const keys = (page: Page) => page.getByRole('group', { name: 'letters' });
// A letter key that has a result is named like "a, in its place", so letters match their first word.
const key = (page: Page, name: string) =>
  name.length === 1 ? keys(page).getByRole('button', { name: new RegExp(`^${name}(,|$)`) }) : keys(page).getByRole('button', { name, exact: true });
const typed = (page: Page) => page.locator('[data-testid="vialo"] .vialo-typed .vialo-letter');
const guesses = (page: Page) => page.getByRole('list', { name: 'your guesses' }).getByRole('listitem');
const field = (page: Page) => page.getByLabel('your guess', { exact: true });
async function tap(page: Page, target: Locator, touch: boolean) {
  if (touch) await target.tap();
  else await target.click();
}
async function typeOnScreen(page: Page, word: string) {
  for (const letter of word) await key(page, letter).click();
}
// TEMPORARY DIAGNOSTICS for the WebKit-only stall of the "after the game is finished" test below (the on-screen `r` key
// never becomes visible, enabled and stable). It changes no assertion and no timeout. It samples the key and the pack for
// 12 animation frames and prints one JSON line (job log) and attaches it. Remove it once the cause is fixed.
async function sampleKeyDiagnostics(page: Page, testInfo: TestInfo, label: string) {
  const data = await page.evaluate(async () => {
    const letters = document.querySelector('[role="group"][aria-label="letters"]');
    const keyEl = Array.from(letters?.querySelectorAll('button') ?? []).find((b) => /^r(,|$)/.test(b.getAttribute('aria-label') ?? b.textContent ?? '')) ?? null;
    const packEl = document.querySelector('.vialo-pack-wrap');
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 100) / 100);
    };
    const anims = (el: Element | null) => {
      const out: string[] = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        for (const a of node.getAnimations({ subtree: false })) {
          const name = (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? '?';
          out.push(`${node.tagName.toLowerCase()}${node.className && typeof node.className === 'string' ? '.' + node.className.split(' ')[0] : ''}:${name}:${a.playState}`);
        }
        if (node === document.body) break;
      }
      return out;
    };
    const frames: unknown[] = [];
    for (let i = 0; i < 12; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const cs = keyEl ? getComputedStyle(keyEl) : null;
      frames.push({
        key: box(keyEl), pack: box(packEl), scroll: Math.round(window.scrollY),
        disabled: (keyEl as HTMLButtonElement | null)?.disabled, ariaDisabled: keyEl?.getAttribute('aria-disabled'),
        vis: cs?.visibility, pe: cs?.pointerEvents, op: cs?.opacity, anims: anims(keyEl),
      });
    }
    const active = document.activeElement;
    return {
      found: Boolean(keyEl), keyClass: keyEl?.className, frames,
      active: `${active?.tagName.toLowerCase()}:${active?.getAttribute('aria-label') ?? active?.getAttribute('name') ?? ''}`,
      openDialogs: document.querySelectorAll('dialog[open], [role="dialog"]').length, inert: document.querySelectorAll('[inert]').length,
    };
  });
  const line = JSON.stringify({ vialoKeyDiagnostics: label, ...data });
  console.log(line);
  await testInfo.attach(`vialo-key-diagnostics-${label}`, { body: line, contentType: 'application/json' });
}

const focusTargets: Record<string, (page: Page) => Promise<void>> = {
  'the page body': async (page) => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  },
  'the guess cell': async (page) => {
    await field(page).focus();
  },
  'a letter key just pressed': async (page) => {
    await key(page, 'q').focus();
  },
  'the delete key': async (page) => {
    await key(page, 'delete').focus();
  },
};

for (const [where, focus] of Object.entries(focusTargets)) {
  for (const physical of ['Backspace', 'Delete']) {
    test(`${physical} removes the last typed letter with focus on ${where}`, async ({ page }) => {
      await typeOnScreen(page, 'cra');
      await focus(page);
      await page.keyboard.press(physical);
      await expect(typed(page)).toHaveText(['c', 'r']);
      await page.keyboard.press(physical);
      await page.keyboard.press(physical);
      await expect(typed(page)).toHaveCount(0);
      await page.keyboard.press(physical);
      await expect(typed(page)).toHaveCount(0);
      await expect(guesses(page)).toHaveCount(0);
    });
  }

  for (const enter of ['Enter', 'NumpadEnter']) {
    test(`${enter} submits a full row with focus on ${where}, once`, async ({ page }) => {
      await typeOnScreen(page, 'crane');
      await focus(page);
      await page.keyboard.press(enter);
      await expect(guesses(page)).toHaveCount(1);
      await expect(guesses(page)).toHaveAccessibleName(/^guess 1: crane\./);
      await expect(typed(page)).toHaveCount(0);
    });
  }
}

test('Backspace never touches submitted rows and Enter on a short row submits nothing', async ({ page }) => {
  await typeOnScreen(page, 'crane');
  await key(page, 'enter').click();
  await expect(guesses(page)).toHaveCount(1);
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(guesses(page)).toHaveCount(1);
  await expect(guesses(page)).toHaveAccessibleName(/^guess 1: crane\./);
  await typeOnScreen(page, 'ab');
  await page.keyboard.press('Enter');
  await expect(guesses(page)).toHaveCount(1);
  await expect(page.getByTestId('vialo-problem')).toBeVisible();
  await expect(typed(page)).toHaveText(['a', 'b']);
});

test('Backspace on the page does not navigate back', async ({ page }) => {
  await page.goto('/');
  await page.goto('/play/vialo');
  await typeOnScreen(page, 'ab');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Backspace');
  await expect(page).toHaveURL(/\/play\/vialo$/);
  await expect(typed(page)).toHaveText(['a']);
});

test('holding Enter submits a row once', async ({ page }) => {
  await typeOnScreen(page, 'crane');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.down('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(guesses(page)).toHaveCount(1);
});

test('Enter on a word that is not in the list shows the message and submits nothing', async ({ page }) => {
  await typeOnScreen(page, 'zzzzz');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('vialo-problem')).toBeVisible();
  await expect(guesses(page)).toHaveCount(0);
  await expect(typed(page)).toHaveCount(5);
});

test('Enter and Backspace do nothing while the how-to-play dialog is open', async ({ page }) => {
  await typeOnScreen(page, 'crane');
  await page.getByTestId('game-frame-help-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  await expect(guesses(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(typed(page)).toHaveCount(5);
});

test('Enter and Backspace do nothing after the game is finished', async ({ page }, testInfo) => {
  let guess = 0;
  for (const word of ['crane', 'crane', 'crane', 'crane', 'crane', 'crane']) {
    guess += 1;
    await sampleKeyDiagnostics(page, testInfo, `before-word-${guess}`); // temporary, see above
    await typeOnScreen(page, word);
    await page.keyboard.press('Enter');
  }
  await expect(page.getByTestId('vialo-result')).toBeVisible();
  const before = await guesses(page).count();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  await expect(guesses(page)).toHaveCount(before);
});

test.describe('on-screen delete and enter keys', () => {
  for (const how of ['click', 'Space key']) {
    test(`delete key removes the last letter by ${how}`, async ({ page }) => {
      await typeOnScreen(page, 'cra');
      const del = key(page, 'delete');
      if (how === 'click') await del.click();
      else {
        await del.focus();
        await page.keyboard.press('Space');
      }
      await expect(typed(page)).toHaveText(['c', 'r']);
      await del.click();
      await del.click();
      await del.click();
      await expect(typed(page)).toHaveCount(0);
    });
  }

  for (const how of ['click', 'Enter key', 'Space key']) {
    test(`enter key submits a full row once by ${how}`, async ({ page }) => {
      await typeOnScreen(page, 'crane');
      const enter = key(page, 'enter');
      if (how === 'click') await enter.click();
      else {
        await enter.focus();
        await page.keyboard.press(how === 'Enter key' ? 'Enter' : 'Space');
      }
      await expect(guesses(page)).toHaveCount(1);
    });
  }

  // Enter on the focused delete key means "submit the row" (Christian, 25 Nov 2026), so it must really submit.
  test('Enter on the focused delete key submits a full row exactly once', async ({ page }) => {
    await typeOnScreen(page, 'crane');
    await key(page, 'delete').focus();
    await page.keyboard.press('Enter');
    await expect(guesses(page)).toHaveCount(1);
    await expect(guesses(page)).toHaveAccessibleName(/^guess 1: crane\./);
    await expect(guesses(page).first().locator('.vialo-pill.vialo-here, .vialo-pill.vialo-elsewhere, .vialo-pill.vialo-absent')).toHaveCount(5);
    await expect(typed(page)).toHaveCount(0);
  });

  test('Enter on the focused delete key with a short row shows the game message and submits nothing', async ({ page }) => {
    await typeOnScreen(page, 'cra');
    await key(page, 'delete').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('vialo-problem')).toBeVisible();
    await expect(guesses(page)).toHaveCount(0);
    await expect(typed(page)).toHaveText(['c', 'r', 'a']);
  });
});

test.describe('on-screen keys by touch', () => {
  // Playwright's isMobile hangs Firefox, so it is set only for Chromium and WebKit; hasTouch stays on everywhere.
  test.use({
    hasTouch: true,
    isMobile: async ({ browserName }, use) => {
      await use(browserName === 'chromium' || browserName === 'webkit');
    },
  });

  test('tapping delete removes the last letter and tapping enter submits once', async ({ page }) => {
    for (const letter of 'crane') await key(page, letter).tap();
    await expect(typed(page)).toHaveCount(5);
    await key(page, 'delete').tap();
    await expect(typed(page)).toHaveText([...'cran']);
    await key(page, 'e').tap();
    await key(page, 'enter').tap();
    await expect(guesses(page)).toHaveCount(1);
    await expect(guesses(page)).toHaveAccessibleName(/^guess 1: crane\./);
  });
});

// Christian (25 Nov 2026): when a game ends the word of the day is not shown, to sight or to screen readers.
test('after a lost game the answer appears nowhere in the visible text or accessible names', async ({ page }) => {
  for (const word of ['plant', 'lemon', 'music', 'pilot', 'coast', 'trial']) {
    await typeOnScreen(page, word);
    await page.keyboard.press('Enter');
  }
  const result = page.getByTestId('vialo-result');
  await expect(result).toBeVisible();
  await expect(result).toContainText('out of guesses');
  await expect(result).toContainText('next word in');
  // Fixed day 1 Nov 2026: the word of the day is grace.
  const everything = await page.evaluate(() => {
    const names = Array.from(document.querySelectorAll('[aria-label], [title], [alt]'), (node) => `${node.getAttribute('aria-label')} ${node.getAttribute('title')} ${node.getAttribute('alt')}`);
    return `${document.body.innerText}\n${document.body.textContent}\n${names.join('\n')}`;
  });
  expect(everything).not.toMatch(/the word was/i);
  expect(everything).not.toMatch(/\bgrace\b/i);
});

// Christian (25 Nov 2026): the board uses only white, oxblood and dark green, the same as the keys, in Light and Evening.
for (const scheme of ['light', 'dark'] as const) {
  test(`board pills and help example pills use only white, oxblood and dark green (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await typeOnScreen(page, 'crane');
    await key(page, 'enter').click();
    await expect(guesses(page)).toHaveCount(1);
    await typeOnScreen(page, 'plant');
    await key(page, 'enter').click();
    await expect(guesses(page)).toHaveCount(2);
    await page.getByTestId('game-frame-help-button').click();
    await expect(page.getByTestId('vialo-legend')).toBeVisible();
    const colours = await page.evaluate(() => {
      const probe = document.createElement('span');
      document.body.append(probe);
      const resolve = (token: string) => {
        probe.style.backgroundColor = `var(${token})`;
        return getComputedStyle(probe).backgroundColor;
      };
      const read = (selector: string) => Array.from(document.querySelectorAll(selector), (pill) => getComputedStyle(pill).backgroundColor);
      const result = {
        green: resolve('--game-dark-green'),
        oxblood: resolve('--game-oxblood'),
        espresso: resolve('--color-pillo-here'),
        tan: resolve('--color-pillo-elsewhere'),
        here: read('.vialo-pill.vialo-here'),
        elsewhere: read('.vialo-pill.vialo-elsewhere'),
        absent: read('.vialo-pill.vialo-absent'),
        all: read('.vialo-pill'),
      };
      probe.remove();
      return result;
    });
    expect(colours.here.length).toBeGreaterThan(1);
    expect(colours.elsewhere.length).toBeGreaterThan(1);
    for (const colour of colours.here) expect(colour).toBe(colours.green);
    for (const colour of colours.elsewhere) expect(colour).toBe(colours.oxblood);
    for (const colour of colours.absent) expect(colour).toBe('rgb(255, 255, 255)');
    for (const colour of colours.all) {
      expect(colour).not.toBe(colours.espresso);
      expect(colour).not.toBe(colours.tan);
    }
  });
}

// "on-screen keyboard only" (settings): only the letter keys below type. The physical keyboard must not add, delete
// or submit, but Enter or Space on a focused key still activates that key.
async function keysOnlyOn(page: Page) {
  await page.getByRole('button', { name: 'vialo settings' }).click();
  const settings = page.getByRole('dialog', { name: 'vialo settings' });
  await settings.getByRole('switch', { name: /on-screen keyboard only/ }).click();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
}

test('with the on-screen keyboard only setting on, the physical keyboard does not type, delete or submit', async ({ page }) => {
  await keysOnlyOn(page);
  await typeOnScreen(page, 'crane');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('a');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Enter');
  await expect(typed(page)).toHaveText([...'crane']);
  await expect(guesses(page)).toHaveCount(0);
  await key(page, 'enter').click();
  await expect(guesses(page)).toHaveCount(1);
});

test('with the setting on, Enter and Space on a focused on-screen key still activate it', async ({ page }) => {
  await keysOnlyOn(page);
  await key(page, 'c').focus();
  await page.keyboard.press('Enter');
  await key(page, 'r').focus();
  await page.keyboard.press('Space');
  await expect(typed(page)).toHaveText(['c', 'r']);
  await key(page, 'delete').focus();
  await page.keyboard.press('Enter');
  await expect(typed(page)).toHaveText(['c']);
});

test('with the setting off, the physical keyboard types, deletes and submits', async ({ page }) => {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (const letter of 'crane') await page.keyboard.press(letter);
  await expect(typed(page)).toHaveCount(5);
  await page.keyboard.press('Backspace');
  await expect(typed(page)).toHaveCount(4);
  await page.keyboard.press('e');
  await page.keyboard.press('Enter');
  await expect(guesses(page)).toHaveCount(1);
});
