import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareDesktopWordmarks } from '../../src/scripts/wordmark-preload';

afterEach(() => vi.unstubAllGlobals());

interface FakeImage {
  srcset: string;
  src: string;
  loading: string;
  getAttribute(name: string): string;
  decode: ReturnType<typeof vi.fn>;
}
const image = (srcset: string, src = '', decode = vi.fn().mockResolvedValue(undefined)): FakeImage => ({
  srcset, src, loading: 'lazy', decode,
  getAttribute(this: FakeImage, name: string) { return name === 'srcset' ? this.srcset : this.src; },
});
const sizes = (name: string, widths: number[]) => widths.map((w) => `/${name}-${w}.png ${w}w`).join(', ');

function page(options: { images: FakeImage[][]; visible?: boolean[]; width?: number; ratio?: number; picker?: boolean }) {
  const viewport = Object.assign(new EventTarget(), { devicePixelRatio: options.ratio ?? 1 });
  const logos = options.images.map((list, index) => ({
    getClientRects: () => ((options.visible?.[index] ?? true) ? [{}] : []),
    getBoundingClientRect: () => ({ width: options.width ?? 240 }),
    querySelectorAll: () => list,
    dataset: {} as Record<string, string>,
  }));
  const picker = new EventTarget();
  vi.stubGlobal('window', viewport);
  vi.stubGlobal('document', {
    querySelectorAll: () => logos,
    querySelector: () => (options.picker === false ? null : picker),
  });
  return { viewport, logos, picker };
}

describe('desktop wordmark preload edges', () => {
  it('does nothing when there is no picker or no logo', () => {
    const img = image(sizes('a', [480]));
    const { picker } = page({ images: [[img]], picker: false });
    prepareDesktopWordmarks();
    picker.dispatchEvent(new Event('focusin'));
    expect(img.src).toBe('');
    page({ images: [] });
    expect(() => prepareDesktopWordmarks()).not.toThrow();
  });
  it.each(['pointerenter', 'pointerdown', 'focusin', 'change'])('prepares on %s', (type) => {
    const img = image(sizes('a', [480, 960]));
    const { picker, logos } = page({ images: [[img]] });
    prepareDesktopWordmarks();
    picker.dispatchEvent(new Event(type));
    expect(img.src).toBe('/a-480.png');
    expect(logos[0]!.dataset.wordmarkPrepared).toBe('true');
  });
  it('does not prepare on an unrelated event', () => {
    const img = image(sizes('a', [480]));
    const { picker } = page({ images: [[img]] });
    prepareDesktopWordmarks();
    picker.dispatchEvent(new Event('click'));
    expect(img.src).toBe('');
  });
  it('adds one resize check however many kinds of intent arrive', () => {
    const img = image(sizes('a', [480]));
    const { picker, viewport } = page({ images: [[img]] });
    prepareDesktopWordmarks();
    for (const type of ['pointerenter', 'focusin', 'change']) picker.dispatchEvent(new Event(type));
    expect(img.decode).toHaveBeenCalledTimes(1);
    viewport.dispatchEvent(new Event('resize'));
    expect(img.src).toBe('/a-480.png');
    expect(img.decode).toHaveBeenCalledTimes(1);
  });
  it('reacts to a repeat of the same intent only once', () => {
    const img = image(sizes('a', [480]));
    const { picker } = page({ images: [[img]] });
    prepareDesktopWordmarks();
    picker.dispatchEvent(new Event('focusin'));
    picker.dispatchEvent(new Event('focusin'));
    expect(img.decode).toHaveBeenCalledTimes(1);
  });
  it('skips a logo that is not showing, and does not mark it prepared', () => {
    const hidden = image(sizes('h', [480]));
    const shown = image(sizes('s', [480]));
    const { picker, logos } = page({ images: [[hidden], [shown]], visible: [false, true] });
    prepareDesktopWordmarks();
    picker.dispatchEvent(new Event('focusin'));
    expect(hidden.src).toBe('');
    expect(logos[0]!.dataset.wordmarkPrepared).toBeUndefined();
    expect(shown.src).toBe('/s-480.png');
  });
  it('picks the smallest file at least as wide as the logo in device pixels, rounded up', () => {
    const img = image(sizes('a', [480, 960, 1440]));
    const { picker } = page({ images: [[img]], width: 240.2, ratio: 2 });
    prepareDesktopWordmarks();
    picker.dispatchEvent(new Event('focusin'));
    expect(img.src).toBe('/a-960.png');
  });
  it('picks an exact match, not the next size up', () => {
    const img = image(sizes('a', [480, 960]));
    const { picker } = page({ images: [[img]], width: 480 });
    prepareDesktopWordmarks();
    picker.dispatchEvent(new Event('focusin'));
    expect(img.src).toBe('/a-480.png');
  });
  it('falls back to the largest file when the logo is wider than every file', () => {
    const img = image(sizes('a', [480, 960]));
    const { picker } = page({ images: [[img]], width: 2000 });
    prepareDesktopWordmarks();
    picker.dispatchEvent(new Event('focusin'));
    expect(img.src).toBe('/a-960.png');
  });
  it('sorts files that are listed out of order', () => {
    const img = image('/a-960.png 960w, /a-480.png 480w, /a-1440.png 1440w');
    const { picker } = page({ images: [[img]], width: 500 });
    prepareDesktopWordmarks();
    picker.dispatchEvent(new Event('focusin'));
    expect(img.src).toBe('/a-960.png');
  });
  it('ignores entries without a usable width, and uses the plain src when none is usable', () => {
    const img = image('/a.png, /c.png abcw', '/plain.png');
    const { picker } = page({ images: [[img]] });
    prepareDesktopWordmarks();
    picker.dispatchEvent(new Event('focusin'));
    expect(img.src).toBe('/plain.png');
    expect(img.srcset).toBe('');
  });
  it('sets an eager, concrete image and clears the srcset', () => {
    const img = image(sizes('a', [480]));
    const { picker } = page({ images: [[img]] });
    prepareDesktopWordmarks();
    picker.dispatchEvent(new Event('focusin'));
    expect(img).toMatchObject({ srcset: '', loading: 'eager', src: '/a-480.png' });
    expect(img.decode).toHaveBeenCalledTimes(1);
  });
  it('does not fail when decoding fails', async () => {
    const decode = vi.fn().mockRejectedValue(new Error('decode'));
    const img = image(sizes('a', [480]), '', decode);
    const { picker } = page({ images: [[img]] });
    prepareDesktopWordmarks();
    expect(() => picker.dispatchEvent(new Event('focusin'))).not.toThrow();
    await Promise.resolve();
    expect(decode).toHaveBeenCalled();
  });
  it('leaves an image alone when it is already the concrete choice', () => {
    const img = image('', '/a-480.png');
    img.srcset = '';
    const { picker } = page({ images: [[img]] });
    prepareDesktopWordmarks();
    picker.dispatchEvent(new Event('focusin'));
    expect(img.decode).not.toHaveBeenCalled();
    expect(img.loading).toBe('lazy');
  });
  it('prepares every image inside a logo', () => {
    const images = [image(sizes('l', [480])), image(sizes('d', [480]))];
    const { picker } = page({ images: [images] });
    prepareDesktopWordmarks();
    picker.dispatchEvent(new Event('focusin'));
    expect(images.map((img) => img.src)).toEqual(['/l-480.png', '/d-480.png']);
  });
});
