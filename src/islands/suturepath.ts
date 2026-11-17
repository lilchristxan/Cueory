import { site } from '../config/site';
import { parsePuzzle as parseSearchPuzzle, type Cell, type SuturePuzzle } from './suture';

/**
 * Word path, board format (issue #722, docs/GAMES-PARITY.md). A board of 6 columns by 8 rows where every letter belongs
 * to exactly one answer. An answer's path goes from letter to touching letter (up, down, sideways or diagonally) and may
 * turn, but never uses a cell twice. One clue names the board's theme; one answer, "the thread", names the theme itself
 * and runs from one edge of the board to the opposite edge.
 *
 * Words that are not answers (the puzzle's `extras`, 4 letters or more) earn hints: every 3 of them earn one. A hint
 * marks the letters of one unsolved answer; a second hint on that answer numbers its letters in order. No guess limit.
 */
export const PATH_ROWS = 8;
export const PATH_COLS = 6;
export const MIN_WORD = 4;
export const WORDS_PER_HINT = 3;
export const MIN_ANSWERS = 3;
export const MAX_ANSWERS = 12;
export const MAX_EXTRAS = 300;
export const MAX_CLUE = 60;

export interface PathAnswer {
  answer: string;
  path: Cell[];
  /** The one answer that names the theme and touches two opposite edges. */
  special: boolean;
}
export interface SuturePathPuzzle {
  format: 'path';
  id: string;
  sample: boolean;
  /** The theme clue for the whole board. */
  clue: string;
  grid: string[];
  /** The answers: every letter on the board belongs to exactly one. */
  words: PathAnswer[];
  /** Other words on the board, 4 letters or more, that count toward hints. */
  extras: string[];
}
export interface PathHint {
  /** Zero-based index into the puzzle's answers. */
  answer: number;
  /** A second hint on the same answer shows the order of its letters. */
  order: boolean;
}
export interface PathState {
  /** The letters picked so far, in order. */
  picked: Cell[];
  /** Answer indexes, in the order they were found. */
  found: number[];
  /** Non-answer words found, in capitals. */
  extras: string[];
  hintsUsed: number;
  /** The answer the latest hint marked, while it is unsolved. */
  hint: PathHint | null;
  /** Submitted words that were not on the list. */
  misses: number;
}
export type PathPick = 'ignored' | 'started' | 'added' | 'removed';
export type PathSubmit =
  | { kind: 'empty' }
  | { kind: 'short' }
  | { kind: 'found'; answer: number }
  | { kind: 'again'; answer: number }
  | { kind: 'elsewhere' }
  | { kind: 'extra'; word: string; earned: boolean }
  | { kind: 'extra-again'; word: string }
  | { kind: 'unknown' };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const same = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1];
const key = ([row, col]: Cell): string => `${row},${col}`;

/** Two different cells that touch: up, down, sideways or diagonally. */
export function touching(a: Cell, b: Cell): boolean {
  return !same(a, b) && Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1;
}

/** Why a path breaks the rules, or null when it is fine: in the board, each step touching the last, no cell twice. */
export function pathProblem(path: readonly Cell[], rows = PATH_ROWS, cols = PATH_COLS): string | null {
  const seen = new Set<string>();
  for (const [i, cell] of path.entries()) {
    const [row, col] = cell;
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= rows || col >= cols) return 'a path leaves the board.';
    if (seen.has(key(cell))) return 'a path uses the same letter twice.';
    seen.add(key(cell));
    if (i > 0 && !touching(path[i - 1]!, cell)) return 'each letter in a path must touch the one before it.';
  }
  return null;
}

/** Whether a path touches two opposite edges: the top and bottom rows, or the left and right columns. */
export function spansBoard(path: readonly Cell[], rows = PATH_ROWS, cols = PATH_COLS): boolean {
  const top = path.some(([row]) => row === 0);
  const bottom = path.some(([row]) => row === rows - 1);
  const left = path.some(([, col]) => col === 0);
  const right = path.some(([, col]) => col === cols - 1);
  return (top && bottom) || (left && right);
}

/** Whether a word can be traced anywhere on the board by the path rules. */
export function traceable(grid: readonly string[], word: string): boolean {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const used = new Set<string>();
  const go = (cell: Cell, i: number): boolean => {
    if (grid[cell[0]]![cell[1]] !== word[i]) return false;
    if (i === word.length - 1) return true;
    used.add(key(cell));
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const next: Cell = [cell[0] + dr, cell[1] + dc];
      if ((dr || dc) && next[0] >= 0 && next[1] >= 0 && next[0] < rows && next[1] < cols && !used.has(key(next)) && go(next, i + 1)) {
        used.delete(key(cell));
        return true;
      }
    }
    used.delete(key(cell));
    return false;
  };
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) if (go([row, col], 0)) return true;
  return false;
}

/** The content validator for the board format: size, letters, paths, full coverage and the one special answer. */
export function parsePathPuzzle(data: unknown): SuturePathPuzzle {
  if (!record(data)) throw new Error('the puzzle must be an object.');
  if (data.format !== 'path') throw new Error('a board puzzle says "format": "path".');
  if (typeof data.id !== 'string' || !data.id.trim() || data.id.length > 128) throw new Error('the puzzle needs a short id.');
  if (typeof data.sample !== 'boolean') throw new Error('the puzzle must say whether it is a sample.');
  if (typeof data.clue !== 'string' || !data.clue.trim()) throw new Error('the board needs a theme clue.');
  const clue = data.clue.trim();
  if (clue.length > MAX_CLUE) throw new Error(`the clue must be at most ${MAX_CLUE} characters.`);
  if (!Array.isArray(data.grid) || data.grid.length !== PATH_ROWS) throw new Error(`the board must have ${PATH_ROWS} rows.`);
  const grid = data.grid as unknown[];
  if (grid.some((row) => typeof row !== 'string' || row.length !== PATH_COLS)) throw new Error(`each row must have ${PATH_COLS} letters.`);
  if (grid.some((row) => !/^[A-Z]+$/.test(row as string))) throw new Error('the board must use only capital letters A to Z.');
  const rows = grid as string[];
  const list = data.words;
  if (!Array.isArray(list) || list.length < MIN_ANSWERS || list.length > MAX_ANSWERS) throw new Error(`the board must have ${MIN_ANSWERS} to ${MAX_ANSWERS} answers.`);
  const answers: PathAnswer[] = [];
  const occupied = new Set<string>();
  const words = new Set<string>();
  for (const item of list) {
    if (!record(item)) throw new Error('each answer must be an object.');
    if (typeof item.answer !== 'string' || !new RegExp(`^[A-Z]{${MIN_WORD},${PATH_ROWS * PATH_COLS}}$`).test(item.answer)) {
      throw new Error(`each answer must have at least ${MIN_WORD} capital letters.`);
    }
    if (words.has(item.answer)) throw new Error('each answer must be different.');
    words.add(item.answer);
    if (item.special !== undefined && typeof item.special !== 'boolean') throw new Error('special, when given, is true or false.');
    if (!Array.isArray(item.path) || item.path.length !== item.answer.length) throw new Error('each path must have one cell per letter.');
    const path: Cell[] = [];
    for (const cell of item.path) {
      if (!Array.isArray(cell) || cell.length !== 2 || !cell.every(Number.isInteger)) throw new Error('each path cell needs a whole-number row and column.');
      path.push([cell[0] as number, cell[1] as number]);
    }
    const problem = pathProblem(path);
    if (problem) throw new Error(problem);
    for (const cell of path) {
      if (occupied.has(key(cell))) throw new Error('two answers share a letter.');
      occupied.add(key(cell));
    }
    if (path.map(([row, col]) => rows[row]![col]).join('') !== item.answer) throw new Error('a path does not spell its answer.');
    answers.push({ answer: item.answer, path, special: item.special === true });
  }
  if (occupied.size !== PATH_ROWS * PATH_COLS) throw new Error('every letter on the board must belong to an answer.');
  const specials = answers.filter((answer) => answer.special);
  if (specials.length !== 1) throw new Error('the board needs exactly one special answer.');
  if (!spansBoard(specials[0]!.path)) throw new Error('the special answer must touch two opposite edges of the board.');
  const extras: string[] = [];
  if (data.extras !== undefined) {
    if (!Array.isArray(data.extras) || data.extras.length > MAX_EXTRAS) throw new Error(`extras, when given, is a list of at most ${MAX_EXTRAS} words.`);
    for (const word of data.extras) {
      if (typeof word !== 'string' || !new RegExp(`^[A-Z]{${MIN_WORD},${PATH_ROWS * PATH_COLS}}$`).test(word)) throw new Error(`each extra word must have at least ${MIN_WORD} capital letters.`);
      if (words.has(word)) throw new Error('an extra word must not be an answer.');
      if (extras.includes(word)) throw new Error('each extra word must be listed once.');
      if (!traceable(rows, word)) throw new Error('an extra word cannot be traced on the board.');
      extras.push(word);
    }
  }
  return { format: 'path', id: data.id, sample: data.sample, clue, grid: [...rows], words: answers, extras };
}

/** Either word path format: the board format (new, preferred) or the older straight-line word search. */
export type WordPathPuzzle = SuturePuzzle | SuturePathPuzzle;

export function isPathPuzzle(puzzle: WordPathPuzzle): puzzle is SuturePathPuzzle {
  return 'format' in puzzle && puzzle.format === 'path';
}

/** Reads a word path puzzle in either format. A file with "format": "path" is a board; one without is the older search. */
export function parseWordPath(data: unknown): WordPathPuzzle {
  if (record(data) && data.format !== undefined) {
    if (data.format !== 'path') throw new Error('the only puzzle format name is "path".');
    return parsePathPuzzle(data);
  }
  return parseSearchPuzzle(data);
}

export function startPath(): PathState {
  return { picked: [], found: [], extras: [], hintsUsed: 0, hint: null, misses: 0 };
}

export const pathDone = (state: PathState, puzzle: SuturePathPuzzle): boolean => state.found.length === puzzle.words.length;
export const hintsEarned = (state: PathState): number => Math.floor(state.extras.length / WORDS_PER_HINT);
export const hintsLeft = (state: PathState): number => Math.max(0, hintsEarned(state) - state.hintsUsed);
/** How many more extra words earn the next hint. */
export const wordsToNextHint = (state: PathState): number => WORDS_PER_HINT - (state.extras.length % WORDS_PER_HINT);
export const specialIndex = (puzzle: SuturePathPuzzle): number => puzzle.words.findIndex((answer) => answer.special);
export const specialFoundFirst = (state: PathState, puzzle: SuturePathPuzzle): boolean => state.found[0] === specialIndex(puzzle);

/** The zero-based answer a found letter belongs to, if any. */
export function foundAnswer(state: PathState, puzzle: SuturePathPuzzle, cell: Cell): number | undefined {
  return state.found.find((i) => puzzle.words[i]!.path.some((part) => same(part, cell)));
}

const onBoard = ([row, col]: Cell): boolean =>
  Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0 && row < PATH_ROWS && col < PATH_COLS;

/**
 * Pick a letter (a tap, a key press or a drag passing over it). The first letter starts a word; a letter touching the
 * last one adds to it; the letter before the last one takes the last one back (dragging back). A letter that does not
 * touch the last one starts a new word there. Found letters and letters already in the word are ignored.
 */
export function extend(state: PathState, puzzle: SuturePathPuzzle, cell: Cell): { state: PathState; outcome: PathPick } {
  if (pathDone(state, puzzle) || !onBoard(cell) || foundAnswer(state, puzzle, cell) !== undefined) return { state, outcome: 'ignored' };
  const at: Cell = [cell[0], cell[1]];
  const { picked } = state;
  if (picked.length >= 2 && same(picked[picked.length - 2]!, at)) return { state: { ...state, picked: picked.slice(0, -1) }, outcome: 'removed' };
  if (picked.some((part) => same(part, at))) return { state, outcome: 'ignored' };
  if (picked.length > 0 && touching(picked.at(-1)!, at)) return { state: { ...state, picked: [...picked, at] }, outcome: 'added' };
  return { state: { ...state, picked: [at] }, outcome: 'started' };
}

/** Take back the last letter. */
export function backspace(state: PathState): PathState {
  return state.picked.length ? { ...state, picked: state.picked.slice(0, -1) } : state;
}

export function clearPicked(state: PathState): PathState {
  return state.picked.length ? { ...state, picked: [] } : state;
}

export function pickedWord(state: PathState, puzzle: SuturePathPuzzle): string {
  return state.picked.map(([row, col]) => puzzle.grid[row]![col]).join('');
}

/** Check the picked word. The pick is always cleared afterwards. */
export function submit(state: PathState, puzzle: SuturePathPuzzle): { state: PathState; outcome: PathSubmit } {
  if (state.picked.length === 0 || pathDone(state, puzzle)) return { state, outcome: { kind: 'empty' } };
  const word = pickedWord(state, puzzle);
  const cleared: PathState = { ...state, picked: [] };
  if (word.length < MIN_WORD) return { state: cleared, outcome: { kind: 'short' } };
  const cells = new Set(state.picked.map(key));
  const index = puzzle.words.findIndex((answer) => answer.answer === word && answer.path.every((cell) => cells.has(key(cell))));
  if (index >= 0) {
    if (state.found.includes(index)) return { state: cleared, outcome: { kind: 'again', answer: index } };
    const hint = state.hint?.answer === index ? null : state.hint;
    return { state: { ...cleared, found: [...state.found, index], hint }, outcome: { kind: 'found', answer: index } };
  }
  if (puzzle.words.some((answer) => answer.answer === word)) return { state: cleared, outcome: { kind: 'elsewhere' } };
  if (puzzle.extras.includes(word)) {
    if (state.extras.includes(word)) return { state: cleared, outcome: { kind: 'extra-again', word } };
    const next = { ...cleared, extras: [...state.extras, word] };
    return { state: next, outcome: { kind: 'extra', word, earned: hintsEarned(next) > hintsEarned(state) } };
  }
  return { state: { ...cleared, misses: state.misses + 1 }, outcome: { kind: 'unknown' } };
}

/**
 * Use an earned hint. While the last hinted answer is unsolved and only marked, the hint numbers its letters in order;
 * otherwise it marks the next unsolved answer, theme answers before the special one.
 */
export function takeHint(state: PathState, puzzle: SuturePathPuzzle): PathState {
  if (hintsLeft(state) === 0 || pathDone(state, puzzle)) return state;
  if (state.hint && !state.hint.order && !state.found.includes(state.hint.answer)) {
    return { ...state, hintsUsed: state.hintsUsed + 1, hint: { answer: state.hint.answer, order: true } };
  }
  const open = puzzle.words.map((_, i) => i).filter((i) => !state.found.includes(i));
  const answer = open.find((i) => !puzzle.words[i]!.special) ?? open[0];
  if (answer === undefined) return state;
  return { ...state, hintsUsed: state.hintsUsed + 1, hint: { answer, order: false } };
}

export type CellLook = 'special' | 'theme' | 'picked' | 'hinted' | 'plain';
export interface CellView {
  look: CellLook;
  /** For a hinted answer shown in order: this letter's one-based place in it. */
  order?: number;
  /** For a picked letter: its one-based place in the word being picked. */
  step?: number;
}

export function cellView(state: PathState, puzzle: SuturePathPuzzle, cell: Cell): CellView {
  const found = foundAnswer(state, puzzle, cell);
  if (found !== undefined) return { look: puzzle.words[found]!.special ? 'special' : 'theme' };
  const step = state.picked.findIndex((part) => same(part, cell));
  if (step >= 0) return { look: 'picked', step: step + 1 };
  if (state.hint) {
    const place = puzzle.words[state.hint.answer]!.path.findIndex((part) => same(part, cell));
    if (place >= 0) return state.hint.order ? { look: 'hinted', order: place + 1 } : { look: 'hinted' };
  }
  return { look: 'plain' };
}

/** What a screen reader hears for a letter. */
export function pathCellLabel(state: PathState, puzzle: SuturePathPuzzle, cell: Cell): string {
  const [row, col] = cell;
  const base = `row ${row + 1}, column ${col + 1}, ${puzzle.grid[row]![col]}`;
  const view = cellView(state, puzzle, cell);
  const found = foundAnswer(state, puzzle, cell);
  switch (view.look) {
    case 'special': return `${base}, the thread: ${puzzle.words[found!]!.answer.toLowerCase()}`;
    case 'theme': return `${base}, theme word: ${puzzle.words[found!]!.answer.toLowerCase()}`;
    case 'picked': return `${base}, picked, letter ${view.step} of the word`;
    case 'hinted': return view.order ? `${base}, cue, letter ${view.order}` : `${base}, cue`;
    default: return base;
  }
}

/** The plain-words line after a submit. */
export function submitInWords(state: PathState, puzzle: SuturePathPuzzle, outcome: PathSubmit): string {
  const total = puzzle.words.length;
  switch (outcome.kind) {
    case 'empty': return 'pick some letters first.';
    case 'short': return `words have at least ${MIN_WORD} letters.`;
    case 'found': {
      const answer = puzzle.words[outcome.answer]!;
      const line = `${answer.special ? 'the thread' : 'theme word'}: ${answer.answer.toLowerCase()}, ${state.found.length} of ${total}.`;
      return pathDone(state, puzzle) ? `${line} board complete.` : line;
    }
    case 'again': return `you already found ${puzzle.words[outcome.answer]!.answer.toLowerCase()}.`;
    case 'elsewhere': return 'that word is an answer, but its letters run another way on this board.';
    case 'extra': {
      if (outcome.earned) return `${outcome.word.toLowerCase()} is a word, not a theme word. you earned a cue.`;
      const left = wordsToNextHint(state);
      return `${outcome.word.toLowerCase()} is a word, not a theme word. ${left} more for a cue.`;
    }
    case 'extra-again': return `you already found ${outcome.word.toLowerCase()}.`;
    default: return 'not a word on this board.';
  }
}

/** The result as one plain line: no grid of squares or symbols copied from another game. */
export function pathShareLine(state: PathState, puzzle: SuturePathPuzzle, dateLabel: string, gameName: string): string {
  const clean = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
  const place = state.found.indexOf(specialIndex(puzzle)) + 1;
  const ordinal = place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`;
  const hints = `${state.hintsUsed} ${state.hintsUsed === 1 ? 'cue' : 'cues'}`;
  return `${site.wordmarkName} ${clean(gameName)}, ${clean(dateLabel)}: found ${state.found.length} of ${puzzle.words.length} answers, the thread ${place > 0 ? ordinal : 'not yet'}, ${hints}.`;
}


/**
 * The event /play's daily status list listens for (#761): sent once, when the player finds the day's first word, so the
 * list can show word path as in progress. Detail `{ game: 'suture', day }`, day as YYYY-MM-DD in the visitor's own time
 * zone. Nothing is stored.
 */
export const GAME_PROGRESS_EVENT = 'cueory:game-progress';

/** Whether a step found the day's first word: an answer or another word that counts toward hints. */
export function firstWordFound(before: Pick<PathState, 'found' | 'extras'>, after: Pick<PathState, 'found' | 'extras'>): boolean {
  return before.found.length + before.extras.length === 0 && after.found.length + after.extras.length > 0;
}

export function announceProgress(day: string, target: EventTarget | undefined = typeof window === 'undefined' ? undefined : window): void {
  target?.dispatchEvent(new CustomEvent(GAME_PROGRESS_EVENT, { detail: { game: 'suture', day } }));
}
