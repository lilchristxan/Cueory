import { describe, expect, it } from 'vitest';
import { END_RESULT_SLOT_ID, findEndSlot, joinFigure, nextLine } from '../../src/islands/endresult';

const slot = { id: END_RESULT_SLOT_ID } as unknown as HTMLElement;
const doc = (found: boolean) => ({ getElementById: (id: string) => (found && id === END_RESULT_SLOT_ID ? slot : null) });

describe('the end-of-game block\'s place', () => {
  it('uses the side panel mount when the layout shows it', () => {
    expect(findEndSlot(doc(true), () => ({ display: 'block' }))).toBe(slot);
  });
  it('stays under the board when the mount is hidden (tablet and phone) or the page has none', () => {
    expect(findEndSlot(doc(true), () => ({ display: 'none' }))).toBeNull();
    expect(findEndSlot(doc(false), () => ({ display: 'block' }))).toBeNull();
  });
});

describe('the end-of-game block\'s lines', () => {
  it('joins the figure without empty parts', () => {
    expect(joinFigure(['5/6', '0:31'])).toBe('5/6 · 0:31');
    expect(joinFigure(['5/6', undefined, false, ''])).toBe('5/6');
    expect(joinFigure([undefined])).toBe('');
  });
  it('writes the wait line only once the wait is known', () => {
    expect(nextLine('next word', '2 h 14 min')).toBe('next word in 2 h 14 min');
    expect(nextLine('next word', '')).toBeUndefined();
  });
});
