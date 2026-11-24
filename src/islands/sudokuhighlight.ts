/**
 * Which highlight classes each sudoku square gets (global.css styles them with tokens from tokens.css).
 * - is-selected: the chosen square (strong outline, the focal point).
 * - is-related / is-box-related: the other squares in its row and column / its 3 × 3 box (a clear tint).
 * - is-identical: every square holding the selected square's number (strongest fill plus bold, so not color alone).
 * - is-conflict: a number that clashes in its row, column or box (a dashed ring, a sign that isn't color).
 * - is-wrong: an entry that isn't the answer, when guesses are checked or "check puzzle" found it (a slash mark).
 * - has-candidates: an empty square showing small candidate numbers (their size and 3 × 3 layout set them apart).
 * Pure, so tap, mouse and keyboard selection all go through the same rules and it can be unit tested.
 */
import type { SudokuSettings } from './sudoku';

export type SudokuHighlightSettings = Pick<SudokuSettings, 'highlightRowColumn' | 'highlightBox' | 'highlightIdentical' | 'highlightConflicts'>;

export interface SudokuHighlightState {
  selected: number;
  entries: readonly number[];
  givens: readonly number[];
  conflicts: ReadonlySet<number>;
  paused: boolean;
  settings: SudokuHighlightSettings;
  /** Squares to show as wrong (sudoku.ts sudokuWrongCells). */
  wrong?: ReadonlySet<number>;
  /** Empty squares that show candidate notes. */
  noted?: ReadonlySet<number>;
}

export function sudokuCellClasses(index: number, state: SudokuHighlightState): string[] {
  const { selected, entries, givens, conflicts, paused, settings } = state;
  const row = Math.floor(index / 9); const column = index % 9;
  const selectedRow = Math.floor(selected / 9); const selectedColumn = selected % 9;
  const value = entries[index] ?? 0; const selectedValue = entries[selected] ?? 0;
  const given = (givens[index] ?? 0) !== 0;
  const isSelected = !paused && index === selected;
  // While paused original givens remain visible, but selection and student content must not leak through classes.
  const show = !paused && !isSelected;
  const related = show && settings.highlightRowColumn && (row === selectedRow || column === selectedColumn);
  const box = show && settings.highlightBox && Math.floor(row / 3) === Math.floor(selectedRow / 3) &&
    Math.floor(column / 3) === Math.floor(selectedColumn / 3);
  const identical = !paused && settings.highlightIdentical && selectedValue !== 0 && value === selectedValue;
  const classes = ['sudoku-cell'];
  if (given) classes.push('is-given');
  else if (!paused && value) classes.push('is-entered');
  if (isSelected) classes.push('is-selected');
  if (related) classes.push('is-related');
  if (box) classes.push('is-box-related');
  if (identical) classes.push('is-identical');
  if (!paused && settings.highlightConflicts && conflicts.has(index)) classes.push('is-conflict');
  if (!paused && !given && state.wrong?.has(index)) classes.push('is-wrong');
  if (!paused && !given && !value && state.noted?.has(index)) classes.push('has-candidates');
  if (column === 2 || column === 5) classes.push('sudoku-box-right');
  if (row === 2 || row === 5) classes.push('sudoku-box-bottom');
  return classes;
}
