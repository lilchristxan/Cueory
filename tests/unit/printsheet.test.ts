import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { vialoSheet } from '../../src/config/vialo-print';
import { keeperFor, wirePrintButtons } from '../../src/scripts/printsheet';

const puzzles = [{ word: 'grace' }, { word: 'pilot' }, { word: 'other' }];
const done = { on: true, stats: [{ game: 'pulse' as const, day: '2026-11-01', solved: true, tries: 4 }] };

describe('vialo paper sheet', () => {
  it('the print button calls print once per click', () => {
    let click: () => void = () => {};
    const button = { addEventListener: (_type: string, listener: () => void) => { click = listener; } };
    const root = { querySelectorAll: () => [button] } as unknown as Document;
    const print = vi.fn();
    wirePrintButtons(root, print);
    click();
    expect(print).toHaveBeenCalledTimes(1);
  });
  it("shows today's word, as the game chooses it, only after today's game is finished", () => {
    const now = new Date('2026-11-01T15:00:00');
    expect(keeperFor(puzzles, done, now)).toEqual({ word: 'grace', number: 1, date: 'sunday, november 1st' });
    expect(keeperFor(puzzles, { on: true, stats: [] }, now)).toBeUndefined();
    expect(keeperFor(puzzles, { on: false, stats: [] }, now)).toBeUndefined();
    expect(keeperFor(puzzles, done, new Date('2026-11-02T15:00:00'))).toBeUndefined();
    expect(keeperFor([], done, now)).toBeUndefined();
  });
  it('the sheet uses the three pen marks and no game-mark symbols', () => {
    expect(vialoSheet.marks.map((mark) => mark.kind)).toEqual(['line', 'cross', 'ring']);
    expect(JSON.stringify(vialoSheet)).not.toMatch(/[●○]/);
  });
  it("the answers sit only on the keeper's box, never in page 1", () => {
    const page = readFileSync('src/pages/play/vialo/print.astro', 'utf8');
    expect(page).toContain('data-puzzles={puzzles}');
    expect(page).not.toMatch(/localStorage/);
  });
});
