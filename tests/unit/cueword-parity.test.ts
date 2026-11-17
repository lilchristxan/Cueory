/** Task 721: crossword parity (docs/GAMES-PARITY.md, crossword section). */
import { describe, expect, it } from 'vitest';
import {
  announceFirstEntry, arrow, autocheckAll, backspace, check, clueLeavesGrid, countsForStreak, GAME_PROGRESS_EVENT, currentWord, DEFAULT_CROSSWORD_SETTINGS, deleteLetter,
  emptyState, enter, isFilled, isFilledWrong, isLocked, isSolved, loadCrosswordSettings, moveClue,
  parseCrosswordSettings, reveal, saveCrosswordSettings, selectCell, CROSSWORD_SETTINGS_KEY,
  type CrosswordSettings, type CuewordPuzzle,
} from '../../src/islands/cueword';
import { currentStreak, parseStats, recordResult, serialize } from '../../src/islands/gamestats';

// Same everyday example as cueword.test.ts. Cells: 1 across 0-2, 4 across 5-7, 5 across 10-12; 1 down 0,5,10.
const puzzle: CuewordPuzzle = {
  id: 'everyday-example', sample: true, grid: ['CAT..', 'ARE..', 'TEN..', '...TO', '...ON'],
  clues: {
    across: [
      { number: 1, text: 'a pet' }, { number: 4, text: 'a form of be' }, { number: 5, text: 'two fives' },
      { number: 6, text: 'toward' }, { number: 8, text: 'the opposite of off' },
    ],
    down: [
      { number: 1, text: 'a pet' }, { number: 2, text: 'a form of be' }, { number: 3, text: 'two fives' },
      { number: 6, text: 'toward' }, { number: 7, text: 'the opposite of off' },
    ],
  },
};
const answers = puzzle.grid.join('');
const plain: CrosswordSettings = { ...DEFAULT_CROSSWORD_SETTINGS, skipFilled: false, jumpBack: false, jumpNext: false };
const fill = (letters: Record<number, string>) => {
  let state = emptyState(puzzle);
  for (const [cell, letter] of Object.entries(letters)) state = enter(selectCell(state, Number(cell), 'across'), letter, plain);
  return selectCell(state, 0, 'across');
};
const solveAll = (except: number[] = [], wrong = 'Z') => {
  const letters: Record<number, string> = {};
  [...answers].forEach((letter, cell) => { if (letter !== '.') letters[cell] = except.includes(cell) ? wrong : letter; });
  return fill(letters);
};

describe('crossword settings', () => {
  it('defaults when nothing is saved, and round-trips a complete record', () => {
    expect(parseCrosswordSettings(null)).toEqual(DEFAULT_CROSSWORD_SETTINGS);
    const changed: CrosswordSettings = { ...DEFAULT_CROSSWORD_SETTINGS, autocheck: true, clueSize: 'large' };
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
    saveCrosswordSettings(storage, changed);
    expect([...store.keys()]).toEqual([CROSSWORD_SETTINGS_KEY]);
    expect(loadCrosswordSettings(storage)).toEqual(changed);
  });
  it('resets an incomplete, malformed or unexpected record and survives blocked storage', () => {
    for (const bad of ['{', '[]', '{"autocheck":true}', JSON.stringify({ ...DEFAULT_CROSSWORD_SETTINGS, clueSize: 'huge' }),
      JSON.stringify({ ...DEFAULT_CROSSWORD_SETTINGS, showTimer: 'yes' }), JSON.stringify({ ...DEFAULT_CROSSWORD_SETTINGS, extra: true })]) {
      expect(parseCrosswordSettings(bad)).toEqual(DEFAULT_CROSSWORD_SETTINGS);
    }
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadCrosswordSettings(blocked)).toEqual(DEFAULT_CROSSWORD_SETTINGS);
    expect(() => saveCrosswordSettings(blocked, DEFAULT_CROSSWORD_SETTINGS)).not.toThrow();
  });
});

describe('pen, pencil and the cursor settings', () => {
  it('marks pencil letters as tentative and pen letters as final, without mutating the old state', () => {
    const start = emptyState(puzzle);
    const pencilled = enter(start, 'c', plain, true);
    expect(start.entries[0]).toBe('');
    expect(pencilled.entries[0]).toBe('C');
    expect(pencilled.pencil[0]).toBe(true);
    expect(enter(selectCell(pencilled, 0), 'c', plain).pencil[0]).toBe(false);
    expect(enter(start, '1', plain)).toBe(start);
  });
  it('skips filled squares only when that setting is on', () => {
    const state = selectCell(fill({ 1: 'A' }), 0, 'across');
    expect(enter(state, 'c', plain).cell).toBe(1);
    expect(enter(state, 'c', { ...plain, skipFilled: true }).cell).toBe(2);
  });
  it('jumps back to the first blank, or on to the next clue with a blank', () => {
    const middle = selectCell(emptyState(puzzle), 1, 'across');
    const back = enter(selectCell(enter(middle, 'a', plain), 2, 'across'), 't', { ...plain, jumpBack: true });
    expect(back.cell).toBe(0);
    expect(enter(selectCell(enter(middle, 'a', plain), 2, 'across'), 't', plain).cell).toBe(2);
    const full = enter(enter(enter(emptyState(puzzle), 'c', plain), 'a', plain), 't', { ...plain, jumpNext: true });
    expect(currentWord(full)).toMatchObject({ number: 4, direction: 'across' });
    expect(full.cell).toBe(5);
  });
  it('never changes a locked (revealed or checked right) square and types into the next open one', () => {
    let state = check(fill({ 0: 'C' }), 'square');
    expect(isLocked(state, 0)).toBe(true);
    state = enter(state, 'x', plain);
    expect(state.entries.slice(0, 2)).toEqual(['C', 'X']);
    expect(backspace(selectCell(state, 0)).entries[0]).toBe('C');
  });
  it('autochecks each typed letter and counts it as help', () => {
    const state = enter(emptyState(puzzle), 'x', { ...plain, autocheck: true });
    expect(state.checks[0]).toBe('wrong');
    expect(state.assists).toBe(1);
    expect(enter(state, 'a', { ...plain, autocheck: true }).assists).toBe(1);
    expect(autocheckAll(emptyState(puzzle)).assists).toBe(0);
    expect(autocheckAll(fill({ 1: 'Q' })).checks[1]).toBe('wrong');
  });
});

describe('crossword keyboard', () => {
  it('backspace clears a filled square in place, or steps back and clears on an empty one', () => {
    const state = selectCell(fill({ 0: 'C', 1: 'A' }), 1, 'across');
    const cleared = backspace(state);
    expect(cleared.entries[1]).toBe('');
    expect(cleared.cell).toBe(1);
    const stepped = backspace(cleared);
    expect(stepped.entries[0]).toBe('');
    expect(stepped.cell).toBe(0);
    expect(backspace(stepped)).toBe(stepped);
    expect(deleteLetter(selectCell(state, 0)).entries[0]).toBe('');
  });
  it('an arrow against the direction switches direction first, then moves', () => {
    const start = emptyState(puzzle);
    expect(start.direction).toBe('across');
    const turned = arrow(start, 'ArrowDown');
    expect(turned).toMatchObject({ cell: 0, direction: 'down' });
    expect(arrow(turned, 'ArrowDown')).toMatchObject({ cell: 5, direction: 'down' });
    expect(arrow(start, 'ArrowRight').cell).toBe(1);
  });
  it('Tab-style clue moves land on the first blank of the next or previous clue', () => {
    const state = fill({ 5: 'A' });
    const next = moveClue(state, 1);
    expect(currentWord(next)).toMatchObject({ number: 4, direction: 'across' });
    expect(next.cell).toBe(6);
    expect(currentWord(moveClue(state, -1))).toMatchObject({ number: 7, direction: 'down' });
  });
  it('Tab on the last clue and Shift+Tab on the first leave the grid instead of wrapping (no keyboard trap)', () => {
    const first = emptyState(puzzle);
    expect(clueLeavesGrid(first, -1)).toBe(true);
    expect(clueLeavesGrid(first, 1)).toBe(false);
    const last = moveClue(first, -1);
    expect(currentWord(last)).toMatchObject({ number: 7, direction: 'down' });
    expect(clueLeavesGrid(last, 1)).toBe(true);
    expect(clueLeavesGrid(last, -1)).toBe(false);
  });
});

describe('check and reveal', () => {
  it('checks a square, a word or the puzzle, marking right and wrong, and counts each use as help', () => {
    const state = fill({ 0: 'C', 1: 'X', 5: 'Q' });
    const square = check(state, 'square');
    expect(square.checks.slice(0, 2)).toEqual(['right', undefined]);
    expect(square.assists).toBe(1);
    const word = check(state, 'word');
    expect(word.checks.slice(0, 3)).toEqual(['right', 'wrong', undefined]);
    const all = check(word, 'puzzle');
    expect(all.checks[5]).toBe('wrong');
    expect(all.assists).toBe(2);
  });
  it('reveals a square, a word or the puzzle, locks revealed letters and clears pencil marks', () => {
    const pencilled = enter(emptyState(puzzle), 'x', plain, true);
    const square = reveal(selectCell(pencilled, 0), 'square');
    expect(square.entries[0]).toBe('C');
    expect(square.pencil[0]).toBe(false);
    expect(square.cued).toEqual([0]);
    expect(isLocked(square, 0)).toBe(true);
    const word = reveal(square, 'word');
    expect(word.entries.slice(0, 3)).toEqual(['C', 'A', 'T']);
    const all = reveal(word, 'puzzle');
    expect(isSolved(all)).toBe(true);
    expect(all.assists).toBe(3);
    expect(reveal(all, 'puzzle')).toBe(all);
    expect(check(all, 'puzzle')).toBe(all);
  });
});

describe('a filled grid that is wrong', () => {
  it('is filled but not solved until the wrong letter is fixed', () => {
    const wrong = solveAll([24]);
    expect(isFilled(wrong)).toBe(true);
    expect(isFilledWrong(wrong)).toBe(true);
    const fixed = enter(selectCell(wrong, 24, 'across'), 'n', plain);
    expect(isSolved(fixed)).toBe(true);
    expect(isFilledWrong(fixed)).toBe(false);
    expect(isFilledWrong(emptyState(puzzle))).toBe(false);
  });
});

describe('the crossword streak', () => {
  const puzzleDay = new Date(2026, 10, 16, 9, 30);
  const at = (hours: number) => new Date(2026, 10, 16).getTime() + hours * 3_600_000;
  it('counts an unassisted solve within 48 hours of the start of the puzzle date', () => {
    expect(countsForStreak(puzzleDay, at(1), 0)).toBe(true);
    expect(countsForStreak(puzzleDay, at(47.9), 0)).toBe(true);
    expect(countsForStreak(puzzleDay, at(48), 0)).toBe(false);
    expect(countsForStreak(puzzleDay, at(-1), 0)).toBe(false);
  });
  it('never counts a solve that used check, reveal or autocheck', () => {
    expect(countsForStreak(puzzleDay, at(1), 1)).toBe(false);
  });
  it('keeps the streak flag in the stats record and counts consecutive clean days', () => {
    let stats = recordResult([], { game: 'cueword', day: '2026-11-14', solved: true, tries: 0, streak: true });
    stats = recordResult(stats, { game: 'cueword', day: '2026-11-15', solved: true, tries: 0, streak: true });
    expect(currentStreak(stats, 'cueword', '2026-11-16')).toBe(2);
    const today = recordResult(stats, { game: 'cueword', day: '2026-11-16', solved: true, tries: 0, streak: true });
    expect(currentStreak(today, 'cueword', '2026-11-16')).toBe(3);
    const helped = recordResult(stats, { game: 'cueword', day: '2026-11-16', solved: true, tries: 2, streak: false });
    expect(currentStreak(helped, 'cueword', '2026-11-16')).toBe(0);
    expect(currentStreak(stats, 'cueword', '2026-11-18')).toBe(0);
    expect(parseStats(serialize(today))).toEqual(today);
    expect(currentStreak(stats, 'pulse', '2026-11-16')).toBe(0);
  });
  it('treats an older clean crossword result without the flag as counting, and rejects a malformed flag', () => {
    const old = recordResult([], { game: 'cueword', day: '2026-11-15', solved: true, tries: 0 });
    expect(old[0]).not.toHaveProperty('streak');
    expect(currentStreak(old, 'cueword', '2026-11-16')).toBe(1);
    expect(recordResult([], { game: 'cueword', day: '2026-11-15', solved: true, tries: 0, streak: 'yes' })).toEqual([]);
  });
});

describe('the daily status progress event (#735)', () => {
  it('sends { game, day } once per day, on the first entry', () => {
    const heard: unknown[] = [];
    const target = new EventTarget();
    target.addEventListener(GAME_PROGRESS_EVENT, (event) => heard.push((event as CustomEvent).detail));
    expect(GAME_PROGRESS_EVENT).toBe('cueory:game-progress');
    expect(announceFirstEntry(target, '2026-11-16')).toBe(true);
    expect(announceFirstEntry(target, '2026-11-16')).toBe(false);
    expect(announceFirstEntry(target, '2026-11-17')).toBe(true);
    expect(announceFirstEntry(undefined, '2026-11-18')).toBe(false);
    expect(heard).toEqual([{ game: 'cueword', day: '2026-11-16' }, { game: 'cueword', day: '2026-11-17' }]);
  });
});
