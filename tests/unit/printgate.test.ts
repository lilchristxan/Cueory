import { describe, expect, it } from 'vitest';
import { canPrintToday, decidePrint, forfeitToday, isFinished, openPrint, PRINT_PAGES, printAnyway } from '../../src/scripts/printgate';

function memory(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [['cueory-game-stats', initial]]);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); }, data };
}

describe('print gate', () => {
  it('opens a finished game and warns on an unfinished one', () => {
    expect(decidePrint(false)).toBe('open');
    expect(decidePrint(true)).toBe('warn');
  });
  it('knows a finished day by the game and its other names', () => {
    expect(isFinished([{ game: 'pulse', day: '2026-11-01', solved: true, tries: 3 }], 'vialo', '2026-11-01')).toBe(true);
    expect(isFinished([{ game: 'pulse', day: '2026-10-31', solved: true, tries: 3 }], 'vialo', '2026-11-01')).toBe(false);
  });
  it("forfeit records today as not solved in the stats record, once", () => {
    const store = memory();
    expect(forfeitToday(store, 'vialo', '2026-11-01', 6)).toBe(true);
    const kept = JSON.parse(store.data.get('cueory-game-stats')!);
    expect(kept.results).toEqual([{ game: 'vialo', day: '2026-11-01', solved: false, tries: 6 }]);
    expect(forfeitToday(store, 'vialo', '2026-11-01', 6)).toBe(true);
    expect(JSON.parse(store.data.get('cueory-game-stats')!).results).toHaveLength(1);
  });
  it('never overwrites a result already kept for the day', () => {
    const store = memory(JSON.stringify({ version: 1, results: [{ game: 'vialo', day: '2026-11-01', solved: true, tries: 3 }] }));
    forfeitToday(store, 'vialo', '2026-11-01', 6);
    expect(JSON.parse(store.data.get('cueory-game-stats')!).results).toEqual([{ game: 'vialo', day: '2026-11-01', solved: true, tries: 3 }]);
  });
  it('records nothing when the browser keeps nothing', () => {
    expect(forfeitToday(undefined, 'vialo', '2026-11-01', 6)).toBe(false);
    const store = { getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => {} };
    expect(forfeitToday(store, 'vialo', '2026-11-01', 6)).toBe(false);
  });
  it('print anyway opens the sheet only when the forfeit was saved', () => {
    let opened = 0;
    expect(printAnyway(memory(), 'vialo', '2026-11-01', 6, () => { opened += 1; })).toBe(true);
    expect(opened).toBe(1);
    const full = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    expect(printAnyway(full, 'vialo', '2026-11-01', 6, () => { opened += 1; })).toBe(false);
    expect(opened).toBe(1);
  });
  it('offers print from the hub only when today has a stored result, and opens the game page with the print mark', () => {
    const kept = (day: string) => JSON.stringify({ version: 1, results: [{ game: 'pulse', day, solved: false, tries: 6 }] });
    expect(canPrintToday(memory(kept('2026-11-01')), 'vialo', '2026-11-01')).toBe(true);
    expect(canPrintToday(memory(kept('2026-10-31')), 'vialo', '2026-11-01')).toBe(false);
    expect(canPrintToday(memory(), 'vialo', '2026-11-01')).toBe(false);
    expect(canPrintToday(undefined, 'vialo', '2026-11-01')).toBe(false);
    const seen: string[] = [];
    openPrint('vialo', (href) => seen.push(href));
    expect(seen).toEqual(['/play/wordpill#print']);
    expect(PRINT_PAGES.vialo).not.toMatch(/[?&=]/);
  });
});
