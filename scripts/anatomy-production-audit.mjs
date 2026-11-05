/**
 * Read-only release gate for anatomy assets. Run after a production-style Astro build, never on an unbuilt source tree.
 * This verifies the actual dist/ output, not merely the draft-filtering functions.
 *
 * Usage: node scripts/anatomy-production-audit.mjs [dist-directory] [content/visuals-directory]
 */
import { closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ANATOMY_FILE = /^anatomy-[a-z0-9-]+\.json$/;
const MODEL_URL = /^\/models\/anatomy\/[a-z0-9][a-z0-9_-]*\.glb$/;
// Match the canonical BodyParts3D IDs accepted by src/content.config.ts.
const STRUCTURE_ID = /^(?:FMA|BP)\d+[a-z]*$/;
const STRUCTURE_TOKEN = /\b(?:FMA|BP)\d+[a-z]*\b/g;
const BODYPARTS3D_URL_PREFIX = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/';
const BODYPARTS3D_CREDIT = 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International';
/** The release gate must verify the actual file containing each quoted anatomy name.
 * A valid archive origin alone is not proof that a README citation points to a parts-list row.
 */
const BODYPARTS3D_SECTION_FILES = new Map([
  ['README_e.html, Release 4.0', 'README_e.html'],
  ['partof_parts_list_e.txt, Release 4.0', 'partof_parts_list_e.txt'],
  ['isa_parts_list_e.txt, Release 4.0', 'isa_parts_list_e.txt'],
]);

// Fail closed on any publicly shipped 3D geometry, including misplaced copies and raw source meshes.
// Include common alternative mesh formats so a renamed draft cannot bypass the production gate.
const MODEL_ASSET = /\.(?:glb|gltf|obj|stl|fbx|ply|dae|3mf|usd|usdz|blend)$/i;
// Scan all ordinary published text assets, not just the anatomy page or hashed JavaScript chunks.
// Site search, manifests or unrelated pages can otherwise accidentally expose a draft identifier.
const TEXT_ASSET = /\.(?:html?|js|mjs|json|map|xml|svg|txt|css|csv|tsv|md|webmanifest)$/i;
const SCRIPT_ESCAPES_ASSET = /\.(?:js|mjs|json|map|webmanifest|html?)$/i;
const MARKUP_ESCAPES_ASSET = /\.(?:html?|svg|xml)$/i;
const CSS_ESCAPES_ASSET = /\.css$/i;

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
 * Validate a full built GLB, including its JSON/BIN framing. No 3D runtime
 * is needed. The stricter published-asset check rejects malformed or stale
 * blobs before Wrangler can upload an approved model.
 */
export function parseApprovedGlb(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 20) throw new Error('invalid GLB size');
  if (bytes.toString('ascii', 0, 4) !== 'glTF' ||
      bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error('invalid GLB v2 header');
  }
  const len = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a ||
      len === 0 || len % 4 !== 0 || 20 + len > bytes.length) {
    throw new Error('incomplete GLB JSON chunk');
  }
  const jsonEnd = 20 + len;
  let binLength = null;
  for (let pos = jsonEnd; pos < bytes.length;) {
    if (pos + 8 > bytes.length) throw new Error('truncated GLB chunk header');
    const size = bytes.readUInt32LE(pos);
    const type = bytes.readUInt32LE(pos + 4);
    if (size % 4 !== 0 || pos + 8 + size > bytes.length) {
      throw new Error('invalid GLB chunk length');
    }
    if (type === 0x4e4f534a) throw new Error('unexpected additional JSON chunk');
    if (type === 0x004e4942) {
      if (pos !== jsonEnd || binLength !== null) throw new Error('BIN chunk out of order');
      binLength = size;
    }
    pos += 8 + size;
  }
  const json = JSON.parse(bytes.toString('utf8', 20, jsonEnd));
  if (!json || !Array.isArray(json.nodes) || !Array.isArray(json.meshes) ||
      !Array.isArray(json.accessors) || !Array.isArray(json.extensionsRequired)) {
    throw new Error('required model metadata missing');
  }
  const buffer = json.buffers?.[0];
  if (!buffer || buffer.uri !== undefined || binLength === null ||
      !Number.isSafeInteger(buffer.byteLength) ||
      binLength < buffer.byteLength || binLength > buffer.byteLength + 3) {
    throw new Error('GLB BIN buffer missing or incomplete');
  }
  return json;
}

/**
 * Verify that production has a readable Astro HTML entry point.
 * An empty dist directory must never pass a release-upload check merely
 * because it contains no draft anatomy files.
 */
export function builtSiteEntrypointErrors(distDir) {
  const entry = join(resolve(distDir), 'index.html');
  try {
    const html = readRegularFileNoFollow(entry);
    if (/<html(?:\s|>)/i.test(html) && /<body(?:\s|>)/i.test(html)) return [];
    return ['production site entry point is invalid: /index.html'];
  } catch {
    return ['production site entry point is missing or unreadable: /index.html'];
  }
}

/**
 * Decode common ASCII escapes before scanning generated text for draft IDs.
 * Bundlers can emit JSON/JS Unicode escapes, and HTML can use numeric entities.
 * This is read-only normalization for the audit, not a change to shipped files.
 */
export function decodeAsciiEscapesForAudit(text, syntax) {
  if (syntax === 'script') {
    // Decode only active JS escapes. An even run of backslashes means the
    // slash was itself escaped, so "\\u0046" is text, not the letter F.
    // Preserve preceding escaped slash pairs while decoding a final odd slash.
    // Padded code-point escapes such as \u{0046} are valid JavaScript too.
    // V8 accepts arbitrarily many leading zeroes inside braces, so do not
    // cap the hex digit count or a legal encoded draft ID can evade the gate.
    return text.replace(/(?<!\\)((?:\\\\)*)\\(?:u00([0-7][0-9a-f])|x([0-7][0-9a-f])|u\{([0-9a-f]+)\})/gi,
      (match, pairs, unicode, hex, braced) => {
        const value = Number.parseInt(unicode ?? hex ?? braced, 16);
        return Number.isInteger(value) && value <= 127 ? pairs + String.fromCharCode(value) : match;
      });
  }
  if (syntax === 'markup') {
    // HTML numeric references may omit the semicolon and may contain any
    // number of leading zeroes (for example &#00000070IX001 is FIX001).
    // Consume the complete digit run or padded encodings bypass the audit.
    return text.replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (match, hex, decimal) => {
      const value = hex === undefined ? Number.parseInt(decimal, 10) : Number.parseInt(hex, 16);
      return value <= 127 ? String.fromCharCode(value) : match;
    });
  }
  if (syntax === 'css') {
    // CSS hex escapes use one to six digits, optionally followed by one space
    // or other CSS whitespace. Paired backslashes are literal, not active escapes.
    return text.replace(/(?<!\\)((?:\\\\)*)\\([0-9a-f]{1,6})(?:[ \t\r\n\f])?/gi,
      (match, pairs, hex) => {
        const value = Number.parseInt(hex, 16);
        return value > 0 && value <= 127 ? pairs + String.fromCharCode(value) : match;
      });
  }
  return text;
}

/** Validate a real ISO calendar date, not just the YYYY-MM-DD shape. */
function validRetrievedDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** Validate the resolved origin and path, not an attacker-controlled raw text prefix. */
function validBodyParts3dSourceUrl(value) {
  if (typeof value !== 'string') return false;
  // URL() removes literal and encoded dot segments before exposing pathname.
  // Reject the unnormalized source path so it cannot leave then re-enter LATEST.
  const rawPath = value.split(/[?#]/, 1)[0] ?? '';
  if (rawPath.includes('%') || /[\\/]\.{1,2}(?:[\\/]|$)/.test(rawPath)) return false;
  try {
    const page = new URL(value);
    const archive = new URL(BODYPARTS3D_URL_PREFIX);
    return page.origin === archive.origin &&
      page.pathname.startsWith(archive.pathname) &&
      page.pathname.length > archive.pathname.length &&
      !page.pathname.includes('%') &&
      !page.username && !page.password && !page.port;
  } catch {
    return false;
  }
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
  const approvedModels = new Map();
  let approvedSystems = 0;
  let draftSystems = 0;

  if (!existsSync(dist) || !statSync(dist).isDirectory()) {
    return { errors: [`production output does not exist: ${dist}`], approvedSystems, draftSystems, shippedModels: 0 };
  }
  if (!existsSync(content) || !statSync(content).isDirectory()) {
    return { errors: [`anatomy source directory does not exist: ${content}`], approvedSystems, draftSystems, shippedModels: 0 };
  }

  // Root paths must be real directories too. A symlink as the audit root
  // otherwise bypasses walkFiles' per-entry symlink rejection.
  if (lstatSync(dist).isSymbolicLink()) {
    return { errors: [`production output root is a symbolic link: ${dist}`], approvedSystems, draftSystems, shippedModels: 0 };
  }
  if (lstatSync(content).isSymbolicLink()) {
    return { errors: [`anatomy source root is a symbolic link: ${content}`], approvedSystems, draftSystems, shippedModels: 0 };
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
      urls.forEach((url) => approvedModels.set(url, data));
      // A reviewed CC BY 4.0 source record is not enough if the actual model
      // claims an older or unknown archive release with different rights.
      if (data.model.release !== 'BodyParts3D 4.0') {
        errors.push(`${name}: approved model must use reviewed BodyParts3D 4.0 release`);
      }
      // Independently verify the source links even when dist/ is older than the
      // current manifest. A nonempty citation string is not proof of a source.
      const sourceIds = new Set();
      const sourceSections = new Map();
      const sourceQuotes = new Map();
      if (!Array.isArray(data.sources) || data.sources.length === 0) {
        errors.push(`${name}: approved source records are missing`);
      } else {
        for (const source of data.sources) {
          // JSON can contain null or primitive entries; report them instead of
          // throwing before the audit checks the remaining release evidence.
          if (!source || typeof source !== 'object' || Array.isArray(source)) {
            errors.push(`${name}: invalid approved source ID`);
            continue;
          }
          if (typeof source.id !== 'string' || !source.id.trim()) {
            errors.push(`${name}: invalid approved source ID`);
            continue;
          } else if (sourceIds.has(source.id)) {
            errors.push(`${name}: duplicate approved source ID ${source.id}`);
          } else {
            sourceIds.add(source.id);
            sourceSections.set(source.id, source.section);
            sourceQuotes.set(source.id, source.quote);
          }
          // Resolving the ID is insufficient when the cited record no longer
          // contains the open-source quote and rights evidence required by the
          // visuals-kit contract. Production audits also check stale dist/.
          const hasQuote = typeof source.quote === 'string' && source.quote.trim().length > 0;
          const hasSection = typeof source.section === 'string' && source.section.trim().length > 0;
          const sourceFile = BODYPARTS3D_SECTION_FILES.get(source.section);
          const sourceTypeMatches = source.id === 'bp3d-readme'
            ? sourceFile === 'README_e.html'
            : /^bp3d-(?:FMA|BP)\d+[a-z]*$/.test(source.id) &&
              (sourceFile === 'partof_parts_list_e.txt' || sourceFile === 'isa_parts_list_e.txt');
          const hasPage = typeof sourceFile === 'string' &&
            sourceTypeMatches &&
            source.url === BODYPARTS3D_URL_PREFIX + sourceFile &&
            validBodyParts3dSourceUrl(source.url);
          const hasDate = validRetrievedDay(source.retrieved);
          if (!hasQuote || !hasSection || !hasPage || !hasDate ||
              source.book !== 'BodyParts3D' || source.license !== 'CC BY 4.0') {
            errors.push(`${name}: approved source ${source.id} has incomplete or incompatible citation and rights evidence`);
          }
        }
      }
      // A production-style audit must also reject a damaged *approved* record.
      // Otherwise a stale dist/ can pass despite having no reviewed source names.
      if (!Array.isArray(data.labels) || data.labels.length === 0) {
        errors.push(`${name}: approved labels are missing`);
      } else {
        const seenIds = new Set();
        for (const label of data.labels) {
          if (!label || typeof label.id !== 'string' || !STRUCTURE_ID.test(label.id)) {
            errors.push(`${name}: invalid approved label ID`);
            continue;
          }
          if (seenIds.has(label.id)) errors.push(`${name}: duplicate approved label ID ${label.id}`);
          seenIds.add(label.id);
          if (typeof label.text !== 'string' || label.text.trim().length === 0) {
            errors.push(`${name}: approved label ${label.id} has no official name`);
          }
          if (typeof label.source !== 'string' || label.source.trim().length === 0) {
            errors.push(`${name}: approved label ${label.id} has no source citation`);
          } else if (!sourceIds.has(label.source)) {
            errors.push(`${name}: approved label ${label.id} references unknown source ${label.source}`);
          } else if (label.source !== `bp3d-${label.id}`) {
            // Each approved BodyParts3D label must cite its own reviewed ID.
            errors.push(`${name}: approved label ${label.id} source does not match structure ID`);
          } else if (!/^(?:partof|isa)_parts_list_e\.txt, Release 4\.0$/.test(sourceSections.get(label.source) ?? '')) {
            // The overview README cannot be used as evidence for an individual structure name.
            errors.push(`${name}: approved label ${label.id} must cite a Release 4.0 parts-list table`);
          } else {
            // Compare the actual recorded FMA/BP/name row to the public label.
            // A canonical structure ID may be either the FMA concept or its BP element ID.
            // A valid URL with a name from another structure is not a safe citation.
            const quote = sourceQuotes.get(label.source);
            const original = typeof quote === 'string'
              ? /^(FMA\d+[a-z]*)\s+(BP\d+[a-z]*)\s+(.+)$/.exec(quote)
              : null;
            if (!original || (original[1] !== label.id && original[2] !== label.id) || original[3] !== label.text) {
              errors.push(`${name}: approved label ${label.id} does not match its cited source row`);
            }
          }
        }
      }
    } else {
      draftSystems++;
      urls.forEach((url) => draft.add(url));
      if (!Array.isArray(data.labels) || data.labels.length === 0) {
        errors.push(`${name}: draft labels are missing`);
      } else {
        for (const label of data.labels) {
          if (!label || typeof label.id !== 'string' || !STRUCTURE_ID.test(label.id)) {
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

  // A review of source GLBs alone cannot validate the exact deployed bytes.
  // Check the shipped approved file's framing, source identity, mandatory
  // compression, copyright, and per-model budget before publication.
  for (const [url, manifest] of approvedModels) {
    if (!shipped.includes(url)) continue;
    const path = join(dist, url.slice(1));
    let fd;
    try {
      if (!Number.isInteger(fsConstants.O_NOFOLLOW)) throw new Error('no symlink guard');
      fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      const stats = fstatSync(fd);
      if (!stats.isFile() || stats.size < 20 || stats.size > 3 * 1024 * 1024) {
        throw new Error('invalid or oversized GLB');
      }
      const bytes = readFileSync(fd);
      const json = parseApprovedGlb(bytes);
      const expectedNames = manifest.labels.map((label) => label.id);
      const nodeNames = json.nodes.map((node) => node.name);
      if (nodeNames.length !== expectedNames.length ||
          new Set(nodeNames).size !== nodeNames.length ||
          expectedNames.some((id, i) => nodeNames[i] !== id)) {
        throw new Error('node identifiers do not match approved labels');
      }
      if (json.asset?.copyright !== BODYPARTS3D_CREDIT) {
        throw new Error('BodyParts3D copyright is missing');
      }
      if (json.extensionsRequired.length !== 2 ||
          !json.extensionsRequired.includes('EXT_meshopt_compression') ||
          !json.extensionsRequired.includes('KHR_mesh_quantization')) {
        throw new Error('meshopt/quantization decoder contract mismatch');
      }
      let triangles = 0;
      for (const mesh of json.meshes) {
        for (const primitive of mesh.primitives) {
          if (primitive.mode !== undefined && primitive.mode !== 4 ||
              !Number.isInteger(primitive.indices) ||
              !Number.isSafeInteger(json.accessors[primitive.indices]?.count) ||
              json.accessors[primitive.indices].count < 3 ||
              json.accessors[primitive.indices].count % 3 !== 0) {
            throw new Error('invalid triangle index accessor');
          }
          triangles += json.accessors[primitive.indices].count / 3;
        }
      }
      if (triangles < 1 || triangles > 150000) throw new Error('model triangle budget exceeded');
    } catch {
      errors.push(`approved model failed built GLB geometry, identity or credit verification: ${url}`);
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }

  for (const path of builtFiles) {
    const url = toUrl(path);
    if (url.startsWith('/preview/anatomy-fixture/')) {
      errors.push(`test fixture exposed in production: ${url}`);
    }
  }

  // Draft labels must not be baked into static HTML/JS data, even if their .glb files were pruned.
  // The identifiers are original data keys, not guessed medical wording. Only match exact token boundaries.
  // Search static text assets, including Pagefind's readable JSON and other public routes.
  // Pagefind's binary .pf_fragment/.pf_index/.pf_meta files are not decoded here.
  // The separate generated-index regression enforces exclusion of noindex preview pages.
  // Token boundaries avoid confusing BP24 with BP240 or FMA7198nsn with FMA7198nsn0. Unknown ID formats fail source validation above.
  const textFiles = builtFiles.filter((path) => TEXT_ASSET.test(path));
  const draftTokens = draftIds;
  for (const file of textFiles) {
    let contents;
    try {
      contents = readRegularFileNoFollow(file);
    } catch {
      errors.push(`cannot safely read built text: ${file.slice(dist.length + 1)}`);
      continue;
    }
    // Both the original bytes and their context-appropriate decoded versions
    // must be checked. This recognizes encoded IDs without erasing raw token boundaries.
    const variants = [contents];
    if (SCRIPT_ESCAPES_ASSET.test(file)) variants.push(decodeAsciiEscapesForAudit(contents, 'script'));
    if (MARKUP_ESCAPES_ASSET.test(file)) variants.push(decodeAsciiEscapesForAudit(contents, 'markup'));
    // Inline <style> and style attributes in HTML/SVG can carry active CSS escapes too.
    if (CSS_ESCAPES_ASSET.test(file) || MARKUP_ESCAPES_ASSET.test(file)) variants.push(decodeAsciiEscapesForAudit(contents, 'css'));
    // HTML style attributes decode numeric entities before parsing their CSS escapes.
    if (MARKUP_ESCAPES_ASSET.test(file)) variants.push(decodeAsciiEscapesForAudit(decodeAsciiEscapesForAudit(contents, 'markup'), 'css'));
    if (draftTokens.size) {
      let exposedDraft = null;
      for (const variant of variants) {
        for (const match of variant.matchAll(STRUCTURE_TOKEN)) {
          if (draftTokens.has(match[0])) {
            exposedDraft = match[0];
            break;
          }
        }
        if (exposedDraft) break;
      }
      if (exposedDraft) {
        errors.push('draft anatomy ID exposed in built text: ' + file.slice(dist.length + 1) + ' (' + exposedDraft + ')');
      }
    }
    // Reserved synthetic shape IDs are forbidden in public HTML, JS, and search
    // assets even if every real source record is approved.
    let exposedFixture = null;
    for (const variant of variants) {
      const match = /\bFIX\d{3,}\b/.exec(variant);
      if (match) {
        exposedFixture = match[0];
        break;
      }
    }
    if (exposedFixture) {
      errors.push('test fixture ID exposed in built text: ' + file.slice(dist.length + 1) + ' (' + exposedFixture + ')');
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
