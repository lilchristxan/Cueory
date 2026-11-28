/**
 * Image sizes (lane 9): pictures declare their real size so nothing shifts while they load, and the share sheet shows
 * small previews instead of the full share cards.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { VIAL_SIZES } from '../../src/config/vialsizes';
import { SHARE_PREVIEW_WIDTHS, SHARE_STYLES, shareImagePath, sharePreviewPath } from '../../src/islands/share';

const pub = (path: string) => new URL(`../../public/${path}`, import.meta.url);

describe('vial pictures', () => {
  const files = readdirSync(pub('vials')).filter((name) => name.endsWith('.webp')).sort();

  it('lists every vial file, and only those', () => {
    expect(Object.keys(VIAL_SIZES).map((vial) => `vial-${vial}.webp`).sort()).toEqual(files);
  });

  it.each(files)('%s: the recorded width and height match the file', async (name) => {
    const meta = await sharp(readFileSync(pub(`vials/${name}`))).metadata();
    const vial = name.slice('vial-'.length, -'.webp'.length) as keyof typeof VIAL_SIZES;
    expect({ width: meta.width, height: meta.height }).toEqual(VIAL_SIZES[vial]);
  });

  it('ModeVial uses the recorded size instead of one fixed size', () => {
    const source = readFileSync(new URL('../../src/components/ModeVial.astro', import.meta.url), 'utf8');
    expect(source).toContain('width={VIAL_SIZES[mode.vial].width}');
    expect(source).toContain('height={VIAL_SIZES[mode.vial].height}');
  });
});

describe('share sheet previews', () => {
  const cases = (['games', 'study'] as const).flatMap((group) =>
    SHARE_STYLES.flatMap((style) => SHARE_PREVIEW_WIDTHS.map((width) => [group, style, width] as const)),
  );

  it.each(cases)('%s %s at %ipx: a WebP of the card, scaled evenly and much smaller', async (group, style, width) => {
    const tool = group === 'study' ? 'study' : 'pulse';
    const full = pub(shareImagePath(tool, style).slice(1));
    const preview = pub(sharePreviewPath(tool, style, width).slice(1));
    const meta = await sharp(readFileSync(preview)).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(width);
    // Same shape as the 1200×630 card, to the nearest pixel.
    expect(meta.height).toBe(Math.round((width * 630) / 1200));
    expect(statSync(preview).size).toBeLessThan(statSync(full).size / 2);
  });

  it('the shared file stays the full PNG; only the picture on screen is a preview', () => {
    expect(sharePreviewPath('study', 'ivory', 560)).toBe('/share/previews/study-ivory-560.webp');
    expect(shareImagePath('study', 'ivory')).toBe('/share/study-ivory.png');
    const sheet = readFileSync(new URL('../../src/islands/ShareSheet.tsx', import.meta.url), 'utf8');
    expect(sheet).toContain('src={sharePreviewPath(tool, style, 560)}');
    expect(sheet).toContain('loadCardFile(fetch, shareImagePath(tool, style)');
  });
});
