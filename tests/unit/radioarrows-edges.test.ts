import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { moveRadioWithArrows, wrapIndex } from '../../src/islands/radioarrows';

class FakeElement {
  constructor(public readonly kids: FakeInput[] = []) {}
  querySelectorAll(selector: string) {
    return selector === 'input[type="radio"]' ? this.kids.filter((kid) => kid.type === 'radio') : [];
  }
}
class FakeInput {
  type = 'radio';
  disabled = false;
  focus = vi.fn();
  click = vi.fn();
  constructor(public name: string, disabled = false) { this.disabled = disabled; }
}

function setup(rtl = false) {
  vi.stubGlobal('HTMLInputElement', FakeInput);
  vi.stubGlobal('Element', FakeElement);
  vi.stubGlobal('getComputedStyle', () => ({ direction: rtl ? 'rtl' : 'ltr' }));
}

function press(key: string, target: unknown, group: unknown, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; defaultPrevented: boolean }> = {}) {
  const preventDefault = vi.fn();
  const moved = moveRadioWithArrows({
    key, target: target as EventTarget, currentTarget: group as EventTarget,
    altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, defaultPrevented: false,
    ...mods, preventDefault,
  });
  return { moved, preventDefault };
}

beforeEach(() => setup());
afterEach(() => vi.unstubAllGlobals());

describe('moveRadioWithArrows', () => {
  it('focuses with a visible ring, clicks the next radio and stops the browser default', () => {
    const [a, b, c] = [new FakeInput('g'), new FakeInput('g'), new FakeInput('g')] as const;
    const { moved, preventDefault } = press('ArrowDown', a, new FakeElement([a, b, c]));
    expect(moved).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(b.focus).toHaveBeenCalledWith({ focusVisible: true });
    expect(b.click).toHaveBeenCalledTimes(1);
    expect(a.click).not.toHaveBeenCalled();
    expect(c.click).not.toHaveBeenCalled();
  });

  it('wraps from the last radio to the first, and from the first back to the last', () => {
    const [a, b, c] = [new FakeInput('g'), new FakeInput('g'), new FakeInput('g')] as const;
    const group = new FakeElement([a, b, c]);
    press('ArrowRight', c, group);
    expect(a.click).toHaveBeenCalledTimes(1);
    press('ArrowUp', a, group);
    expect(c.click).toHaveBeenCalledTimes(1);
  });

  it('skips disabled radios and never lands on one', () => {
    const [a, b, c] = [new FakeInput('g'), new FakeInput('g', true), new FakeInput('g')] as const;
    press('ArrowDown', a, new FakeElement([a, b, c]));
    expect(b.click).not.toHaveBeenCalled();
    expect(c.click).toHaveBeenCalledTimes(1);
  });

  it('does nothing when every other radio is disabled', () => {
    const [a, b] = [new FakeInput('g'), new FakeInput('g', true)] as const;
    const { moved, preventDefault } = press('ArrowDown', a, new FakeElement([a, b]));
    expect(moved).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(b.click).not.toHaveBeenCalled();
  });

  it('still moves away from the radio that has focus even if that radio is disabled', () => {
    const [a, b] = [new FakeInput('g', true), new FakeInput('g')] as const;
    expect(press('ArrowDown', a, new FakeElement([a, b])).moved).toBe(true);
    expect(b.click).toHaveBeenCalledTimes(1);
  });

  it('only moves among radios that share the focused radio\'s name', () => {
    const [a, other, b] = [new FakeInput('one'), new FakeInput('two'), new FakeInput('one')] as const;
    press('ArrowDown', a, new FakeElement([a, other, b]));
    expect(other.click).not.toHaveBeenCalled();
    expect(b.click).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a lone radio', () => {
    const a = new FakeInput('g');
    expect(press('ArrowDown', a, new FakeElement([a])).moved).toBe(false);
  });

  it('does nothing when the focused radio is not inside the group it was asked about', () => {
    const [a, b] = [new FakeInput('g'), new FakeInput('g')] as const;
    const stray = new FakeInput('g');
    expect(press('ArrowDown', stray, new FakeElement([a, b])).moved).toBe(false);
  });

  it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'defaultPrevented'] as const)('ignores the key when %s is set', (flag) => {
    const [a, b] = [new FakeInput('g'), new FakeInput('g')] as const;
    const { moved, preventDefault } = press('ArrowDown', a, new FakeElement([a, b]), { [flag]: true });
    expect(moved).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(b.click).not.toHaveBeenCalled();
  });

  it('ignores other keys, non-radio targets and a missing group', () => {
    const [a, b] = [new FakeInput('g'), new FakeInput('g')] as const;
    const group = new FakeElement([a, b]);
    expect(press('Enter', a, group).moved).toBe(false);
    const checkbox = new FakeInput('g');
    checkbox.type = 'checkbox';
    expect(press('ArrowDown', checkbox, group).moved).toBe(false);
    expect(press('ArrowDown', {}, group).moved).toBe(false);
    expect(press('ArrowDown', a, null).moved).toBe(false);
    expect(press('ArrowDown', null, group).moved).toBe(false);
  });

  it('reads the right-to-left direction from the radio, swapping Left and Right', () => {
    setup(true);
    const [a, b] = [new FakeInput('g'), new FakeInput('g')] as const;
    const group = new FakeElement([a, b]);
    press('ArrowRight', b, group);
    expect(a.click).toHaveBeenCalledTimes(1);
    press('ArrowDown', a, group);
    expect(b.click).toHaveBeenCalledTimes(1);
  });
});

describe('wrapIndex edges', () => {
  it('steps back from the start and forward from the end for a two-radio group', () => {
    expect(wrapIndex(0, -1, 2)).toBe(1);
    expect(wrapIndex(1, 1, 2)).toBe(0);
  });
});
