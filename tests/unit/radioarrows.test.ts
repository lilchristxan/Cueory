import { describe, expect, it } from 'vitest';
import { arrowStep, wrapIndex } from '../../src/islands/radioarrows';

describe('radio arrow keys (engine E8)', () => {
  it('Down and Right go forward, Up and Left go back, other keys do nothing', () => {
    expect(arrowStep('ArrowDown')).toBe(1);
    expect(arrowStep('ArrowRight')).toBe(1);
    expect(arrowStep('ArrowUp')).toBe(-1);
    expect(arrowStep('ArrowLeft')).toBe(-1);
    for (const key of ['Enter', ' ', 'Tab', 'Home', 'a']) expect(arrowStep(key)).toBe(0);
  });

  it('swaps Left and Right in right-to-left text, but not Up and Down', () => {
    expect(arrowStep('ArrowRight', true)).toBe(-1);
    expect(arrowStep('ArrowLeft', true)).toBe(1);
    expect(arrowStep('ArrowDown', true)).toBe(1);
    expect(arrowStep('ArrowUp', true)).toBe(-1);
  });

  it('wraps at both ends', () => {
    expect(wrapIndex(0, 1, 3)).toBe(1);
    expect(wrapIndex(2, 1, 3)).toBe(0);
    expect(wrapIndex(0, -1, 3)).toBe(2);
  });
});
