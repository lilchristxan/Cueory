import { afterEach, describe, expect, it, vi } from 'vitest';
import { revealSections } from '../../src/scripts/reveal';

afterEach(() => {
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
});
