/**
 * Read-only release gate for anatomy assets. Run after a production-style Astro build, never on an unbuilt source tree.
 * This verifies the actual dist/ output, not merely the draft-filtering functions.
 *
 * Usage: node scripts/anatomy-production-audit.mjs [dist-directory] [content/visuals-directory]
 */
import { closeSync, constants as fsConstants, existsSync, fstatSync, openSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ANATOMY_FILE = /^anatomy-[a-z0-9-]+\.json$/;
const MODEL_URL = /^\/models\/anatomy\/[a-z0-9][a-z0-9_-]*\.glb$/;
// Fail closed on any publicly shipped 3D geometry, including misplaced copies and raw source meshes.
const MODEL_ASSET = /\.(?:glb|gltf|obj|stl)$/i;
// Scan all ordinary published text assets, not just the anatomy page or hashed JavaScript chunks.
// Site search, manifests or unrelated pages can otherwise accidentally expose a draft identifier.
const TEXT_ASSET = /\.(?:html?|js|mjs|json|map|xml|svg|txt|css|csv|tsv|md|webmanifest)$/i;
const SCRIPT_ESCAPES_ASSET = /\.(?:js|mjs|json|map|webmanifest|html?)$/i;
const MARKUP_ESCAPES_ASSET = /\.(?:html?|svg|xml)$/i;

/** Walk a built artifact without following links outside (or back into) the output. */
function walkFiles(dir, linked) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      linked.push(p); // A link is not proof of a reviewed production asset.
      return [];
    }
    if (entry.isDirectory()) return walkFiles(p, linked);
    if (entry.isFile()) return [p];
    return [];
  });
}

/**
 * Read an audited regular file through its opened descriptor, never through a
 * later pathname lookup. If a file changes into a symlink after directory
 * enumeration, O_NOFOLLOW rejects it instead of reading its target.
 */
export function readRegularFileNoFollow(path) {
  if (!Number.isInteger(fsConstants.O_NOFOLLOW)) {
    throw new Error('this platform cannot safely audit symbolic links');
  }
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    if (!fstatSync(fd).isFile()) throw new Error('not a regular file');
    return readFileSync(fd, 'utf8');
  } finally {
    closeSync(fd);
  }
}

/**
 * Decode common ASCII escapes before scanning generated text for draft IDs.
 * Bundlers can emit JSON/JS Unicode escapes, and HTML can use numeric entities.
 * This is read-only normalization for the audit, not a change to shipped files.
 */
export function decodeAsciiEscapesForAudit(text, syntax) {
  if (syntax === 'script') {
    return text.replace(/\\+(?:u00([0-7][0-9a-f])|x([0-7][0-9a-f])|u\{([0-7][0-9a-f])\})/gi,
      (_match, unicode, hex, braced) => String.fromCharCode(Number.parseInt(unicode ?? hex ?? braced, 16)));
  }
  if (syntax === 'markup') {
    return text.replace(/&#(?:x([0-9a-f]{1,6})|([0-9]{1,7}));/gi, (match, hex, decimal) => {
      const value = hex === undefined ? Number.parseInt(decimal, 10) : Number.parseInt(hex, 16);
      return value <= 127 ? String.fromCharCode(value) : match;
    });
  }
  return text;
}

/** Extracts references without trusting paths from content files as filesystem paths. */
export function modelUrls(model) {
  if (!model || typeof model !== 'object' || Array.isArray(model)) return null;
  const refs = [model.file];
  if (model.files !== undefined) {
    if (!Array.isArray(model.files)) return null;
    refs.push(...model.files);
  }
  if (model.layerFiles !== undefined) {
    if (!model.layerFiles || typeof model.layerFiles !== 'object' || Array.isArray(model.layerFiles)) return null;
    for (const list of Object.values(model.layerFiles)) {
      if (!Array.isArray(list)) return null;
      refs.push(...list);
    }
  }
  return refs.every((url) => typeof url === 'string' && MODEL_URL.test(url)) ? [...new Set(refs)] : null;
}

/**
 * Audit a built production site against the current source-file publication statuses.
 * No writes or network operations. Return every error instead of stopping at the first one.
 */
export function auditAnatomyProduction(distDir, contentDir) {
  const dist = resolve(distDir);
  const content = resolve(contentDir);
  const errors = [];
  const approved = new Set();
  const draft = new Set();
  const draftIds = new Set();
  let approvedSystems = 0;
  let draftSystems = 0;

  if (!existsSync(dist) || !statSync(dist).isDirectory()) {
    return { errors: [`production output does not exist: ${dist}`], approvedSystems, draftSystems, shippedModels: 0 };
  }
  if (!existsSync(content) || !statSync(content).isDirectory()) {
    return { errors: [`anatomy source directory does not exist: ${content}`], approvedSystems, draftSystems, shippedModels: 0 };
  }

  const sources = readdirSync(content).filter((n) => ANATOMY_FILE.test(n)).sort();
  if (!sources.length) errors.push('no anatomy source files found');
  for (const name of sources) {
    const sourcePath = join(content, name);
    let data;
    try {
      data = JSON.parse(readRegularFileNoFollow(sourcePath));
    } catch (error) {
      const linked = error && typeof error === 'object' && 'code' in error && error.code === 'ELOOP';
      errors.push(linked ? `${name}: anatomy source must not be a symbolic link` : `${name}: cannot read valid JSON`);
      continue;
    }
    if (!data || (data.status !== 'approved' && data.status !== 'draft')) {
      errors.push(`${name}: invalid publication status`);
      continue;
    }
    const urls = modelUrls(data.model);
    if (!urls) {
      errors.push(`${name}: invalid model URL list`);
      continue;
    }
    if (data.status === 'approved') {
      approvedSystems++;
      urls.forEach((url) => approved.add(url));
    } else {
      draftSystems++;
      urls.forEach((url) => draft.add(url));
      if (!Array.isArray(data.labels) || data.labels.length === 0) {
        errors.push(`${name}: draft labels are missing`);
      } else {
        for (const label of data.labels) {
          if (!label || typeof label.id !== 'string' || !/^FMA\d{3,}$/.test(label.id)) {
            errors.push(`${name}: invalid draft label ID`);
          } else {
            draftIds.add(label.id);
          }
        }
      }
    }
  }

  for (const url of approved) {
    if (draft.has(url)) errors.push(`ambiguous approval: ${url} is also referenced by a draft`);
  }

  // Inspect the entire output, not only dist/models/anatomy: a misplaced file is just as public.
  // The source manifest approves exact .glb URLs; any other 3D asset must be explicitly reviewed.
  const linked = [];
  const builtFiles = walkFiles(dist, linked);
  const toUrl = (path) => '/' + path.slice(dist.length + 1).replaceAll('\\', '/');
  for (const path of linked) errors.push(`symbolic link in production output: ${toUrl(path)}`);
  const shipped = [...new Set(builtFiles
    .filter((path) => MODEL_ASSET.test(path))
    .map(toUrl))];

  for (const url of shipped) {
    if (!approved.has(url)) errors.push(`unapproved model exposed in production: ${url}`);
  }
  for (const url of approved) {
    if (!shipped.includes(url)) errors.push(`approved model missing from production: ${url}`);
  }

  for (const path of builtFiles) {
    const url = toUrl(path);
    if (url.startsWith('/preview/anatomy-fixture/')) {
      errors.push(`test fixture exposed in production: ${url}`);
    }
  }

  // Draft labels must not be baked into static HTML/JS data, even if their .glb files were pruned.
  // The identifiers are original data keys, not guessed medical wording. Only match exact token boundaries.
  // Search every static text asset, including Pagefind/search data and other public routes.
  // Token boundaries avoid confusing FMA999991 with FMA9999910. Unknown ID formats fail source validation above.
  const textFiles = builtFiles.filter((path) => TEXT_ASSET.test(path));
  const draftTokens = draftIds;
  if (draftTokens.size) {
    for (const file of textFiles) {
      // Directory enumeration and reading are separate operations; fail
      // closed if a file changes into a symlink between them.
      let contents;
      try {
        contents = readRegularFileNoFollow(file);
      } catch {
        errors.push(`cannot safely read built text: ${file.slice(dist.length + 1)}`);
        continue;
      }
      // Scan original text even when additional decoding is useful. Decoding
      // literal HTML references in JS (or JS escapes in markup) can erase a
      // boundary and otherwise suppress a draft ID that is already visible.
      const variants = [contents];
      if (SCRIPT_ESCAPES_ASSET.test(file)) variants.push(decodeAsciiEscapesForAudit(contents, 'script'));
      if (MARKUP_ESCAPES_ASSET.test(file)) variants.push(decodeAsciiEscapesForAudit(contents, 'markup'));
      let exposed = null;
      for (const variant of variants) {
        for (const match of variant.matchAll(/\bFMA\d{3,}\b/g)) {
          if (draftTokens.has(match[0])) {
            exposed = match[0];
            break;
          }
        }
        if (exposed) break;
      }
      if (exposed) {
        errors.push('draft anatomy ID exposed in built text: ' + file.slice(dist.length + 1) + ' (' + exposed + ')');
      }
    }
  }

  return { errors, approvedSystems, draftSystems, shippedModels: shipped.length };
}

function runCli() {
  if (process.argv.length > 4) {
    process.stderr.write('usage: node scripts/anatomy-production-audit.mjs [dist] [content/visuals]\n');
    process.exitCode = 2;
    return;
  }
  const result = auditAnatomyProduction(process.argv[2] ?? 'dist', process.argv[3] ?? 'content/visuals');
  if (result.errors.length) {
    process.stderr.write(`anatomy production audit FAILED (${result.errors.length} issue(s)):\n`);
    for (const error of result.errors) process.stderr.write(`- ${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`anatomy production audit PASS: ${result.approvedSystems} approved system(s), ${result.draftSystems} draft system(s), ${result.shippedModels} shipped model(s)\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runCli();
