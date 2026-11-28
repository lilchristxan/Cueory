import { describe, expect, it } from 'vitest';
import { isApplePlatform, shortcutKeyAction, shortcutWheelAction, SHORTCUT_KEY_MAP, type Modifiers } from '../../src/islands/anatomyshortcuts';

const none: Modifiers = { shift: false, alt: false, ctrl: false, meta: false, mac: false };
const win = (held: Partial<Modifiers>): Modifiers => ({ ...none, ...held });
const mac = (held: Partial<Modifiers>): Modifiers => ({ ...none, mac: true, ...held });
const STEP = 0.25;

describe('anatomy lab shortcuts: keys', () => {
  it('Ctrl on Windows and Command on a Mac zoom with + − and the up and down arrows', () => {
    for (const m of [win({ ctrl: true }), mac({ meta: true })]) {
      for (const key of ['+', '=', 'ArrowUp']) expect(shortcutKeyAction(key, m, STEP)).toEqual({ kind: 'zoom', direction: 'in' });
      for (const key of ['-', '_', 'ArrowDown']) expect(shortcutKeyAction(key, m, STEP)).toEqual({ kind: 'zoom', direction: 'out' });
    }
    // The other platform's key is not the main modifier.
    expect(shortcutKeyAction('+', mac({ ctrl: true }), STEP)).toBeNull();
    expect(shortcutKeyAction('+', win({ meta: true }), STEP)).toBeNull();
  });

  it('Shift with the left and right arrows moves the model', () => {
    expect(shortcutKeyAction('ArrowLeft', win({ shift: true }), STEP)).toEqual({ kind: 'pan', direction: 'left' });
    expect(shortcutKeyAction('ArrowRight', mac({ shift: true }), STEP)).toEqual({ kind: 'pan', direction: 'right' });
    expect(shortcutKeyAction('ArrowUp', win({ shift: true }), STEP)).toBeNull();
  });

  it('Alt or Option with the arrows turns and tips the body', () => {
    const alt = win({ alt: true });
    // Left is clockwise and right counter-clockwise (seen from above): opposite camera turns.
    expect(shortcutKeyAction('ArrowLeft', alt, STEP)).toEqual({ kind: 'orbit', yaw: STEP, pitch: 0 });
    expect(shortcutKeyAction('ArrowRight', alt, STEP)).toEqual({ kind: 'orbit', yaw: -STEP, pitch: 0 });
    // Up tips the head toward the viewer, down the feet: opposite again.
    expect(shortcutKeyAction('ArrowUp', alt, STEP)).toEqual({ kind: 'orbit', yaw: 0, pitch: STEP });
    expect(shortcutKeyAction('ArrowDown', alt, STEP)).toEqual({ kind: 'orbit', yaw: 0, pitch: -STEP });
    expect(shortcutKeyAction('ArrowLeft', mac({ alt: true }), STEP)).toEqual({ kind: 'orbit', yaw: STEP, pitch: 0 });
  });

  it('leaves plain keys, other keys and mixed modifiers alone', () => {
    expect(shortcutKeyAction('ArrowLeft', none, STEP)).toBeNull();
    expect(shortcutKeyAction('a', win({ ctrl: true }), STEP)).toBeNull();
    expect(shortcutKeyAction('z', win({ ctrl: true }), STEP)).toBeNull();
    expect(shortcutKeyAction('ArrowLeft', win({ alt: true, shift: true }), STEP)).toBeNull();
    expect(shortcutKeyAction('ArrowLeft', win({ alt: true, ctrl: true }), STEP)).toBeNull();
  });
});

describe('anatomy lab shortcuts: the mouse wheel', () => {
  const forward = -100;
  const backward = 100;

  it('Ctrl or Command with the wheel zooms: forward in, backward out', () => {
    for (const m of [win({ ctrl: true }), mac({ meta: true })]) {
      expect(shortcutWheelAction(forward, m, STEP)).toEqual({ kind: 'zoom', direction: 'in' });
      expect(shortcutWheelAction(backward, m, STEP)).toEqual({ kind: 'zoom', direction: 'out' });
    }
  });

  it('a Mac trackpad pinch (Ctrl plus the wheel) keeps zooming', () => {
    expect(shortcutWheelAction(forward, mac({ ctrl: true }), STEP)).toEqual({ kind: 'zoom', direction: 'in' });
    expect(shortcutWheelAction(backward, mac({ ctrl: true }), STEP)).toEqual({ kind: 'zoom', direction: 'out' });
  });

  it('Shift with the wheel moves the model: backward left, forward right', () => {
    expect(shortcutWheelAction(backward, win({ shift: true }), STEP)).toEqual({ kind: 'pan', direction: 'left' });
    expect(shortcutWheelAction(forward, win({ shift: true }), STEP)).toEqual({ kind: 'pan', direction: 'right' });
  });

  it('Alt or Option with the wheel turns the body: backward clockwise, forward counter-clockwise', () => {
    expect(shortcutWheelAction(backward, mac({ alt: true }), STEP)).toEqual({ kind: 'orbit', yaw: STEP, pitch: 0 });
    expect(shortcutWheelAction(forward, win({ alt: true }), STEP)).toEqual({ kind: 'orbit', yaw: -STEP, pitch: 0 });
  });

  it('the Windows key with the wheel tips the body: forward the feet toward you, backward the head', () => {
    expect(shortcutWheelAction(forward, win({ meta: true }), STEP)).toEqual({ kind: 'orbit', yaw: 0, pitch: -STEP });
    expect(shortcutWheelAction(backward, win({ meta: true }), STEP)).toEqual({ kind: 'orbit', yaw: 0, pitch: STEP });
  });

  it('leaves the plain wheel, and a wheel that did not move, to the view itself', () => {
    expect(shortcutWheelAction(forward, none, STEP)).toBeNull();
    expect(shortcutWheelAction(0, win({ ctrl: true }), STEP)).toBeNull();
    expect(shortcutWheelAction(Number.NaN, win({ ctrl: true }), STEP)).toBeNull();
  });
});

describe('anatomy lab shortcuts: platform and the keys panel', () => {
  it('knows an Apple device', () => {
    expect(isApplePlatform('MacIntel', '')).toBe(true);
    expect(isApplePlatform('', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isApplePlatform('Win32', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
    expect(isApplePlatform('Linux x86_64', 'Mozilla/5.0 (X11; Linux x86_64)')).toBe(false);
  });

  it('lists every shortcut once in the keys panel', () => {
    expect(SHORTCUT_KEY_MAP).toHaveLength(8);
    expect(new Set(SHORTCUT_KEY_MAP.map((row) => row.keys)).size).toBe(8);
    for (const row of SHORTCUT_KEY_MAP) expect(row.does).not.toMatch(/\b(front|back|side)\b/);
  });
});
