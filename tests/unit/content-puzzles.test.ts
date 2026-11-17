import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { forbiddenGameWords } from '../../src/config/games';
import { buildFromSheet, parseCells, parseCsv, readSheet } from '../../scripts/content/csv';
import {
  buildCalendar, calendarLines, fileDay, forbiddenWordIn, gameFor, isBoardSizeMessage, parseDay, puzzleFindings, reportText,
  sudokuDigits, sudokuSolutionFinding, type Finding, type PuzzleFile,
} from '../../scripts/content/puzzles';

const root = new URL('../../', import.meta.url).pathname;
const fixtures = join(root, 'tests/fixtures/puzzles');
const templates = join(root, 'content/samples/templates');
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
const rules = (findings: Finding[], severity?: Finding['severity']) =>
  findings.filter((finding) => !severity || finding.severity === severity).map((finding) => finding.rule);

function run(script: string, args: string[], cwd = root): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [join(root, 'scripts/content', script), ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (error) {
    const failed = error as { status: number; stdout: string; stderr: string };
    return { code: failed.status, out: failed.stdout + failed.stderr };
  }
}

/** The command-line tests start Node and the site's rules; give them room on a busy machine. */
const SLOW = 60_000;

const temps: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'cueory-puzzles-'));
  temps.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('which game a file is for', () => {
  it('reads the folder name first, then the fields', () => {
    expect(gameFor('games/pulse/a.json', {})).toBe('pillo');
    expect(gameFor('my-puzzles/crossword/a.json', {})).toBe('crossword');
    expect(gameFor('suture/x/a.json', {})).toBe('word path');
    expect(gameFor('sudoku/a.json', {})).toBe('sudoku');
    expect(gameFor('a.json', { word: 'apple', cue: 'x' })).toBe('pillo');
    expect(gameFor('a.json', { grid: [], clues: {} })).toBe('crossword');
    expect(gameFor('a.json', { grid: [], words: [] })).toBe('word path');
    expect(gameFor('a.json', { grid: Array(9).fill('.........') })).toBe('sudoku');
  });

  it('leaves out folders that hold no daily puzzle, and other content', () => {
    expect(gameFor('games/triage/a.json', { word: 'apple', cue: 'x' })).toBeUndefined();
    expect(gameFor('games/hello-cards/a.json', {})).toBeUndefined();
    expect(gameFor('lessons/a.json', { sentences: [] })).toBeUndefined();
  });
});

describe('the puzzle rules', () => {
  it('passes every good fixture with no problem', () => {
    for (const [file, game] of [
      ['good/games/pulse/2026-12-01.json', 'pillo'],
      ['good/games/cueword/2026-12-01-easy.json', 'crossword'],
      ['good/games/suture/2026-12-01.json', 'word path'],
      ['good/sudoku/classic.json', 'sudoku'],
    ] as const) {
      expect(rules(puzzleFindings(game, readJson(join(fixtures, file)), 'x'), 'problem'), file).toEqual([]);
    }
  });

  it('refuses a pillo word or cue that holds a forbidden game name', () => {
    for (const name of forbiddenGameWords) {
      expect(rules(puzzleFindings('pillo', { status: 'sample', word: 'apple', cue: `just like ${name}` }, 'x'))).toContain('pillo-forbidden');
    }
    expect(forbiddenWordIn('plain everyday words')).toBeUndefined();
    const short = forbiddenGameWords.find((name) => name.length <= 5)!;
    expect(rules(puzzleFindings('pillo', { status: 'sample', word: (short + 'abcde').slice(0, 5), cue: 'a cue' }, 'x'))).toContain('pillo-forbidden');
  });

  it('wants exactly five lowercase letters for pillo', () => {
    for (const word of ['four', 'sixsix', 'Apple', 'app1e']) {
      expect(rules(puzzleFindings('pillo', { status: 'sample', word, cue: 'a cue' }, 'x'))).toContain('pillo-length');
    }
  });

  it('checks crossword clue length and repeated answers', () => {
    const puzzle = readJson(join(fixtures, 'good/games/cueword/2026-12-01-easy.json')) as { clues: { across: { text: string }[] } };
    puzzle.clues.across[0]!.text = 'x'.repeat(121);
    expect(rules(puzzleFindings('crossword', puzzle, 'x'), 'problem')).toContain('crossword-clue-length');
    puzzle.clues.across[0]!.text = 'x'.repeat(120);
    expect(rules(puzzleFindings('crossword', puzzle, 'x'), 'problem')).toEqual([]);
    expect(rules(puzzleFindings('crossword', readJson(join(fixtures, 'broken/cueword/crossword-duplicate-answer.json')), 'x'))).toContain('crossword-duplicate-answer');
  });

  it('checks the word path theme clue, every letter once and the one special answer', () => {
    const board = readJson(join(fixtures, 'good/games/suture/2026-12-01.json'));
    expect(rules(puzzleFindings('word path', { ...board, clue: 'x'.repeat(61) }, 'x'))).toContain('wordpath-clue-length');
    expect(rules(puzzleFindings('word path', { ...board, clue: 'x'.repeat(60) }, 'x'), 'problem')).toEqual([]);
    const words = board.words as { answer: string; special?: boolean }[];
    expect(rules(puzzleFindings('word path', { ...board, words: words.slice(1) }, 'x'))).toEqual(expect.arrayContaining(['wordpath-every-letter-once', 'wordpath-special']));
    const twoSpecial = words.map((word) => ({ ...word, special: true }));
    expect(puzzleFindings('word path', { ...board, words: twoSpecial }, 'x').find((finding) => finding.rule === 'wordpath-special')?.message).toMatch(/exactly one .* it has 7/);
  });

  it('matches only the whole board-size message from the game', () => {
    expect(isBoardSizeMessage('the board must have 8 rows.')).toBe(true);
    expect(isBoardSizeMessage('each row must have 6 letters.')).toBe(true);
    expect(isBoardSizeMessage('the board must have 8 rows. and more')).toBe(false);
    expect(isBoardSizeMessage('extra: each row must have 6 letters.')).toBe(false);
    expect(isBoardSizeMessage('each extra word must have at least 4 capital letters.')).toBe(false);
    expect(isBoardSizeMessage('rows')).toBe(false);
  });

  it('checks that a sudoku board has exactly one solution', () => {
    const classic = sudokuDigits(readJson(join(fixtures, 'good/sudoku/classic.json')).grid)!;
    expect(sudokuSolutionFinding(classic)).toBeUndefined();
    const open = [...classic];
    open.fill(0, 9);
    expect(sudokuSolutionFinding(open)?.rule).toBe('sudoku-one-solution');
    const clash = [...classic];
    clash[1] = clash[0]!;
    expect(sudokuSolutionFinding(clash)?.rule).toBe('sudoku-conflict');
    expect(sudokuDigits(['123'])).toBeUndefined();
  });

  it('warns about a field the game does not read', () => {
    expect(rules(puzzleFindings('pillo', { status: 'sample', word: 'apple', cue: 'a', clue: 'b' }, 'x'), 'warning')).toEqual(['unknown-field']);
  });
});

describe('content:check on the command line', () => {
  it('passes every file in content/ (--all runs in npm test)', () => {
    const { code, out } = run('check.mjs', ['--all']);
    expect(out).toMatch(/checked \d+ puzzle files in content/);
    expect(out, out).toMatch(/no problems found/);
    expect(code).toBe(0);
  }, SLOW);

  it('reports each broken fixture by the rule it is named after', () => {
    const { code, out } = run('check.mjs', ['tests/fixtures/puzzles/broken']);
    expect(code).toBe(1);
    const sections = out.split(/\n(?=tests\/fixtures\/puzzles\/broken\/)/);
    const games = readdirSync(join(fixtures, 'broken'));
    let checked = 0;
    for (const game of games) {
      for (const file of readdirSync(join(fixtures, 'broken', game))) {
        const rule = file.replace(/\.json$/, '');
        const section = sections.find((part) => part.startsWith(`tests/fixtures/puzzles/broken/${game}/${file}:`));
        expect(section, `${game}/${file}`).toBeDefined();
        expect(section, `${game}/${file}`).toContain(`(rule ${rule})`);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(20);
  }, SLOW);

  it('works on any folder, including one outside the repository with real (unlabelled) puzzles', () => {
    const dir = temp();
    cpSync(join(fixtures, 'good'), dir, { recursive: true });
    const file = join(dir, 'games/pulse/2026-12-01.json');
    writeFileSync(file, JSON.stringify({ status: 'draft', word: 'plant', cue: 'it grows' }));
    const { code, out } = run('check.mjs', [dir], dir);
    expect(out).toContain('checked 6 puzzle files');
    expect(out).toContain('1 file isn\'t labelled as samples');
    expect(code).toBe(0);
  }, SLOW);

  it('saves a plain report with --report, next to the folder it checked', () => {
    const dir = temp();
    cpSync(join(fixtures, 'broken/sudoku'), join(dir, 'sudoku'), { recursive: true });
    cpSync(join(fixtures, 'good/games'), join(dir, 'games'), { recursive: true });
    const { code, out } = run('check.mjs', ['--report', dir], dir);
    expect(code).toBe(1);
    expect(out).toContain('report saved to content-report.txt');
    const report = readFileSync(join(dir, 'content-report.txt'), 'utf8');
    expect(report).toContain('how to read this:');
    expect(report).toMatch(/result: 3 of 8 files need fixing/);
    expect(report).toMatch(/^ok {6}games\/pulse\/2026-12-01\.json \(pillo\)$/m);
    expect(report).toMatch(/^fix {5}sudoku\/sudoku-conflict\.json \(sudoku\)$/m);
    expect(report).toMatch(/1\. note: the site doesn't load sudoku files/);
  }, SLOW);

  it('says plainly when a path is wrong or a file is not a puzzle', () => {
    expect(run('check.mjs', ['no-such-folder']).code).toBe(2);
    expect(run('check.mjs', []).code).toBe(2);
    const { code, out } = run('check.mjs', ['package.json']);
    expect(code).toBe(1);
    expect(out).toContain('(rule not-a-puzzle)');
  }, SLOW);
});

describe('the puzzle calendar', () => {
  const pillo = (file: string, word: string): PuzzleFile => ({ file, id: file.replace(/\.json$/, ''), game: 'pillo', data: { status: 'sample', word, cue: 'a cue' } });
  const start = parseDay('2026-12-01')!;

  it('reads dated files by date and flags missing and duplicate days', () => {
    const calendar = buildCalendar([pillo('2026-12-01.json', 'plant'), pillo('2026-12-03.json', 'cloud'), pillo('2026-12-03-b.json', 'bread')], start, 3);
    expect(calendar.modes.pillo).toBe('by date');
    expect(calendar.days.map((day) => day.cells.pillo)).toEqual([['2026-12-01.json'], [], ['2026-12-03.json', '2026-12-03-b.json']]);
    const pilloFindings = calendar.findings.filter(({ lane }) => lane === 'pillo').map(({ finding }) => finding);
    expect(pilloFindings.find((finding) => finding.rule === 'missing-day')?.message).toContain('2026-12-02');
    expect(pilloFindings.find((finding) => finding.rule === 'duplicate-day')?.message).toContain('2026-12-03');
  });

  it('takes turns like /play when files are not dated, and says when they repeat', () => {
    const calendar = buildCalendar([pillo('b.json', 'cloud'), pillo('a.json', 'plant')], start, 4);
    expect(calendar.modes.pillo).toBe('taking turns (2 puzzles)');
    // 1 December 2026 is day 30 from 1 November, so the list (sorted a, b) starts at a.
    expect(calendar.days.map((day) => day.cells.pillo![0])).toEqual(['a.json', 'b.json', 'a.json', 'b.json']);
    expect(calendar.findings.some(({ finding }) => finding.rule === 'repeat-puzzle')).toBe(true);
  });

  it('flags the same answer on two days, and checks the site\'s sudoku boards', () => {
    const calendar = buildCalendar([pillo('2026-12-01.json', 'plant'), pillo('2026-12-02.json', 'plant')], start, 2);
    expect(calendar.findings.find(({ finding }) => finding.rule === 'repeated-answer')?.finding.message).toContain('"PLANT"');
    expect(calendar.days.every((day) => ['sudoku easy', 'sudoku mid', 'sudoku hard'].every((lane) => day.cells[lane]![0] === 'ok'))).toBe(true);
    const lines = calendarLines(calendar, 'my-puzzles').join('\n');
    expect(lines).toContain('puzzle calendar for my-puzzles, 2026-12-01 to 2026-12-02 (2 days)');
    expect(lines).toContain('MISSING');
  });

  it('knows dated file names and real dates', () => {
    expect(fileDay('games/pulse/2026-11-20.json')).toBe('2026-11-20');
    expect(fileDay('2026-11-20-easy.json')).toBe('2026-11-20');
    expect(fileDay('2026-02-30.json')).toBeUndefined();
    expect(fileDay('sample-01.json')).toBeUndefined();
    expect(parseDay('2026-13-01')).toBeUndefined();
  });

  it('runs on a folder from the command line, 30 days by default', () => {
    const { code, out } = run('calendar.mjs', ['tests/fixtures/puzzles/good', '--from', '2026-12-01', '--days', '3']);
    expect(out).toContain('pillo: by date');
    expect(out).toMatch(/2026-12-01 {2}2026-12-01 {2}2026-12-01-easy/);
    expect(out).toContain('crossword mid: no puzzles at all');
    expect(code).toBe(1);
    expect(run('calendar.mjs', ['content', '--from', '2026-02-30']).code).toBe(2);
    expect(buildCalendar([], start).days).toHaveLength(30);
  }, SLOW);
});

describe('sheets to puzzle files', () => {
  it('reads quoted cells, line breaks and note rows the way spreadsheets write them', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,"two\nlines",3')).toEqual([['a', 'b, c', 'say "hi"'], ['1', 'two\nlines', '3']]);
    const sheet = readSheet('﻿Date,Word,Cue\n# notes,,\n\n2026-12-01, plant ,a cue\n');
    expect(sheet.columns).toEqual(['date', 'word', 'cue']);
    expect(sheet.rows).toEqual([{ line: 4, values: { date: '2026-12-01', word: 'plant', cue: 'a cue' } }]);
    expect(parseCells('1-6 2-6')).toEqual([[0, 5], [1, 5]]);
    expect(parseCells('r1c6; 2,6')).toEqual([[0, 5], [1, 5]]);
    expect(parseCells('one')).toBeUndefined();
  });

  it('turns each template into valid puzzles', () => {
    const crossword = buildFromSheet(readSheet(readFileSync(join(templates, 'crossword.csv'), 'utf8')), { sample: true, baseName: 'x' });
    expect(crossword.problems).toEqual([]);
    expect(crossword.puzzles.map((puzzle) => puzzle.name)).toEqual(['2026-12-01-easy.json']);
    expect(crossword.puzzles[0]!.data).toEqual(readJson(join(fixtures, 'good/games/cueword/2026-12-01-easy.json')));

    const path = buildFromSheet(readSheet(readFileSync(join(templates, 'word-path.csv'), 'utf8')), { sample: true, baseName: 'x' });
    expect(path.problems).toEqual([]);
    expect(path.puzzles[0]!.data.grid).toEqual(readJson(join(root, 'content/games/suture/sample-01.json')).grid);
    expect(rules(puzzleFindings('word path', path.puzzles[0]!.data, 'x'), 'problem')).toEqual([]);

    const words = buildFromSheet(readSheet(readFileSync(join(templates, 'pillo.csv'), 'utf8')), { sample: false, baseName: 'x' });
    expect(words.problems).toEqual([]);
    expect(words.puzzles).toHaveLength(7);
    expect(words.puzzles[0]).toEqual({ name: '2026-12-01.json', data: { status: 'draft', word: 'plant', cue: 'a living thing that grows in soil' } });
  });

  it('names the spreadsheet row to fix', () => {
    const clash = buildFromSheet(readSheet('direction,row,column,answer,clue\nacross,1,1,CAT,a\ndown,1,1,DOG,b\n'), { sample: true, baseName: 'x' });
    expect(clash.problems.join('\n')).toMatch(/row 3: DOG puts "D" at row 1, column 1, but row 2 already put "C" there/);
    const extra = buildFromSheet(readSheet('direction,row,column,answer,clue\nacross,1,1,CAT,a\nacross,2,1,DOG,b\ndown,1,1,CD,c\n'), { sample: true, baseName: 'x' });
    expect(extra.problems.join('\n')).toMatch(/the letters make the word "AO"/);
    const gaps = buildFromSheet(readSheet('type,text,cells\nclue,a clue,\nspecial,ABCDEFGH,1-1 2-1 3-1 4-1 5-1 6-1 7-1 8-1\n'), { sample: true, baseName: 'x' });
    expect(gaps.problems.join('\n')).toMatch(/40 squares have no letter/);
    const dates = buildFromSheet(readSheet('date,word,cue\n2026-12-40,plant,a\n2026-12-01,cloud,b\n2026-12-01,bread,c\n'), { sample: true, baseName: 'x' });
    expect(dates.problems).toEqual([
      'row 2: "2026-12-40" isn\'t a date written YYYY-MM-DD, for example 2026-11-20.',
      'row 4: 2026-12-01 already has a word on an earlier row. Keep one word a day.',
    ]);
    expect(buildFromSheet(readSheet('a,b\n1,2\n'), { sample: true, baseName: 'x' }).problems[0]).toMatch(/first row must name the columns/);
  });

  it('saves files from the command line only when every puzzle passes, and never real ones in the repository', () => {
    const dir = temp();
    const saved = run('from-csv.mjs', [join(templates, 'pillo.csv'), '--out', dir]);
    expect(saved.code).toBe(0);
    expect(readdirSync(dir)).toHaveLength(7);
    expect(run('check.mjs', [dir]).code).toBe(0);

    const bad = join(dir, 'bad.csv');
    writeFileSync(bad, 'date,word,cue\n2026-12-01,apples,a cue\n');
    const refused = run('from-csv.mjs', [bad, '--out', join(dir, 'out')]);
    expect(refused.code).toBe(1);
    expect(refused.out).toContain('nothing saved');
    expect(refused.out).toContain('(rule pillo-length)');
    expect(existsSync(join(dir, 'out'))).toBe(false);

    expect(run('from-csv.mjs', [join(templates, 'pillo.csv'), '--out', join(root, 'content/games/pulse')]).code).toBe(2);
  }, SLOW);
});

describe('the saved report', () => {
  it('lists every file and explains its words', () => {
    const text = reportText({
      when: new Date(2026, 11, 1, 9, 5),
      where: 'my-puzzles',
      files: [{ file: 'a.json', game: 'pillo', findings: [] }, { file: 'b.json', game: 'pillo', findings: [{ severity: 'problem', rule: 'pillo-length', message: 'too long.' }] }],
      skipped: 1,
      otherChecked: 0,
    });
    expect(text).toContain('when: 2026-12-01 09:05');
    expect(text).toContain('result: 1 of 2 files need fixing.');
    expect(text).toContain('ok      a.json (pillo)');
    expect(text).toContain('        1. fix: too long. (rule pillo-length)');
    expect(text).toContain('1 file wasn\'t a puzzle and was skipped.');
  });
});
