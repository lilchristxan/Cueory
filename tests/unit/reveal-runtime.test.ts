import { afterEach, describe, expect, it, vi } from 'vitest';
import { revealSections, settleReveal } from '../../src/scripts/reveal';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('reveal section runtime guards', () => {
  it('does not query the document when reduced motion is enabled', () => {
    // Make the observer available so only the reduced-motion guard can stop the query.
    class AvailableObserver {
      observe() {}
      unobserve() {}
    }
    vi.stubGlobal('IntersectionObserver', AvailableObserver);
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true }),
      IntersectionObserver: AvailableObserver,
    });
    vi.stubGlobal('document', {
      querySelectorAll: () => {
        throw new Error('document should not be queried');
      },
    });

    expect(() => revealSections()).not.toThrow();
  });

  it('does not query the document when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal('document', {
      querySelectorAll: () => {
        throw new Error('document should not be queried');
      },
    });

    expect(() => revealSections()).not.toThrow();
  });

  it('wires up focusin on waiting sections to reveal instantly and unobserve', () => {
    const unobserved: unknown[] = [];
    class AvailableObserver {
      observe() {}
      unobserve(el: unknown) {
        unobserved.push(el);
      }
    }
    const listeners: Record<string, () => void> = {};
    const section = {
      dataset: { reveal: '' },
      getBoundingClientRect: () => ({ top: 1000 }),
      addEventListener: (type: string, fn: () => void) => {
        listeners[type] = fn;
      },
      removeEventListener: (type: string) => {
        delete listeners[type];
      },
    };
    vi.stubGlobal('IntersectionObserver', AvailableObserver);
    vi.stubGlobal('window', {
      innerHeight: 800,
      matchMedia: () => ({ matches: false }),
      IntersectionObserver: AvailableObserver,
    });
    vi.stubGlobal('document', {
      querySelectorAll: () => [section],
    });

    revealSections();
    expect(section.dataset.reveal).toBe('waiting');
    expect(listeners.focusin).toBeDefined();

    listeners.focusin();
    expect(section.dataset.reveal).toBe('instant');
    expect(unobserved).toContain(section);
  });

  it('aligns a focused target in a waiting section in the focusin turn, without waiting for a frame', () => {
    const listeners: Record<string, (event?: FocusEvent) => void> = {};
    const scrollIntoView = vi.fn();
    const requestAnimationFrame = vi.fn();
    class AvailableElement {
      scrollIntoView = scrollIntoView;
    }
    const target = new AvailableElement() as unknown as HTMLElement;
    class AvailableObserver {
      observe() {}
      unobserve() {}
    }
    const section = {
      dataset: { reveal: '' },
      getBoundingClientRect: () => ({ top: 1000 }),
      addEventListener: (type: string, fn: (event?: FocusEvent) => void) => {
        listeners[type] = fn;
      },
      removeEventListener: () => {},
    };
    vi.stubGlobal('IntersectionObserver', AvailableObserver);
    vi.stubGlobal('HTMLElement', AvailableElement);
    vi.stubGlobal('window', {
      innerHeight: 800,
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame,
      IntersectionObserver: AvailableObserver,
    });
    vi.stubGlobal('document', {
      activeElement: target,
      querySelectorAll: () => [section],
    });

    revealSections();
    listeners.focusin({ target } as unknown as FocusEvent);

    expect(section.dataset.reveal).toBe('instant');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('keeps a waiting section instant when intersection follows focus-induced scrolling', () => {
    let intersection: ((entries: Array<{ isIntersecting: boolean; target: unknown }>) => void) | undefined;
    const unobserved: unknown[] = [];
    class AvailableElement {
      scrollIntoView = vi.fn();
    }
    const target = new AvailableElement() as unknown as HTMLElement;
    const section = {
      dataset: { reveal: '' },
      getBoundingClientRect: () => ({ top: 1000 }),
      contains: (node: unknown) => node === target,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    class AvailableObserver {
      constructor(callback: (entries: Array<{ isIntersecting: boolean; target: unknown }>) => void) {
        intersection = callback;
      }
      observe() {}
      unobserve(element: unknown) {
        unobserved.push(element);
      }
    }
    vi.stubGlobal('HTMLElement', AvailableElement);
    vi.stubGlobal('IntersectionObserver', AvailableObserver);
    vi.stubGlobal('window', {
      innerHeight: 800,
      matchMedia: () => ({ matches: false }),
      IntersectionObserver: AvailableObserver,
    });
    vi.stubGlobal('document', {
      activeElement: target,
      querySelectorAll: () => [section],
    });

    revealSections();
    expect(section.dataset.reveal).toBe('waiting');
    intersection?.([{ isIntersecting: true, target: section }]);

    expect(section.dataset.reveal).toBe('instant');
    expect(unobserved).toContain(section);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });
});

describe('reveal safety net', () => {
  it('finishes a shown section\'s animations about a second after it is shown', () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout: globalThis.setTimeout.bind(globalThis), matchMedia: () => ({ matches: false }) });
    const finish = vi.fn();
    const cancel = vi.fn();
    settleReveal({ getAnimations: () => [{ finish, cancel }] } as never);
    vi.advanceTimersByTime(999);
    expect(finish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('cancels an animation that refuses to finish, and runs when the observer shows a section', () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout: globalThis.setTimeout.bind(globalThis), matchMedia: () => ({ matches: false }), innerHeight: 800 });
    let callback: (entries: unknown[]) => void = () => {};
    class FakeObserver {
      constructor(cb: (entries: unknown[]) => void) { callback = cb; }
      observe() {}
      unobserve() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('window', { setTimeout: globalThis.setTimeout.bind(globalThis), matchMedia: () => ({ matches: false }), innerHeight: 800, IntersectionObserver: FakeObserver });
    const cancel = vi.fn();
    const section = {
      dataset: { reveal: '' } as Record<string, string>,
      getBoundingClientRect: () => ({ top: 1000 }),
      addEventListener: () => {},
      removeEventListener: () => {},
      contains: () => false,
      getAnimations: () => [{ finish: () => { throw new Error('nope'); }, cancel }],
    };
    vi.stubGlobal('document', { querySelectorAll: () => [section], activeElement: null });
    vi.stubGlobal('HTMLElement', class {});
    revealSections();
    expect(section.dataset.reveal).toBe('waiting');
    callback([{ isIntersecting: true, target: section }]);
    expect(section.dataset.reveal).toBe('shown');
    vi.advanceTimersByTime(1000);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
