import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';
import { openLabPanels } from './anatomy-lab-panels';
import { sizeOf } from './projects';

/**
 * The anatomy lab's redesigned shell (Task 178, redesign part 1): the dark instrument look in Light and Evening, the
 * orientation panel with Christian's three view names, body systems with a dot and the words on / off, the bottom bar,
 * and panels that collapse below the desktop width. Against the test fixture (?fixture) plus the draft systems the
 * preview build carries; nothing here depends on what any structure is called.
 */

const URL = '/preview/anatomy-lab?fixture';

async function openClosedLab(page: Page) {
  await markPanelsSeen(page);
  await page.goto(URL);
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.getByTestId('anatomy-stage')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'labels', exact: true })).toBeEnabled({ timeout: 20_000 });
}

async function openLab(page: Page) {
  await openClosedLab(page);
  await openLabPanels(page);
  await expect(page.getByRole('button', { name: 'reset view' })).toBeEnabled({ timeout: 20_000 });
}

async function noSidewaysScroll(page: Page) {
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

test.describe('anatomy lab shell: look', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`the stage is the same dark instrument in ${scheme === 'light' ? 'Light' : 'Evening'}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openLab(page);
      const look = await page.getByTestId('anatomy-lab').evaluate((frame) => {
        const style = getComputedStyle(frame);
        return {
          page: style.getPropertyValue('--color-page').trim().toLowerCase(),
          ink: style.getPropertyValue('--color-ink').trim().toLowerCase(),
          text: style.color,
          scheme: style.colorScheme,
        };
      });
      expect(look).toEqual({ page: '#1c1917', ink: '#f9f5ef', text: 'rgb(249, 245, 239)', scheme: 'dark' });
    });
  }

  test('nothing on the stage animates, and nothing starts animating with reduced motion on', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLab(page);
    const animated = await page.getByTestId('anatomy-lab').evaluate((frame) =>
      [...frame.querySelectorAll('*'), frame].filter((el) => getComputedStyle(el).animationName !== 'none').length);
    expect(animated).toBe(0);
  });

  test('uses Lato and no other font on the stage', async ({ page }) => {
    await openLab(page);
    const fonts = await page.getByTestId('anatomy-lab').evaluate((frame) =>
      [...new Set([...frame.querySelectorAll('button, p, h2, label, input, span')].map((el) => getComputedStyle(el).fontFamily.split(',')[0]!.replace(/["']/g, '').trim()))]);
    expect(fonts).toEqual(['Lato']);
  });
});

test.describe('anatomy lab shell: orientation', () => {
  test('three views carry Christian\'s words, with a picture of the loaded model each, plus the play button', async ({ page }) => {
    await openLab(page);
    const views = page.getByRole('group', { name: 'preset views' });
    await expect(views.getByRole('button')).toHaveCount(3);
    await expect(views.getByRole('button', { name: 'anterior view', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(views.getByRole('button', { name: 'posterior view', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(views.getByRole('button', { name: 'lateral view', exact: true })).toHaveAttribute('aria-pressed', 'false');
    // The words are on the screen under each picture.
    for (const word of ['anterior', 'posterior', 'lateral']) await expect(views.getByText(word, { exact: true })).toBeVisible();

    // Each picture is the model drawn from that view: real pixels, not an empty frame.
    for (const word of ['anterior', 'posterior', 'lateral']) {
      const image = views.getByRole('button', { name: `${word} view`, exact: true }).locator('img');
      await expect(image).toHaveAttribute('src', /^data:image\/png/, { timeout: 15_000 });
      const drawn = await image.evaluate(async (img: HTMLImageElement) => {
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let opaque = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) opaque++;
        return opaque;
      });
      expect(drawn, word).toBeGreaterThan(100);
    }

    // The play button in the middle of the arrows turns the model by itself (it replaced "free rotate", Christian,
    // 2026-11-27). The test shapes start still; a preset view, an arrow or reset stops the turning again.
    const spin = page.getByRole('button', { name: 'turn the model by itself', exact: true });
    await expect(spin).toHaveAttribute('aria-pressed', 'false');
    await spin.click();
    await expect(spin).toHaveAttribute('aria-pressed', 'true');
    await expect(views.getByRole('button', { name: 'anterior view', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await views.getByRole('button', { name: 'lateral view', exact: true }).click();
    await expect(views.getByRole('button', { name: 'lateral view', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(spin).toHaveAttribute('aria-pressed', 'false');
    // Turning with a button leaves the preset.
    await page.getByRole('button', { name: 'turn left' }).click();
    await expect(views.getByRole('button', { name: 'lateral view', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'reset view' }).click();
    await expect(views.getByRole('button', { name: 'anterior view', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the lab never says front, back or side', async ({ page }) => {
    await openLab(page);
    const text = await page.getByTestId('anatomy-lab').innerText();
    // "back" alone stays ("put a layer back" is about layers); as a view name it is gone.
    expect(text).not.toMatch(/\b(front|side)\b|\bback view\b|\bon its back\b/i);
    const names = await page.getByTestId('anatomy-lab').locator('button[aria-label], [aria-label]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
    for (const name of names) expect(name, name).not.toMatch(/\b(front|side)\b|\bback view\b|\bon its back\b/i);
  });
});

test.describe('anatomy lab shell: body systems and layers', () => {
  test('each row has a filled or hollow dot AND an arrow, matching its pressed state', async ({ page }) => {
    await openLab(page);
    const rows = page.getByRole('group', { name: 'body system' }).locator(':scope > button'); // the system rows; the open system's structures are listed under its row
    expect(await rows.count()).toBeGreaterThan(1);
    const states = await rows.evaluateAll((buttons) => buttons.map((button) => ({
      pressed: button.getAttribute('aria-pressed'),
      word: button.querySelector('.lab-state')?.textContent,
      dot: !!button.querySelector('.lab-dot'),
    })));
    for (const state of states) {
      expect(state.dot).toBe(true);
      // Christian (2026-11-27): the words on / off were too much. The lit or hollow dot is the indicator, and a
      // second shape, the arrow, points down on the open system and sideways on the others: never colour alone.
      expect(state.word).toBe(state.pressed === 'true' ? '▾' : '▸');
    }
    expect(states.filter((state) => state.pressed === 'true')).toHaveLength(1);
    // The arrow is drawn on the screen, not only in the markup.
    await expect(rows.first().locator('.lab-state')).toBeVisible();
    await expect(rows.first().locator('.lab-state')).toHaveText('▾');
  });
});

test.describe('anatomy lab shell: bottom bar', () => {
  test('labels, spread structures apart and more are there, and the slider moves the structures', async ({ page }) => {
    await openLab(page);
    // The bottom bar is the slider alone (Christian, 2026-11-27); labels and more sit in the top bar.
    const bar = page.getByRole('group', { name: 'bottom bar' });
    const labels = page.getByRole('button', { name: 'labels', exact: true });
    await expect(labels).toBeEnabled();
    await expect(bar.getByRole('button')).toHaveCount(0);
    await expect(bar.getByText('spread structures apart · 0%')).toBeAttached();
    for (const control of [labels, page.getByRole('button', { name: 'more', exact: true })]) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }

    await labels.click();
    const overlay = page.getByTestId('anatomy-labels');
    await expect(overlay.locator(':scope > span').first()).toBeVisible();
    // Measured from the 3D view's own corner: focusing the slider can scroll the page (by a different amount in
    // each engine), and that moves every label on the screen without moving it in the view.
    const spots = () => overlay.locator(':scope > span').evaluateAll((spans) =>
      spans.map((span) => {
        const box = span.getBoundingClientRect();
        const frame = span.parentElement!.getBoundingClientRect();
        return `${span.textContent}@${Math.round(box.x - frame.x)},${Math.round(box.y - frame.y)}`;
      }).sort().join('|'));
    const together = await spots();

    const slider = bar.getByRole('slider', { name: /spread structures apart/ });
    await slider.focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
    await expect(bar.getByText('spread structures apart · 50%')).toBeAttached();
    await expect(slider).toHaveAttribute('aria-valuetext', '50%');
    await expect.poll(spots).not.toEqual(together);
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
    await expect(bar.getByText('spread structures apart · 0%')).toBeAttached();
    await expect.poll(spots).toEqual(together);
  });

  test('more opens and closes the drawer of the other tools', async ({ page }) => {
    await openClosedLab(page);
    const more = page.getByRole('button', { name: 'more', exact: true });
    const drawer = page.getByTestId('anatomy-more');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(drawer).toBeHidden();
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'start the quiz' })).toBeVisible();
    await more.click();
    await expect(drawer).toBeHidden();
  });
});

test.describe('anatomy lab shell: layout', () => {
  test('comparing two models leaves both clear of every panel', async ({ page }) => {
    await openLab(page);
    const pick = page.getByTestId('anatomy-tools').getByLabel('compare with…');
    await expect(pick).toBeEnabled();
    await pick.selectOption({ index: 1 });
    const compare = page.getByTestId('anatomy-compare');
    await expect(compare).toBeVisible();
    const canvases = [page.locator('canvas').first(), compare.locator('canvas')];
    for (const canvas of canvases) await canvas.scrollIntoViewIfNeeded();
    const overlaps = await page.evaluate(() => {
      const canvasBoxes = [...document.querySelectorAll('[data-testid="anatomy-views-row"] canvas')].map((c) => c.getBoundingClientRect());
      const panels = [...document.querySelectorAll('[data-testid="anatomy-lab"] .lab-glass')]
        .map((panel) => panel.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.height > 0);
      const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return canvasBoxes.map((canvas) => panels.filter((panel) => hit(canvas, panel)).length);
    });
    expect(overlaps).toHaveLength(2);
    expect(overlaps, 'panels over each canvas').toEqual([0, 0]);
    // Both models keep a usable width, not a sliver.
    for (const canvas of canvases) expect((await canvas.boundingBox())!.width).toBeGreaterThanOrEqual(160);
  });

  test('desktop shows the panels beside the model; phone and tablet fold them into drawers on 44 px buttons', async ({ page }, info) => {
    await openClosedLab(page);
    const orientation = page.getByRole('region', { name: 'orientation' });
    const systems = page.getByRole('region', { name: 'body systems' });
    const dock = page.getByRole('group', { name: 'panels' });
    if (sizeOf(info) === 'desktop') {
      await expect(dock).toBeHidden();
      await expect(orientation).toBeVisible();
      await expect(systems).toBeVisible();
      await expect(page.getByRole('region', { name: 'structures' })).toBeVisible();
      // The panels sit over the stage's two edges, never over the middle where the model stands.
      const stage = (await page.getByTestId('anatomy-stage').boundingBox())!;
      const left = (await systems.boundingBox())!;
      expect(left.x + left.width).toBeLessThan(stage.x + stage.width / 2);
      // One tree (Christian, 2026-11-27): the open system's structures are listed inside the body systems panel.
      await expect(systems.getByRole('region', { name: 'structures' })).toBeVisible();
      // The orientation panel is the view's remote control: it sits in the stage's bottom right corner.
      const remote = (await orientation.boundingBox())!;
      expect(remote.x).toBeGreaterThan(stage.x + stage.width / 2);
      expect(stage.x + stage.width - (remote.x + remote.width)).toBeLessThan(32);
      expect(stage.y + stage.height - (remote.y + remote.height)).toBeLessThan(32);
    } else {
      await expect(dock).toBeVisible();
      await expect(orientation).toBeHidden();
      await expect(systems).toBeHidden();
      await expect(page.getByRole('region', { name: 'structures' })).toBeHidden();
      // The structures are listed inside the body systems panel now, so there are two drawers, not three.
      await expect(dock.getByRole('button', { name: 'structures', exact: true })).toHaveCount(0);
      for (const name of ['orientation', 'body systems']) {
        const button = dock.getByRole('button', { name, exact: true });
        const box = (await button.boundingBox())!;
        expect(box.height, name).toBeGreaterThanOrEqual(44);
        expect(box.width, name).toBeGreaterThanOrEqual(44);
        await expect(button).toHaveAttribute('aria-expanded', 'false');
        await button.click();
        await expect(button).toHaveAttribute('aria-expanded', 'true');
      }
      await expect(orientation).toBeVisible();
      await expect(systems).toBeVisible();
      await expect(page.getByRole('region', { name: 'structures' })).toBeVisible();
      // And they close again.
      await dock.getByRole('button', { name: 'orientation', exact: true }).click();
      await expect(orientation).toBeHidden();
      // The model stays above the panels, still tappable.
      const stage = (await page.getByTestId('anatomy-stage').boundingBox())!;
      const canvas = (await page.locator('canvas').boundingBox())!;
      expect(canvas.y).toBeLessThan(stage.y + stage.height / 2);
      expect(canvas.height).toBeGreaterThan(300);
    }
    await noSidewaysScroll(page);
    // The corner buttons in the top bar are 44 px or larger.
    const keys = (await page.getByRole('button', { name: 'keys', exact: true }).boundingBox())!;
    expect(keys.width).toBeGreaterThanOrEqual(44);
    expect(keys.height).toBeGreaterThanOrEqual(44);
  });

  test('every panel opened at once still fits the width (the phone-evening project covers Evening)', async ({ page }) => {
    await openLab(page);
    await noSidewaysScroll(page);
    const overflowing = await page.getByTestId('anatomy-lab').evaluate((frame) => {
      const limit = frame.getBoundingClientRect().right + 1;
      return [...frame.querySelectorAll('button, input, section')].filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.right > limit;
      }).length;
    });
    expect(overflowing).toBe(0);
  });
});
