#!/usr/bin/env node
/**
 * content:csv: turns a spreadsheet saved as CSV (one row per clue or word) into puzzle files, then checks them with
 * every content:check rule. Steps for Christian: docs/CONTENT-HANDOFF.md. Templates: content/samples/templates/.
 *
 *   npm run content:csv <sheet.csv>                    saves next to the sheet
 *   npm run content:csv -- <sheet.csv> --out <folder>  saves in another folder
 *   npm run content:csv -- <sheet.csv> --sample        made-up samples for the repository ("status": "sample")
 *
 * The game comes from the sheet's columns (pillo: date, word, cue; crossword: direction, row, column, answer, clue;
 * word path: type, text, cells). Files are saved only when every puzzle passes; otherwise nothing is saved and each
 * problem names the spreadsheet row to fix. Real puzzles (no --sample) are never saved inside the repository.
 *
 * Exit code: 0 saved, 1 something to fix (nothing saved), 2 the command was typed wrong.
 */
import './hooks.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isInside, repoRoot, shown } from './files.mjs';

const USAGE = 'Usage: npm run content:csv <sheet.csv>   (options: -- <sheet.csv> --out <folder> --sample)';
let args;
try {
  args = parseArgs({ options: { out: { type: 'string' }, sample: { type: 'boolean' } }, allowPositionals: true });
} catch (error) {
  console.error(`${error instanceof Error ? error.message : 'unknown option'}\n${USAGE}`);
  process.exit(2);
}
if (args.positionals.length !== 1) {
  console.error(`Say which CSV file to read.\n${USAGE}`);
  process.exit(2);
}
const sheetFile = resolve(args.positionals[0]);
// Read the sheet in one step (no separate existence check that could go stale).
let sheetText;
try {
  sheetText = readFileSync(sheetFile, 'utf8');
} catch {
  console.error(`there is no file at ${args.positionals[0]}. In Google Sheets use File > Download > Comma-separated values (.csv).`);
  process.exit(2);
}
const outDir = resolve(args.values.out ?? dirname(sheetFile));
const sample = args.values.sample === true;
if (!sample && isInside(outDir, repoRoot)) {
  console.error('real puzzles never go in the repository. Save them in your private folder with --out <folder>, or add --sample for a made-up sample.');
  process.exit(2);
}

const load = (path) => import(pathToFileURL(join(repoRoot, path)).href);
const csv = await load('scripts/content/csv.ts');
const puzzles = await load('scripts/content/puzzles.ts');
const { collections } = await load('src/content.config.ts');
const { describeIssue } = await load('scripts/check-content/report.ts');
const COLLECTION = { pillo: 'pulse', crossword: 'cueword', 'word path': 'suture' };

const built = csv.buildFromSheet(csv.readSheet(sheetText), { sample, baseName: basename(sheetFile).replace(/\.csv$/i, '') });
const problems = built.problems.map((problem) => `${shown(sheetFile)}: ${problem}`);
for (const puzzle of built.puzzles) {
  const schema = collections[COLLECTION[built.game]].schema;
  // The build's own file rules, with the repository's "sample" label set aside for a private puzzle.
  const result = await schema.safeParseAsync({ ...puzzle.data, status: 'sample' });
  const messages = result.success ? [] : result.error.issues.map((issue) => describeIssue(issue, puzzle.data));
  for (const finding of puzzles.puzzleFindings(built.game, puzzle.data, puzzle.name.replace(/\.json$/, ''), messages)) {
    if (finding.severity === 'problem') problems.push(`${puzzle.name}: ${finding.message} (rule ${finding.rule})`);
  }
}

if (problems.length || !built.puzzles.length) {
  console.log(`nothing saved: ${problems.length || 1} ${problems.length > 1 ? 'things' : 'thing'} to fix in the sheet first.`);
  for (const problem of problems.length ? problems : [`${shown(sheetFile)}: the sheet makes no puzzles.`]) console.log(`  ${problem}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
for (const puzzle of built.puzzles) {
  const file = join(outDir, puzzle.name);
  const text = `${JSON.stringify(puzzle.data, null, 2)}\n`;
  // Create the file in one step ("wx" fails if it is already there), so no separate existence check can go stale.
  let existed = false;
  try {
    writeFileSync(file, text, { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    existed = true;
    writeFileSync(file, text);
  }
  console.log(`${existed ? 'updated' : 'saved'} ${shown(file)}`);
}
console.log(`${built.puzzles.length} ${built.game} ${built.puzzles.length === 1 ? 'puzzle' : 'puzzles'} ready${sample ? ' (labelled samples)' : ' (private: keep them out of the repository)'}. next: npm run content:calendar ${shown(outDir)}`);
