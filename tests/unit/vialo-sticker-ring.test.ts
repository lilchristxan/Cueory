import { describe, expect, it, vi } from 'vitest';
import { hasRing, type PillRect } from '../../src/islands/vialosticker';
import { drawPill, type StickerPalette } from '../../src/islands/vialostickerdraw';

// Colour is never the only signal: on the exported sticker "elsewhere" pills carry the board's thin inset ring,
// "in place" is plain and "not in the word" is the plain white pill.

const palette = {
  pillShade: 'a',
  pillLift: 'b',
  pillGloss: 'c',
  ring: { color: 'ringcolour', width: 4, gap: 6 },
  pill: { here: ['1', '2', '3'], elsewhere: ['4', '5', '6'], absent: ['7', '8', '9'] },
} as unknown as StickerPalette;

function recorder() {
  const strokes: Array<{ style: unknown; width: unknown }> = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key === 'stroke') return () => strokes.push({ style: target.strokeStyle, width: target.lineWidth });
      if (key === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, strokes };
}

const pill = (kind: PillRect['kind']): PillRect => ({ cx: 100, cy: 60, width: 126, height: 88, kind });

describe('pills differ by more than colour on the sticker', () => {
  it('only "elsewhere" has a ring', () => {
    expect(hasRing('elsewhere')).toBe(true);
    expect(hasRing('here')).toBe(false);
    expect(hasRing('absent')).toBe(false);
    expect(hasRing('empty')).toBe(false);
  });

  it('draws the ring stroke for elsewhere only, in the board ring colour and thickness', () => {
    vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} arc() {} closePath() {} rect() {} addPath() {} });
    const drawn = Object.fromEntries(
      (['here', 'elsewhere', 'absent', 'empty'] as const).map((kind) => {
        const { ctx, strokes } = recorder();
        drawPill(ctx, pill(kind), palette, 1);
        return [kind, strokes];
      }),
    );
    vi.unstubAllGlobals();
    expect(drawn.here).toEqual([]);
    expect(drawn.absent).toEqual([]);
    expect(drawn.empty).toEqual([]);
    expect(drawn.elsewhere).toEqual([{ style: 'ringcolour', width: 4 }]);
  });
});
