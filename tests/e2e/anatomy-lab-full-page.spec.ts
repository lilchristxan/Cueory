import { expect, test, type Page } from '@playwright/test';
import { markPanelsSeen } from './clock';
import { sizeOf } from './projects';

/**
 * The open anatomy lab is the whole page (Christian, 2026-11-27): it fills the window edge to edge, the site's header,
 * footer and the page's own heading are hidden and take no focus, the top bar is pinned to the top edge, and one
 * button leaves the lab again. Against the test fixture (?fixture); nothing here depends on a structure's name.
 */

const URL = '/preview/anatomy-lab?fixture';

async function openLab(page: Page) {
  await markPanelsSeen(page);
  await page.goto(URL);
  await page.getByRole('button', { name: 'open the anatomy lab' }).click();
  await expect(page.getByTestId('anatomy-stage')).toBeVisible({ timeout: 20_000 });
  // The slider is on screen at every size and comes alive with the model (labels now sits in the controls box).
  await expect(page.getByRole('slider', { name: /spread structures apart/ })).toBeEnabled({ timeout: 20_000 });
}

test.describe('anatomy lab: full page', () => {
  test('the lab fills the window and nothing else on the page shows or takes focus', async ({ page }) => {
    await openLab(page);
    const viewport = page.viewportSize()!;
    const box = (await page.getByTestId('anatomy-page').boundingBox())!;
    expect(Math.round(box.x)).toBe(0);
    expect(Math.round(box.y)).toBe(0);
    expect(Math.round(box.width)).toBe(viewport.width);
    expect(Math.round(box.height)).toBe(viewport.height);
    await expect(page.locator('[data-site-footer]')).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'anatomy lab' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'start text name it', exact: true })).toBeHidden();
    // The lab's own top edge starts at the top of the window: no site header above it.
    const lab = (await page.getByTestId('anatomy-lab').boundingBox())!;
    expect(Math.round(lab.y)).toBe(0);
    // The window itself never scrolls, sideways or down: the lab scrolls inside itself when it must.
    const scroll = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      labWidth: document.querySelector('[data-testid="anatomy-page"]')!.scrollWidth,
      overflow: getComputedStyle(document.documentElement).overflowY,
    }));
    expect(scroll.pageWidth).toBeLessThanOrEqual(viewport.width);
    expect(scroll.labWidth).toBeLessThanOrEqual(viewport.width);
    expect(scroll.overflow).toBe('hidden');
    // Every focus stop is inside the lab (past the last one, focus rests on the page itself, never on hidden chrome).
    for (let i = 0; i < 30; i += 1) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body) return 'page';
        return active.closest('[data-testid="anatomy-page"]') ? 'lab' : 'outside';
      });
      expect(where).not.toBe('outside');
    }
  });

  test('the credits sit at the bottom of the body systems box and in the ? pop-up', async ({ page }) => {
    await openLab(page);
    const systems = page.getByRole('group', { name: 'panels' }).getByRole('button', { name: 'body systems', exact: true });
    if (await systems.isVisible()) await systems.click();
    const box = page.getByRole('region', { name: 'body systems' });
    await expect(box.getByTestId('anatomy-credits')).toBeVisible();
    const boxText = await box.getByTestId('anatomy-credits').innerText();
    expect(boxText.trim().length).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'keys' }).click();
    await expect(page.getByTestId('anatomy-credits-help')).toBeVisible();
    expect(await page.getByTestId('anatomy-credits-help').innerText()).toBe(boxText);
  });

  test('"model only" clears the side panels on desktop and brings them back', async ({ page }, testInfo) => {
    test.skip(sizeOf(testInfo) !== 'desktop', 'below the desktop width the side panels are closed until asked for');
    await openLab(page);
    const focus = page.getByTestId('anatomy-focus');
    await expect(page.getByTestId('anatomy-rail')).toBeVisible();
    await expect(page.getByTestId('anatomy-inspector')).toBeVisible();
    await focus.click();
    await expect(focus).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('anatomy-rail')).toBeHidden();
    await expect(page.getByTestId('anatomy-inspector')).toBeHidden();
    await expect(page.getByRole('button', { name: 'labels', exact: true })).toBeVisible();
    await focus.click();
    await expect(focus).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('anatomy-rail')).toBeVisible();
    // The controls stay through "model only": they are how the model is turned.
    await expect(page.getByRole('button', { name: 'show all' })).toBeVisible();
  });

  test('more opens the other tools in view, and its close button shuts them', async ({ page }) => {
    await openLab(page);
    await page.getByRole('button', { name: 'more', exact: true }).click();
    const more = page.getByTestId('anatomy-more');
    await expect(more).toBeVisible();
    await expect(more.getByRole('heading', { name: 'more' })).toBeInViewport();
    await page.getByTestId('anatomy-more-close').click();
    await expect(more).toBeHidden();
  });

  test('the back button leaves the lab: the page, its header and footer come back', async ({ page }) => {
    await openLab(page);
    const exit = page.getByRole('button', { name: 'leave the anatomy lab' });
    const size = (await exit.boundingBox())!;
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
    await exit.click();
    await expect(page.getByTestId('anatomy-page')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'open the anatomy lab' })).toBeVisible();
    await expect(page.locator('[data-site-footer]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'anatomy lab' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.classList.contains('lab-open'))).toBe(false);
  });
});

test.describe('anatomy lab: the view remote, the stage and the tree', () => {
  test('a real body system starts out turning, and the play button in the arrows stops and starts it', async ({ page }) => {
    await markPanelsSeen(page);
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(page.getByTestId('anatomy-stage')).toBeVisible({ timeout: 20_000 });
    const drawer = page.getByRole('group', { name: 'panels' }).getByRole('button', { name: 'controls', exact: true });
    if (await drawer.isVisible()) await drawer.click();
    const spin = page.getByRole('button', { name: 'turn the model by itself', exact: true });
    await expect(spin).toBeEnabled({ timeout: 30_000 });
    await expect(spin).toHaveAttribute('aria-pressed', 'true');
    const box = (await spin.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await spin.click();
    await expect(spin).toHaveAttribute('aria-pressed', 'false');
    await spin.click();
    await expect(spin).toHaveAttribute('aria-pressed', 'true');
    // Asking for a set view stops the turning.
    await page.getByRole('button', { name: 'anterior view', exact: true }).click();
    await expect(spin).toHaveAttribute('aria-pressed', 'false');
    // Turning reduced motion on while it turns stops it too, and the button says so.
    await spin.click();
    await expect(spin).toHaveAttribute('aria-pressed', 'true');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(spin).toHaveAttribute('aria-pressed', 'false');
  });

  test('with reduced motion the model starts still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await markPanelsSeen(page);
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    await expect(page.getByTestId('anatomy-stage')).toBeVisible({ timeout: 20_000 });
    const drawer = page.getByRole('group', { name: 'panels' }).getByRole('button', { name: 'controls', exact: true });
    if (await drawer.isVisible()) await drawer.click();
    const spin = page.getByRole('button', { name: 'turn the model by itself', exact: true });
    await expect(spin).toBeEnabled({ timeout: 30_000 });
    await expect(spin).toHaveAttribute('aria-pressed', 'false');
  });

  test('printing puts the full-page lab back into the page flow, so a long worksheet is not clipped', async ({ page }) => {
    await markPanelsSeen(page);
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    const lab = page.getByTestId('anatomy-page');
    await expect(lab).toBeVisible({ timeout: 20_000 });
    expect(await lab.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
    await page.emulateMedia({ media: 'print' });
    expect(await lab.evaluate((el) => [getComputedStyle(el).position, getComputedStyle(el).overflowY])).toEqual(['static', 'visible']);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe('visible');
  });

  test('the black / white switch changes the stage, and keeps the panels brown', async ({ page }) => {
    await openLab(page);
    const orientation = page.getByRole('group', { name: 'panels' }).getByRole('button', { name: 'controls', exact: true });
    if (await orientation.isVisible()) await orientation.click();
    const stage = () => page.getByTestId('anatomy-lab').evaluate((lab) => getComputedStyle(lab).backgroundColor);
    const bar = () => page.locator('.lab-topbar').evaluate((strip) => getComputedStyle(strip).backgroundColor);
    const choices = page.getByRole('group', { name: 'background' });
    await expect(choices.getByRole('button', { name: 'black' })).toHaveAttribute('aria-pressed', 'true');
    expect(await stage()).toBe('rgb(28, 25, 23)');
    const brown = await bar();
    await choices.getByRole('button', { name: 'white' }).click();
    await expect(choices.getByRole('button', { name: 'white' })).toHaveAttribute('aria-pressed', 'true');
    expect(await stage()).toBe('rgb(249, 245, 239)');
    expect(await bar()).toBe(brown);
    // A saved picture takes the white stage's colours too: an Ivory page with dark text.
    const picture = () => page.getByTestId('anatomy-lab').evaluate((lab) => {
      const style = getComputedStyle(lab);
      return [style.getPropertyValue('--lab-picture-page').trim(), style.getPropertyValue('--lab-picture-ink').trim()];
    });
    expect(await picture()).toEqual(['#f9f5ef', '#1c1917']);
    await choices.getByRole('button', { name: 'black' }).click();
    expect(await stage()).toBe('rgb(28, 25, 23)');
    expect(await picture()).toEqual(['', '']);
  });

  test('the controls box: undo, up, redo / left, play, right / zoom out, down, zoom in, with a hide button', async ({ page }) => {
    await openLab(page);
    const drawer = page.getByRole('group', { name: 'panels' }).getByRole('button', { name: 'controls', exact: true });
    if (await drawer.isVisible()) await drawer.click();
    const box = page.getByRole('region', { name: 'controls' });
    await expect(box).toBeVisible();
    await expect(page.getByTestId('anatomy-lab')).not.toContainText('orientation');
    const names = ['undo', 'tilt up', 'redo', 'turn left', 'turn the model by itself', 'turn right', 'zoom out', 'tilt down', 'zoom in'];
    const spots: { x: number; y: number }[] = [];
    for (const name of names) {
      const button = box.getByRole('button', { name, exact: true });
      const at = (await button.boundingBox())!;
      expect(at.width, name).toBeGreaterThanOrEqual(44);
      expect(at.height, name).toBeGreaterThanOrEqual(44);
      spots.push({ x: at.x + at.width / 2, y: at.y + at.height / 2 });
    }
    // Three rows of three: each row shares a line, each column a centre.
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        expect(Math.abs(spots[row * 3 + col]!.y - spots[row * 3]!.y)).toBeLessThan(2);
        expect(Math.abs(spots[row * 3 + col]!.x - spots[col]!.x)).toBeLessThan(2);
      }
    }
    await expect(box.getByRole('button', { name: 'labels', exact: true })).toBeVisible();
    await expect(box.getByRole('button', { name: 'reset view' })).toHaveCount(0);
    await page.getByRole('button', { name: 'hide the controls' }).click();
    await expect(box.getByRole('button', { name: 'tilt up' })).toBeHidden();
    await page.getByRole('button', { name: 'show the controls' }).click();
    await expect(box.getByRole('button', { name: 'tilt up' })).toBeVisible();
  });

  test('each group heading folds with its arrow, and the − button hides the whole box', async ({ page }) => {
    await openLab(page);
    const systems = page.getByRole('group', { name: 'panels' }).getByRole('button', { name: 'body systems', exact: true });
    if (await systems.isVisible()) await systems.click();
    const list = page.getByRole('region', { name: 'structures' });
    const heading = list.getByRole('heading', { level: 4 }).first().getByRole('button');
    await expect(heading).toHaveAttribute('aria-expanded', 'true');
    const rows = await list.locator('li').count();
    expect(rows).toBeGreaterThan(0);
    await heading.click();
    await expect(heading).toHaveAttribute('aria-expanded', 'false');
    expect(await list.locator('li:visible').count()).toBeLessThan(rows);
    await heading.click();
    await expect(list.locator('li:visible')).toHaveCount(rows);
    // A structure's dot hides and shows it; the dot is a 44 px target named for what it does.
    const dot = list.getByRole('button', { name: /^hide /u }).first();
    const size = (await dot.boundingBox())!;
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);

    const min = page.getByRole('button', { name: 'hide the body systems box' });
    await min.click();
    await expect(list).toBeHidden();
    await page.getByRole('button', { name: 'show the body systems box' }).click();
    await expect(list).toBeVisible();
  });

  test('the body systems box scrolls with the mouse wheel, and hidden boxes are round icon buttons', async ({ page }, testInfo) => {
    test.skip(sizeOf(testInfo) !== 'desktop', 'the boxes sit beside the model only at the desktop width');
    await markPanelsSeen(page);
    await page.goto('/preview/anatomy-lab');
    await page.getByRole('button', { name: 'open the anatomy lab' }).click();
    const body = page.getByTestId('anatomy-tree-body');
    await expect(body.locator('li').first()).toBeVisible({ timeout: 30_000 });
    expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    const at = (await body.boundingBox())!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    for (const [hide, show] of [['hide the body systems box', 'show the body systems box'], ['hide the controls', 'show the controls']] as const) {
      await page.getByRole('button', { name: hide }).click();
      const icon = page.getByRole('button', { name: show });
      const size = (await icon.boundingBox())!;
      expect(size.width, show).toBeGreaterThanOrEqual(44);
      expect(Math.abs(size.width - size.height), show).toBeLessThan(1);
      await expect(icon.locator('svg')).toBeVisible();
    }
  });

  test('modifier shortcuts: zoom, move and turn by key and by wheel, and the ? pop-up lists them', async ({ page }, testInfo) => {
    test.skip(sizeOf(testInfo) !== 'desktop', 'keyboard and wheel shortcuts need a keyboard and a mouse');
    await openLab(page);
    await page.getByRole('button', { name: 'labels', exact: true }).click();
    const overlay = page.getByTestId('anatomy-labels');
    await expect(overlay.locator(':scope > span').first()).toBeVisible();
    // Where each label sits, and how spread out they are (a zoom spreads them).
    const read = () => overlay.evaluateAll((overlays) => overlays.flatMap((frameEl) => {
      const frame = frameEl.getBoundingClientRect();
      return [...frameEl.querySelectorAll(':scope > span')].map((span) => {
        const box = span.getBoundingClientRect();
        return { name: span.textContent ?? '', x: Math.round(box.x - frame.x), y: Math.round(box.y - frame.y) };
      });
    }));
    const key = (labels: Awaited<ReturnType<typeof read>>) => labels.map((l) => `${l.name}@${l.x},${l.y}`).sort().join('|');
    const meanX = (labels: Awaited<ReturnType<typeof read>>) => labels.reduce((sum, l) => sum + l.x, 0) / labels.length;
    const canvas = page.locator('canvas').first();
    await canvas.focus();
    const start = await read();

    // Shift + left arrow moves the model left; Shift + right arrow moves it back.
    await page.keyboard.press('Shift+ArrowLeft');
    await expect.poll(async () => meanX(await read())).toBeLessThan(meanX(start));
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(async () => key(await read())).toEqual(key(start));

    // Alt + arrows turn and tip the body, and the opposite arrow undoes each.
    for (const [there, back] of [['Alt+ArrowLeft', 'Alt+ArrowRight'], ['Alt+ArrowUp', 'Alt+ArrowDown']] as const) {
      await page.keyboard.press(there);
      await expect.poll(async () => key(await read())).not.toEqual(key(start));
      await page.keyboard.press(back);
      await expect.poll(async () => key(await read())).toEqual(key(start));
    }

    // Ctrl + up arrow zooms (the view changes) and Ctrl + down arrow zooms back out.
    await page.keyboard.press('Control+ArrowUp');
    await expect.poll(async () => key(await read())).not.toEqual(key(start));
    await page.keyboard.press('Control+ArrowDown');
    await expect.poll(async () => key(await read())).toEqual(key(start));

    // The wheel with Shift held moves the model: backward left, forward right.
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 100);
    await expect.poll(async () => meanX(await read())).toBeLessThan(meanX(start));
    await page.mouse.wheel(0, -100);
    await expect.poll(async () => key(await read())).toEqual(key(start));
    await page.keyboard.up('Shift');

    // The wheel with Alt held turns the body, and the other way turns it back.
    await page.keyboard.down('Alt');
    await page.mouse.wheel(0, 100);
    await expect.poll(async () => key(await read())).not.toEqual(key(start));
    await page.mouse.wheel(0, -100);
    await expect.poll(async () => key(await read())).toEqual(key(start));
    await page.keyboard.up('Alt');

    await page.getByRole('button', { name: 'keys' }).click();
    const keys = page.getByRole('region', { name: 'keys for the 3D view' });
    await expect(keys).toContainText('Shift with ← →');
    await expect(keys).toContainText('turn the body clockwise or counter-clockwise');
  });
});
