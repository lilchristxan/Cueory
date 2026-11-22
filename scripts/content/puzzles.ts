/**
 * The daily-puzzle rules behind `content:check` and `content:calendar` (scripts/content/check.mjs, calendar.mjs).
 * Pure: no files and no Astro, so every rule is unit tested (tests/unit/content-puzzles.test.ts). Each finding names a
 * rule id (the broken samples in tests/fixtures/puzzles/broken/ are named after them) and says, in plain words, what is
 * wrong and what to do. The games' own checks (parsePuzzle, parseWordPath, countSolutions) run unchanged, so this can
 * never pass a puzzle the site would refuse.
 */
import { forbiddenGameWords } from '../../src/config/game-words.ts';
import { parsePuzzle, words as crosswordWords, levelSize, type CrosswordLevel } from '../../src/islands/cueword.ts';
import { dayNumber, puzzleForDay, WORD_LENGTH } from '../../src/islands/pulse.ts';
import { countSolutions, conflictIndices, dailySudokuSeed, generateSudoku, type SudokuLevel } from '../../src/islands/sudoku.ts';
import { MAX_CLUE, PATH_COLS, PATH_ROWS, parseWordPath, spansBoard } from '../../src/islands/suturepath.ts';

export type Game = 'pillo' | 'crossword' | 'sudoku' | 'word path';
export const GAMES: readonly Game[] = ['pillo', 'crossword', 'sudoku', 'word path'];

/** "problem": the puzzle can't be used as it is. "warning": worth a look, but it plays. "note": information only. */
export type Severity = 'problem' | 'warning' | 'note';
export interface Finding {
  severity: Severity;
  rule: string;
  message: string;
}

/** Folder names that say which game a file is for: the repository's inside ids and the names visitors see. */
const FOLDER_GAMES: Readonly<Record<string, Game>> = {
  pulse: 'pillo', pillo: 'pillo',
  cueword: 'crossword', crossword: 'crossword',
  suture: 'word path', 'word-path': 'word path', wordpath: 'word path', 'word path': 'word path',
  sudoku: 'sudoku',
};
/** Every folder name that marks a game. */
export const GAME_FOLDER_NAMES: readonly string[] = Object.keys(FOLDER_GAMES);
/** Folders under content/games that hold no daily puzzles. */
export const NOT_PUZZLE_FOLDERS: Readonly<Record<string, string>> = {
  triage: 'the retired sorting game',
  'hello-cards': 'hello cards (not a daily puzzle)',
  stat: 'stat (not a daily puzzle)',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Which game a file is for: the nearest folder with a game's name, otherwise the fields in the file. */
export function gameFor(relativePath: string, data: unknown): Game | undefined {
  const folders = relativePath.split(/[\\/]/).slice(0, -1).reverse();
  for (const folder of folders) {
    const name = folder.toLowerCase();
    if (Object.hasOwn(FOLDER_GAMES, name)) return FOLDER_GAMES[name];
    if (Object.hasOwn(NOT_PUZZLE_FOLDERS, name)) return undefined;
  }
  if (!isRecord(data)) return undefined;
  if (typeof data.word === 'string' && 'cue' in data) return 'pillo';
  if (isRecord(data.clues) && Array.isArray(data.grid)) return 'crossword';
  if (Array.isArray(data.words) && Array.isArray(data.grid)) return 'word path';
  if (Array.isArray(data.grid) && data.grid.length === 9 && !('clues' in data) && !('words' in data)) return 'sudoku';
  return undefined;
}

/** The fields each game reads. Anything else is probably a typo. `sample` is the public-repository label. */
const KNOWN_FIELDS: Readonly<Record<Game, readonly string[]>> = {
  pillo: ['status', 'sample', 'word', 'cue'],
  crossword: ['status', 'sample', 'level', 'grid', 'clues'],
  'word path': ['status', 'sample', 'format', 'clue', 'theme', 'grid', 'words', 'extras'],
  sudoku: ['status', 'sample', 'level', 'grid'],
};

const problem = (rule: string, message: string): Finding => ({ severity: 'problem', rule, message });
const warning = (rule: string, message: string): Finding => ({ severity: 'warning', rule, message });
const note = (rule: string, message: string): Finding => ({ severity: 'note', rule, message });
/** The games' own messages end with a full stop and start in lowercase; ours read the same way. */
const plain = (message: string) => message.replace(/\.$/, '');

/** The game's own board-size messages (parsePathPuzzle), matched whole so a longer message never counts. */
export const isBoardSizeMessage = (message: string): boolean =>
  /^(?:the board must have \d+ rows|each row must have \d+ letters)\.$/.test(message);

/** Clue limits from src/content.config.ts: a crossword clue up to 120 characters, a word path theme clue up to 60. */
export const CROSSWORD_CLUE_MAX = 120;
export const WORD_PATH_CLUE_MAX = MAX_CLUE;

function fieldFindings(game: Game, data: Record<string, unknown>): Finding[] {
  return Object.keys(data)
    .filter((key) => !KNOWN_FIELDS[game].includes(key))
    .map((key) => warning('unknown-field', `"${key}" isn't a field ${game} reads. Check its spelling, or remove it.`));
}

/** A forbidden game word anywhere in the text, as a whole word or inside one. */
export function forbiddenWordIn(text: string): string | undefined {
  const lower = text.toLowerCase();
  return forbiddenGameWords.find((word) => lower.includes(word));
}

function pilloFindings(data: Record<string, unknown>): Finding[] {
  const findings: Finding[] = [];
  const word = data.word;
  if (typeof word !== 'string') return [problem('pillo-word', 'the file has no "word". Add the five-letter word to guess.')];
  if (!new RegExp(`^[a-z]{${WORD_LENGTH}}$`).test(word)) {
    findings.push(problem('pillo-length', `the word "${word}" must be exactly ${WORD_LENGTH} lowercase letters a to z (it has ${[...word].length} characters). pillo only plays five-letter words.`));
  }
  const forbidden = forbiddenWordIn(word);
  if (forbidden) findings.push(problem('pillo-forbidden', `the word contains "${forbidden}", a name the games must never use. Pick another word.`));
  if (typeof data.cue !== 'string' || !data.cue.trim()) {
    findings.push(problem('pillo-cue', 'the file needs a "cue": one line of 1 to 120 characters (the game doesn\'t show it today, but the file needs it).'));
  } else {
    if (data.cue.length > 120) findings.push(problem('pillo-cue', `the cue is ${data.cue.length} characters; keep it to 120 or fewer.`));
    const inCue = forbiddenWordIn(data.cue);
    if (inCue) findings.push(problem('pillo-forbidden', `the cue contains "${inCue}", a name the games must never use. Reword it.`));
  }
  return findings;
}

/** Crossword answers in the grid, as the game numbers them. Empty if the grid itself is broken. */
export function crosswordAnswers(data: Record<string, unknown>): { number: number; direction: 'across' | 'down'; answer: string }[] {
  try {
    const grid = data.grid as string[];
    return crosswordWords({ id: 'check', sample: true, grid, clues: { across: [], down: [] } }).map(({ number, direction, answer }) => ({ number, direction, answer }));
  } catch {
    return [];
  }
}

function crosswordFindings(data: Record<string, unknown>, id: string): Finding[] {
  const findings: Finding[] = [];
  try {
    parsePuzzle({ id, sample: true, level: data.level, grid: data.grid, clues: data.clues });
  } catch (error) {
    findings.push(problem('crossword-rules', `${plain((error as Error).message)}.`));
  }
  if (isRecord(data.clues)) {
    for (const direction of ['across', 'down'] as const) {
      const list = data.clues[direction];
      if (!Array.isArray(list)) continue;
      for (const clue of list) {
        if (!isRecord(clue) || typeof clue.text !== 'string') continue;
        const length = clue.text.trim().length;
        const name = `${direction} clue ${typeof clue.number === 'number' ? clue.number : '?'}`;
        if (length === 0) findings.push(problem('crossword-clue-length', `${name} has no text.`));
        else if (clue.text.length > CROSSWORD_CLUE_MAX) {
          findings.push(problem('crossword-clue-length', `${name} is ${clue.text.length} characters; keep it to ${CROSSWORD_CLUE_MAX} or fewer.`));
        }
      }
    }
  }
  const seen = new Map<string, string>();
  for (const entry of Array.isArray(data.grid) && data.grid.every((row) => typeof row === 'string') ? crosswordAnswers(data) : []) {
    const name = `${entry.number} ${entry.direction}`;
    const first = seen.get(entry.answer);
    if (first) findings.push(warning('crossword-duplicate-answer', `the answer "${entry.answer}" is in the grid twice (${first} and ${name}). Use each answer once.`));
    else seen.set(entry.answer, name);
  }
  if (data.level === undefined) {
    findings.push(warning('crossword-level', 'there is no "level" (easy, mid or hard), so /play never shows this puzzle. Add one.'));
  }
  return findings;
}

const cellName = (row: number, col: number) => `row ${row + 1}, column ${col + 1}`;

function wordPathFindings(data: Record<string, unknown>, id: string): Finding[] {
  const findings: Finding[] = [];
  if (data.format !== 'path') {
    findings.push(warning('wordpath-old-format', 'this is the older word search (no "format": "path"). New boards should use the board format.'));
    try {
      parseWordPath({ id, sample: true, theme: data.theme, grid: data.grid, words: data.words });
    } catch (error) {
      findings.push(problem('wordpath-rules', `${plain((error as Error).message)}.`));
    }
    return findings;
  }
  try {
    parseWordPath({ id, sample: true, format: data.format, clue: data.clue, grid: data.grid, words: data.words, extras: data.extras });
  } catch (error) {
    findings.push(problem('wordpath-rules', `${plain((error as Error).message)}.`));
  }
  if (typeof data.clue !== 'string' || !data.clue.trim()) {
    findings.push(problem('wordpath-clue-length', 'the board needs a theme "clue" of 1 to 60 characters.'));
  } else if (data.clue.trim().length > WORD_PATH_CLUE_MAX) {
    findings.push(problem('wordpath-clue-length', `the theme clue is ${data.clue.trim().length} characters; keep it to ${WORD_PATH_CLUE_MAX} or fewer.`));
  }
  const grid = Array.isArray(data.grid) ? data.grid : [];
  const boardOk = grid.length === PATH_ROWS && grid.every((row) => typeof row === 'string' && row.length === PATH_COLS);
  if (!boardOk) findings.push(problem('wordpath-board-size', `the board must be exactly ${PATH_ROWS} rows of ${PATH_COLS} letters.`));
  const answers = Array.isArray(data.words) ? data.words.filter(isRecord) : [];
  if (boardOk) {
    const uses = Array.from({ length: PATH_ROWS }, () => Array<number>(PATH_COLS).fill(0));
    for (const answer of answers) {
      if (!Array.isArray(answer.path)) continue;
      for (const cell of answer.path) {
        if (Array.isArray(cell) && Number.isInteger(cell[0]) && Number.isInteger(cell[1]) && cell[0] >= 0 && cell[0] < PATH_ROWS && cell[1] >= 0 && cell[1] < PATH_COLS) {
          uses[cell[0]]![cell[1]]!++;
        }
      }
    }
    const unused: string[] = [];
    const twice: string[] = [];
    uses.forEach((row, r) => row.forEach((count, c) => {
      const label = `${cellName(r, c)} ("${(grid[r] as string)[c]}")`;
      if (count === 0) unused.push(label);
      if (count > 1) twice.push(label);
    }));
    if (unused.length) findings.push(problem('wordpath-every-letter-once', `${unused.length} ${unused.length === 1 ? 'letter is' : 'letters are'} in no answer: ${unused.join('; ')}. Every letter must belong to exactly one answer.`));
    if (twice.length) findings.push(problem('wordpath-every-letter-once', `${twice.length} ${twice.length === 1 ? 'letter is' : 'letters are'} in more than one answer: ${twice.join('; ')}. Every letter must belong to exactly one answer.`));
  }
  const specials = answers.filter((answer) => answer.special === true);
  if (specials.length !== 1) {
    findings.push(problem('wordpath-special', `the board needs exactly one answer with "special": true; it has ${specials.length}.`));
  } else {
    const path = specials[0]!.path;
    const cells = Array.isArray(path) ? path.filter((cell): cell is [number, number] => Array.isArray(cell) && cell.length === 2 && cell.every(Number.isInteger)) : [];
    if (!spansBoard(cells)) {
      findings.push(problem('wordpath-special-edges', `the special answer "${String(specials[0]!.answer)}" must touch two opposite edges: the top and bottom rows, or the left and right columns.`));
    }
  }
  return findings;
}

/** A sudoku file (check only): `level` and a `grid` of 9 rows of 9 characters, 1 to 9 or `.` for an empty square. */
export function sudokuDigits(grid: unknown): number[] | undefined {
  if (!Array.isArray(grid) || grid.length !== 9 || !grid.every((row) => typeof row === 'string' && /^[1-9.0]{9}$/.test(row))) return undefined;
  return grid.join('').split('').map((cell) => (cell === '.' ? 0 : Number(cell)));
}

/** What exactly-one-solution says about a board: a finding when it fails. */
export function sudokuSolutionFinding(digits: readonly number[]): Finding | undefined {
  const conflicts = conflictIndices(digits);
  if (conflicts.length) {
    const cells = conflicts.slice(0, 6).map((index) => cellName(Math.floor(index / 9), index % 9));
    return problem('sudoku-conflict', `a number repeats in a row, column or box at ${cells.join('; ')}${conflicts.length > 6 ? ' and more' : ''}.`);
  }
  const solutions = countSolutions(digits, 2);
  if (solutions === 0) return problem('sudoku-one-solution', 'this board has no solution. Check the given numbers.');
  if (solutions > 1) return problem('sudoku-one-solution', 'this board has more than one solution. Add a given number or two so only one answer works.');
  return undefined;
}

function sudokuFindings(data: Record<string, unknown>): Finding[] {
  const findings: Finding[] = [note('sudoku-no-files', 'the site doesn\'t load sudoku files today: it makes each day\'s boards itself. This file is checked, but not used.')];
  if (!['easy', 'mid', 'hard'].includes(String(data.level))) findings.push(problem('sudoku-shape', 'the "level" must be easy, mid or hard.'));
  const digits = sudokuDigits(data.grid);
  if (!digits) {
    findings.push(problem('sudoku-shape', 'the "grid" must be 9 rows of 9 characters: the numbers 1 to 9, and "." for an empty square.'));
    return findings;
  }
  const solution = sudokuSolutionFinding(digits);
  if (solution) findings.push(solution);
  return findings;
}

/**
 * Everything the game rules say about one file. `schemaMessages` are the build's own schema problems for it (the
 * command line works them out from src/content.config.ts); they come first.
 */
export function puzzleFindings(game: Game, data: unknown, id: string, schemaMessages: readonly string[] = []): Finding[] {
  if (!isRecord(data)) return [problem('not-an-object', 'the file must be one { … } object.')];
  const schema = schemaMessages.map((message) => problem('file-format', `${message}.`));
  const status = data.status;
  const label = status === undefined
    ? [problem('status', 'the file needs a "status". Samples in the repository say "sample".')]
    : [];
  const rules = game === 'pillo' ? pilloFindings(data)
    : game === 'crossword' ? crosswordFindings(data, id)
      : game === 'word path' ? wordPathFindings(data, id)
        : sudokuFindings(data);
  // A schema message or the game's own first error often says what a rule here says in more detail: keep the detail.
  const fired = new Set(rules.filter((finding) => finding.severity === 'problem').map((finding) => finding.rule));
  const covered = (finding: Finding) => {
    if (finding.rule === 'file-format') {
      return (/\bclue\b/.test(finding.message) && (fired.has('crossword-clue-length') || fired.has('wordpath-clue-length')))
        || (/\bcue\b/.test(finding.message) && fired.has('pillo-cue'))
        || (/\bword\b/.test(finding.message) && fired.has('pillo-length'));
    }
    if (finding.rule === 'wordpath-rules') {
      return (/every letter|share a letter/.test(finding.message) && fired.has('wordpath-every-letter-once'))
        || (/exactly one special/.test(finding.message) && fired.has('wordpath-special'))
        || (/opposite edges/.test(finding.message) && fired.has('wordpath-special-edges'))
        || (isBoardSizeMessage(finding.message) && fired.has('wordpath-board-size'))
        || (/clue/.test(finding.message) && fired.has('wordpath-clue-length'));
    }
    return false;
  };
  const seen = new Set<string>();
  return [...schema, ...label, ...rules, ...fieldFindings(game, data)].filter((finding) => !covered(finding)).filter((finding) => {
    const key = finding.message.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Whether any finding stops the puzzle from being used. */
export const hasProblems = (findings: readonly Finding[]) => findings.some((finding) => finding.severity === 'problem');

/** One line for a finding, in the checker's own words. */
export function findingLine(finding: Finding): string {
  const label = finding.severity === 'problem' ? 'fix' : finding.severity === 'warning' ? 'check' : 'note';
  return `${label}: ${finding.message} (rule ${finding.rule})`;
}

// ---------- the calendar ----------

/** A calendar date in the visitor's own time zone, written YYYY-MM-DD (like localDay in src/islands/gameresults.ts). */
export function isoDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Midday on a YYYY-MM-DD date, or undefined when it isn't a real date. */
export function parseDay(text: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return isoDay(date) === text ? date : undefined;
}

/** The date a file is for, from a name that starts with YYYY-MM-DD ("2026-11-20.json", "2026-11-20-easy.json"). */
export function fileDay(name: string): string | undefined {
  const base = name.split(/[\\/]/).at(-1) ?? '';
  const match = /^(\d{4}-\d{2}-\d{2})(?![\d])/.exec(base);
  return match && parseDay(match[1]!) ? match[1] : undefined;
}

export interface PuzzleFile {
  /** The path shown to Christian. */
  file: string;
  /** The entry id the site sorts by: the path inside the game's folder, without .json. */
  id: string;
  game: Game;
  data: unknown;
}

/** Calendar rows: a game, or one crossword or sudoku level. */
export interface Lane {
  name: string;
  game: Game;
  level?: CrosswordLevel;
}
export const LANES: readonly Lane[] = [
  { name: 'pillo', game: 'pillo' },
  { name: 'crossword easy', game: 'crossword', level: 'easy' },
  { name: 'crossword mid', game: 'crossword', level: 'mid' },
  { name: 'crossword hard', game: 'crossword', level: 'hard' },
  { name: 'word path', game: 'word path' },
  { name: 'sudoku easy', game: 'sudoku', level: 'easy' },
  { name: 'sudoku mid', game: 'sudoku', level: 'mid' },
  { name: 'sudoku hard', game: 'sudoku', level: 'hard' },
];
const SUDOKU_LEVEL: Readonly<Record<CrosswordLevel, SudokuLevel>> = { easy: 'easy', mid: 'medium', hard: 'hard' };

/** The answers a puzzle reveals: pillo's word, every crossword entry, every word path answer. */
export function answersOf(file: PuzzleFile): string[] {
  const data = file.data;
  if (!isRecord(data)) return [];
  if (file.game === 'pillo') return typeof data.word === 'string' ? [data.word.toUpperCase()] : [];
  if (file.game === 'crossword') return crosswordAnswers(data).map((entry) => entry.answer);
  if (file.game === 'word path') {
    return Array.isArray(data.words) ? data.words.filter(isRecord).map((word) => String(word.answer ?? '').toUpperCase()).filter(Boolean) : [];
  }
  return [];
}

/** The files that can appear in a lane, as the site picks them (pillo skips words that aren't five letters). */
function laneFiles(lane: Lane, files: readonly PuzzleFile[]): PuzzleFile[] {
  return files
    .filter((file) => file.game === lane.game && isRecord(file.data))
    .filter((file) => lane.game !== 'crossword' || (file.data as Record<string, unknown>).level === lane.level)
    .filter((file) => lane.game !== 'pillo' || new RegExp(`^[a-z]{${WORD_LENGTH}}$`).test(String((file.data as Record<string, unknown>).word)));
}

export interface CalendarDay {
  day: string;
  /** Per lane name: the files for that day (empty: missing). Sudoku lanes hold "made by the site". */
  cells: Record<string, string[]>;
}
export interface Calendar {
  from: string;
  to: string;
  days: CalendarDay[];
  /** How each lane picks its puzzles: "by date", "taking turns" or "made by the site". */
  modes: Record<string, string>;
  findings: { lane: string; finding: Finding }[];
}

/**
 * The next `count` days for every game. A lane whose files are named by date (YYYY-MM-DD…) is read by date: a day with
 * no file is missing and a day with two files is a duplicate. Otherwise it takes turns the way /play does today (files
 * sorted by name, one a day from 1 November 2026, starting again after the last). Sudoku is made by the site each day,
 * so its lanes check that every day's board has exactly one solution.
 */
export function buildCalendar(files: readonly PuzzleFile[], start: Date, count = 30): Calendar {
  const dates = Array.from({ length: count }, (_, offset) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset, 12));
  const days: CalendarDay[] = dates.map((date) => ({ day: isoDay(date), cells: {} }));
  const modes: Record<string, string> = {};
  const findings: Calendar['findings'] = [];
  const add = (lane: Lane, finding: Finding) => findings.push({ lane: lane.name, finding });

  for (const lane of LANES) {
    if (lane.game === 'sudoku') {
      modes[lane.name] = 'made by the site';
      for (const [index, date] of dates.entries()) {
        const board = generateSudoku(dailySudokuSeed(isoDay(date), SUDOKU_LEVEL[lane.level!]), SUDOKU_LEVEL[lane.level!]);
        const finding = sudokuSolutionFinding(board.puzzle);
        days[index]!.cells[lane.name] = [finding ? 'not ok' : 'ok'];
        if (finding) add(lane, { ...finding, message: `${isoDay(date)}: the site's ${lane.level} board: ${finding.message}` });
      }
      continue;
    }
    const pool = laneFiles(lane, files);
    const dated = pool.filter((file) => fileDay(file.file));
    const byDate = dated.length > 0;
    modes[lane.name] = byDate ? 'by date' : pool.length ? `taking turns (${pool.length} ${pool.length === 1 ? 'puzzle' : 'puzzles'})` : 'no puzzles';
    const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
    const missing: string[] = [];
    for (const [index, date] of dates.entries()) {
      const day = isoDay(date);
      const chosen = byDate
        ? dated.filter((file) => fileDay(file.file) === day)
        : [puzzleForDay(sorted, dayNumber(date))].filter((file): file is PuzzleFile => Boolean(file));
      days[index]!.cells[lane.name] = chosen.map((file) => file.file);
      if (chosen.length === 0) missing.push(day);
      if (chosen.length > 1) add(lane, problem('duplicate-day', `${day}: ${chosen.length} puzzles for one day (${chosen.map((file) => file.file).join(', ')}). Keep one.`));
    }
    if (pool.length === 0) add(lane, problem('missing-day', `no puzzles at all, so all ${count} days are missing.`));
    else if (missing.length) add(lane, problem('missing-day', `${missing.length} ${missing.length === 1 ? 'day has' : 'days have'} no puzzle: ${missing.join(', ')}.`));
    if (!byDate && sorted.length === 1 && count > 1) {
      add(lane, warning('repeat-puzzle', `only 1 puzzle (${sorted[0]!.file}), so it shows every day. Add puzzles to cover every day.`));
    } else if (!byDate && sorted.length > 1 && sorted.length < count) {
      const back = days[sorted.length]!;
      add(lane, warning('repeat-puzzle', `only ${sorted.length} puzzles, so they take turns and repeat: ${back.cells[lane.name]![0]} comes back on ${back.day}. Add puzzles to cover every day.`));
    }
    if (byDate && dated.length < pool.length) {
      add(lane, warning('undated-file', `${pool.length - dated.length} ${pool.length - dated.length === 1 ? 'file isn\'t' : 'files aren\'t'} named by date, so the calendar leaves ${pool.length - dated.length === 1 ? 'it' : 'them'} out: ${pool.filter((file) => !fileDay(file.file)).map((file) => file.file).join(', ')}.`));
    }
  }

  // The same answer on two different days, from two different puzzles of the same game, gives the game away.
  for (const game of ['pillo', 'crossword', 'word path'] as const) {
    const seen = new Map<string, { day: string; file: string }>();
    const pairs = new Map<string, { first: { day: string; file: string }; later: { day: string; file: string }; answers: string[] }>();
    for (const day of days) {
      const shown = new Set(LANES.filter((lane) => lane.game === game).flatMap((lane) => day.cells[lane.name] ?? []));
      for (const name of shown) {
        const file = files.find((candidate) => candidate.file === name)!;
        for (const answer of new Set(answersOf(file))) {
          if (answer.length < 3) continue;
          const first = seen.get(answer);
          if (!first) {
            seen.set(answer, { day: day.day, file: name });
          } else if (first.file !== name) {
            const key = [first.file, name].sort().join('\n');
            const pair = pairs.get(key) ?? { first, later: { day: day.day, file: name }, answers: [] };
            if (!pair.answers.includes(answer)) pair.answers.push(answer);
            pairs.set(key, pair);
            seen.set(answer, { day: day.day, file: name });
          }
        }
      }
    }
    for (const { first, later, answers } of pairs.values()) {
      const list = answers.map((answer) => `"${answer}"`).join(', ');
      findings.push({
        lane: game,
        finding: warning('repeated-answer', `${answers.length === 1 ? 'the answer' : `${answers.length} answers,`} ${list}, ${answers.length === 1 ? 'is' : 'are'} used on ${first.day} (${first.file}) and again on ${later.day} (${later.file}).`),
      });
    }
  }
  return { from: days[0]!.day, to: days.at(-1)!.day, days, modes, findings };
}

/** The calendar as plain text: one table, then what to fix. */
export function calendarLines(calendar: Calendar, folder: string): string[] {
  const short = (file: string) => (file.split(/[\\/]/).at(-1) ?? file).replace(/\.json$/, '');
  const columns = LANES.map((lane) => lane.name);
  const cell = (day: CalendarDay, lane: string) => {
    const files = day.cells[lane] ?? [];
    if (files.length === 0) return 'MISSING';
    if (files.length > 1) return `${files.length} FILES`;
    return short(files[0]!);
  };
  const widths = columns.map((name) => Math.max(name.length, ...calendar.days.map((day) => cell(day, name).length)));
  const row = (first: string, values: string[]) => [first.padEnd(10), ...values.map((value, i) => value.padEnd(widths[i]!))].join('  ').trimEnd();
  const lines = [
    `puzzle calendar for ${folder}, ${calendar.from} to ${calendar.to} (${calendar.days.length} days)`,
    '',
    'how each game picks its puzzle:',
    ...columns.map((name) => `  ${name}: ${calendar.modes[name]}`),
    '',
    row('date', columns),
    ...calendar.days.map((day) => row(day.day, columns.map((name) => cell(day, name)))),
    '',
  ];
  const problems = calendar.findings.filter(({ finding }) => finding.severity === 'problem');
  const warnings = calendar.findings.filter(({ finding }) => finding.severity !== 'problem');
  if (!calendar.findings.length) {
    lines.push('every day has exactly one puzzle and no answer repeats. nothing to fix.');
    return lines;
  }
  if (problems.length) {
    lines.push(`${problems.length} ${problems.length === 1 ? 'thing' : 'things'} to fix:`);
    for (const { lane, finding } of problems) lines.push(`  ${lane}: ${finding.message}`);
  }
  if (warnings.length) {
    if (problems.length) lines.push('');
    lines.push(`${warnings.length} ${warnings.length === 1 ? 'thing' : 'things'} worth a look:`);
    for (const { lane, finding } of warnings) lines.push(`  ${lane}: ${finding.message}`);
  }
  return lines;
}

/** Sudoku level names in files and on the page (mid), and the size each crossword level needs. */
export const crosswordSize = (level: CrosswordLevel) => levelSize(level);

// ---------- the saved report ----------

export interface ReportInput {
  when: Date;
  where: string;
  files: { file: string; game?: string; findings: readonly Finding[] }[];
  skipped: number;
  otherChecked: number;
}

/**
 * content-report.txt: the same result as the screen, written for reading later or sending to Claude. Every file is
 * listed, with "ok" or a numbered list of what to fix, and the words used are explained at the top.
 */
export function reportText(input: ReportInput): string {
  const fix = input.files.filter((entry) => hasProblems(entry.findings));
  const lines = [
    'cueory puzzle check',
    `checked: ${input.where}`,
    `when: ${isoDay(input.when)} ${String(input.when.getHours()).padStart(2, '0')}:${String(input.when.getMinutes()).padStart(2, '0')}`,
    '',
    'how to read this:',
    '  ok      the file is ready to use.',
    '  fix     the game can\'t use the file until this is fixed.',
    '  check   it plays, but take a look (for example a typo in a field name).',
    '  note    information only; nothing to do.',
    '  (rule …) the name of the rule, if you want to ask Claude about it.',
    '',
    fix.length
      ? `result: ${fix.length} of ${input.files.length} ${input.files.length === 1 ? 'file needs' : 'files need'} fixing.`
      : `result: all ${input.files.length} ${input.files.length === 1 ? 'file is' : 'files are'} ok.`,
  ];
  if (input.otherChecked) lines.push(`${input.otherChecked} other content ${input.otherChecked === 1 ? 'file was' : 'files were'} checked too.`);
  if (input.skipped) lines.push(`${input.skipped} ${input.skipped === 1 ? 'file wasn\'t a puzzle and was' : 'files weren\'t puzzles and were'} skipped.`);
  lines.push('');
  for (const entry of input.files) {
    const label = entry.game ? ` (${entry.game})` : '';
    if (!entry.findings.length) {
      lines.push(`ok      ${entry.file}${label}`);
      continue;
    }
    lines.push(`${hasProblems(entry.findings) ? 'fix' : 'ok'}${hasProblems(entry.findings) ? '     ' : '      '}${entry.file}${label}`);
    entry.findings.forEach((finding, index) => {
      lines.push(`        ${index + 1}. ${finding.severity === 'problem' ? 'fix' : finding.severity === 'warning' ? 'check' : 'note'}: ${finding.message} (rule ${finding.rule})`);
    });
  }
  lines.push('');
  return lines.join('\n');
}
