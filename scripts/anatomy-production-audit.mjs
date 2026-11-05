/**
 * Read-only release gate for anatomy assets. Run after a production-style Astro build, never on an unbuilt source tree.
 * This verifies the actual dist/ output, not merely the draft-filtering functions.
 *
 * Usage: node scripts/anatomy-production-audit.mjs [dist-directory] [content/visuals-directory]
 */
import { closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

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
// Archives can conceal otherwise unapproved model files from a path/GLB-signature scan.
const ARCHIVE_ASSET = /\.(?:zip|tar|tgz|gz|bz2|xz|zst|7z|rar|cab|jar|war|ear|apk|ipa|iso|dmg)$/i;
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

/** A GLB is still unpublished model data if it is renamed to .bin or another suffix. */
function hasGlbMagic(path) {
  if (!Number.isInteger(fsConstants.O_NOFOLLOW)) throw new Error('this platform cannot safely audit symbolic links');
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    if (!fstatSync(fd).isFile()) throw new Error('not a regular file');
    const magic = Buffer.alloc(4);
    return readSync(fd, magic, 0, magic.length, 0) === magic.length && magic.toString('ascii') === 'glTF';
  } finally {
    closeSync(fd);
  }
}

/**
 * Reject common archive/container formats in production output. A nested GLB
 * or OBJ is just as public as a loose mesh, but walking the outer dist tree
 * cannot see into ZIP/TAR/compressed package payloads. This deliberately
 * fails closed rather than trying to unpack untrusted build artifacts.
 */
function hasArchiveMagicBytes(bytes) {
  const contains = (signature) => bytes.indexOf(Buffer.from(signature)) !== -1;
  // Search throughout Pagefind's decompressed payload: valid data may begin
  // with its own envelope marker before any embedded model/container bytes.
  if (contains([0x67, 0x6c, 0x54, 0x46]) ||
      contains([0x50, 0x4b, 0x03, 0x04]) || contains([0x50, 0x4b, 0x05, 0x06]) ||
      contains([0x50, 0x4b, 0x07, 0x08]) || contains([0x1f, 0x8b]) ||
      contains([0x42, 0x5a, 0x68]) || contains([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]) ||
      contains([0x28, 0xb5, 0x2f, 0xfd]) || contains([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) ||
      contains([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]) || contains([0x4d, 0x53, 0x43, 0x46]) ||
      contains([0x21, 0x3c, 0x61, 0x72, 0x63, 0x68, 0x3e, 0x0a])) return true;
  return bytes.indexOf(Buffer.from('ustar', 'ascii')) !== -1;
}

function hasArchiveMagicHeader(header) {
  const starts = (bytes) => header.length >= bytes.length && header.subarray(0, bytes.length).equals(Buffer.from(bytes));
  if (starts([0x50, 0x4b, 0x03, 0x04]) || starts([0x50, 0x4b, 0x05, 0x06]) ||
      starts([0x50, 0x4b, 0x07, 0x08]) || starts([0x1f, 0x8b]) ||
      starts([0x42, 0x5a, 0x68]) || starts([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]) ||
      starts([0x28, 0xb5, 0x2f, 0xfd]) || starts([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) ||
      starts([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]) || starts([0x4d, 0x53, 0x43, 0x46]) ||
      starts([0x21, 0x3c, 0x61, 0x72, 0x63, 0x68, 0x3e, 0x0a])) return true;
  return header.length >= 262 && header.toString('ascii', 257, 262) === 'ustar';
}

function hasArchiveMagic(path) {
  if (!Number.isInteger(fsConstants.O_NOFOLLOW)) throw new Error('this platform cannot safely audit symbolic links');
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    if (!fstatSync(fd).isFile()) throw new Error('not a regular file');
    const size = fstatSync(fd).size;
    const header = Buffer.alloc(Math.min(size, 512));
    if (header.length) readSync(fd, header, 0, header.length, 0);
    return hasArchiveMagicHeader(header);
  } finally {
    closeSync(fd);
  }
}

/** Read bytes from a regular file through its opened descriptor, without following symlinks. */
function readRegularBytesNoFollow(path, maxBytes = 64 * 1024 * 1024) {
  if (!Number.isInteger(fsConstants.O_NOFOLLOW)) throw new Error('this platform cannot safely audit symbolic links');
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stats = fstatSync(fd);
    if (!stats.isFile()) throw new Error('not a regular file');
    if (stats.size > maxBytes) throw new Error('oversized Pagefind artifact');
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Detect a fully framed GLB embedded in a Pagefind payload, not merely the text "glTF". */
function containsGlbHeader(bytes) {
  const magic = Buffer.from('glTF', 'ascii');
  for (let offset = bytes.indexOf(magic); offset >= 0; offset = bytes.indexOf(magic, offset + 1)) {
    if (offset + 20 > bytes.length) continue;
    const version = bytes.readUInt32LE(offset + 4);
    const totalLength = bytes.readUInt32LE(offset + 8);
    const jsonLength = bytes.readUInt32LE(offset + 12);
    const jsonType = bytes.readUInt32LE(offset + 16);
    if (version === 2 && totalLength >= 20 && offset + totalLength <= bytes.length &&
        jsonLength >= 2 && jsonLength <= totalLength - 20 && jsonType === 0x4e4f534a) return true;
  }
  return false;
}

/** Parse one definite-length CBOR value, rejecting embedded model/archive byte strings. */
function validPagefindCbor(bytes) {
  let offset = 0;
  let values = 0;
  const readArgument = (additional) => {
    if (additional < 24) return additional;
    if (additional === 24) {
      if (offset + 1 > bytes.length) return null;
      return bytes[offset++];
    }
    if (additional === 25) {
      if (offset + 2 > bytes.length) return null;
      const value = bytes.readUInt16BE(offset);
      offset += 2;
      return value;
    }
    if (additional === 26) {
      if (offset + 4 > bytes.length) return null;
      const value = bytes.readUInt32BE(offset);
      offset += 4;
      return value;
    }
    if (additional === 27) {
      if (offset + 8 > bytes.length) return null;
      const value = bytes.readBigUInt64BE(offset);
      offset += 8;
      return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
    }
    return null;
  };
  const parseValue = (depth) => {
    if (depth > 64 || ++values > 1_000_000 || offset >= bytes.length) return false;
    const initial = bytes[offset++];
    const major = initial >> 5;
    const additional = initial & 31;
    if (additional === 31) return false;
    const argument = readArgument(additional);
    if (argument === null) return false;
    if (major === 0 || major === 1 || major === 7) return true;
    if (major === 2 || major === 3) {
      if (!Number.isSafeInteger(argument) || argument < 0 || offset + argument > bytes.length) return false;
      const value = bytes.subarray(offset, offset + argument);
      if (major === 2 && (containsGlbHeader(value) || hasArchiveMagicBytes(value))) return false;
      if (major === 3) {
        try {
          new TextDecoder('utf-8', { fatal: true }).decode(value);
        } catch {
          return false;
        }
      }
      offset += argument;
      return true;
    }
    if (major === 4) {
      if (argument > 1_000_000) return false;
      for (let i = 0; i < argument; i += 1) if (!parseValue(depth + 1)) return false;
      return true;
    }
    if (major === 5) {
      if (argument > 1_000_000) return false;
      for (let i = 0; i < argument * 2; i += 1) if (!parseValue(depth + 1)) return false;
      return true;
    }
    if (major === 6) return parseValue(depth + 1);
    return false;
  };
  const rootMajor = bytes.length ? bytes[0] >> 5 : -1;
  return (rootMajor === 4 || rootMajor === 5) && parseValue(0) && offset === bytes.length;
}

const PAGEFIND_SIGNATURE = Buffer.from('pagefind_dcd', 'ascii');
const PAGEFIND_GZIP_PATH = /^\/pagefind\/(?:fragment\/[^/]+\.pf_fragment|index\/[^/]+\.pf_index|filter\/[^/]+\.pf_filter|[^/]+\.pf_meta)$/i;
const PAGEFIND_WASM_PATH = /^\/pagefind\/wasm\.[^/]+\.pagefind$/i;
const MAX_PAGEFIND_DECOMPRESSED_BYTES = 128 * 1024 * 1024;

function pagefindArtifactKind(url) {
  if (PAGEFIND_GZIP_PATH.test(url)) return 'gzip';
  if (PAGEFIND_WASM_PATH.test(url)) return 'wasm';
  return null;
}



/** Validate Pagefind's actual generated formats; a matching filename alone is never trusted. */
function validPagefindArtifact(path, kind) {
  let bytes;
  try {
    bytes = readRegularBytesNoFollow(path, 64 * 1024 * 1024);
  } catch {
    return false;
  }
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  let decoded;
  try {
    decoded = isGzip
      ? gunzipSync(bytes, {
          maxOutputLength: MAX_PAGEFIND_DECOMPRESSED_BYTES,
          rejectGarbageAfterEnd: true,
        })
      : bytes;
  } catch {
    return false;
  }
  if (decoded.length <= PAGEFIND_SIGNATURE.length ||
      !decoded.subarray(0, PAGEFIND_SIGNATURE.length).equals(PAGEFIND_SIGNATURE)) return false;
  const payload = decoded.subarray(PAGEFIND_SIGNATURE.length);
  if (containsGlbHeader(payload)) return false;
  if (kind === 'wasm') {
    return payload.length >= 8 &&
      payload.subarray(0, 4).equals(Buffer.from([0x00, 0x61, 0x73, 0x6d])) &&
      payload.readUInt32LE(4) === 1 &&
      WebAssembly.validate(payload);
  }
  if (path.endsWith('.pf_fragment')) {
    try {
      const fragment = JSON.parse(payload.toString('utf8'));
      return fragment !== null && typeof fragment === 'object' && !Array.isArray(fragment);
    } catch {
      return false;
    }
  }
  return validPagefindCbor(payload);
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
/**
 * Validate the mode-dependent layout mandated by the ratified
 * EXT_meshopt_compression spec. Independent enum checks are insufficient:
 * e.g. an OCTAHEDRAL filter must never be used on TRIANGLES.
 */
export function validMeshoptLayout(view, compression) {
  const stride = compression?.byteStride;
  const count = compression?.count;
  const mode = compression?.mode;
  const filter = compression?.filter ?? 'NONE';
  if (!view || !Number.isSafeInteger(stride) || stride < 1 || stride > 256 ||
      !Number.isSafeInteger(count) || count < 1 ||
      !Number.isSafeInteger(count * stride) || view.byteLength !== count * stride ||
      (view.byteStride !== undefined && view.byteStride !== stride)) return false;

  if (mode === 'ATTRIBUTES') {
    if (stride % 4 !== 0) return false;
    if (filter === 'NONE' || filter === 'EXPONENTIAL') return true;
    if (filter === 'OCTAHEDRAL') return stride === 4 || stride === 8;
    return filter === 'QUATERNION' && stride === 8;
  }
  return (mode === 'TRIANGLES' || mode === 'INDICES') &&
    (stride === 2 || stride === 4) && filter === 'NONE' &&
    (mode !== 'TRIANGLES' || count % 3 === 0);
}

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
    // Cueory's reviewed generator writes exactly one JSON and one BIN chunk.
    // Any extra chunk carries unreviewed bytes and must not be published.
    if (type !== 0x004e4942) throw new Error('unexpected non-BIN GLB chunk');
    if (type === 0x004e4942) {
      if (pos !== jsonEnd || binLength !== null) throw new Error('BIN chunk out of order');
      binLength = size;
    }
    pos += 8 + size;
  }
  const json = JSON.parse(bytes.toString('utf8', 20, jsonEnd));
  if (!json || json.asset?.version !== '2.0' || !Array.isArray(json.nodes) || !Array.isArray(json.meshes) ||
      !Array.isArray(json.accessors) || !Array.isArray(json.extensionsRequired)) {
    throw new Error('required model metadata missing');
  }
  // Every required extension must also be declared as used by the GLB.
  // A synthetic string in extensionsRequired alone is not a valid glTF declaration.
  if (!Array.isArray(json.extensionsUsed) ||
      json.extensionsRequired.some((extension) => !json.extensionsUsed.includes(extension))) {
    throw new Error('required GLB extension missing from extensionsUsed');
  }
  // Cueory's BodyParts3D pipeline produces untextured geometry. An approved
  // model with embedded or external image references would import unreviewed
  // visual content and could make network requests outside the local GLB.
  if ((json.images !== undefined && (!Array.isArray(json.images) || json.images.length !== 0)) ||
      (json.textures !== undefined && (!Array.isArray(json.textures) || json.textures.length !== 0))) {
    throw new Error('unreviewed GLB images or textures');
  }
  // gltfpack's EXT_meshopt_compression output uses a real GLB BIN at buffer 0
  // and a VIRTUAL fallback buffer at index 1 for the uncompressed bufferViews.
  // Khronos permits this required-extension fallback to have no stored bytes.
  // Reject external or arbitrary extra buffers, but do not reject this real format.
  const buffer = json.buffers?.[0];
  const fallback = json.buffers?.[1];
  const taggedFallback = json.buffers?.length === 2 &&
    fallback?.extensions?.EXT_meshopt_compression?.fallback === true &&
    fallback.uri === undefined &&
    Number.isSafeInteger(fallback.byteLength) && fallback.byteLength > 0 &&
    json.extensionsRequired.includes('EXT_meshopt_compression');
  if (!Array.isArray(json.buffers) ||
      (json.buffers.length !== 1 && !taggedFallback) ||
      !buffer || buffer.uri !== undefined || binLength === null ||
      !Number.isSafeInteger(buffer.byteLength) || buffer.byteLength <= 0 ||
      binLength < buffer.byteLength || binLength > buffer.byteLength + 3) {
    throw new Error('GLB BIN buffer missing or incomplete');
  }
  // The fallback is never fetched. Its views must be meshopt-compressed,
  // and every compressed byte range must stay inside the actual embedded BIN.
  if (taggedFallback) {
    if (!Array.isArray(json.bufferViews) || !json.bufferViews.length) {
      throw new Error('GLB meshopt fallback views are missing');
    }
    for (const view of json.bufferViews) {
      const holder = json.buffers[view?.buffer];
      const offset = view?.byteOffset ?? 0;
      const compression = view?.extensions?.EXT_meshopt_compression;
      if (!holder || !Number.isSafeInteger(offset) || offset < 0 ||
          !Number.isSafeInteger(view.byteLength) || view.byteLength <= 0 ||
          offset + view.byteLength > holder.byteLength ||
          (view.buffer === 1 && !compression)) {
        throw new Error('GLB fallback view is invalid');
      }
      if (compression) {
        const compressedOffset = compression.byteOffset ?? 0;
        if (compression.buffer !== 0 ||
            !Number.isSafeInteger(compressedOffset) || compressedOffset < 0 ||
            !Number.isSafeInteger(compression.byteLength) || compression.byteLength <= 0 ||
            compressedOffset + compression.byteLength > buffer.byteLength ||
            !Number.isSafeInteger(compression.count) || compression.count <= 0 ||
            !Number.isSafeInteger(compression.byteStride) || compression.byteStride <= 0 ||
            view.byteLength !== compression.count * compression.byteStride) {
          throw new Error('GLB compressed buffer view is invalid');
        }
      }
    }
  }
  // Every typed mesh accessor must resolve to the single embedded BIN buffer.
  // Validate both ordinary glTF byte ranges and meshopt-compressed byte ranges.
  // A declared meshopt extension alone does not make the geometry decodable.
  if (!Array.isArray(json.bufferViews) || json.bufferViews.length === 0) {
    throw new Error('GLB mesh buffer views are missing');
  }
  const validRange = (offset, length, limit) =>
    Number.isSafeInteger(offset) && offset >= 0 &&
    Number.isSafeInteger(length) && length > 0 &&
    Number.isSafeInteger(limit) && limit > 0 &&
    offset <= limit && length <= limit - offset;
  for (const view of json.bufferViews) {
    // gltfpack's virtual fallback views point at buffer 1, while their meshopt
    // extensions must point at the actually embedded compressed buffer 0.
    const onEmbeddedBuffer = view?.buffer === 0;
    const onMeshoptFallback = taggedFallback && view?.buffer === 1 &&
      view.extensions?.EXT_meshopt_compression != null;
    const holderLength = json.buffers?.[view?.buffer]?.byteLength;
    if (!view || (!onEmbeddedBuffer && !onMeshoptFallback) ||
        !validRange(view.byteOffset ?? 0, view.byteLength, holderLength)) {
      throw new Error('GLB buffer view outside embedded BIN or meshopt fallback');
    }
    const compressed = view.extensions?.EXT_meshopt_compression;
    if (compressed !== undefined &&
        (!compressed || compressed.buffer !== 0 ||
         !validRange(compressed.byteOffset ?? 0, compressed.byteLength, buffer.byteLength) ||
         !Number.isSafeInteger(compressed.count) || compressed.count < 1 ||
         !Number.isSafeInteger(compressed.byteStride) || compressed.byteStride < 1 ||
         !validMeshoptLayout(view, compressed))) {
      throw new Error('GLB meshopt range or decoder metadata invalid');
    }
  }
  // EXT_meshopt_compression mode and filter combinations must be decodable.
  // The fallback/byte-range checks above are necessary but not sufficient.
  for (const view of json.bufferViews) {
    const ext = view.extensions?.EXT_meshopt_compression;
    if (!ext) continue;
    const stride = ext.byteStride;
    const filter = ext.filter ?? 'NONE';
    if ((ext.mode === 'ATTRIBUTES' && stride % 4 !== 0) ||
        (ext.mode === 'TRIANGLES' &&
          (ext.count % 3 !== 0 || ![2, 4].includes(stride))) ||
        (ext.mode === 'INDICES' && ![2, 4].includes(stride)) ||
        ((ext.mode === 'TRIANGLES' || ext.mode === 'INDICES') && filter !== 'NONE') ||
        (filter === 'OCTAHEDRAL' && ![4, 8].includes(stride)) ||
        (filter === 'QUATERNION' && stride !== 8) ||
        (filter === 'EXPONENTIAL' && stride % 4 !== 0)) {
      throw new Error('GLB meshopt mode/stride/filter combination is invalid');
    }
  }
  // Validate the *full* typed accessor span, not only its starting offset.
  // Cueory's generator emits scalar indices and vector attributes, with the
  // meshopt fallback view describing their decompressed, virtual byte ranges.
  const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  for (const accessor of json.accessors) {
    if (!accessor || !Number.isSafeInteger(accessor.bufferView) ||
        accessor.bufferView < 0 || accessor.bufferView >= json.bufferViews.length) {
      throw new Error('GLB accessor references a missing buffer view');
    }
    const view = json.bufferViews[accessor.bufferView];
    const unit = componentBytes[accessor.componentType];
    const count = components[accessor.type];
    if (!unit || !count || !Number.isSafeInteger(accessor.count) || accessor.count < 1 ||
        accessor.sparse !== undefined) {
      throw new Error('GLB accessor has unsupported typed data');
    }
    const elementBytes = unit * count;
    const stride = view.byteStride ?? elementBytes;
    const offset = accessor.byteOffset ?? 0;
    const span = (accessor.count - 1) * stride + elementBytes;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset % unit !== 0 ||
        !Number.isSafeInteger(stride) || stride < elementBytes || stride % unit !== 0 ||
        !Number.isSafeInteger(span) || offset > view.byteLength ||
        span > view.byteLength - offset) {
      throw new Error('GLB typed accessor exceeds its buffer view');
    }
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
      // A binary cannot be independently approved as two different system models.
      // Overwriting this map would hide the first system's node/credit checks.
      for (const url of urls) {
        if (approvedModels.has(url)) {
          errors.push(`ambiguous approval: ${url} is claimed by multiple approved systems`);
        }
        approved.add(url);
        approvedModels.set(url, data);
      }
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
  for (const path of builtFiles) {
    const url = toUrl(path);
    const pagefindKind = pagefindArtifactKind(url);
    if (ARCHIVE_ASSET.test(path) ||
        (pagefindKind ? !validPagefindArtifact(path, pagefindKind) : hasArchiveMagic(path))) {
      errors.push(\`archive/container in production output requires explicit review: \${url}\`);
    }
  }
  const shipped = [...new Set(builtFiles
    .filter((path) => MODEL_ASSET.test(path) || hasGlbMagic(path))
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
      // Validate the exact bytes that Wrangler would upload. A GLB's JSON and
      // meshopt ranges can be intact while its compressed BIN bytes are corrupt.
      // The checked-in public model is separately decoded in CI. Astro must
      // copy it into dist without modifying the reviewed payload.
      const checkedInPath = join(resolve(content, '..', '..', 'public'), url.slice(1));
      const referenceFd = openSync(checkedInPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      try {
        const reference = fstatSync(referenceFd);
        if (!reference.isFile() || reference.size !== stats.size ||
            !readFileSync(referenceFd).equals(bytes)) {
          throw new Error('built approved GLB bytes differ from checked-in source');
        }
      } finally {
        closeSync(referenceFd);
      }
      const json = parseApprovedGlb(bytes);
      const expectedNames = manifest.labels.map((label) => label.id);
      const nodeNames = json.nodes.map((node) => node.name);
      if (nodeNames.length !== expectedNames.length ||
          new Set(nodeNames).size !== nodeNames.length ||
          expectedNames.some((id, i) => nodeNames[i] !== id)) {
        throw new Error('node identifiers do not match approved labels');
      }
      // Cueory's BodyParts3D generator emits a single active scene with
      // every reviewed structure as an ordered root. A glTF can contain named
      // meshes without attaching any of them to the scene loaded by GLTFLoader.
      const roots = json.scenes?.[0]?.nodes;
      if (json.scene !== 0 || !Array.isArray(json.scenes) ||
          json.scenes.length !== 1 || !Array.isArray(roots) ||
          roots.length !== json.nodes.length ||
          roots.some((nodeIndex, i) => nodeIndex !== i) ||
          json.nodes.some((node) => node.children !== undefined)) {
        throw new Error('approved structure nodes are not attached to the active scene');
      }
      // A named node without a linked mesh can have matching metadata while
      // rendering no anatomy. The release check must inspect the shipped GLB,
      // not just count triangles in unrelated, unreferenced meshes.
      if (json.nodes.some((node) =>
        !Number.isSafeInteger(node.mesh) || node.mesh < 0 || node.mesh >= json.meshes.length)) {
        throw new Error('approved structure node is missing an attached mesh');
      }
      // Every reviewed structure owns one distinct mesh, with no missing or
      // unreferenced meshes. This is the exact Task 177 generator contract.
      if (json.nodes.length !== json.meshes.length ||
          new Set(json.nodes.map((node) => node.mesh)).size !== json.nodes.length) {
        throw new Error('approved structures have duplicate or unused meshes');
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
        // An otherwise valid scene may have a named structure pointing at an
        // empty mesh while another structure supplies all the triangles.
        // Every approved structure must have drawable geometry of its own.
        if (!Array.isArray(mesh?.primitives) || mesh.primitives.length === 0) {
          throw new Error('approved structure mesh has no triangle primitives');
        }
        for (const primitive of mesh.primitives) {
          const indexAccessor = json.accessors[primitive.indices];
          const positionAccessor = json.accessors[primitive.attributes?.POSITION];
          if ((primitive.mode !== undefined && primitive.mode !== 4) ||
              !Number.isInteger(primitive.indices) ||
              !Number.isSafeInteger(indexAccessor?.count) ||
              indexAccessor.count < 3 ||
              indexAccessor.count % 3 !== 0 ||
              ![5121, 5123, 5125].includes(indexAccessor.componentType) ||
              indexAccessor.type !== 'SCALAR' ||
              !Number.isInteger(primitive.attributes?.POSITION) ||
              !Number.isSafeInteger(positionAccessor?.count) ||
              positionAccessor.count < 3 ||
              positionAccessor.componentType !== 5126 ||
              positionAccessor.type !== 'VEC3') {
            throw new Error('invalid mesh primitive or glTF accessors');
          }
          // A declared decoder extension is not proof that the actual rendered
          // geometry uses it. The approved BodyParts3D gltfpack pipeline
          // compresses both index and position data with meshopt.
          const indexView = json.bufferViews[indexAccessor.bufferView];
          const positionView = json.bufferViews[positionAccessor.bufferView];
          if (indexView?.extensions?.EXT_meshopt_compression == null ||
              positionView?.extensions?.EXT_meshopt_compression == null) {
            throw new Error('approved primitive index and position data must be meshopt-compressed');
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
