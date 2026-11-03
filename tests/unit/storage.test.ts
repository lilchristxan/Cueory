import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserStorage } from '../../src/scripts/storage';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browserStorage', () => {
  it('returns the browser local storage object', () => {
    const storage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    vi.stubGlobal('window', { localStorage: storage });

    expect(browserStorage()).toBe(storage);
  });

  it('returns undefined when browser storage is blocked', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('blocked');
      },
    });

    expect(browserStorage()).toBeUndefined();
  });
});
