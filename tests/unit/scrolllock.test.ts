import { describe, expect, it, vi } from 'vitest';
import { lockPageScroll, type ScrollBody, type ScrollRoot, type ScrollView } from '../../src/scripts/scrolllock';

const rootOf = (style: Partial<ScrollRoot['style']> = {}): ScrollRoot => ({
  style: { overflow: '', overscrollBehavior: '', ...style },
});
const bodyOf = (style: Partial<ScrollBody['style']> = {}): ScrollBody => ({
  style: { position: '', top: '', left: '', right: '', width: '', overflow: '', overscrollBehavior: '', ...style },
});
const viewAt = (scrollX: number, scrollY: number): ScrollView & { scrollTo: ReturnType<typeof vi.fn> } => ({
  scrollX,
  scrollY,
  scrollTo: vi.fn(),
});

describe('lockPageScroll', () => {
  it('fixes the body at the current offset and hides root overflow', () => {
    const root = rootOf();
    const body = bodyOf();
    lockPageScroll(root, body, viewAt(30, 420));
    expect(root.style).toMatchObject({ overflow: 'hidden', overscrollBehavior: 'none' });
    expect(body.style).toEqual({
      position: 'fixed', top: '-420px', left: '-30px', right: '0', width: '100%', overflow: 'hidden', overscrollBehavior: 'none',
    });
  });

  it('writes plain 0px offsets (never -0px) at the top of the page', () => {
    const body = bodyOf();
    lockPageScroll(rootOf(), body, viewAt(0, 0));
    expect(body.style.top).toBe('0px');
    expect(body.style.left).toBe('0px');
  });

  it('keeps a fractional offset exactly', () => {
    const body = bodyOf();
    lockPageScroll(rootOf(), body, viewAt(0, 12.5));
    expect(body.style.top).toBe('-12.5px');
  });

  it('puts every earlier inline value back, not just blanks, and scrolls to the saved spot', () => {
    const rootBefore = { overflow: 'auto', overscrollBehavior: 'contain' };
    const bodyBefore = {
      position: 'relative', top: '3px', left: '4px', right: '5px', width: '90%', overflow: 'scroll', overscrollBehavior: 'auto',
    };
    const root = rootOf(rootBefore);
    const body = bodyOf(bodyBefore);
    const view = viewAt(7, 250);
    const unlock = lockPageScroll(root, body, view);
    unlock();
    expect(root.style).toEqual(rootBefore);
    expect(body.style).toEqual(bodyBefore);
    expect(view.scrollTo).toHaveBeenCalledTimes(1);
    expect(view.scrollTo).toHaveBeenCalledWith(7, 250);
  });

  it('restores the offset read at lock time even if the view moved while locked', () => {
    const view = { scrollX: 0, scrollY: 100, scrollTo: vi.fn() };
    const unlock = lockPageScroll(rootOf(), bodyOf(), view);
    view.scrollY = 0;
    unlock();
    expect(view.scrollTo).toHaveBeenCalledWith(0, 100);
  });

  it('ignores a second unlock call', () => {
    const root = rootOf({ overflow: 'auto' });
    const view = viewAt(0, 60);
    const unlock = lockPageScroll(root, bodyOf(), view);
    unlock();
    root.style.overflow = 'clip';
    unlock();
    expect(root.style.overflow).toBe('clip');
    expect(view.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('unwinds nested locks in reverse order back to the original styles', () => {
    const root = rootOf({ overflow: 'auto' });
    const body = bodyOf({ width: '80%' });
    const view = viewAt(0, 90);
    const outer = lockPageScroll(root, body, view);
    const inner = lockPageScroll(root, body, view);
    inner();
    expect(body.style.position).toBe('fixed');
    outer();
    expect(root.style.overflow).toBe('auto');
    expect(body.style.width).toBe('80%');
    expect(body.style.position).toBe('');
  });
});
