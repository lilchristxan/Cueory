#!/usr/bin/env node
/**
 * content:check: checks daily puzzle files (pillo, crossword, word path, and check-only sudoku boards) with the
 * build's own file rules (src/content.config.ts), the games' own checks and the extra rules in puzzles.ts, and says in
 * plain words what to fix. Steps for Christian: docs/CONTENT-HANDOFF.md.
 *
 *   npm run content:check <file or folder> [more files or folders]
 *   npm run content:check -- --all             every file in this repository's content/ folder (npm test runs this)
 *   npm run content:check -- --report <folder> also saves the result as content-report.txt
 *
 * Works on any folder: the repository's content/, or a private puzzle folder anywhere. A puzzle outside the repository
 * may be a real one, so it doesn't have to say "status": "sample"; one inside the repository must.
 *
 * Exit code: 0 nothing to fix, 1 something to fix, 2 the command was typed wrong.
 */
import './hooks.mjs';
import { writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { entryId, filesFor, isInside, readJson, repoContent, repoRoot, shown } from './files.mjs';

const USAGE = [
  'Usage:',
  '  npm run content:check <file or folder>',
  '  npm run content:check -- --all',
  '  npm run content:check -- --report <file or folder>',
].join('\n');

let args;
try {
  args = parseArgs({ options: { all: { type: 'boolean' }, report: { type: 'boolean' }, help: { type: 'boolean' } }, allowPositionals: true });
} catch (error) {
  console.error(`${error instanceof Error ? error.message : 'unknown option'}\n${USAGE}`);
  process.exit(2);
}
if (args.values.help) {
  console.log(USAGE);
  process.exit(0);
}
const targets = [...args.positionals, ...(args.values.all ? [repoContent] : [])];
if (targets.length === 0) {
  console.error(`Say which file or folder to check.\n${USAGE}`);
  process.exit(2);
}

const load = (path) => import(pathToFileURL(join(repoRoot, path)).href);
const { collections } = await load('src/content.config.ts');
const { describeIssue } = await load('scripts/check-content/report.ts');
const puzzles = await load('scripts/content/puzzles.ts');

/** The collection whose folder holds a file inside the repository's content/, if any. */
function collectionFor(file) {
  for (const [name, collection] of Object.entries(collections)) {
    const base = collection.loader?.glob?.base;
    if (base && isInside(file, resolve(repoRoot, base))) return { name, collection };
  }
  return undefined;
}
const PUZZLE_COLLECTION = { pillo: 'pulse', crossword: 'cueword', 'word path': 'suture' };

async function schemaMessages(collection, data) {
  if (!collection) return [];
  const result = await collection.schema.safeParseAsync(data);
  return result.success ? [] : result.error.issues.map((issue) => describeIssue(issue, data));
}

let files;
try {
  files = filesFor(targets);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

/** @type {{ file: string, game?: string, findings: import('./puzzles.ts').Finding[] }[]} */
const results = [];
let otherChecked = 0;
let skipped = 0;
let privateFiles = 0;
for (const { file, base } of files) {
  const inRepo = isInside(file, repoRoot);
  const inContent = isInside(file, repoContent);
  const read = readJson(file);
  if (read.error) {
    results.push({ file, findings: [{ severity: 'problem', rule: 'json', message: read.error }] });
    continue;
  }
  const data = read.data;
  const relativePath = relative(base, file);
  const game = puzzles.gameFor(inContent ? relative(repoContent, file) : relativePath, data);
  if (!game) {
    // Inside content/, every file in a collection gets the build's own schema check, puzzle or not.
    const owner = inContent ? collectionFor(file) : undefined;
    if (owner) {
      otherChecked++;
      const messages = await schemaMessages(owner.collection, data);
      if (messages.length) results.push({ file, findings: messages.map((message) => ({ severity: 'problem', rule: 'file-format', message: `${message}.` })) });
    } else if (files.length === 1) {
      results.push({ file, findings: [{ severity: 'problem', rule: 'not-a-puzzle', message: 'this doesn\'t look like a pillo, crossword, word path or sudoku file. Put it in a folder named after its game (pulse, cueword, suture or sudoku), or compare it with the examples in docs/CONTENT-HANDOFF.md.' }] });
    } else {
      skipped++;
    }
    continue;
  }
  const collection = PUZZLE_COLLECTION[game] ? collections[PUZZLE_COLLECTION[game]] : undefined;
  const labelled = data && typeof data === 'object' && data.status === 'sample';
  // A real puzzle in a private folder is checked with every rule except the repository's "sample" label.
  const schemaData = !inRepo && data && typeof data === 'object' && !Array.isArray(data) && data.status !== undefined && !labelled
    ? { ...data, status: 'sample' }
    : data;
  if (!inRepo && !labelled) privateFiles++;
  const findings = puzzles.puzzleFindings(game, data, entryId(file, base, puzzles.GAME_FOLDER_NAMES), await schemaMessages(collection, schemaData));
  if (inRepo && !labelled) {
    // Say why the label matters here, instead of the schema's shorter "use sample".
    for (let index = findings.length - 1; index >= 0; index--) {
      if (findings[index].rule === 'file-format' && /\bstatus\b/.test(findings[index].message)) findings.splice(index, 1);
    }
    findings.unshift({ severity: 'problem', rule: 'public-repository', message: 'this file is inside the public repository but isn\'t labelled "status": "sample". Real puzzles never go here: move it to your private folder.' });
  }
  results.push({ file, game, findings });
}

const puzzleResults = results.filter((result) => result.game);
const byGame = puzzles.GAMES.map((game) => [game, puzzleResults.filter((result) => result.game === game).length]).filter(([, count]) => count > 0);
const toFix = results.filter((result) => puzzles.hasProblems(result.findings));
const toLook = results.filter((result) => !puzzles.hasProblems(result.findings) && result.findings.some((finding) => finding.severity === 'warning'));
const where = targets.map((target) => shown(resolve(target))).join(', ');

const lines = [];
lines.push(`checked ${puzzleResults.length} puzzle ${puzzleResults.length === 1 ? 'file' : 'files'} in ${where}${byGame.length ? ` (${byGame.map(([game, count]) => `${game} ${count}`).join(', ')})` : ''}`);
if (otherChecked) lines.push(`also checked ${otherChecked} other content ${otherChecked === 1 ? 'file' : 'files'} with the build's rules (lesson links: node scripts/check-content.mjs)`);
if (skipped) lines.push(`skipped ${skipped} ${skipped === 1 ? 'file that isn\'t a puzzle' : 'files that aren\'t puzzles'}`);
if (privateFiles) lines.push(`${privateFiles} ${privateFiles === 1 ? 'file isn\'t' : 'files aren\'t'} labelled as samples: fine in your private folder, but never add ${privateFiles === 1 ? 'it' : 'them'} to the repository`);
lines.push('');
for (const result of results) {
  const shownFindings = result.findings.filter((finding) => finding.severity !== 'note' || files.length === 1);
  if (!shownFindings.length) continue;
  lines.push(`${shown(result.file)}:`);
  for (const finding of shownFindings) lines.push(`  ${puzzles.findingLine(finding)}`);
}
if (toFix.length || toLook.length) lines.push('');
lines.push(toFix.length
  ? `${toFix.length} ${toFix.length === 1 ? 'file needs' : 'files need'} fixing (lines starting "fix:"). Fix them and run this again.`
  : `no problems found${toLook.length ? `; ${toLook.length} ${toLook.length === 1 ? 'file has' : 'files have'} something worth a look (lines starting "check:")` : ''}.`);
console.log(lines.join('\n'));

if (args.values.report) {
  const first = resolve(targets[0]);
  const folder = files.length && !isInside(first, repoRoot) ? (files.length === 1 && files[0].file === first ? dirname(first) : first) : repoRoot;
  const reportFile = join(folder, 'content-report.txt');
  writeFileSync(reportFile, puzzles.reportText({
    when: new Date(),
    where,
    files: results.map((result) => ({ file: shown(result.file), game: result.game, findings: result.findings })),
    skipped,
    otherChecked,
  }));
  console.log(`\nreport saved to ${shown(reportFile)}`);
}
process.exit(toFix.length ? 1 : 0);
