import { describe, expect, it } from 'vitest';
import { showFocusRing } from '../../src/islands/focusring';

/** A stand-in for a focused control whose ring the browser shows only after the given kind of focus() call. */
function control(ringAfter: 'none' | 'in-place' | 'refocus', visible = false) {
  const calls: string[] = [];
  let blurred = false;
  const element = {
    matches: (selector: string) => selector === ':focus-visible' && visible,
    focus: (options?: FocusOptions) => {
      calls.push(blurred ? 'focus again' : 'focus in place');
      if (options?.focusVisible && (ringAfter === 'in-place' || (ringAfter === 'refocus' && blurred))) visible = true;
    },
    blur: () => { calls.push('blur'); blurred = true; },
  } as unknown as HTMLElement;
  return { element, calls, visible: () => visible };
}

describe('showFocusRing (engine E8, Firefox)', () => {
  it('does nothing when the ring already shows', () => {
    const c = control('none', true);
    showFocusRing(c.element, c.element);
    expect(c.calls).toEqual([]);
  });

  it('does nothing when the control is not the focused element', () => {
    const c = control('in-place');
    showFocusRing(c.element, null);
    expect(c.calls).toEqual([]);
  });

  it('asks for the ring in place first, and stops there when that works', () => {
    const c = control('in-place');
    showFocusRing(c.element, c.element);
    expect(c.calls).toEqual(['focus in place']);
    expect(c.visible()).toBe(true);
  });

  it('focuses again when the browser ignores the request for an already focused element', () => {
    const c = control('refocus');
    showFocusRing(c.element, c.element);
    expect(c.calls).toEqual(['focus in place', 'blur', 'focus again']);
    expect(c.visible()).toBe(true);
  });
});
