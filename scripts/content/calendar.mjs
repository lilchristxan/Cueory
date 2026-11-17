#!/usr/bin/env node
/**
 * content:calendar: the next 30 days of every daily game for a puzzle folder, and what's missing. Steps for Christian:
 * docs/CONTENT-HANDOFF.md.
 *
 *   npm run content:calendar <folder>
 *   npm run content:calendar -- <folder> --from 2026-11-19 --days 14
 *
 * Files named by date (2026-11-20.json, 2026-11-20-easy.json) are read by date: a day with no puzzle is missing, a day
 * with two is a duplicate. A game whose files aren't named by date takes turns the way /play does today. Sudoku is
 * made by the site each day; the calendar checks that every one of those boards has exactly one solution. It also
 * lists any answer used on two different days.
 *
 * Exit code: 0 nothing to fix, 1 a missing or duplicate day (or a sudoku board without exactly one solution),
 * 2 the command was typed wrong.
 */
import './hooks.mjs';
import { relative, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { entryId, filesFor, readJson, repoContent, repoRoot, shown, isInside } from './files.mjs';

const USAGE = 'Usage: npm run content:calendar <folder>   (options: -- <folder> --from YYYY-MM-DD --days N)';

let args;
try {
  args = parseArgs({ options: { from: { type: 'string' }, days: { type: 'string' } }, allowPositionals: true });
} catch (error) {
  console.error(`${error instanceof Error ? error.message : 'unknown option'}\n${USAGE}`);
  process.exit(2);
}
const puzzles = await import(pathToFileURL(join(repoRoot, 'scripts/content/puzzles.ts')).href);
if (args.positionals.length !== 1) {
  console.error(`Say which folder to look at.\n${USAGE}`);
  process.exit(2);
}
const start = args.values.from === undefined ? new Date() : puzzles.parseDay(args.values.from);
if (!start) {
  console.error('--from must be a real date written YYYY-MM-DD, for example 2026-11-19.');
  process.exit(2);
}
const count = args.values.days === undefined ? 30 : Number(args.values.days);
if (!/^\d{1,3}$/.test(args.values.days ?? '30') || count < 1 || count > 366) {
  console.error('--days must be a whole number from 1 to 366.');
  process.exit(2);
}

let files;
try {
  files = filesFor(args.positionals);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const list = [];
const unreadable = [];
for (const { file, base } of files) {
  const read = readJson(file);
  if (read.error) {
    unreadable.push(`${shown(file)} ${read.error}`);
    continue;
  }
  const inContent = isInside(file, repoContent);
  const game = puzzles.gameFor(inContent ? relative(repoContent, file) : relative(base, file), read.data);
  if (game && game !== 'sudoku') list.push({ file: shown(file), id: entryId(file, base, puzzles.GAME_FOLDER_NAMES), game, data: read.data });
}

const calendar = puzzles.buildCalendar(list, start, count);
const lines = puzzles.calendarLines(calendar, shown(resolve(args.positionals[0])));
if (unreadable.length) {
  lines.push('', 'these files could not be read, so the calendar leaves them out (run content:check on them):');
  for (const line of unreadable) lines.push(`  ${line}`);
}
console.log(lines.join('\n'));
process.exit(calendar.findings.some(({ finding }) => finding.severity === 'problem') || unreadable.length ? 1 : 0);
