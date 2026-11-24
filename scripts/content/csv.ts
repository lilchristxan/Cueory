/**
 * Spreadsheet sheets (CSV) to puzzle files, for scripts/content/from-csv.mjs. Pure, so it is unit tested
 * (tests/unit/content-puzzles.test.ts). Christian writes puzzles in Google Sheets, one row per clue or word, downloads
 * the sheet as CSV and turns it into the JSON the site reads. Templates: content/samples/templates/.
 *
 * The first row names the columns. A row whose first cell starts with "#" is a note and is skipped, and so is an empty
 * row. A blank `date` repeats the date of the row above, so a sheet can hold a whole week.
 */
import { levelSize, words as crosswordWords, type CrosswordLevel } from '../../src/islands/cueword.ts';
import { PATH_COLS, PATH_ROWS } from '../../src/islands/suturepath.ts';

export type SheetGame = 'pillo' | 'crossword' | 'word path';
export interface SheetRow {
  /** The row number in the spreadsheet (the header is row 1). */
  line: number;
  values: Record<string, string>;
}
export interface Sheet {
  columns: string[];
  rows: SheetRow[];
}
export interface BuiltPuzzle {
  /** File name to save, for example "2026-11-20.json", "2026-11-20-easy.json" or "sheet.json". */
  name: string;
  data: Record<string, unknown>;
}
export interface BuildResult {
  puzzles: BuiltPuzzle[];
  problems: string[];
}

/** Reads CSV text the way spreadsheets write it: quoted cells may hold commas, quotes ("") and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^﻿/, '');
  for (let index = 0; index < input.length; index++) {
    const char = input[index]!;
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** The header and the rows that hold puzzle data, with each cell trimmed and named by its column. */
export function readSheet(text: string): Sheet {
  const all = parseCsv(text);
  const header = (all[0] ?? []).map((name) => name.trim().toLowerCase());
  const rows: SheetRow[] = [];
  all.slice(1).forEach((cells, index) => {
    if (cells.every((value) => value.trim() === '')) return;
    if ((cells[0] ?? '').trim().startsWith('#')) return;
    const values: Record<string, string> = {};
    header.forEach((name, column) => {
      if (name) values[name] = (cells[column] ?? '').trim();
    });
    rows.push({ line: index + 2, values });
  });
  return { columns: header, rows };
}

/** Which game a sheet is for, from its columns. */
export function sheetGame(columns: readonly string[]): SheetGame | undefined {
  if (columns.includes('direction') && columns.includes('answer')) return 'crossword';
  if (columns.includes('type') && columns.includes('cells')) return 'word path';
  if (columns.includes('word') && columns.includes('cue')) return 'pillo';
  return undefined;
}

const REQUIRED: Readonly<Record<SheetGame, readonly string[]>> = {
  pillo: ['date', 'word', 'cue'],
  crossword: ['direction', 'row', 'column', 'answer', 'clue'],
  'word path': ['type', 'text', 'cells'],
};

/**
 * Rows grouped into puzzles by their date (a blank date repeats the row above), and for a crossword by level too (a
 * blank level also repeats the row above); one group when the sheet has no date column.
 */
function groupRows(sheet: Sheet, problems: string[], byLevel: boolean): { date?: string; rows: SheetRow[] }[] {
  if (!sheet.columns.includes('date')) return [{ rows: sheet.rows }];
  const groups = new Map<string, { date: string; rows: SheetRow[] }>();
  let current = '';
  let currentLevel = '';
  for (const row of sheet.rows) {
    const date = row.values.date || current;
    if (!date) {
      problems.push(`row ${row.line}: the date is empty. Write it as YYYY-MM-DD, for example 2026-11-20.`);
      continue;
    }
    if (!isRealDate(date)) {
      problems.push(`row ${row.line}: "${date}" isn't a date written YYYY-MM-DD, for example 2026-11-20.`);
      continue;
    }
    if (date !== current) currentLevel = '';
    current = date;
    const level = byLevel ? (row.values.level || currentLevel).toLowerCase() : '';
    currentLevel = level;
    if (byLevel && level) row.values.level = level;
    const key = `${date} ${level}`;
    const group = groups.get(key) ?? { date, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function isRealDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === text;
}

const wholeNumber = (text: string) => (/^\d{1,3}$/.test(text) ? Number(text) : undefined);

function buildPillo(sheet: Sheet, problems: string[], status: Record<string, unknown>): BuiltPuzzle[] {
  const puzzles: BuiltPuzzle[] = [];
  const dates = new Set<string>();
  for (const row of sheet.rows) {
    const { date = '', word = '', cue = '' } = row.values;
    if (!isRealDate(date)) {
      problems.push(`row ${row.line}: "${date}" isn't a date written YYYY-MM-DD, for example 2026-11-20.`);
      continue;
    }
    if (dates.has(date)) problems.push(`row ${row.line}: ${date} already has a word on an earlier row. Keep one word a day.`);
    dates.add(date);
    puzzles.push({ name: `${date}.json`, data: { ...status, word: word.toLowerCase(), cue } });
  }
  return puzzles;
}

function buildCrossword(rows: SheetRow[], problems: string[], status: Record<string, unknown>, where: string): Record<string, unknown> | undefined {
  const start = problems.length;
  const levels = [...new Set(rows.map((row) => row.values.level ?? '').filter(Boolean).map((level) => level.toLowerCase()))];
  if (levels.length > 1) problems.push(`${where}the rows name more than one level (${levels.join(', ')}). Use one level per puzzle.`);
  const level = levels[0] as CrosswordLevel | undefined;
  if (level !== undefined && !['easy', 'mid', 'hard'].includes(level)) {
    problems.push(`${where}the level "${level}" must be easy, mid or hard.`);
    return undefined;
  }
  const entries: { line: number; direction: 'across' | 'down'; row: number; col: number; answer: string; clue: string }[] = [];
  for (const row of rows) {
    const direction = (row.values.direction ?? '').toLowerCase();
    const r = wholeNumber(row.values.row ?? '');
    const c = wholeNumber(row.values.column ?? '');
    const answer = (row.values.answer ?? '').toUpperCase();
    if (direction !== 'across' && direction !== 'down') problems.push(`row ${row.line}: direction must be "across" or "down".`);
    if (!r || !c) problems.push(`row ${row.line}: row and column must be whole numbers from 1 (the top left square is row 1, column 1).`);
    if (!/^[A-Z]{2,15}$/.test(answer)) problems.push(`row ${row.line}: the answer "${row.values.answer ?? ''}" must be 2 to 15 letters A to Z, with no spaces.`);
    if ((direction === 'across' || direction === 'down') && r && c && /^[A-Z]{2,15}$/.test(answer)) {
      entries.push({ line: row.line, direction, row: r - 1, col: c - 1, answer, clue: row.values.clue ?? '' });
    }
  }
  if (problems.length > start || entries.length === 0) {
    if (entries.length === 0 && problems.length === start) problems.push(`${where}the sheet has no clue rows.`);
    return undefined;
  }
  const size = level ? levelSize(level) : undefined;
  const height = size ?? Math.max(...entries.map((entry) => entry.row + (entry.direction === 'down' ? entry.answer.length : 1)));
  const width = size ?? Math.max(...entries.map((entry) => entry.col + (entry.direction === 'across' ? entry.answer.length : 1)));
  const cells: (string | undefined)[][] = Array.from({ length: height }, () => Array<string | undefined>(width).fill(undefined));
  const owner: (number | undefined)[][] = Array.from({ length: height }, () => Array<number | undefined>(width).fill(undefined));
  for (const entry of entries) {
    [...entry.answer].forEach((letter, offset) => {
      const r = entry.row + (entry.direction === 'down' ? offset : 0);
      const c = entry.col + (entry.direction === 'across' ? offset : 0);
      if (r >= height || c >= width) {
        problems.push(`row ${entry.line}: ${entry.answer} runs off the ${height} by ${width} grid at row ${r + 1}, column ${c + 1}.`);
        return;
      }
      const there = cells[r]![c];
      if (there !== undefined && there !== letter) {
        problems.push(`row ${entry.line}: ${entry.answer} puts "${letter}" at row ${r + 1}, column ${c + 1}, but row ${owner[r]![c]} already put "${there}" there.`);
        return;
      }
      cells[r]![c] = letter;
      owner[r]![c] = entry.line;
    });
  }
  if (problems.length > start) return undefined;
  const grid = cells.map((line) => line.map((letter) => letter ?? '.').join(''));
  const found = crosswordWords({ id: 'sheet', sample: true, grid, clues: { across: [], down: [] } });
  const clues: { across: { number: number; text: string }[]; down: { number: number; text: string }[] } = { across: [], down: [] };
  const used = new Set<number>();
  for (const word of found) {
    const first = word.cells[0]!;
    const match = entries.findIndex((entry) => entry.direction === word.direction && entry.row * width + entry.col === first);
    if (match === -1 || entries[match]!.answer !== word.answer) {
      const r = Math.floor(first / width) + 1;
      const c = (first % width) + 1;
      problems.push(`${where}the letters make the word "${word.answer}" (${word.direction}, starting at row ${r}, column ${c}) but no row of the sheet is that answer. Add a row for it, or move letters apart with a gap.`);
      continue;
    }
    used.add(match);
    clues[word.direction].push({ number: word.number, text: entries[match]!.clue });
  }
  for (const [index, entry] of entries.entries()) {
    if (!used.has(index)) problems.push(`row ${entry.line}: ${entry.answer} touches other letters, so it isn't a word of its own in the grid. Check its row and column.`);
  }
  if (problems.length > start) return undefined;
  return { ...status, ...(level ? { level } : {}), grid, clues };
}

/** "1-6 2-6 3-5": row-column pairs counted from 1, separated by spaces (also accepted: "1,6; 2,6" and "r1c6"). */
export function parseCells(text: string): [number, number][] | undefined {
  const parts = text.trim().split(/[\s;]+/).filter(Boolean);
  if (!parts.length) return undefined;
  const cells: [number, number][] = [];
  for (const part of parts) {
    const match = /^r?(\d{1,2})\s*[-,c:]\s*(\d{1,2})$/i.exec(part);
    if (!match) return undefined;
    cells.push([Number(match[1]) - 1, Number(match[2]) - 1]);
  }
  return cells;
}

function buildWordPath(rows: SheetRow[], problems: string[], status: Record<string, unknown>, where: string): Record<string, unknown> | undefined {
  const start = problems.length;
  const clues = rows.filter((row) => (row.values.type ?? '').toLowerCase() === 'clue');
  if (clues.length !== 1) problems.push(`${where}the sheet needs exactly one "clue" row (the theme clue); it has ${clues.length}.`);
  const words: { answer: string; path: [number, number][]; special?: true }[] = [];
  const extras: string[] = [];
  const board: (string | undefined)[][] = Array.from({ length: PATH_ROWS }, () => Array<string | undefined>(PATH_COLS).fill(undefined));
  const owner: (number | undefined)[][] = Array.from({ length: PATH_ROWS }, () => Array<number | undefined>(PATH_COLS).fill(undefined));
  for (const row of rows) {
    const type = (row.values.type ?? '').toLowerCase();
    const text = (row.values.text ?? '').toUpperCase();
    if (type === 'clue') continue;
    if (type === 'extra') {
      if (!/^[A-Z]{4,48}$/.test(text)) problems.push(`row ${row.line}: the extra word "${row.values.text ?? ''}" must be 4 letters A to Z or more, with no spaces.`);
      else extras.push(text);
      continue;
    }
    if (type !== 'answer' && type !== 'special') {
      problems.push(`row ${row.line}: type must be clue, answer, special or extra.`);
      continue;
    }
    if (!/^[A-Z]{4,48}$/.test(text)) {
      problems.push(`row ${row.line}: the answer "${row.values.text ?? ''}" must be 4 letters A to Z or more, with no spaces.`);
      continue;
    }
    const path = parseCells(row.values.cells ?? '');
    if (!path) {
      problems.push(`row ${row.line}: cells must list each letter's square as row-column, counted from 1 and separated by spaces, for example "1-6 2-6 3-5".`);
      continue;
    }
    if (path.length !== text.length) {
      problems.push(`row ${row.line}: ${text} has ${text.length} letters but ${path.length} squares in cells. Give one square per letter.`);
      continue;
    }
    path.forEach(([r, c], index) => {
      if (r < 0 || r >= PATH_ROWS || c < 0 || c >= PATH_COLS) {
        problems.push(`row ${row.line}: square ${r + 1}-${c + 1} is off the board (rows 1 to ${PATH_ROWS}, columns 1 to ${PATH_COLS}).`);
        return;
      }
      const letter = text[index]!;
      const there = board[r]![c];
      if (there !== undefined) {
        problems.push(`row ${row.line}: square ${r + 1}-${c + 1} is already used by row ${owner[r]![c]} ("${there}"). Each square belongs to one answer.`);
        return;
      }
      board[r]![c] = letter;
      owner[r]![c] = row.line;
    });
    words.push({ answer: text, path, ...(type === 'special' ? { special: true as const } : {}) });
  }
  const empty: string[] = [];
  board.forEach((line, r) => line.forEach((letter, c) => {
    if (letter === undefined) empty.push(`${r + 1}-${c + 1}`);
  }));
  if (empty.length && problems.length === start) {
    problems.push(`${where}${empty.length} ${empty.length === 1 ? 'square has' : 'squares have'} no letter: ${empty.join(' ')}. Every square must belong to one answer.`);
  }
  if (problems.length > start) return undefined;
  return {
    ...status,
    format: 'path',
    clue: clues[0]!.values.text ?? '',
    grid: board.map((line) => line.join('')),
    words,
    ...(extras.length ? { extras } : {}),
  };
}

/**
 * Builds the puzzle files a sheet describes. `sample` marks them as public samples ("status": "sample"); otherwise they
 * say "status": "draft", for Christian's private folder only. `baseName` names a sheet's single puzzle when it has no
 * dates. Problems say which spreadsheet row to fix.
 */
export function buildFromSheet(sheet: Sheet, options: { game?: SheetGame; sample: boolean; baseName: string }): BuildResult & { game?: SheetGame } {
  const problems: string[] = [];
  const game = options.game ?? sheetGame(sheet.columns);
  if (!game) {
    return { puzzles: [], problems: ['the first row must name the columns. Start from a template in content/samples/templates/ (pillo.csv, crossword.csv or word-path.csv).'] };
  }
  const missing = REQUIRED[game].filter((column) => !sheet.columns.includes(column));
  if (missing.length) return { game, puzzles: [], problems: [`a ${game} sheet needs the column${missing.length === 1 ? '' : 's'} ${missing.join(', ')} in its first row.`] };
  if (!sheet.rows.length) return { game, puzzles: [], problems: ['the sheet has no rows under the first row.'] };
  const status: Record<string, unknown> = options.sample ? { status: 'sample', sample: true } : { status: 'draft' };
  if (game === 'pillo') {
    const puzzles = buildPillo(sheet, problems, status);
    return { game, puzzles, problems };
  }
  const puzzles: BuiltPuzzle[] = [];
  for (const group of groupRows(sheet, problems, game === 'crossword')) {
    const levelName = game === 'crossword' ? group.rows[0]?.values.level : '';
    const where = group.date ? `${group.date}${levelName ? ` ${levelName}` : ''}: ` : '';
    const data = game === 'crossword'
      ? buildCrossword(group.rows, problems, status, where)
      : buildWordPath(group.rows, problems, status, where);
    if (!data) continue;
    const level = typeof data.level === 'string' ? `-${data.level}` : '';
    const name = group.date ? `${group.date}${game === 'crossword' ? level : ''}.json` : `${options.baseName}.json`;
    if (puzzles.some((puzzle) => puzzle.name === name)) problems.push(`${where}two puzzles would both be saved as ${name}.`);
    puzzles.push({ name, data });
  }
  return { game, puzzles, problems };
}
