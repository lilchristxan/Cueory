/**
 * Arrow keys in a radio group, done by the page instead of the browser (engine run 44460645965, group E8).
 *
 * The browser's own arrow keys move to the next radio and pick it, but in WebKit the radio they move to does not
 * match :focus-visible, so a keyboard user sees no focus ring on it. Here the same move is made with
 * focus({ focusVisible: true }) and a click, so every engine shows the ring and the radio's change handler runs as
 * before. Down and Right go forward, Up and Left go back (Left and Right swap in right-to-left text), and the ends wrap
 * around, as in the browser's own radio groups. Disabled radios are skipped.
 */

const FORWARD = new Set(['ArrowDown', 'ArrowRight']);
const BACKWARD = new Set(['ArrowUp', 'ArrowLeft']);

/** The step for a key: 1 forward, -1 back, 0 for any other key. */
export function arrowStep(key: string, rightToLeft = false): -1 | 0 | 1 {
  const flip = rightToLeft && (key === 'ArrowLeft' || key === 'ArrowRight') ? -1 : 1;
  if (FORWARD.has(key)) return flip === 1 ? 1 : -1;
  if (BACKWARD.has(key)) return flip === 1 ? -1 : 1;
  return 0;
}

/** The index of the radio to move to from `current` among `count` radios, wrapping at the ends. */
export function wrapIndex(current: number, step: -1 | 1, count: number): number {
  return (current + step + count) % count;
}

interface ArrowKeyEvent {
  key: string;
  target: EventTarget | null;
  currentTarget: EventTarget | null;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
  preventDefault: () => void;
}

/**
 * Keydown handler for an element that holds one radio group (a fieldset). Returns true when it moved the choice.
 */
export function moveRadioWithArrows(event: ArrowKeyEvent): boolean {
  const radio = event.target;
  const group = event.currentTarget;
  if (!(radio instanceof HTMLInputElement) || radio.type !== 'radio' || !(group instanceof Element)) return false;
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  const step = arrowStep(event.key, getComputedStyle(radio).direction === 'rtl');
  if (step === 0) return false;
  const radios = [...group.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    .filter((input) => input.name === radio.name && (!input.disabled || input === radio));
  const current = radios.indexOf(radio);
  if (current === -1 || radios.length < 2) return false;
  let index = current;
  do index = wrapIndex(index, step, radios.length); while (radios[index]!.disabled && index !== current);
  if (index === current) return false;
  event.preventDefault();
  const next = radios[index]!;
  next.focus({ focusVisible: true });
  // A click picks it and fires the same input and change events as the browser's own arrow keys.
  next.click();
  return true;
}
