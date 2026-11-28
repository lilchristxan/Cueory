/**
 * The 3D view's modifier shortcuts (Christian, 2026-11-27): the same moves by key and by mouse wheel.
 *
 *   Ctrl (Windows) or Command (Mac) with + / − / ↑ / ↓ / wheel   zoom in or out
 *   Shift with ← / → / wheel                                     move the model left or right
 *   Alt or Option with ← / → / wheel                              turn the body clockwise or counter-clockwise
 *   Alt or Option with ↑ / ↓                                      tip the head, or the feet, toward you
 *   the Windows key with the wheel                                tip the body (Windows only, see `tipKeyHeld`)
 *
 * "Clockwise" is the body seen from above. Plain arrows, + and − keep what they did before (anatomyviews.ts).
 * Only this file decides what a key or wheel step means; the lab (AnatomyLab.tsx) carries it out.
 */

export type ShortcutAction =
  | { kind: 'zoom'; direction: 'in' | 'out' }
  | { kind: 'pan'; direction: 'left' | 'right' }
  | { kind: 'orbit'; yaw: number; pitch: number };

export interface Modifiers {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  /** An Apple device: Command is the main modifier there, Ctrl everywhere else. */
  mac: boolean;
}

/** The main modifier: Command on a Mac, Ctrl on Windows and everywhere else. */
const mainKeyHeld = (m: Modifiers) => (m.mac ? m.meta : m.ctrl);

/**
 * The second modifier, for tipping the body with the wheel: the Windows key on Windows. On a Mac it would be Ctrl, but
 * a trackpad pinch reaches the page as Ctrl plus the wheel, and a pinch has to keep zooming, so a Mac has no wheel
 * shortcut for tipping (Option with ↑ and ↓ does it).
 */
const tipKeyHeld = (m: Modifiers) => !m.mac && m.meta;

/** Camera turns that show the body turning clockwise (seen from above) and tipping its head toward the viewer. */
const clockwise = (step: number): ShortcutAction => ({ kind: 'orbit', yaw: step, pitch: 0 });
const counterClockwise = (step: number): ShortcutAction => ({ kind: 'orbit', yaw: -step, pitch: 0 });
const headForward = (step: number): ShortcutAction => ({ kind: 'orbit', yaw: 0, pitch: step });
const feetForward = (step: number): ShortcutAction => ({ kind: 'orbit', yaw: 0, pitch: -step });

/** What a key press with a modifier held does; null when it is not one of the shortcuts. */
export function shortcutKeyAction(key: string, m: Modifiers, step: number): ShortcutAction | null {
  if (mainKeyHeld(m) && !m.alt && !m.shift) {
    if (key === '+' || key === '=' || key === 'ArrowUp') return { kind: 'zoom', direction: 'in' };
    if (key === '-' || key === '_' || key === 'ArrowDown') return { kind: 'zoom', direction: 'out' };
    return null;
  }
  if (m.ctrl || m.meta) return null;
  if (m.shift && !m.alt) {
    if (key === 'ArrowLeft') return { kind: 'pan', direction: 'left' };
    if (key === 'ArrowRight') return { kind: 'pan', direction: 'right' };
    return null;
  }
  if (m.alt && !m.shift) {
    if (key === 'ArrowLeft') return clockwise(step);
    if (key === 'ArrowRight') return counterClockwise(step);
    if (key === 'ArrowUp') return headForward(step);
    if (key === 'ArrowDown') return feetForward(step);
  }
  return null;
}

/**
 * What one wheel step with a modifier held does. `delta` is the wheel's movement: below zero is the wheel rolled
 * forward (away from you), above zero backward. Null leaves the wheel to the view's own plain zoom.
 */
export function shortcutWheelAction(delta: number, m: Modifiers, step: number): ShortcutAction | null {
  if (!Number.isFinite(delta) || delta === 0) return null;
  const forward = delta < 0;
  if (tipKeyHeld(m)) return forward ? feetForward(step) : headForward(step);
  if (mainKeyHeld(m) || (m.mac && m.ctrl)) return { kind: 'zoom', direction: forward ? 'in' : 'out' };
  if (m.shift && !m.alt) return { kind: 'pan', direction: forward ? 'right' : 'left' };
  if (m.alt && !m.shift) return forward ? counterClockwise(step) : clockwise(step);
  return null;
}

/** True on Apple devices, where Command is the main modifier. */
export function isApplePlatform(platform: string, userAgent: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform) || /\bMac OS X\b|iPhone|iPad/i.test(userAgent);
}

/** The shortcut rows for the lab's "keys" panel, in the words a student reads. Kept in step with the two functions above. */
export const SHORTCUT_KEY_MAP: ReadonlyArray<{ keys: string; does: string }> = [
  { keys: 'Ctrl or ⌘ with + − ↑ ↓', does: 'zoom in or out, as + and − do' },
  { keys: 'Ctrl or ⌘ with the wheel', does: 'zoom in (forward) or out (backward)' },
  { keys: 'Shift with ← →', does: 'move the model left or right' },
  { keys: 'Shift with the wheel', does: 'move the model left (backward) or right (forward)' },
  { keys: 'Alt or ⌥ with ← →', does: 'turn the body clockwise or counter-clockwise' },
  { keys: 'Alt or ⌥ with ↑ ↓', does: 'tip the head toward you, or the feet toward you' },
  { keys: 'Alt or ⌥ with the wheel', does: 'turn the body clockwise (backward) or counter-clockwise (forward)' },
  { keys: 'Windows key with the wheel', does: 'tip the feet toward you (forward) or the head toward you (backward)' },
];
