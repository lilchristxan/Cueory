import { describe, expect, it, vi } from 'vitest';
import {
  BEADS_PER_LINE,
  dotColumns,
  picclineDescription,
  picclineFileName,
  picclineLayout,
  picclineStats,
  PICCLINE_STICKER_SIZE,
  type PicclineStickerInput,
} from '../../src/islands/picclinesticker';
import { drawDot, type PicclinePalette } from '../../src/islands/picclinestickerdraw';

const found = [false, true, false, false, false, false, false, false];
const stats = [
  { value: '0:58', label: 'solve time' },
  { value: '92%', label: 'solved' },
  { value: '5', label: 'day streak' },
];
const input = (over: Partial<PicclineStickerInput> = {}): PicclineStickerInput => ({ found, date: 'friday, november 20th', stats, ...over });

describe('sizes', () => {
  it('exports at the two sizes Christian drew', () => {
    expect(PICCLINE_STICKER_SIZE).toEqual({ centered: { width: 1200, height: 1220 }, 'lower-third': { width: 1580, height: 840 } });
    for (const kind of ['centered', 'lower-third'] as const) {
      const layout = picclineLayout(kind, input());
      expect(layout.width).toBe(PICCLINE_STICKER_SIZE[kind].width);
      expect(layout.height).toBe(PICCLINE_STICKER_SIZE[kind].height);
    }
  });
});

describe('the portrait dot cluster', () => {
  it('is two rows, as many columns as the words need, one dot per word in the order found', () => {
    expect(dotColumns(6)).toBe(3);
    expect(dotColumns(7)).toBe(4);
    expect(dotColumns(8)).toBe(4);
    const { dots } = picclineLayout('centered', input());
    expect(dots).toHaveLength(8);
    expect(dots.map((d) => d.special)).toEqual(found);
    // Row-major: four across, then the next row; every dot 136 wide.
    expect(new Set(dots.slice(0, 4).map((d) => d.cy)).size).toBe(1);
    expect(dots[4]!.cy).toBeGreaterThan(dots[0]!.cy);
    expect(dots[4]!.cx).toBe(dots[0]!.cx);
    expect(dots[0]!.radius * 2).toBe(136);
    expect(dots[1]!.cx - dots[0]!.cx).toBe(136 + 48);
  });

  it('is centred on the sticker whatever the number of words', () => {
    for (const n of [6, 7, 8]) {
      const { dots } = picclineLayout('centered', input({ found: Array.from({ length: n }, (_, i) => i === 1) }));
      const columns = dotColumns(n);
      const left = dots[0]!.cx - 68;
      const right = dots[columns - 1]!.cx + 68;
      expect((left + right) / 2).toBe(600);
    }
  });
});

describe('the landscape beadLines', () => {
  it('has one bead line of five beads per word, in the order found, and keeps eight inside the frame', () => {
    const { beadLines } = picclineLayout('lower-third', input());
    expect(beadLines).toHaveLength(8);
    expect(beadLines.map((s) => s.special)).toEqual(found);
    for (const beadLine of beadLines) {
      expect(beadLine.beads).toHaveLength(BEADS_PER_LINE);
      expect(beadLine.beads.every((b) => b.special === beadLine.special)).toBe(true);
    }
    expect(beadLines[1]!.beads[0]!.cy - beadLines[0]!.beads[0]!.cy).toBe(88);
    expect(beadLines[7]!.beads[0]!.cy + 27).toBeLessThan(840);
  });

  it('squeezes a long list so nothing leaves the frame', () => {
    const { beadLines } = picclineLayout('lower-third', input({ found: Array.from({ length: 14 }, () => false) }));
    expect(beadLines.at(-1)!.beads[0]!.cy + 27).toBeLessThan(840);
    expect(beadLines[0]!.beads[0]!.cy - 27).toBeGreaterThan(0);
  });
});

describe('stats: signed in or out is the one switch', () => {
  it('signed in has time, solved and streak; signed out has the time only', () => {
    expect(picclineStats({ solveMs: 58_000, found: 8, total: 8, account: { winPercent: 92, streak: 5 } })).toEqual(stats);
    expect(picclineStats({ solveMs: 58_000, found: 8, total: 8, account: undefined })).toEqual([{ value: '0:58', label: 'solve time' }]);
  });
  it('shows the words found when there is no recorded time', () => {
    expect(picclineStats({ solveMs: undefined, found: 7, total: 7, account: undefined })).toEqual([{ value: '7/7', label: 'words' }]);
  });
  it('lays out one stat or three', () => {
    expect(picclineLayout('centered', input({ stats: stats.slice(0, 1) })).statValues).toHaveLength(1);
    expect(picclineLayout('centered', input({ stats: stats.slice(0, 1) })).dividers).toHaveLength(0);
    expect(picclineLayout('centered', input()).dividers).toHaveLength(2);
  });
});

describe('words', () => {
  it('describes the sticker without any letter of a word and says where the word of the day is', () => {
    const text = picclineDescription(input());
    expect(text).toMatch(/word of the day was number 2 of 8/);
    expect(text).toMatch(/teal with a ring/);
    expect(text).toMatch(/solve time 0:58/);
  });
  it('names the files by game, shape and day', () => {
    expect(picclineFileName('centered', new Date(2026, 10, 1))).toBe('piccline-portrait-2026-11-01.png');
    expect(picclineFileName('lower-third', new Date(2026, 10, 20))).toBe('piccline-landscape-2026-11-20.png');
  });
});

describe('the word of the day differs from the others by more than colour', () => {
  const palette = {
    special: ['1', '2', '3'],
    other: ['4', '5', '6'],
    lift: 'a',
    edge: 'b',
    ring: { color: 'ringcolour', dot: 6, dotGap: 10, bead: 3, beadGap: 5 },
  } as unknown as PicclinePalette;

  function strokes(special: boolean, ring: { width: number; gap: number } | undefined) {
    const seen: Array<{ style: unknown; width: unknown }> = [];
    const state: Record<string, unknown> = {};
    const ctx = new Proxy(state, {
      get(target, key: string) {
        if (key === 'stroke') return () => seen.push({ style: target.strokeStyle, width: target.lineWidth });
        if (key === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
        if (key in target) return target[key];
        return () => undefined;
      },
      set(target, key: string, value) {
        target[key] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    vi.stubGlobal('Path2D', class {});
    drawDot(ctx, { cx: 100, cy: 100, radius: 68, special }, palette, { lift: 'x', blur: 4, dy: 7, edge: 2, ring });
    vi.unstubAllGlobals();
    return seen;
  }

  it('draws the ring stroke only for the word of the day', () => {
    const ring = { width: 6, gap: 10 };
    // The hairline edge is drawn for every dot; the ring is the extra stroke, in the ring colour.
    const special = strokes(true, ring);
    const other = strokes(false, ring);
    expect(other).toHaveLength(1);
    expect(special).toHaveLength(2);
    expect(special.at(-1)).toEqual({ style: 'ringcolour', width: 6 });
    expect(other.some((s) => s.style === 'ringcolour')).toBe(false);
  });
});
