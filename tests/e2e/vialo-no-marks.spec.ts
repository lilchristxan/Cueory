import { expect, test, type Page } from '@playwright/test';
import { fixClock } from './clock';

// Christian: "I hate these circles below the letters." The board and keys carry no mark under a letter. The three
// results still differ without colour: red ("in the word, somewhere else") has a thin light ring inside the capsule,
// green and white have none.

async function guessCrane(page: Page) {
  await fixClock(page, new Date('2026-11-01T15:00:00'));
  await page.goto('/play/vialo');
  const pack = page.locator('.vialo-pack');
  await pack.getByLabel('your guess', { exact: true }).fill('crane');
  await pack.getByLabel('your guess', { exact: true }).press('Enter');
  const row = pack.getByRole('listitem').first();
  await expect(row).toHaveAccessibleName(/^guess 1: crane\./);
  return row;
}

for (const scheme of ['light', 'dark'] as const) {
  test(`only the red pill has an inner ring and nothing is drawn under a letter: ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const row = await guessCrane(page);
    const pills = await row.locator('.vialo-pill').evaluateAll((nodes) =>
      nodes.map((pill) => {
        const after = getComputedStyle(pill, '::after');
        const before = getComputedStyle(pill, '::before');
        const letter = pill.querySelector('.vialo-letter')!.getBoundingClientRect();
        const box = pill.getBoundingClientRect();
        return {
          kind: ['here', 'elsewhere', 'absent'].find((mark) => pill.classList.contains(`vialo-${mark}`)),
          ring: after.content === '""' && after.position === 'absolute' && Number.parseFloat(after.borderTopWidth) >= 2,
          text: after.content === 'none' || after.content === 'normal' ? '' : after.content,
          shine: before.content !== 'none' && before.content !== 'normal',
          // The letter's own centre is the pill's centre: it was lifted when a mark sat below it.
          offCentre: Math.abs(letter.y + letter.height / 2 - (box.y + box.height / 2)),
        };
      }),
    );
    expect(pills.map((p) => p.kind)).toEqual(['elsewhere', 'here', 'here', 'absent', 'here']);
    expect(pills.map((p) => p.ring)).toEqual([true, false, false, false, false]);
    // The red pill's ring is an empty box; no ● ○ · or any other text is drawn by a pill.
    expect(pills.map((p) => p.text)).toEqual(['""', '', '', '', '']);
    for (const p of pills) expect(p.offCentre).toBeLessThanOrEqual(3);
    expect(pills.every((p) => !p.shine)).toBe(true);
    // The keys draw no mark either (their mark element only shows in high contrast).
    const keyMarks = await page.locator('.vialo-key-mark').evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).display));
    expect(keyMarks.every((d) => d === 'none')).toBe(true);
  });
}

test('the how-to-play legend shows the ring on the red sample and describes it in words', async ({ page }) => {
  await fixClock(page, new Date('2026-11-01T15:00:00'));
  await page.goto('/play/vialo');
  await page.getByTestId('vialo').getByRole('button', { name: 'how to play vialo' }).click();
  const dialog = page.getByRole('dialog', { name: 'how to play vialo' });
  await expect(dialog).toContainText('red with a thin light ring inside it');
  const rings = await dialog.getByTestId('vialo-legend').locator('.vialo-pill').evaluateAll((nodes) =>
    nodes.map((pill) => getComputedStyle(pill, '::after').content === '""'),
  );
  expect(rings).toEqual([false, true, false]);
  await expect(dialog.getByTestId('vialo-legend').getByRole('listitem')).toHaveText([/in its place$/, /in the word, somewhere else$/, /not in the word$/]);
});

test('high contrast draws no inner ring and no mark under the letter either', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cueory-game-settings', JSON.stringify({ highContrast: true }));
  });
  const row = await guessCrane(page);
  await expect(page.getByTestId('vialo')).toHaveClass(/vialo-contrast/);
  const display = await row.locator('.vialo-pill').evaluateAll((nodes) => nodes.map((p) => getComputedStyle(p, '::after').display));
  expect(display.every((d) => d === 'none')).toBe(true);
  // Its three results still differ by rim, as before: a solid rim on "elsewhere", a dashed border on "not in the word".
  await expect(row.locator('.vialo-elsewhere').first()).toHaveCSS('box-shadow', /inset/);
  await expect(row.locator('.vialo-absent').first()).toHaveCSS('border-top-style', 'dashed');
});
