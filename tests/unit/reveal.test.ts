import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepFocusedTargetInView, revealInstantly, waitsForReveal } from '../../src/scripts/reveal';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('home page sections fade in once (D-62)', () => {
  it('only a section that starts below the window waits to fade in; one already on screen never hides', () => {
    expect(waitsForReveal(900, 900)).toBe(true);
    expect(waitsForReveal(1400, 900)).toBe(true);
    expect(waitsForReveal(899, 900)).toBe(false);
    expect(waitsForReveal(-200, 900)).toBe(false);
  });

  it('reveals a waiting section instantly on focus and unobserves it', () => {
    const section = {
      dataset: { reveal: 'waiting' },
    } as unknown as HTMLElement;
    let unobserved: Element | null = null;
    const observer = {
      unobserve: (el: Element) => {
        unobserved = el;
      },
    } as unknown as IntersectionObserver;
    revealInstantly(section, observer);
    expect(section.dataset.reveal).toBe('instant');
    expect(unobserved).toBe(section);
  });

  it('leaves a non-waiting section alone', () => {
    const section = {
      dataset: { reveal: 'shown' },
    } as unknown as HTMLElement;
    let called = false;
    const observer = {
      unobserve: () => {
        called = true;
      },
    } as unknown as IntersectionObserver;
    revealInstantly(section, observer);
    expect(section.dataset.reveal).toBe('shown');
    expect(called).toBe(false);
  });

  it('keeps a revealed focused target in view synchronously without a frame callback', () => {
    const scrollIntoView = vi.fn();
    const target = { scrollIntoView } as unknown as HTMLElement;
    vi.stubGlobal('window', {
      requestAnimationFrame: vi.fn(),
    });
    vi.stubGlobal('document', { activeElement: target });

    keepFocusedTargetInView(target);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });
});
