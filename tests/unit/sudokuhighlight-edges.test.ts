import { describe, expect, it } from 'vitest';
import { sudokuCellClasses, type SudokuHighlightState } from '../../src/islands/sudokuhighlight';

const allOn = { highlightRowColumn: true, highlightBox: true, highlightIdentical: true, highlightConflicts: true };
const allOff = { highlightRowColumn: false, highlightBox: false, highlightIdentical: false, highlightConflicts: false };
const empty = () => Array<number>(81).fill(0);
const state = (changes: Partial<SudokuHighlightState> = {}): SudokuHighlightState => ({
  selected: 40, entries: empty(), givens: empty(), conflicts: new Set(), paused: false, settings: allOn, ...changes,
});
const classes = (index: number, changes: Partial<SudokuHighlightState> = {}) => sudokuCellClasses(index, state(changes));

describe('sudoku highlight edges', () => {
  it('gives a plain empty square only its base class', () => {
    expect(classes(0, { selected: 40 })).toEqual(['sudoku-cell']);
  });
  it('lists the base class first and keeps a stable order of the rest', () => {
    const entries = empty(); entries[39] = 3; entries[40] = 3;
    const result = classes(39, { entries, conflicts: new Set([39]), wrong: new Set([39]) });
    expect(result[0]).toBe('sudoku-cell');
    expect(result).toEqual(['sudoku-cell', 'is-entered', 'is-related', 'is-box-related', 'is-identical', 'is-conflict', 'is-wrong']);
  });
  it('tints a square in the same box but a different row and column only as box-related', () => {
    const result = classes(30);
    expect(result).toContain('is-box-related');
    expect(result).not.toContain('is-related');
  });
  it('tints a square in the same row but another box only as related', () => {
    const result = classes(36);
    expect(result).toContain('is-related');
    expect(result).not.toContain('is-box-related');
  });
  it('adds no tint at all when every setting is off, but still marks the selected square', () => {
    expect(classes(39, { settings: allOff })).toEqual(['sudoku-cell']);
    expect(classes(40, { settings: allOff })).toContain('is-selected');
  });
  it('does not treat a selected square outside the board as related to anything', () => {
    for (const selected of [-1, 81, 1000]) {
      for (let index = 0; index < 81; index++) {
        const result = classes(index, { selected });
        expect(result).not.toContain('is-selected');
        expect(result).not.toContain('is-identical');
        expect(result).not.toContain('is-box-related');
      }
    }
  });
  it('never marks a square identical to an empty square, even another empty one', () => {
    expect(classes(3, { selected: 40 })).not.toContain('is-identical');
  });
  it('marks identical squares across the whole board, regardless of row, column or box settings', () => {
    const entries = empty(); entries[40] = 6; entries[80] = 6;
    const settings = { ...allOff, highlightIdentical: true };
    expect(classes(80, { entries, settings })).toContain('is-identical');
    expect(classes(80, { entries, settings })).not.toContain('is-related');
  });
  it('treats a short entries array as empty squares instead of failing', () => {
    expect(() => classes(80, { entries: [], givens: [] })).not.toThrow();
    expect(classes(80, { entries: [], givens: [] })).toEqual(['sudoku-cell']);
  });
  it('shows a given as given, not entered, and never as wrong or with candidates', () => {
    const givens = empty(); givens[10] = 4;
    const entries = [...givens];
    const result = classes(10, { givens, entries, wrong: new Set([10]), noted: new Set([10]) });
    expect(result).toContain('is-given');
    expect(result).not.toContain('is-entered');
    expect(result).not.toContain('is-wrong');
    expect(result).not.toContain('has-candidates');
  });
  it('shows candidates only on an empty, noted, non-given square', () => {
    const noted = new Set([5]);
    expect(classes(5, { noted })).toContain('has-candidates');
    const entries = empty(); entries[5] = 2;
    expect(classes(5, { noted, entries })).not.toContain('has-candidates');
    expect(classes(6, { noted })).not.toContain('has-candidates');
  });
  it('shows a wrong mark on an entered square and not on an unmarked one', () => {
    const entries = empty(); entries[20] = 9;
    expect(classes(20, { entries, wrong: new Set([20]) })).toContain('is-wrong');
    expect(classes(20, { entries })).not.toContain('is-wrong');
  });
  it('honors the conflict setting for the conflict ring', () => {
    const conflicts = new Set([7]);
    expect(classes(7, { conflicts })).toContain('is-conflict');
    expect(classes(7, { conflicts, settings: { ...allOn, highlightConflicts: false } })).not.toContain('is-conflict');
  });
  it('draws box lines for every column 3 and 6 and row 3 and 6, and nowhere else', () => {
    for (let index = 0; index < 81; index++) {
      const result = classes(index, { selected: -1 });
      expect(result.includes('sudoku-box-right')).toBe([2, 5].includes(index % 9));
      expect(result.includes('sudoku-box-bottom')).toBe([2, 5].includes(Math.floor(index / 9)));
    }
  });
  it('keeps box lines while paused, and nothing else', () => {
    const entries = empty(); entries[2] = 8;
    const result = classes(2, { paused: true, entries, conflicts: new Set([2]), wrong: new Set([2]), noted: new Set([2]) });
    expect(result).toEqual(['sudoku-cell', 'sudoku-box-right']);
  });
  it('keeps a given visible while paused', () => {
    const givens = empty(); givens[11] = 1;
    expect(classes(11, { paused: true, givens, entries: [...givens] })).toContain('is-given');
  });
  it('does not change the state it is given', () => {
    const input = state({ conflicts: new Set([1]), wrong: new Set([2]) });
    const copy = { ...input, entries: [...input.entries], conflicts: new Set(input.conflicts), wrong: new Set(input.wrong) };
    for (let index = 0; index < 81; index++) sudokuCellClasses(index, input);
    expect(input.entries).toEqual(copy.entries);
    expect([...input.conflicts]).toEqual([...copy.conflicts]);
    expect([...input.wrong!]).toEqual([...copy.wrong]);
  });
});
