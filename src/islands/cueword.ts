import { site } from '../config/site';

export type Direction = 'across' | 'down';
export type CellMark = 'right' | 'wrong' | 'empty';
export type CrosswordLevel = 'easy' | 'mid' | 'hard';
export const crosswordLevels: ReadonlyArray<{ level: CrosswordLevel; size: 5 | 7 | 15 }> = [
  { level: 'easy', size: 5 },
  { level: 'mid', size: 7 },
  { level: 'hard', size: 15 },
];

export interface CuewordPuzzle {
  id: string;
  sample: boolean;
  level?: CrosswordLevel;
  grid: string[];
  clues: { across: { number: number; text: string }[]; down: { number: number; text: string }[] };
}
export interface CuewordWord {
  number: number;
  direction: Direction;
  /** Zero-based indexes in the flattened grid, including gaps. */
  cells: number[];
  answer: string;
}
export interface CuewordState {
  puzzle: CuewordPuzzle;
  entries: string[];
  cell: number;
  direction: Direction;
  cued: number[];
  checks: (CellMark | undefined)[];
  /** Pencil entries (Task 721): tentative letters, drawn lighter and dashed. They still count toward the solve. */
  pencil: boolean[];
  /** How many times Check, Reveal or Autocheck helped with this puzzle. Any help keeps the solve out of the streak. */
  assists: number;
}
export interface CrosswordResult {
  solved: boolean;
  seconds: number;
  level: CrosswordLevel;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Standard numbering: scan starting cells left to right, top to bottom, sharing a number at crossings. */
function structure(grid: readonly string[]): { numbers: (number | null)[]; words: CuewordWord[] } {
  const width = grid[0]!.length;
  const numbers: (number | null)[] = Array(grid.length * width).fill(null);
  const found: CuewordWord[] = [];
  let next = 1;
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < width; col++) {
      if (grid[row]![col] === '.') continue;
      const across = (col === 0 || grid[row]![col - 1] === '.') && col + 1 < width && grid[row]![col + 1] !== '.';
      const down = (row === 0 || grid[row - 1]![col] === '.') && row + 1 < grid.length && grid[row + 1]![col] !== '.';
      if (!across && !down) continue;
      const number = next++;
      numbers[row * width + col] = number;
      for (const direction of ['across', 'down'] as const) {
        if (!(direction === 'across' ? across : down)) continue;
        const cells: number[] = [];
        let r = row, c = col;
        while (r < grid.length && c < width && grid[r]![c] !== '.') {
          cells.push(r * width + c);
          if (direction === 'across') c++;
          else r++;
        }
        found.push({ number, direction, cells, answer: cells.map((cell) => grid[Math.floor(cell / width)]![cell % width]).join('') });
      }
    }
  }
  found.sort((a, b) => a.direction === b.direction ? a.number - b.number : a.direction === 'across' ? -1 : 1);
  return { numbers, words: found };
}

/** Level grids use the same block pattern after a half-turn. */
export function hasRotationalSymmetry(grid: readonly string[]): boolean {
  const flat = grid.join('');
  return [...flat].every((cell, index) => (cell === '.') === (flat[flat.length - 1 - index] === '.'));
}

/** A level puzzle never contains a one- or two-letter across/down entry. */
export function hasShortEntries(grid: readonly string[]): boolean {
  const across = grid.flatMap((row) => row.split('.'));
  const width = grid[0]?.length ?? 0;
  const down = Array.from({ length: width }, (_, column) => grid.map((row) => row[column]).join('')).flatMap((column) => column.split('.'));
  return [...across, ...down].some((entry) => entry.length > 0 && entry.length < 3);
}

/** The words people read and hear for each level (Christian, 23 Nov 2026). The ids stay easy, mid and hard in saved data. */
export const crosswordLevelLabels: Readonly<Record<CrosswordLevel, string>> = { easy: 'small', mid: 'medium', hard: 'large' };

export function levelSize(level: CrosswordLevel): 5 | 7 | 15 {
  return crosswordLevels.find((option) => option.level === level)!.size;
}

function isLevel(value: unknown): value is CrosswordLevel {
  return value === 'easy' || value === 'mid' || value === 'hard';
}

export function parsePuzzle(data: unknown): CuewordPuzzle {
  if (!record(data)) throw new Error('the puzzle must be an object.');
  if (typeof data.id !== 'string' || !data.id.trim() || data.id.length > 128) throw new Error('the puzzle needs a short id.');
  if (typeof data.sample !== 'boolean') throw new Error('the puzzle must say whether it is a sample.');
  if (data.level !== undefined && !isLevel(data.level)) throw new Error('the crossword level must be easy, mid or hard.');
  if (!Array.isArray(data.grid) || data.grid.length < 3 || data.grid.length > 15) throw new Error('the grid must have 3 to 15 rows.');
  const grid = data.grid;
  if (grid.some((row) => typeof row !== 'string' || row.length < 3 || row.length > 15)) throw new Error('each row must have 3 to 15 cells.');
  if (grid.some((row) => row.length !== grid[0].length)) throw new Error('the grid rows must have equal lengths.');
  if (grid.some((row) => !/^[A-Z.]+$/.test(row))) throw new Error('use a to z in uppercase, or a dot for a gap.');
  if (data.level !== undefined) {
    const expected = levelSize(data.level);
    if (grid.length !== expected || grid[0]!.length !== expected) throw new Error(data.level + ' crosswords must be ' + expected + ' by ' + expected + '.');
    if (!hasRotationalSymmetry(grid)) throw new Error('level crossword blocks must have rotational symmetry.');
    if (hasShortEntries(grid)) throw new Error('level crosswords cannot contain one- or two-letter entries.');
  }
  const { words: found } = structure(grid);
  const covered = new Set(found.flatMap((word) => word.cells));
  const letters = grid.join('');
  if (!covered.size) throw new Error('the grid must contain a word of at least two letters.');
  if ([...letters].some((letter, cell) => letter !== '.' && !covered.has(cell))) throw new Error('a one-letter run must cross a word in the other direction.');
  if (!record(data.clues)) throw new Error('the puzzle needs across and down clues.');
  const clues: CuewordPuzzle['clues'] = { across: [], down: [] };
  for (const direction of ['across', 'down'] as const) {
    const items = data.clues[direction];
    if (!Array.isArray(items) || items.length > 49) throw new Error('the ' + direction + ' clues must be a list.');
    const expected = new Set(found.filter((word) => word.direction === direction).map((word) => word.number));
    const seen = new Set<number>();
    for (const item of items) {
      if (!record(item) || !Number.isInteger(item.number) || typeof item.number !== 'number' || item.number < 1) throw new Error('each ' + direction + ' clue needs a whole-number label.');
      if (typeof item.text !== 'string' || !item.text.trim() || item.text.length > 500) throw new Error('each clue needs short, nonempty text.');
      if (!expected.has(item.number)) throw new Error('an extra ' + direction + ' clue has no word with that number.');
      if (seen.has(item.number)) throw new Error('a ' + direction + ' word has more than one clue.');
      seen.add(item.number);
      clues[direction].push({ number: item.number, text: item.text.trim() });
    }
    if (seen.size !== expected.size) throw new Error('a ' + direction + ' word is missing its clue.');
  }
  return { id: data.id, sample: data.sample, ...(data.level ? { level: data.level } : {}), grid: [...grid], clues };
}

export function numbering(puzzle: CuewordPuzzle): (number | null)[][] {
  const flat = structure(puzzle.grid).numbers;
  const width = puzzle.grid[0]!.length;
  return puzzle.grid.map((_, row) => flat.slice(row * width, (row + 1) * width));
}
export function words(puzzle: CuewordPuzzle): CuewordWord[] { return structure(puzzle.grid).words; }
function playable(state: CuewordState, cell: number): boolean { return Number.isInteger(cell) && cell >= 0 && cell < state.entries.length && state.puzzle.grid.join('')[cell] !== '.'; }
export function currentWord(state: CuewordState): CuewordWord { return words(state.puzzle).find((word) => word.direction === state.direction && word.cells.includes(state.cell))!; }
export function selectCell(state: CuewordState, cell: number, direction = state.direction): CuewordState {
  if (!playable(state, cell)) return state;
  const options = words(state.puzzle).filter((word) => word.cells.includes(cell));
  return { ...state, cell, direction: options.find((word) => word.direction === direction)?.direction ?? options[0]!.direction };
}
export function selectOrToggleCell(state: CuewordState, cell: number): CuewordState { return cell === state.cell ? toggleDirection(state) : selectCell(state, cell); }
export function emptyState(puzzle: CuewordPuzzle): CuewordState {
  const parsed = parsePuzzle(puzzle);
  const first = words(parsed)[0]!;
  const count = parsed.grid.length * parsed.grid[0]!.length;
  return { puzzle: parsed, entries: Array(count).fill(''), cell: first.cells[0]!, direction: first.direction, cued: [], checks: Array(count).fill(undefined), pencil: Array(count).fill(false), assists: 0 };
}
function step(state: CuewordState, direction: Direction, delta: -1 | 1): CuewordState {
  const width = state.puzzle.grid[0]!.length;
  let row = Math.floor(state.cell / width), col = state.cell % width;
  while (true) {
    if (direction === 'across') col += delta; else row += delta;
    if (row < 0 || col < 0 || row >= state.puzzle.grid.length || col >= width) return state;
    const cell = row * width + col;
    if (playable(state, cell)) return selectCell(state, cell, direction);
  }
}
export function type(state: CuewordState, letter: string): CuewordState {
  if (!/^[a-z]$/i.test(letter) || isSolved(state)) return state;
  let at = state;
  while (at.cued.includes(at.cell)) {
    const next = step(at, at.direction, 1);
    if (next.cell === at.cell) return state;
    at = next;
  }
  const entries = [...at.entries], checks = [...at.checks];
  entries[at.cell] = letter.toUpperCase(); checks[at.cell] = undefined;
  return step({ ...at, entries, checks }, at.direction, 1);
}
export function erase(state: CuewordState): CuewordState {
  if (isSolved(state)) return state;
  const entries = [...state.entries], checks = [...state.checks];
  if (!state.cued.includes(state.cell)) { entries[state.cell] = ''; checks[state.cell] = undefined; }
  return step({ ...state, entries, checks }, state.direction, -1);
}
export function move(state: CuewordState, key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'): CuewordState {
  return step(state, key === 'ArrowLeft' || key === 'ArrowRight' ? 'across' : 'down', key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1);
}
export function toggleDirection(state: CuewordState): CuewordState { return selectCell(state, state.cell, state.direction === 'across' ? 'down' : 'across'); }
function changeWord(state: CuewordState, delta: -1 | 1): CuewordState {
  const list = words(state.puzzle), word = currentWord(state);
  const index = list.findIndex((candidate) => candidate.number === word.number && candidate.direction === word.direction);
  const next = list[(index + delta + list.length) % list.length]!;
  return selectCell(state, next.cells[0]!, next.direction);
}
export const nextWord = (state: CuewordState): CuewordState => changeWord(state, 1);
export const previousWord = (state: CuewordState): CuewordState => changeWord(state, -1);
function mark(state: CuewordState, cell: number): CellMark {
  const answer = state.puzzle.grid.join('')[cell];
  return !state.entries[cell] ? 'empty' : state.entries[cell] === answer ? 'right' : 'wrong';
}
export function checkWord(state: CuewordState, word = currentWord(state)): CuewordState {
  const checks = [...state.checks]; for (const cell of word.cells) checks[cell] = mark(state, cell); return { ...state, checks };
}
export function checkAll(state: CuewordState): CuewordState { return { ...state, checks: state.entries.map((_, cell) => playable(state, cell) ? mark(state, cell) : undefined) }; }
export function isSolved(state: CuewordState): boolean { return [...state.puzzle.grid.join('')].every((answer, cell) => answer === '.' || state.entries[cell] === answer); }
export function revealCue(state: CuewordState, cell: number): CuewordState {
  if (!playable(state, cell) || state.cued.length >= 3 || state.cued.includes(cell) || isSolved(state)) return state;
  const entries = [...state.entries], checks = [...state.checks]; entries[cell] = state.puzzle.grid.join('')[cell]!; checks[cell] = 'right';
  return { ...state, entries, checks, cued: [...state.cued, cell] };
}
export function getResult(state: CuewordState, seconds: number): CrosswordResult {
  return { solved: isSolved(state), seconds: Math.max(0, Math.floor(seconds)), level: state.puzzle.level ?? 'easy' };
}
export function shareLine(result: { solved: boolean; seconds: number; cues: number }, dateLabel: string, gameName: string): string {
  const seconds = Math.max(0, Math.floor(result.seconds));
  const time = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  const day = dateLabel.replace(/\s+/g, ' ').trim().toLowerCase();
  const name = gameName.replace(/\s+/g, ' ').trim().toLowerCase();
  return site.wordmarkName + ' ' + name + ', ' + day + ': ' + (result.solved ? 'solved in ' + time : 'not solved this time') + ' with ' + result.cues + ' ' + (result.cues === 1 ? 'cue' : 'cues') + '.';
}

/* ── Task 721: crossword parity (docs/GAMES-PARITY.md, crossword section) ─────────────────────────────────────────── */

export type HelpScope = 'square' | 'word' | 'puzzle';

/** Cursor and display settings, kept in this browser under CROSSWORD_SETTINGS_KEY. */
export interface CrosswordSettings {
  /** Check each letter as it is typed. Counts as help, so a solve with it on doesn't count toward the streak. */
  autocheck: boolean;
  /** While typing, skip squares that already have a letter. */
  skipFilled: boolean;
  /** At the end of a word, jump back to its first blank square. */
  jumpBack: boolean;
  /** At the end of a finished word, jump to the next clue with a blank square. */
  jumpNext: boolean;
  showTimer: boolean;
  clueSize: 'small' | 'medium' | 'large';
  playSound: boolean;
}

import { CROSSWORD_SETTINGS_KEY } from './cuewordkeys';
export { CROSSWORD_SETTINGS_KEY };
export const DEFAULT_CROSSWORD_SETTINGS: Readonly<CrosswordSettings> = Object.freeze({
  autocheck: false,
  skipFilled: true,
  jumpBack: false,
  jumpNext: true,
  showTimer: true,
  clueSize: 'medium',
  playSound: true,
});
const CLUE_SIZES: readonly CrosswordSettings['clueSize'][] = ['small', 'medium', 'large'];

/** A saved record that is incomplete, old or malformed resets to the defaults instead of mixing values. */
export function parseCrosswordSettings(saved: string | null): CrosswordSettings {
  if (!saved) return { ...DEFAULT_CROSSWORD_SETTINGS };
  try {
    const value: unknown = JSON.parse(saved);
    if (!record(value)) return { ...DEFAULT_CROSSWORD_SETTINGS };
    const keys = Object.keys(DEFAULT_CROSSWORD_SETTINGS) as (keyof CrosswordSettings)[];
    if (Object.keys(value).length !== keys.length) return { ...DEFAULT_CROSSWORD_SETTINGS };
    for (const key of keys) {
      const ok = key === 'clueSize' ? CLUE_SIZES.includes(value[key] as CrosswordSettings['clueSize']) : typeof value[key] === 'boolean';
      if (!ok) return { ...DEFAULT_CROSSWORD_SETTINGS };
    }
    return Object.fromEntries(keys.map((key) => [key, value[key]])) as unknown as CrosswordSettings;
  } catch {
    return { ...DEFAULT_CROSSWORD_SETTINGS };
  }
}

interface SettingsStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function loadCrosswordSettings(storage: Pick<SettingsStorage, 'getItem'> | undefined): CrosswordSettings {
  try { return parseCrosswordSettings(storage?.getItem(CROSSWORD_SETTINGS_KEY) ?? null); } catch { return { ...DEFAULT_CROSSWORD_SETTINGS }; }
}
export function saveCrosswordSettings(storage: Pick<SettingsStorage, 'setItem'> | undefined, settings: CrosswordSettings): void {
  try { storage?.setItem(CROSSWORD_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Saving is optional; play goes on. */ }
}

const answerAt = (state: CuewordState, cell: number) => state.puzzle.grid.join('')[cell]!;
/** Revealed squares and squares that a check confirmed can't be changed. */
export function isLocked(state: CuewordState, cell: number): boolean { return state.cued.includes(cell) || state.checks[cell] === 'right'; }
/** Every square has a letter. */
export function isFilled(state: CuewordState): boolean { return [...state.puzzle.grid.join('')].every((answer, cell) => answer === '.' || state.entries[cell] !== ''); }
/** Every square is filled but at least one letter is wrong: the game says "something's not right yet". */
export function isFilledWrong(state: CuewordState): boolean { return isFilled(state) && !isSolved(state); }

function wordList(state: CuewordState): CuewordWord[] { return words(state.puzzle); }
function firstBlank(state: CuewordState, word: CuewordWord): number | undefined { return word.cells.find((cell) => state.entries[cell] === '' && !isLocked(state, cell)); }

/** The next (or previous) clue in reading order, landing on its first blank square, or its first square when full. */
export function moveClue(state: CuewordState, delta: -1 | 1): CuewordState {
  const list = wordList(state), word = currentWord(state);
  const index = list.findIndex((candidate) => candidate.number === word.number && candidate.direction === word.direction);
  const next = list[(index + delta + list.length) % list.length]!;
  return selectCell(state, firstBlank(state, next) ?? next.cells[0]!, next.direction);
}

/**
 * Tab on the last clue, or Shift+Tab on the first, leaves the grid to the next or previous control instead of
 * wrapping round, so the grid is never a keyboard trap (WCAG 2.1.2). Escape leaves too.
 */
export function clueLeavesGrid(state: CuewordState, delta: -1 | 1): boolean {
  const list = wordList(state), word = currentWord(state);
  const index = list.findIndex((candidate) => candidate.number === word.number && candidate.direction === word.direction);
  return delta === 1 ? index === list.length - 1 : index === 0;
}

/** Where the cursor goes after a letter, by the cursor settings. */
function advance(state: CuewordState, settings: CrosswordSettings): CuewordState {
  const word = currentWord(state);
  const at = word.cells.indexOf(state.cell);
  const later = word.cells.slice(at + 1).filter((cell) => !isLocked(state, cell));
  const target = settings.skipFilled ? later.find((cell) => state.entries[cell] === '') : later[0];
  if (target !== undefined) return selectCell(state, target, state.direction);
  if (settings.jumpBack) {
    const blank = firstBlank(state, word);
    if (blank !== undefined && blank !== state.cell) return selectCell(state, blank, state.direction);
  }
  if (settings.jumpNext && firstBlank(state, word) === undefined) {
    const list = wordList(state);
    const index = list.findIndex((candidate) => candidate.number === word.number && candidate.direction === word.direction);
    for (let offset = 1; offset < list.length; offset++) {
      const next = list[(index + offset) % list.length]!;
      const blank = firstBlank(state, next);
      if (blank !== undefined) return selectCell(state, blank, next.direction);
    }
  }
  return state;
}

function marked(state: CuewordState, cell: number): CellMark { return !state.entries[cell] ? 'empty' : state.entries[cell] === answerAt(state, cell) ? 'right' : 'wrong'; }

/** Types a letter in pen or pencil, then moves the cursor by the settings. Locked squares are skipped, never changed. */
export function enter(state: CuewordState, letter: string, settings: CrosswordSettings, pencil = false): CuewordState {
  if (!/^[a-z]$/i.test(letter) || isSolved(state)) return state;
  let at = state;
  if (isLocked(at, at.cell)) {
    const word = currentWord(at);
    const open = word.cells.slice(word.cells.indexOf(at.cell) + 1).find((cell) => !isLocked(at, cell));
    if (open === undefined) return state;
    at = selectCell(at, open, at.direction);
  }
  const entries = [...at.entries], checks = [...at.checks], marks = [...at.pencil];
  entries[at.cell] = letter.toUpperCase();
  marks[at.cell] = pencil;
  checks[at.cell] = undefined;
  let next: CuewordState = { ...at, entries, checks, pencil: marks };
  if (settings.autocheck) {
    checks[at.cell] = marked(next, at.cell);
    // Autocheck counts as one use of help for the puzzle, not one per letter.
    next = { ...next, checks, assists: Math.max(next.assists, 1) };
  }
  return advance(next, settings);
}

function clear(state: CuewordState, cell: number): CuewordState {
  if (isLocked(state, cell) || state.entries[cell] === '') return state;
  const entries = [...state.entries], checks = [...state.checks], marks = [...state.pencil];
  entries[cell] = ''; checks[cell] = undefined; marks[cell] = false;
  return { ...state, entries, checks, pencil: marks };
}

/** Backspace: clears a filled square in place; on an empty square, steps back one square and clears that one. */
export function backspace(state: CuewordState): CuewordState {
  if (isSolved(state)) return state;
  if (state.entries[state.cell] !== '' && !isLocked(state, state.cell)) return clear(state, state.cell);
  const word = currentWord(state);
  const at = word.cells.indexOf(state.cell);
  if (at <= 0) return state;
  const back = selectCell(state, word.cells[at - 1]!, state.direction);
  return clear(back, back.cell);
}

/** Delete: clears the current square and stays. */
export function deleteLetter(state: CuewordState): CuewordState { return isSolved(state) ? state : clear(state, state.cell); }

/** An arrow against the current direction switches direction first, when this square has a word that way. */
export function arrow(state: CuewordState, key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'): CuewordState {
  const direction: Direction = key === 'ArrowLeft' || key === 'ArrowRight' ? 'across' : 'down';
  if (direction !== state.direction) {
    const turned = toggleDirection(state);
    if (turned.direction === direction) return turned;
  }
  return move(state, key);
}

function scopeCells(state: CuewordState, scope: HelpScope): number[] {
  if (scope === 'square') return [state.cell];
  if (scope === 'word') return currentWord(state).cells;
  return [...state.puzzle.grid.join('')].flatMap((answer, cell) => answer === '.' ? [] : [cell]);
}

/** Check: marks each letter in the square, word or puzzle right or wrong. Right letters lock. Counts as help. */
export function check(state: CuewordState, scope: HelpScope): CuewordState {
  if (isSolved(state)) return state;
  const checks = [...state.checks];
  for (const cell of scopeCells(state, scope)) if (state.entries[cell] && !state.cued.includes(cell)) checks[cell] = marked(state, cell);
  return { ...state, checks, assists: state.assists + 1 };
}

/** Reveal: fills the square, word or puzzle with the answer. Revealed letters lock and are marked. Counts as help. */
export function reveal(state: CuewordState, scope: HelpScope): CuewordState {
  if (isSolved(state)) return state;
  const entries = [...state.entries], checks = [...state.checks], marks = [...state.pencil], cued = [...state.cued];
  for (const cell of scopeCells(state, scope)) {
    if (entries[cell] === answerAt(state, cell) && checks[cell] === 'right') continue;
    if (entries[cell] !== answerAt(state, cell) && !cued.includes(cell)) cued.push(cell);
    entries[cell] = answerAt(state, cell); checks[cell] = 'right'; marks[cell] = false;
  }
  return { ...state, entries, checks, pencil: marks, cued, assists: state.assists + 1 };
}

/** Autocheck turned on mid-puzzle checks every letter already typed. */
export function autocheckAll(state: CuewordState): CuewordState {
  if (isSolved(state) || !state.entries.some(Boolean)) return state;
  return check(state, 'puzzle');
}

const HOUR = 3_600_000;
/** The local midnight that starts the puzzle's day. */
export function puzzleDayStart(day: Date): number { return new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime(); }
/** A solve counts toward the streak only without help and within 48 hours of the start of the puzzle's date. */
export function countsForStreak(puzzleDay: Date, solvedAt: number, assists: number): boolean {
  return assists === 0 && solvedAt >= puzzleDayStart(puzzleDay) && solvedAt - puzzleDayStart(puzzleDay) < 48 * HOUR;
}

/**
 * The event /play's daily status list listens for (issue #735, src/islands/playstatus.ts): sent once a day, on the
 * player's first entry, with `{ game: 'cueword', day }` (YYYY-MM-DD, local day). Nothing is stored.
 */
export const GAME_PROGRESS_EVENT = 'cueory:game-progress';
const announcedDays = new Set<string>();
/** Sends the progress event the first time it is called for `day` on this page; true when it sent it. */
export function announceFirstEntry(target: Pick<EventTarget, 'dispatchEvent'> | undefined, day: string): boolean {
  if (!target || announcedDays.has(day)) return false;
  announcedDays.add(day);
  target.dispatchEvent(new CustomEvent(GAME_PROGRESS_EVENT, { detail: { game: 'cueword', day } }));
  return true;
}
