/**
 * Read-only anatomy model review inventory (Task 178).
 *
 * Prints the labels and source lines that already exist in content/visuals/anatomy-*.json.
 * This is evidence for a HUMAN visual/clinical and rights review, never automatic approval.
 * No dependencies, network requests, model rendering, content edits, or publication changes.
 *
 * Usage:
 *   node scripts/anatomy-review-report.mjs --system heart > /tmp/heart-review.md
 *   node scripts/anatomy-review-report.mjs > /tmp/all-anatomy-review.md
 *   node scripts/anatomy-review-report.mjs --out-dir /tmp/anatomy-review-sheets
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SYSTEM_FILE = /^anatomy-([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;
const MODEL_PATH = /^\/models\/anatomy\/[a-z0-9]+(?:-[a-z0-9]+)*\.glb$/;
const BODY_PARTS_SOURCE_PREFIX = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/';
const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORDER = ['skin', 'muscle', 'nerves', 'vessels', 'organs', 'skeleton'];

function requireText(value, description) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${description} must be nonempty text`);
  return value;
}

function markdownCell(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
}

function safeLink(value, name) {
  const url = requireText(value, name);
  if (!/^https:\/\/[^\s)\]]+$/i.test(url)) throw new Error(`${name} must be a safe HTTPS URL`);
  // Inspect the original source path first. URL() normalizes /../ and encoded
  // dot segments, which could otherwise leave and re-enter the LATEST archive.
  const rawPath = url.split(/[?#]/, 1)[0] ?? '';
  if (rawPath.includes('%') || /[\\/]\.{1,2}(?:[\\/]|$)/.test(rawPath)) {
    throw new Error(`${name} must link to the official BodyParts3D source`);
  }
  let parsed;
  try { parsed = new URL(url); }
  catch { throw new Error(`${name} must be a safe HTTPS URL`); }
  // Check the parsed origin and normalized path, not only the raw string.
  // A raw prefix check accepts /bodyparts3d/../other and encoded dot-segments.
  // The current Release 4.0 archive is CC BY 4.0, but older archived
  // releases (such as 20110915) carry different rights notices.
  // Require the reviewed LATEST release path before presenting a CC BY citation.
  const official = new URL(BODY_PARTS_SOURCE_PREFIX);
  if (
    parsed.origin !== official.origin ||
    !parsed.pathname.startsWith(official.pathname) ||
    parsed.pathname.length === official.pathname.length ||
    // Source records use literal public archive paths. Refuse escaped path bytes
    // so encoded slashes/dot segments cannot be reinterpreted downstream.
    parsed.pathname.includes('%') ||
    parsed.username || parsed.password || parsed.port
  ) {
    throw new Error(`${name} must link to the official BodyParts3D source`);
  }
  return url;
}

/**
 * Read source records, enforce basic inventory integrity, and report file sizes without opening or editing GLBs.
 * The existing anatomy-models tests remain the authority for actual GLB node/triangle validation.
 * @param {string} root Repository root
 * @param {string | null} selectedSystem Optional filename-derived system ID
 */
export function anatomyInventory(root = DEFAULT_ROOT, selectedSystem = null) {
  if (selectedSystem !== null && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(selectedSystem)) {
    throw new Error('system must be a lowercase anatomy file ID, such as heart or skeleton-axial');
  }
  const content = join(resolve(root), 'content', 'visuals');
  const paths = readdirSync(content).filter((file) => SYSTEM_FILE.test(file)).sort();
  const chosen = selectedSystem === null ? paths : paths.filter((p) => SYSTEM_FILE.exec(p)?.[1] === selectedSystem);
  if (!chosen.length) throw new Error(selectedSystem ? `No anatomy source file for ${selectedSystem}` : 'No anatomy source files found');
  const globalIds = new Set();
  const entries = [];
  for (const file of chosen) {
    const id = SYSTEM_FILE.exec(file)[1];
    const fail = (message) => { throw new Error(`${file}: ${message}`); };
    let visual;
    try { visual = JSON.parse(readFileSync(join(content, file), 'utf8')); }
    catch { fail('could not read a JSON source file'); }
    if (!visual || typeof visual !== 'object' || Array.isArray(visual)) fail('must contain an object');
    if (visual.kind !== 'model') fail('kind must be model');
    if (visual.status !== 'draft' && visual.status !== 'approved') fail('status must be draft or approved');
    if (!visual.model || !MODEL_PATH.test(visual.model.file)) fail('model.file must be a local /models/anatomy/*.glb path');
    const modelPath = join(resolve(root), 'public', visual.model.file.slice(1));
    if (!existsSync(modelPath)) fail(`model file missing: ${visual.model.file}`);
    const modelBytes = statSync(modelPath).size;
    if (!Array.isArray(visual.sources) || !Array.isArray(visual.labels) || !visual.labels.length) {
      fail('must have nonempty labels and a sources list');
    }
    const sources = new Map();
    for (const source of visual.sources) {
      if (!source || typeof source !== 'object') fail('source record must be an object');
      const sourceId = requireText(source.id, `${file} source id`);
      if (sources.has(sourceId)) fail(`source id repeated: ${sourceId}`);
      safeLink(source.url, `${file} source ${sourceId} URL`);
      if (source.book !== 'BodyParts3D' || source.license !== 'CC BY 4.0') {
        fail(`source ${sourceId} must cite BodyParts3D under CC BY 4.0`);
      }
      sources.set(sourceId, source);
    }
    const labels = visual.labels.map((label, index) => {
      if (!label || typeof label !== 'object') fail(`label ${index + 1} must be an object`);
      const labelId = requireText(label.id, `${file} label id`);
      if (globalIds.has(labelId)) fail(`structure id repeated: ${labelId}`);
      globalIds.add(labelId);
      const name = requireText(label.text, `${file} label ${labelId} name`);
      const source = sources.get(label.source);
      if (!source) fail(`label ${labelId} has no cited source`);
      // Every BodyParts3D name must cite its own exact FMA/BP identity, not
      // another structure's valid source line in the same inventory.
      if (label.source !== `bp3d-${labelId}`) fail(`label ${labelId} cites a different structure source`);
      requireText(source.quote, `${file} label ${labelId} source quote`);
      requireText(source.section, `${file} label ${labelId} source section`);
      requireText(source.book, `${file} label ${labelId} source book`);
      requireText(source.license, `${file} label ${labelId} source license`);
      if (!ORDER.includes(label.layer)) fail(`label ${labelId} has no recognized layer`);
      return { id: labelId, name, group: label.group || 'ungrouped', layer: label.layer, source };
    });
    entries.push({
      id,
      title: requireText(visual.title, `${file} title`),
      status: visual.status,
      release: requireText(visual.model.release, `${file} model release`),
      path: visual.model.file,
      bytes: modelBytes,
      labels,
    });
  }
  return entries;
}

/**
 * Fail-closed publication gate for review-sheet HTML and routes.
 *
 * The existing lab gate predates the connected Workers production branch
 * legacy/main. A review page containing all original draft names must not
 * rely on the staging-wide gate until its production alias fix is merged.
 * The recognized Workers CI values are 1 and true; unknown values are
 * rejected, even when local preview opt-in is also supplied.
 *
 * @param {{WORKERS_CI?:string, WORKERS_CI_BRANCH?:string, CUEORY_ANATOMY_DRAFTS?:string}} env
 */
export function draftReviewSheetsAllowed(env) {
  const raw = env.WORKERS_CI_BRANCH?.trim() ?? '';
  const branch = raw.startsWith('refs/heads/') ? raw.slice('refs/heads/'.length) : raw;
  // Reject main, legacy/main, refs/heads/main and any other main alias.
  if (branch.toLowerCase().split('/').at(-1) === 'main') return false;

  const ci = env.WORKERS_CI?.trim().toLowerCase() ?? '';
  if (ci === '1' || ci === 'true') {
    // Workers preview builds must identify a real non-production branch.
    return branch.length > 0 && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch);
  }
  if (ci !== '' && ci !== '0' && ci !== 'false') return false;
  return env.CUEORY_ANATOMY_DRAFTS === '1';
}

/**
 * @typedef {{id:string, name:string, group:string, layer:string,
 *   source:{quote:string, url:string, section:string, book:string, license:string}}} ReviewLabel
 * @typedef {{id:string, title:string, status:'draft'|'approved', release:string,
 *   path:string, bytes:number, labels:ReviewLabel[]}} ReviewEntry
 * @typedef {ReviewEntry & {url:string, structureCount:number, pictureViews:string[]}} ReviewSheet
 */

/**
 * Make independently addressable, source-backed review sheets for the locked preview.
 * The structure text, source quote and URL are passed through unchanged.
 * Front/side pictures are rendered on demand in the browser from the existing GLB,
 * rather than asserting that a generated picture is a human-approved model.
 * No statuses are changed and no assets are written by this function.
 * @param {ReviewEntry[]} entries
 * @returns {ReviewSheet[]}
 */
export function anatomyReviewSheets(entries) {
  return entries.map((entry) => {
    if (!entry || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) || !Array.isArray(entry.labels)) {
      throw new Error('invalid anatomy review sheet data');
    }
    return {
      ...entry,
      url: `/preview/anatomy-review/${entry.id}`,
      structureCount: entry.labels.length,
      pictureViews: ['front', 'side'],
    };
  });
}

/** Markdown for manual inspection. No model or teaching content is authored by this script. */
export function anatomyReviewMarkdown(entries) {
  const total = entries.reduce((n, entry) => n + entry.labels.length, 0);
  const lines = [
    '# Anatomy lab: model review inventory',
    '',
    '> Review aid only. The labels and source lines below are copied from existing anatomy source files. This report',
    '> does not verify anatomy geometry or approve a draft for student use.',
    '',
    `Systems: **${entries.length}**. Listed structures: **${total}**.`,
    '',
    '| System | Review status | Release | Structures | Model size |',
    '| --- | --- | --- | ---: | ---: |',
  ];
  for (const entry of entries) {
    lines.push(`| ${markdownCell(entry.title)} | ${entry.status} | ${markdownCell(entry.release)} | ${entry.labels.length} | ${(entry.bytes / 1024).toFixed(1)} KiB |`);
  }
  for (const entry of entries) {
    lines.push('', `## ${markdownCell(entry.title)} (${entry.id})`, '',
      `Status: **${entry.status}**. Model: \`${entry.path}\`. Release: ${markdownCell(entry.release)}.`, '',
      '### Layers', '', '| Layer | Structures |', '| --- | ---: |');
    for (const layer of ORDER) {
      const count = entry.labels.filter((label) => label.layer === layer).length;
      if (count) lines.push(`| ${layer} | ${count} |`);
    }
    lines.push('', '### Official names and their cited source lines', '',
      '| # | Structure ID | Official name | Group | Layer | Source quote | Source record |',
      '| ---: | --- | --- | --- | --- | --- | --- |');
    for (const [index, label] of entry.labels.entries()) {
      const source = label.source;
      lines.push(`| ${index + 1} | ${markdownCell(label.id)} | ${markdownCell(label.name)} | ${markdownCell(label.group)} | ${label.layer} | ${markdownCell(source.quote)} | [${markdownCell(source.book)}, ${markdownCell(source.section)}](${source.url}) · ${markdownCell(source.license)} |`);
    }
    lines.push('', '### Human review before approval', '',
      '- [ ] Check the model visually against the original BodyParts3D reference.',
      '- [ ] Check the cited names, grouping and layer placement for students.',
      '- [ ] Confirm licensing and attribution in the viewer and exported pictures.',
      '- [ ] Confirm any placeholder lesson links are corrected before release.',
      '- [ ] Keep the source status as `draft` until the founder approves publication.', '');
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Write separate review sheets only with explicit opt-in. Existing files
 * are never overwritten, to preserve a human's earlier annotations.
 * @param {ReviewEntry[]} entries
 * @param {string} destination
 * @returns {string[]} Written file paths
 */
export function writeAnatomyReviewSheets(entries, destination) {
  if (typeof destination !== 'string' || !destination.trim()) {
    throw new Error('an explicit review output directory is required');
  }
  const folder = resolve(destination);
  // Generated drafts must not be accidentally written into the public repo.
  if (folder === DEFAULT_ROOT || folder.startsWith(DEFAULT_ROOT + sep)) {
    throw new Error('write review sheets outside the project repository');
  }
  if (existsSync(folder)) {
    if (!lstatSync(folder).isDirectory() || lstatSync(folder).isSymbolicLink()) {
      throw new Error('review output directory must be a real directory');
    }
  } else {
    mkdirSync(folder, { recursive: true });
  }
  const paths = anatomyReviewSheets(entries)
    .map((entry) => ({ file: join(folder, `anatomy-${entry.id}-review.md`), entry }));
  // Fail before creating any file if an earlier human review sheet exists.
  if (paths.some(({ file }) => existsSync(file))) {
    throw new Error('review output already exists; choose a fresh output directory');
  }
  for (const { file, entry } of paths) {
    writeFileSync(file, anatomyReviewMarkdown([entry]), { flag: 'wx', mode: 0o600 });
  }
  return paths.map(({ file }) => file);
}

function cli(args) {
  let selectedSystem = null;
  let outDir = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--system' && args[i + 1] && !args[i + 1].startsWith('--')) {
      if (selectedSystem !== null) throw new Error('Only one --system is allowed');
      selectedSystem = args[++i];
    } else if (args[i] === '--out-dir' && args[i + 1] && !args[i + 1].startsWith('--')) {
      if (outDir !== null) throw new Error('Only one --out-dir is allowed');
      outDir = args[++i];
    } else if (args[i] === '--help') {
      return 'Usage: node scripts/anatomy-review-report.mjs [--system heart] [--out-dir /tmp/anatomy-review-sheets]\nWithout --out-dir, print Markdown. With --out-dir, write independent review files without overwriting them.\n';
    } else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  const entries = anatomyInventory(DEFAULT_ROOT, selectedSystem);
  if (outDir) {
    const paths = writeAnatomyReviewSheets(entries, outDir);
    return `Created ${paths.length} independent review sheet(s) in ${resolve(outDir)}. No model statuses changed.\n`;
  }
  return anatomyReviewMarkdown(entries);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(cli(process.argv.slice(2))); }
  catch (err) { process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`); process.exitCode = 1; }
}
