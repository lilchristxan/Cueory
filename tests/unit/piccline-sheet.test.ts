import { describe, expect, it } from 'vitest';
import { listOrder } from '../../src/islands/PicclineSheetParts';
import { canPrintToday, forfeitToday, isFinished, openPrint, PRINT_PAGES } from '../../src/scripts/printgate';
import type { SuturePathPuzzle } from '../../src/islands/suturepath';

function memory(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [['cueory-game-stats', initial]]);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); }, data };
}

const puzzle = {
  words: [{ answer: 'ZED', path: [], special: true }, { answer: 'APE', path: [], special: false }, { answer: 'MID', path: [], special: false }],
} as unknown as SuturePathPuzzle;

describe("piccline's paper sheet", () => {
  it('lists the answers alphabetically on both pages, so the list never shows which is the thread', () => {
    expect(listOrder(puzzle)).toEqual([1, 2, 0]);
  });
  it('prints from its own game page', () => {
    expect(PRINT_PAGES.piccline).toBe('/play/piccline#print');
    let went = '';
    openPrint('piccline', (href) => { went = href; });
    expect(went).toBe('/play/piccline#print');
  });
  it("counts the older suture result as piccline's finished day", () => {
    const store = memory(JSON.stringify({ version: 1, results: [{ game: 'suture', day: '2026-11-01', solved: true, tries: 0 }] }));
    expect(canPrintToday(store, 'piccline', '2026-11-01')).toBe(true);
    expect(canPrintToday(store, 'piccline', '2026-11-02')).toBe(false);
    expect(isFinished([{ game: 'suture', day: '2026-11-01', solved: true, tries: 0 }], 'piccline', '2026-11-01')).toBe(true);
  });
  it('a forfeit records the day as not solved and keeps an earlier result', () => {
    const store = memory();
    expect(forfeitToday(store, 'piccline', '2026-11-01', 0)).toBe(true);
    expect(JSON.parse(store.data.get('cueory-game-stats')!).results).toEqual([{ game: 'piccline', day: '2026-11-01', solved: false, tries: 0 }]);
    const kept = memory(JSON.stringify({ version: 1, results: [{ game: 'suture', day: '2026-11-01', solved: true, tries: 0 }] }));
    forfeitToday(kept, 'piccline', '2026-11-01', 0);
    expect(JSON.parse(kept.data.get('cueory-game-stats')!).results).toEqual([{ game: 'suture', day: '2026-11-01', solved: true, tries: 0 }]);
  });
});
