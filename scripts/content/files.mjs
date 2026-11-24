/**
 * Finding and reading puzzle files for the content tools (check.mjs, calendar.mjs, from-csv.mjs). Any file or folder
 * works: the repository's content/ folder, or Christian's private puzzle store anywhere on his computer.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
export const repoContent = join(repoRoot, 'content');

/** Whether a path is inside a folder (or is the folder). */
export const isInside = (path, folder) => {
  const rel = relative(folder, path);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[a-zA-Z]:/.test(rel));
};

/** The path the way Christian sees it: relative to where he ran the command when that's shorter. */
export const shown = (path, cwd = process.cwd()) => {
  const rel = relative(cwd, path);
  return (rel && !rel.startsWith('..') ? rel : path).split(sep).join('/');
};

/** Every .json file in a folder and its subfolders (hidden folders and node_modules skipped), sorted. */
export function jsonFilesIn(folder) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) found.push(path);
    }
  };
  walk(folder);
  return found.sort();
}

/**
 * The files to look at for each path typed: a file is itself, a folder is every .json file in it.
 * Throws a plain message when a path doesn't exist.
 */
export function filesFor(targets) {
  const files = [];
  for (const target of targets) {
    const path = resolve(target);
    if (!existsSync(path)) throw new Error(`there is no file or folder at ${target}. Check the spelling, or drag the folder into the terminal to paste its path.`);
    if (statSync(path).isDirectory()) files.push(...jsonFilesIn(path).map((file) => ({ file, base: path })));
    else files.push({ file: path, base: dirname(path) });
  }
  return files;
}

/** Reads a JSON file: { data } or { error } in plain words. */
export function readJson(file) {
  try {
    return { data: JSON.parse(readFileSync(file, 'utf8')) };
  } catch (error) {
    const reason = error instanceof SyntaxError ? error.message : 'it could not be read';
    return { error: `isn't valid JSON (${reason}). Check for a missing comma, quote or bracket.` };
  }
}

/** The id the site sorts a puzzle by: its path inside the game's folder, without .json. */
export function entryId(file, base, gameFolders) {
  const parts = relative(base, file).split(sep);
  let start = 0;
  parts.slice(0, -1).forEach((folder, index) => {
    if (gameFolders.includes(folder.toLowerCase())) start = index + 1;
  });
  return parts.slice(start).join('/').replace(/\.json$/i, '');
}
