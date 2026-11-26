import type { SudokuLevel } from './sudoku';

/** The level names, in their own small file so the results code that shows them does not pull in the whole puzzle engine (the page JS budget). */
export const LEVEL_LABELS: Readonly<Record<SudokuLevel, string>> = { easy: 'easy', medium: 'medium', hard: 'hard' };
