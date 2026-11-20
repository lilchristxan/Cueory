import { afterEach, expect, it, vi } from 'vitest';
import { prepareDesktopWordmarks } from '../../src/scripts/wordmark-preload';

afterEach(() => vi.unstubAllGlobals());

it('reselects both palette files after the desktop pixel density changes', () => {
  const viewport = Object.assign(new EventTarget(), { devicePixelRatio: 1 });
  const images = ['light', 'dark'].map(palette => ({
    srcset: [480, 960, 1440].map(w => `/${palette}-${w}.png ${w}w`).join(', '),
    src: '',
    getAttribute(name: string) { return name === 'srcset' ? this.srcset : this.src; },
    decode: vi.fn().mockResolvedValue(undefined),
  }));
  const logo = {
    getClientRects: () => [{ width: 240 }],
    getBoundingClientRect: () => ({ width: 240 }),
    querySelectorAll: () => images,
    dataset: {},
  };
  vi.stubGlobal('window', viewport);
  const picker = new EventTarget();
  vi.stubGlobal('document', { querySelectorAll: () => [logo], querySelector: () => picker });

  prepareDesktopWordmarks();
  viewport.dispatchEvent(new Event('resize'));
  for (const image of images) expect(image.decode).toHaveBeenCalledTimes(0);
  picker.dispatchEvent(new Event('focusin'));
  expect(images.map(image => image.src)).toEqual(['/light-480.png', '/dark-480.png']);
  viewport.devicePixelRatio = 3;
  viewport.dispatchEvent(new Event('resize'));
  expect(images.map(image => image.src)).toEqual(['/light-960.png', '/dark-960.png']);
  viewport.dispatchEvent(new Event('resize'));
  for (const image of images) expect(image.decode).toHaveBeenCalledTimes(2);
});
