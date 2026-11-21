/**
 * Pure Sudoku rules for the daily game (Task 625). The templates contain only numbers and no clinical content.
 *
 * Difficulty rule:
 * - easy: 40 givens, tuned for direct singles;
 * - medium: 32 givens, tuned for naked/hidden singles and candidate elimination;
 * - hard: 26 givens, unique but intentionally sparse enough to require search.
 *
 * A seed permutes digits, bands, rows, stacks and columns without changing a template's solution count or technique
 * band. The same day and level therefore produce the same puzzle for everyone.
 */
export type SudokuLevel = 'easy' | 'medium' | 'hard';
export type SudokuGrid = readonly number[];
export type SudokuTechnique = 'naked singles' | 'hidden singles' | 'search';

export const LEVEL_RULES: Readonly<Record<SudokuLevel, { givens: number; technique: string }>> = {
  easy: { givens: 40, technique: 'direct singles' },
  medium: { givens: 32, technique: 'naked and hidden singles, then candidate elimination' },
  hard: { givens: 26, technique: 'candidate elimination and search' },
};

/** All saved Sudoku preferences must have this exact set of boolean keys. */
export interface SudokuSettings {
  checkGuesses: boolean;
  autoCandidates: boolean;
  showErrors: boolean;
  showTimer: boolean;
  highlightConflicts: boolean;
  highlightRowColumn: boolean;
  highlightBox: boolean;
  highlightIdentical: boolean;
  playSound: boolean;
}

export const SUDOKU_SETTINGS_KEY = 'cueory-sudoku-settings';
export const DEFAULT_SUDOKU_SETTINGS: Readonly<SudokuSettings> = Object.freeze({
  checkGuesses: true,
  autoCandidates: false,
  showErrors: true,
  showTimer: true,
  highlightConflicts: true,
  highlightRowColumn: true,
  highlightBox: true,
  highlightIdentical: true,
  playSound: true,
});

export interface SudokuSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function parseSudokuSettings(saved: string | null): SudokuSettings {
  if (!saved) return { ...DEFAULT_SUDOKU_SETTINGS };
  try {
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULT_SUDOKU_SETTINGS };
    const record = parsed as Record<string, unknown>;
    const keys = Object.keys(DEFAULT_SUDOKU_SETTINGS) as Array<keyof SudokuSettings>;
    // An incomplete, obsolete or malformed record resets completely instead of mixing old and new preferences.
    if (Object.keys(record).length !== keys.length || keys.some((key) => typeof record[key] !== 'boolean')) {
      return { ...DEFAULT_SUDOKU_SETTINGS };
    }
    return Object.fromEntries(keys.map((key) => [key, record[key]])) as unknown as SudokuSettings;
  } catch {
    return { ...DEFAULT_SUDOKU_SETTINGS };
  }
}

export function loadSudokuSettings(storage: Pick<SudokuSettingsStorage, 'getItem'> | undefined): SudokuSettings {
  try {
    return parseSudokuSettings(storage?.getItem(SUDOKU_SETTINGS_KEY) ?? null);
  } catch {
    return { ...DEFAULT_SUDOKU_SETTINGS };
  }
}

export function saveSudokuSettings(storage: Pick<SudokuSettingsStorage, 'setItem'> | undefined, settings: SudokuSettings): void {
  try {
    storage?.setItem(SUDOKU_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Persistence is optional. A blocked storage API must never stop play.
  }
}

/**
 * A paused board shows no numbers at all, givens included, so nothing can be worked on while the clock is stopped
 * (Christian's sudoku brief). Student data stays untouched in memory and comes back on resume.
 */
export interface SudokuCellPresentation {
  given: boolean;
  value: number;
  marked: boolean;
  hidden: boolean;
}
export function sudokuCellPresentation(
  entries: SudokuGrid, puzzle: SudokuGrid, marks: ReadonlySet<number>, index: number, paused: boolean,
): SudokuCellPresentation {
  const given = puzzle[index] !== 0;
  if (paused) return { given, value: 0, marked: false, hidden: true };
  return { given, value: entries[index] ?? 0, marked: !given && marks.has(index), hidden: false };
}

/** The clock counts only active play. */
export function advanceSudokuSeconds(seconds: number, paused: boolean, solved: boolean): number {
  return paused || solved ? seconds : seconds + 1;
}

export type SudokuEdit = { kind: 'enter'; value: number } | { kind: 'mark' };
export type SudokuKeyAction = SudokuEdit | { kind: 'select'; index: number } | { kind: 'clear' } | { kind: 'toggle-mode' };

/**
 * Arrow keys stop at the board edges, rather than wrapping to another row or column. Space switches between normal
 * and candidate (Pencil) mode; Backspace and Delete clear the square; x toggles the x mark. With Shift held a number key gives
 * a symbol on most layouts, so the physical key (`code`, Digit1 or Numpad1) still names the number.
 */
export function sudokuKeyAction(key: string, selected: number, code = ''): SudokuKeyAction | undefined {
  if (!Number.isInteger(selected) || selected < 0 || selected >= 81) return;
  const row = Math.floor(selected / 9);
  const column = selected % 9;
  if (key === 'ArrowUp') return { kind: 'select', index: row > 0 ? selected - 9 : selected };
  if (key === 'ArrowDown') return { kind: 'select', index: row < 8 ? selected + 9 : selected };
  if (key === 'ArrowLeft') return { kind: 'select', index: column > 0 ? selected - 1 : selected };
  if (key === 'ArrowRight') return { kind: 'select', index: column < 8 ? selected + 1 : selected };
  if (/^[1-9]$/.test(key)) return { kind: 'enter', value: Number(key) };
  const physical = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (physical) return { kind: 'enter', value: Number(physical[1]) };
  if (key === ' ' || key === 'Spacebar') return { kind: 'toggle-mode' };
  if (key === 'Backspace' || key === 'Delete') return { kind: 'clear' };
  if (key === 'x' || key === 'X') return { kind: 'mark' };
}

/** Keyboard and on-screen pad use the same pure editing rules. Given squares cannot be changed. */
export function applySudokuEdit(
  entries: SudokuGrid,
  givens: SudokuGrid,
  marks: ReadonlySet<number>,
  index: number,
  action: SudokuEdit,
): { entries: number[]; marks: Set<number>; markRemoved: boolean | null } | undefined {
  if (entries.length !== 81 || givens.length !== 81 || !Number.isInteger(index) || index < 0 || index >= 81 || givens[index]) return;
  const nextEntries = [...entries];
  const nextMarks = new Set(marks);
  if (action.kind === 'enter') {
    if (!Number.isInteger(action.value) || action.value < 1 || action.value > 9) return;
    nextEntries[index] = action.value;
    nextMarks.delete(index);
    return { entries: nextEntries, marks: nextMarks, markRemoved: null };
  }
  const markRemoved = nextMarks.has(index);
  nextEntries[index] = 0;
  if (markRemoved) nextMarks.delete(index);
  else nextMarks.add(index);
  return { entries: nextEntries, marks: nextMarks, markRemoved };
}

const SIZE = 9;
const CELLS = SIZE * SIZE;
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function readGrid(text: string): number[] {
  const values = [...text.replace(/\s/g, '')].map(Number);
  if (values.length !== CELLS || values.some((value) => !Number.isInteger(value) || value < 0 || value > 9)) {
    throw new Error('Sudoku template must contain 81 digits.');
  }
  return values;
}

const STANDARD_SOLUTION = readGrid(`
534678912
672195348
198342567
859761423
426853791
713924856
961537284
287419635
345286179`);

const STANDARD_PUZZLE = readGrid(`
530070000
600195000
098000060
800060003
400803001
700020006
060000280
000419005
000080079`);

const MEDIUM_PUZZLE = readGrid(`
534600000
000095340
198000500
809701420
406050090
000020000
001500000
080419000
340000070`);

const HARD_SOLUTION = readGrid(`
693784512
487512936
125963874
932651487
568247391
741398625
319475268
856129743
274836159`);

const HARD_PUZZLE = readGrid(`
093700000
007000906
000063070
030051000
060000001
700000000
000005208
050109000
074030150`);

function withAddedGivens(puzzle: number[], solution: number[], indices: readonly number[]): number[] {
  const next = [...puzzle];
  for (const index of indices) next[index] = solution[index]!;
  return next;
}

const TEMPLATES: Readonly<Record<SudokuLevel, { puzzle: number[]; solution: number[] }>> = {
  easy: {
    puzzle: withAddedGivens(STANDARD_PUZZLE, STANDARD_SOLUTION, [2, 3, 5, 6, 7, 8, 10, 11, 15, 16]),
    solution: STANDARD_SOLUTION,
  },
  medium: {
    puzzle: MEDIUM_PUZZLE,
    solution: STANDARD_SOLUTION,
  },
  hard: {
    puzzle: HARD_PUZZLE,
    solution: HARD_SOLUTION,
  },
};

function hash(text: string): number {
  let value = 2166136261;
  for (const character of text) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function random(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(values: readonly T[], next: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(next() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

function transform(template: SudokuGrid, seed: string): number[] {
  const next = random(hash(seed));
  const digitOrder = shuffle(DIGITS, next);
  const digitMap = [0, ...digitOrder];
  const rowBands = shuffle([0, 1, 2], next);
  const rows = rowBands.flatMap((band) => shuffle([0, 1, 2], next).map((row) => band * 3 + row));
  const columnStacks = shuffle([0, 1, 2], next);
  const columns = columnStacks.flatMap((stack) => shuffle([0, 1, 2], next).map((column) => stack * 3 + column));
  const transpose = next() >= 0.5;
  const result = Array<number>(CELLS).fill(0);
  for (let row = 0; row < SIZE; row++) {
    for (let column = 0; column < SIZE; column++) {
      const sourceRow = transpose ? rows[column]! : rows[row]!;
      const sourceColumn = transpose ? columns[row]! : columns[column]!;
      result[row * SIZE + column] = digitMap[template[sourceRow * SIZE + sourceColumn]!]!;
    }
  }
  return result;
}

export interface SudokuPuzzle {
  level: SudokuLevel;
  seed: string;
  puzzle: number[];
  solution: number[];
  givens: number;
  technique: SudokuTechnique;
}

export function generateSudoku(seed: string, level: SudokuLevel): SudokuPuzzle {
  const template = TEMPLATES[level];
  const puzzle = transform(template.puzzle, `${seed}:${level}`);
  const solution = transform(template.solution, `${seed}:${level}`);
  return {
    level,
    seed,
    puzzle,
    solution,
    givens: puzzle.filter(Boolean).length,
    technique: solvingTechnique(puzzle),
  };
}

export function dailySudokuSeed(day: string, level: SudokuLevel): string {
  return `cueory-sudoku:${day}:${level}`;
}

function peers(index: number): number[] {
  const row = Math.floor(index / SIZE);
  const column = index % SIZE;
  const boxRow = Math.floor(row / 3) * 3;
  const boxColumn = Math.floor(column / 3) * 3;
  const values = new Set<number>();
  for (let offset = 0; offset < SIZE; offset++) {
    values.add(row * SIZE + offset);
    values.add(offset * SIZE + column);
  }
  for (let rowOffset = 0; rowOffset < 3; rowOffset++) {
    for (let columnOffset = 0; columnOffset < 3; columnOffset++) {
      values.add((boxRow + rowOffset) * SIZE + boxColumn + columnOffset);
    }
  }
  values.delete(index);
  return [...values];
}

export function candidates(grid: SudokuGrid, index: number): number[] {
  if (grid.length !== CELLS || index < 0 || index >= CELLS || grid[index]) return [];
  const used = new Set(peers(index).map((peer) => grid[peer]).filter(Boolean));
  return DIGITS.filter((digit) => !used.has(digit));
}

export function conflictIndices(grid: SudokuGrid): number[] {
  if (grid.length !== CELLS) return [];
  const conflicts = new Set<number>();
  for (let index = 0; index < CELLS; index++) {
    const value = grid[index];
    if (!value) continue;
    for (const peer of peers(index)) {
      if (grid[peer] === value) {
        conflicts.add(index);
        conflicts.add(peer);
      }
    }
  }
  return [...conflicts].sort((a, b) => a - b);
}

export function isCompleteAndValid(grid: SudokuGrid): boolean {
  return grid.length === CELLS && grid.every((value) => value >= 1 && value <= 9) && conflictIndices(grid).length === 0;
}

function bestEmpty(grid: number[]): { index: number; values: number[] } | undefined {
  let best: { index: number; values: number[] } | undefined;
  for (let index = 0; index < CELLS; index++) {
    if (grid[index]) continue;
    const values = candidates(grid, index);
    if (values.length === 0) return { index, values };
    if (!best || values.length < best.values.length) best = { index, values };
    if (values.length === 1) break;
  }
  return best;
}

export function solveSudoku(input: SudokuGrid): number[] | undefined {
  if (input.length !== CELLS || input.some((value) => !Number.isInteger(value) || value < 0 || value > 9) || conflictIndices(input).length) return;
  const grid = [...input];
  const visit = (): boolean => {
    const empty = bestEmpty(grid);
    if (!empty) return true;
    for (const value of empty.values) {
      grid[empty.index] = value;
      if (visit()) return true;
    }
    grid[empty.index] = 0;
    return false;
  };
  return visit() ? grid : undefined;
}

export function countSolutions(input: SudokuGrid, limit = 2): number {
  if (input.length !== CELLS || conflictIndices(input).length) return 0;
  const grid = [...input];
  let count = 0;
  const visit = () => {
    if (count >= limit) return;
    const empty = bestEmpty(grid);
    if (!empty) {
      count++;
      return;
    }
    for (const value of empty.values) {
      grid[empty.index] = value;
      visit();
      if (count >= limit) break;
    }
    grid[empty.index] = 0;
  };
  visit();
  return count;
}

function singlesSolve(input: SudokuGrid, hidden: boolean): boolean {
  const grid = [...input];
  while (true) {
    let changed = false;
    for (let index = 0; index < CELLS; index++) {
      if (grid[index]) continue;
      const values = candidates(grid, index);
      if (values.length === 0) return false;
      if (values.length === 1) {
        grid[index] = values[0]!;
        changed = true;
      }
    }
    if (changed) continue;
    if (!hidden) break;
    const units: number[][] = [];
    for (let row = 0; row < SIZE; row++) units.push(Array.from({ length: SIZE }, (_, column) => row * SIZE + column));
    for (let column = 0; column < SIZE; column++) units.push(Array.from({ length: SIZE }, (_, row) => row * SIZE + column));
    for (let boxRow = 0; boxRow < 3; boxRow++) {
      for (let boxColumn = 0; boxColumn < 3; boxColumn++) {
        units.push(Array.from({ length: SIZE }, (_, offset) => (boxRow * 3 + Math.floor(offset / 3)) * SIZE + boxColumn * 3 + (offset % 3)));
      }
    }
    for (const unit of units) {
      for (const digit of DIGITS) {
        const cells = unit.filter((index) => !grid[index] && candidates(grid, index).includes(digit));
        if (cells.length === 1) {
          grid[cells[0]!] = digit;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return isCompleteAndValid(grid);
}

export function solvingTechnique(grid: SudokuGrid): SudokuTechnique {
  if (singlesSolve(grid, false)) return 'naked singles';
  if (singlesSolve(grid, true)) return 'hidden singles';
  return 'search';
}

export interface SudokuResult {
  game: 'sudoku';
  day: string;
  level: SudokuLevel;
  solved: boolean;
  seconds: number;
  time: string;
  errors: number;
}

export function getResult(input: {
  day: string;
  level: SudokuLevel;
  solved: boolean;
  seconds: number;
  errors: number;
}): SudokuResult {
  const minutes = Math.floor(input.seconds / 60);
  const seconds = input.seconds % 60;
  return {
    game: 'sudoku',
    day: input.day,
    level: input.level,
    solved: input.solved,
    seconds: input.seconds,
    time: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    errors: input.errors,
  };
}

/* ---------- Parity play tools (#720): levels, modes, candidates, undo, check, validator ---------- */

/** What each level is called on screen. The stored id stays `medium` so seeds and saved results never change. */
export const LEVEL_LABELS: Readonly<Record<SudokuLevel, string>> = { easy: 'easy', medium: 'medium', hard: 'hard' };

/**
 * The event /play's daily status listens for (PR #761): sent once, on the player's first move of the day, so the list
 * can say sudoku is in progress. Only the game id and the day; nothing is stored.
 */
export const GAME_PROGRESS_EVENT = 'cueory:game-progress';
export function sudokuProgressDetail(day: string): { game: 'triage'; day: string } {
  return { game: 'triage', day };
}

/** Normal places a number; candidate toggles a small pencil note. */
export type SudokuMode = 'normal' | 'candidate';

/** Holding Shift flips the chosen mode for as long as it is held. */
export function effectiveSudokuMode(mode: SudokuMode, shiftHeld: boolean): SudokuMode {
  if (!shiftHeld) return mode;
  return mode === 'normal' ? 'candidate' : 'normal';
}

/**
 * One board's player state. `notes` holds each square's candidates as a bit mask (bit 0 is 1, bit 8 is 9) so a
 * snapshot for undo is a plain copy.
 */
export interface SudokuBoard {
  entries: number[];
  notes: number[];
  marks: Set<number>;
}

export function newSudokuBoard(puzzle: SudokuGrid): SudokuBoard {
  return { entries: [...puzzle], notes: Array<number>(CELLS).fill(0), marks: new Set() };
}

const bit = (digit: number) => 1 << (digit - 1);

/** The digits in a candidate mask, smallest first. */
export function noteDigits(mask: number): number[] {
  return DIGITS.filter((digit) => (mask & bit(digit)) !== 0);
}

/** Every empty square gets all the numbers that don't clash in its row, column and box. */
export function autoCandidateNotes(entries: SudokuGrid): number[] {
  return Array.from({ length: CELLS }, (_, index) =>
    entries[index] ? 0 : candidates(entries, index).reduce((mask, digit) => mask | bit(digit), 0));
}

export type SudokuBoardAction =
  | { kind: 'enter'; value: number }
  | { kind: 'note'; value: number }
  | { kind: 'clear' }
  | { kind: 'mark' };

/**
 * The one editing rule for keyboard, number pad and buttons. Given squares never change. Returns undefined when the
 * action changes nothing, so it is never pushed to the undo history.
 * - enter: places the number, clearing that square's notes and mark; with auto candidates on it also removes the
 *   number from the notes of every square in the same row, column and box.
 * - note: toggles one candidate on an empty square.
 * - clear: empties the square (number, notes and mark).
 * - mark: toggles the x mark, which also empties the square.
 */
export function editSudokuBoard(
  board: SudokuBoard, givens: SudokuGrid, index: number, action: SudokuBoardAction, autoCandidates = false,
): SudokuBoard | undefined {
  if (board.entries.length !== CELLS || board.notes.length !== CELLS || givens.length !== CELLS) return;
  if (!Number.isInteger(index) || index < 0 || index >= CELLS || givens[index]) return;
  const digit = 'value' in action ? action.value : 0;
  if ('value' in action && (!Number.isInteger(digit) || digit < 1 || digit > 9)) return;
  const entries = [...board.entries];
  const notes = [...board.notes];
  const marks = new Set(board.marks);
  if (action.kind === 'enter') {
    if (entries[index] === digit && !marks.has(index) && notes[index] === 0) return;
    entries[index] = digit;
    notes[index] = 0;
    marks.delete(index);
    if (autoCandidates) for (const peer of peers(index)) notes[peer] = notes[peer]! & ~bit(digit);
  } else if (action.kind === 'note') {
    if (entries[index]) return;
    notes[index] = notes[index]! ^ bit(digit);
    marks.delete(index);
  } else if (action.kind === 'clear') {
    if (!entries[index] && !notes[index] && !marks.has(index)) return;
    entries[index] = 0;
    notes[index] = 0;
    marks.delete(index);
  } else {
    entries[index] = 0;
    notes[index] = 0;
    if (marks.has(index)) marks.delete(index);
    else marks.add(index);
  }
  return { entries, notes, marks };
}

/** Undo keeps at most this many earlier boards. */
export const SUDOKU_UNDO_LIMIT = 300;

export function pushSudokuHistory(history: readonly SudokuBoard[], board: SudokuBoard): SudokuBoard[] {
  const next = [...history, board];
  return next.length > SUDOKU_UNDO_LIMIT ? next.slice(next.length - SUDOKU_UNDO_LIMIT) : next;
}

export function undoSudoku(history: readonly SudokuBoard[]): { board: SudokuBoard; history: SudokuBoard[] } | undefined {
  if (history.length === 0) return;
  return { board: history[history.length - 1]!, history: history.slice(0, -1) };
}

/**
 * Squares shown as wrong: a filled, non-given square whose number isn't the answer, when guesses are checked as they
 * are entered, or when "check puzzle" looked at that square and it is still wrong.
 */
export function sudokuWrongCells(
  entries: SudokuGrid, givens: SudokuGrid, solution: SudokuGrid, checkGuesses: boolean, checked: ReadonlySet<number>,
): Set<number> {
  const wrong = new Set<number>();
  for (let index = 0; index < CELLS; index++) {
    const value = entries[index] ?? 0;
    if (!value || givens[index] || value === solution[index]) continue;
    if (checkGuesses || checked.has(index)) wrong.add(index);
  }
  return wrong;
}

/** What "check puzzle" finds: the filled squares that are wrong now, and how many squares are still empty. */
export function checkSudoku(entries: SudokuGrid, givens: SudokuGrid, solution: SudokuGrid): { wrong: number[]; empty: number } {
  const wrong: number[] = [];
  let empty = 0;
  for (let index = 0; index < CELLS; index++) {
    const value = entries[index] ?? 0;
    if (!value) empty++;
    else if (!givens[index] && value !== solution[index]) wrong.push(index);
  }
  return { wrong, empty };
}

/**
 * The puzzle validator: the givens must be a valid start, agree with the solution, the solution must be a complete
 * valid grid, and the givens must have exactly one solution, which is that solution. Returns the problems found.
 */
export function validateSudokuPuzzle(puzzle: Pick<SudokuPuzzle, 'puzzle' | 'solution'>): string[] {
  const problems: string[] = [];
  const shape = (grid: SudokuGrid) => grid.length === CELLS && grid.every((value) => Number.isInteger(value) && value >= 0 && value <= 9);
  if (!shape(puzzle.puzzle)) problems.push('givens must be 81 digits from 0 to 9.');
  if (!shape(puzzle.solution) || !isCompleteAndValid(puzzle.solution)) problems.push('solution must be a complete, valid grid.');
  if (problems.length) return problems;
  if (puzzle.puzzle.some((value, index) => value !== 0 && value !== puzzle.solution[index])) problems.push('givens must match the solution.');
  const count = countSolutions(puzzle.puzzle, 2);
  if (count !== 1) problems.push(count === 0 ? 'givens have no solution.' : 'givens have more than one solution.');
  else if (solveSudoku(puzzle.puzzle)?.some((value, index) => value !== puzzle.solution[index])) problems.push('the only solution must be the stored solution.');
  return problems;
}
