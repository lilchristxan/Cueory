import { describe, expect, it } from 'vitest';
import {
  ART,
  FOIL,
  formatCountdown,
  formatSolveTime,
  pillGrid,
  stickerDate,
  stickerDescription,
  stickerFileName,
  stickerLayout,
  stickerStats,
  STICKER_SIZE,
  type StickerInput,
} from '../../src/islands/vialosticker';
import type { Mark } from '../../src/islands/pulse';

const rows: Mark[][] = [
  ['absent', 'elsewhere', 'here', 'absent', 'elsewhere'],
  ['here', 'here', 'here', 'here', 'here'],
];
const input = (stats: StickerInput['stats']): StickerInput => ({ rows, date: 'friday, november 20th', stats });
const three = [
  { value: '0:42', label: 'solve time' },
  { value: '93%', label: 'solved' },
  { value: '6', label: 'day streak' },
];

describe('sticker sizes and the foil crop', () => {
  it('exports at the two sizes Christian drew', () => {
    expect(STICKER_SIZE.centered).toEqual({ width: 1200, height: 1720 });
    expect(STICKER_SIZE['lower-third']).toEqual({ width: 1620, height: 840 });
  });

  it('crops the foil inside the artwork file, with the mat cut away', () => {
    expect(FOIL.x + FOIL.width).toBeLessThan(ART.width);
    expect(FOIL.y + FOIL.height).toBeLessThan(ART.height);
    expect(FOIL.x).toBeGreaterThan(0);
  });
});

describe('the wells', () => {
  it('lays out six rows of five and leaves unplayed rows empty', () => {
    const layout = stickerLayout('centered', input(three));
    expect(layout.pills).toHaveLength(30);
    expect(layout.pills.slice(0, 5).map((p) => p.kind)).toEqual(rows[0]);
    expect(layout.pills.slice(5, 10).map((p) => p.kind)).toEqual(rows[1]);
    expect(layout.pills.slice(10).every((p) => p.kind === 'empty')).toBe(true);
  });

  it('keeps every pill inside the pack and in reading order', () => {
    for (const kind of ['centered', 'lower-third'] as const) {
      const { pills, pack } = stickerLayout(kind, input(three));
      for (const p of pills) {
        expect(p.cx - p.width / 2).toBeGreaterThan(pack.x);
        expect(p.cx + p.width / 2).toBeLessThan(pack.x + pack.width);
        expect(p.cy - p.height / 2).toBeGreaterThan(pack.y);
        expect(p.cy + p.height / 2).toBeLessThan(pack.y + pack.height);
      }
      expect(pills[1]!.cx).toBeGreaterThan(pills[0]!.cx);
      expect(pills[5]!.cy).toBeGreaterThan(pills[0]!.cy);
    }
  });

  it('puts the first pill where Christian measured it (portrait, export pixels)', () => {
    const { pills } = stickerLayout('centered', input(three));
    // 13.4% across and 12.299% down the 1230 x 1180 file, inside a 960 px pack that starts at x 120.
    expect(pills[0]!.cx).toBeCloseTo(120 + ((0.134 * ART.width - FOIL.x) * 960) / FOIL.width, 3);
    expect(pills[0]!.cx).toBeGreaterThan(225);
    expect(pills[0]!.cx).toBeLessThan(245);
  });

  it('ignores guesses beyond six rows', () => {
    const many = Array.from({ length: 8 }, () => ['here', 'here', 'here', 'here', 'here'] as Mark[]);
    expect(pillGrid(many, { x: 0, y: 0, width: 960, height: 920 }, 1)).toHaveLength(30);
  });
});

describe('layout', () => {
  it('centres the portrait sticker and its stats row', () => {
    const l = stickerLayout('centered', input(three));
    expect(l.wordmark.x + l.wordmark.width / 2).toBeCloseTo(600, 3);
    expect(l.pack.x + l.pack.width / 2).toBeCloseTo(600, 3);
    expect(l.statValues.map((s) => s.x)).toEqual([...l.statValues.map((s) => s.x)].sort((a, b) => a - b));
    expect(l.dividers).toHaveLength(2);
    expect(l.footer.y + l.footer.lineHeight).toBeLessThan(1720);
    expect(l.wordmark.y).toBeGreaterThan(0);
  });

  it('puts a single stat in the middle with no dividers', () => {
    const l = stickerLayout('centered', input([three[0]!]));
    expect(l.statValues).toHaveLength(1);
    expect(l.statValues[0]!.x).toBeCloseTo(600, 3);
    expect(l.dividers).toHaveLength(0);
  });

  it('lays the landscape sticker out as pack, rule, then text, inside 1620 x 840', () => {
    const l = stickerLayout('lower-third', input(three));
    expect(l.pack.x).toBeGreaterThan(0);
    expect(l.dividers[0]!.x).toBeGreaterThan(l.pack.x + l.pack.width);
    expect(l.wordmark.x).toBeGreaterThan(l.dividers[0]!.x);
    expect(l.wordmark.x + l.wordmark.width).toBeLessThanOrEqual(1620);
    expect(l.labelBesideValue).toBe(true);
    const ys = l.statValues.map((s) => s.y);
    expect(ys[1]! - ys[0]!).toBeGreaterThan(80);
    expect(l.footer.y).toBeGreaterThan(ys[2]!);
  });

  it('sits a single landscape stat lower in the gap than the first of three', () => {
    const one = stickerLayout('lower-third', input([three[0]!]));
    const all = stickerLayout('lower-third', input(three));
    expect(one.statValues[0]!.y).toBeGreaterThan(all.statValues[0]!.y);
    expect(one.statValues[0]!.y).toBeLessThan(one.footer.y);
  });
});

describe('wording', () => {
  it('formats the solve time as m:ss, rounded down', () => {
    expect(formatSolveTime(0)).toBe('0:00');
    expect(formatSolveTime(42_999)).toBe('0:42');
    expect(formatSolveTime(605_000)).toBe('10:05');
    expect(formatSolveTime(-5)).toBe('0:00');
  });

  it('formats the countdown as HH:MM:SS', () => {
    expect(formatCountdown(8 * 3600_000 + 42 * 60_000 + 15_000)).toBe('08:42:15');
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(999)).toBe('00:00:01');
  });

  it('writes the date line in lowercase with an ordinal', () => {
    expect(stickerDate(new Date(2026, 10, 20))).toBe('friday, november 20th');
    expect(stickerDate(new Date(2026, 10, 1))).toBe('sunday, november 1st');
    expect(stickerDate(new Date(2026, 10, 2))).toBe('monday, november 2nd');
    expect(stickerDate(new Date(2026, 10, 3))).toBe('tuesday, november 3rd');
    expect(stickerDate(new Date(2026, 10, 11))).toBe('wednesday, november 11th');
    expect(stickerDate(new Date(2026, 10, 22))).toBe('sunday, november 22nd');
  });

  it('names the files by kind and local date', () => {
    expect(stickerFileName('centered', new Date(2026, 10, 5))).toBe('vialo-portrait-2026-11-05.png');
    expect(stickerFileName('lower-third', new Date(2026, 10, 25))).toBe('vialo-landscape-2026-11-25.png');
  });
});

describe('the stats switch', () => {
  const base = { solved: true, tries: 4, maxTries: 6, solveMs: 42_000 } as const;

  it('shows all three for a signed-in player', () => {
    expect(stickerStats({ ...base, account: { winPercent: 93, streak: 6 } })).toEqual(three);
  });

  it('shows the solve time only for a signed-out player', () => {
    expect(stickerStats({ ...base, account: undefined })).toEqual([{ value: '0:42', label: 'solve time' }]);
  });

  it('shows the tries when a solved game was not timed', () => {
    expect(stickerStats({ ...base, solveMs: undefined, account: undefined })).toEqual([{ value: '4/6', label: 'tries' }]);
  });

  it('shows x/6 and no time for a lost game, keeping the account stats for a signed-in player', () => {
    const lost = { solved: false, tries: 6, maxTries: 6, solveMs: undefined };
    expect(stickerStats({ ...lost, account: undefined })).toEqual([{ value: 'x/6', label: 'tries' }]);
    expect(stickerStats({ ...lost, account: { winPercent: 50, streak: 0 } }).map((s) => s.label)).toEqual(['tries', 'solved', 'day streak']);
  });

  it('describes the sticker in words, with no letters', () => {
    const text = stickerDescription(input(three), true, 4, 6);
    expect(text).toContain('solved in 4 of 6');
    expect(text).toContain('solve time 0:42');
    expect(text).toContain('no letters');
  });
});
