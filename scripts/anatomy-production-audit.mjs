/**
 * Read-only release gate for anatomy assets. Run after a production-style Astro build, never on an unbuilt source tree.
 * This verifies the actual dist/ output, not merely the draft-filtering functions.
 *
 * Usage: node scripts/anatomy-production-audit.mjs [dist-directory] [content/visuals-directory]
 */
import { closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync, inflateRawSync } from 'node:zlib';

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
// Published file types have to be explicitly reviewed. A hidden model can be a
// plain JSON glTF renamed .dat, which has neither .gltf suffix nor GLB magic.
const REVIEWED_OUTPUT_TYPE = /\.(?:html?|js|mjs|cjs|css|json|map|xml|svg|txt|csv|tsv|md|webmanifest|ico|png|jpe?g|gif|webp|avif|bmp|tiff?|woff2?|ttf|otf|eot|wasm|pdf|mp4|webm|mp3|m4a|wav|ogg|vtt)$/i;
const REVIEWED_EXTENSIONLESS_OUTPUT = new Set(['/_headers', '/_redirects']);
// Archives can conceal otherwise unapproved model files from a path/GLB-signature scan.
const ARCHIVE_ASSET = /\.(?:zip|tar|tgz|gz|bz2|xz|zst|7z|rar|cab|jar|war|ear|apk|ipa|iso|dmg)$/i;
// Scan all ordinary published text assets, not just the anatomy page or hashed JavaScript chunks.
// Site search, manifests or unrelated pages can otherwise accidentally expose a draft identifier.
const TEXT_ASSET = /\.(?:html?|js|mjs|cjs|json|map|xml|svg|txt|css|csv|tsv|md|webmanifest|vtt)$/i;
const SCRIPT_ESCAPES_ASSET = /\.(?:js|mjs|cjs|json|map|webmanifest|html?)$/i;
const MARKUP_ESCAPES_ASSET = /\.(?:html?|svg|xml)$/i;
const CSS_ESCAPES_ASSET = /\.css$/i;
/** A bounded pass over URL-encoded public text, including mixed literal and %HH IDs. */
export function decodePercentEscapesForAudit(text) {
  // ASCII URL percent-escapes are decoded as bytes, with no URI authority,
  // percent-decoding rounds, or Unicode normalization. Preserve all other
  // characters verbatim so an encoded reserved ID cannot evade an exact match.
  return text.replace(/%([0-7][0-9a-f])/gi, (_match, byte) =>
    String.fromCharCode(Number.parseInt(byte, 16)));
}



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
 * Detect a drawable, plain-text glTF 2.0 payload regardless of its filename.
 * Large JSON objects are indeterminate under the bounded 16 MiB scan and must
 * fail closed, rather than silently certifying possibly hidden geometry.
 */
function hasTextGltfModel(path) {
  if (!Number.isInteger(fsConstants.O_NOFOLLOW)) throw new Error('this platform cannot safely audit symbolic links');
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stats = fstatSync(fd);
    if (!stats.isFile()) throw new Error('not a regular file');
    const prefix = Buffer.alloc(Math.min(stats.size, 4096));
    if (prefix.length) readSync(fd, prefix, 0, prefix.length, 0);
    const start = prefix.toString('utf8').replace(/^\uFEFF/u, '').trimStart();
    // A JSON model may legally begin with many kilobytes of whitespace.
    // If the bounded prefix has not reached the first token, fail closed.
    if (start.length === 0 && stats.size > prefix.length) return true;
    if (!start.startsWith('{')) return false;
    if (stats.size > 16 * 1024 * 1024) return true;
    let json;
    try { json = JSON.parse(readFileSync(fd, 'utf8').replace(/^\uFEFF/u, '')); }
    catch { return false; }
    return json !== null && typeof json === 'object' && !Array.isArray(json) &&
      json.asset?.version === '2.0' &&
      Array.isArray(json.meshes) && json.meshes.some((mesh) => Array.isArray(mesh?.primitives) &&
        mesh.primitives.some((primitive) => Number.isInteger(primitive?.attributes?.POSITION) &&
          primitive.attributes.POSITION >= 0 && primitive.attributes.POSITION < json.accessors.length)) &&
      Array.isArray(json.accessors) && json.accessors.length > 0 &&
      Array.isArray(json.buffers) && json.buffers.length > 0 &&
      Array.isArray(json.bufferViews) && json.bufferViews.length > 0;
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
function hasTarHeaderAt(bytes, offset) {
  if (offset < 0 || offset + 512 > bytes.length) return false;
  const magic = bytes.subarray(offset + 257, offset + 263);
  const isUstar = magic.toString('ascii', 0, 5) === 'ustar';
  // The original V7 header predates the ustar magic field; those six bytes
  // are all NUL. Validate its numeric fields and checksum before accepting it.
  const isV7 = magic.every((byte) => byte === 0);
  if (!isUstar && !isV7) return false;
  const checksumField = bytes.toString('ascii', offset + 148, offset + 156);
  const checksumDigits = checksumField.replace(/[\0 ]+$/u, '').trim();
  if (!/^[0-7]{6}$/u.test(checksumDigits)) return false;
  if (isV7) {
    for (const [start, end] of [[100, 108], [108, 116], [116, 124], [124, 136], [136, 148]]) {
      const field = bytes.toString('ascii', offset + start, offset + end).replace(/[\0 ]+$/u, '').trim();
      if (!/^[0-7]+$/u.test(field)) return false;
    }
  }
  const expected = Number.parseInt(checksumDigits, 8);
  let actual = 0;
  for (let i = 0; i < 512; i += 1) actual += i >= 148 && i < 156 ? 0x20 : bytes[offset + i];
  return actual === expected;
}

function containsTarHeader(bytes) {
  // POSIX ustar and pre-ustar V7 both carry a six-digit octal checksum at
  // byte 148. Scan for that narrow candidate field, then validate the full
  // 512-byte header; V7 has no magic marker to search for.
  for (let checksumOffset = 148; checksumOffset + 8 <= bytes.length; checksumOffset += 1) {
    let octal = true;
    for (let digit = 0; digit < 6; digit += 1) {
      const value = bytes[checksumOffset + digit];
      if (value < 0x30 || value > 0x37) { octal = false; break; }
    }
    if (!octal) continue;
    const terminator = bytes[checksumOffset + 6];
    const padding = bytes[checksumOffset + 7];
    if ((terminator !== 0 && terminator !== 0x20) || (padding !== 0 && padding !== 0x20)) continue;
    if (hasTarHeaderAt(bytes, checksumOffset - 148)) return true;
  }
  return false;
}

function hasArchiveMagicBytes(bytes, includeAsciiMarkers = true, includeInteriorGzip = true) {
  const contains = (signature) => bytes.indexOf(Buffer.from(signature)) !== -1;
  // Multi-byte archive signatures can be searched within opaque payloads.
  // Gzip's two-byte magic is too short to be meaningful at arbitrary offsets:
  // ordinary PNG/WOFF2/WebP compressed data naturally contains 1f 8b.
  // Check gzip at offset zero in hasArchiveMagicHeader(), and validate the
  // actual bounded gzip envelope for Pagefind artifacts before accepting them.
  if (contains([0x50, 0x4b, 0x03, 0x04]) || contains([0x50, 0x4b, 0x05, 0x06]) ||
      contains([0x50, 0x4b, 0x07, 0x08]) || (includeInteriorGzip && contains([0x1f, 0x8b])) ||
      contains([0x42, 0x5a, 0x68]) || contains([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]) ||
      contains([0x28, 0xb5, 0x2f, 0xfd]) || contains([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) ||
      contains([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]) || contains([0x4d, 0x53, 0x43, 0x46])) return true;
  if (containsTarHeader(bytes)) return true;
  return includeAsciiMarkers && contains([0x21, 0x3c, 0x61, 0x72, 0x63, 0x68, 0x3e, 0x0a]);
}

function hasArchiveMagicHeader(header, includeAsciiMarkers = true) {
  const starts = (bytes) => header.length >= bytes.length && header.subarray(0, bytes.length).equals(Buffer.from(bytes));
  if (starts([0x50, 0x4b, 0x03, 0x04]) || starts([0x50, 0x4b, 0x05, 0x06]) ||
      starts([0x50, 0x4b, 0x07, 0x08]) || starts([0x1f, 0x8b]) ||
      starts([0x42, 0x5a, 0x68]) || starts([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]) ||
      starts([0x28, 0xb5, 0x2f, 0xfd]) || starts([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) ||
      starts([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]) || starts([0x4d, 0x53, 0x43, 0x46])) return true;
  if (includeAsciiMarkers && starts([0x21, 0x3c, 0x61, 0x72, 0x63, 0x68, 0x3e, 0x0a])) return true;
  return hasTarHeaderAt(header, 0);
}

/** Detect a framed GLB embedded after byte zero in an ordinary output file. */
function containsGlbHeaderAtOffset(bytes, baseOffset, fileSize) {
  const magic = Buffer.from('glTF', 'ascii');
  for (let offset = bytes.indexOf(magic); offset >= 0; offset = bytes.indexOf(magic, offset + 1)) {
    const absoluteOffset = baseOffset + offset;
    // A top-level GLB is handled by the approved-model parser and byte-parity
    // checks. Only non-zero offsets indicate a nested/hidden model payload.
    if (absoluteOffset === 0 || offset + 20 > bytes.length) continue;
    const version = bytes.readUInt32LE(offset + 4);
    const totalLength = bytes.readUInt32LE(offset + 8);
    const jsonLength = bytes.readUInt32LE(offset + 12);
    const jsonType = bytes.readUInt32LE(offset + 16);
    if (version === 2 && totalLength >= 20 && absoluteOffset + totalLength <= fileSize &&
        jsonLength >= 2 && jsonLength <= totalLength - 20 && jsonType === 0x4e4f534a) return true;
  }
  return false;
}

function hasZipLocalHeaderAt(bytes, offset, baseOffset, fileSize) {
  if (offset < 0 || offset + 30 > bytes.length ||
      bytes.readUInt32LE(offset) !== 0x04034b50) return false;
  const versionNeeded = bytes.readUInt16LE(offset + 4);
  const flags = bytes.readUInt16LE(offset + 6);
  const compressedSize = bytes.readUInt32LE(offset + 18);
  const uncompressedSize = bytes.readUInt32LE(offset + 22);
  const nameLength = bytes.readUInt16LE(offset + 26);
  const extraLength = bytes.readUInt16LE(offset + 28);
  const usesDataDescriptor = (flags & 0x0008) !== 0;
  if (versionNeeded < 10 || versionNeeded > 99 || nameLength < 1) return false;
  const nameStart = offset + 30;
  const extraStart = nameStart + nameLength;
  const dataStart = extraStart + extraLength;
  if (dataStart > bytes.length) return false;

  // ZIP64 stores sentinel 0xffffffff sizes in the local header and carries
  // the real 64-bit values in extra field 0x0001 (uncompressed then compressed).
  let compressedSizeValue = BigInt(compressedSize);
  let uncompressedSizeValue = BigInt(uncompressedSize);
  if (!usesDataDescriptor && (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff)) {
    let foundZip64 = false;
    for (let cursor = extraStart; cursor + 4 <= dataStart;) {
      const fieldId = bytes.readUInt16LE(cursor);
      const fieldLength = bytes.readUInt16LE(cursor + 2);
      const fieldStart = cursor + 4;
      const fieldEnd = fieldStart + fieldLength;
      if (fieldEnd > dataStart) return false;
      if (fieldId === 0x0001) {
        let valueOffset = fieldStart;
        if (uncompressedSize === 0xffffffff) {
          if (valueOffset + 8 > fieldEnd) return false;
          uncompressedSizeValue = bytes.readBigUInt64LE(valueOffset);
          valueOffset += 8;
        }
        if (compressedSize === 0xffffffff) {
          if (valueOffset + 8 > fieldEnd) return false;
          compressedSizeValue = bytes.readBigUInt64LE(valueOffset);
        }
        foundZip64 = true;
        break;
      }
      cursor = fieldEnd;
    }
    if (!foundZip64) return false;
  }
  // A highly-compressible ZIP entry may legitimately expand beyond the
  // entire archive size. That is not malformed: it is precisely the ZIP-bomb
  // case the gate must reject, not a reason to treat the header as harmless.
  // Only the compressed byte range must fit in the inspected outer file.
  if (!usesDataDescriptor &&
      (compressedSizeValue > BigInt(fileSize) ||
       BigInt(baseOffset + dataStart) + compressedSizeValue > BigInt(fileSize))) return false;
  // Bit 3 is valid ZIP streaming mode: sizes/CRC live in a data descriptor
  // after the entry data, not in the local header. ZIP64 sentinel sizes are
  // resolved from the extra field above when no data descriptor is present.
  if (usesDataDescriptor && baseOffset + dataStart >= fileSize) return false;
  // ZIP filenames are byte strings; control characters (including newlines)
  // do not invalidate the container and must not create an archive-detection bypass.
  return true;
}

function containsZipLocalHeader(bytes, baseOffset, fileSize) {
  const marker = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  for (let offset = bytes.indexOf(marker); offset >= 0; offset = bytes.indexOf(marker, offset + 1)) {
    if (hasZipLocalHeaderAt(bytes, offset, baseOffset, fileSize)) return true;
  }
  return false;
}

const MAX_ARCHIVE_INSPECTION_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_DECOMPRESSED_BYTES = 128 * 1024 * 1024;
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < table.length; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function hasGzipAt(bytes, offset) {
  if (offset < 0 || offset + 10 > bytes.length ||
      bytes[offset] !== 0x1f || bytes[offset + 1] !== 0x8b ||
      bytes[offset + 2] !== 8 || (bytes[offset + 3] & 0xe0) !== 0) return false;
  const flags = bytes[offset + 3];
  let cursor = offset + 10;
  if (flags & 0x04) {
    if (cursor + 2 > bytes.length) return false;
    const extraLength = bytes.readUInt16LE(cursor);
    cursor += 2 + extraLength;
  }
  const skipTerminated = () => {
    while (cursor < bytes.length && bytes[cursor] !== 0) cursor += 1;
    if (cursor >= bytes.length) return false;
    cursor += 1;
    return true;
  };
  if (flags & 0x08 && !skipTerminated()) return false;
  if (flags & 0x10 && !skipTerminated()) return false;
  if (flags & 0x02) {
    if (cursor + 2 > bytes.length || (crc32(bytes.subarray(offset, cursor)) & 0xffff) !== bytes.readUInt16LE(cursor)) {
      return false;
    }
    cursor += 2;
  }
  if (cursor >= bytes.length) return false;
  try {
    const result = inflateRawSync(bytes.subarray(cursor), {
      info: true,
      maxOutputLength: MAX_ARCHIVE_DECOMPRESSED_BYTES,
    });
    const footer = cursor + result.engine.bytesWritten;
    return footer + 8 <= bytes.length &&
      crc32(result.buffer) === bytes.readUInt32LE(footer) &&
      (result.buffer.length >>> 0) === bytes.readUInt32LE(footer + 4);
  } catch (error) {
    // A syntactically valid stream that exceeds the inspection budget is still
    // an opaque container and must not silently pass the production gate.
    return error?.code === 'ERR_BUFFER_TOO_LARGE';
  }
}

function hasBzip2At(bytes, offset) {
  // BZip2 is a bitstream: its end-of-stream marker can start between bytes.
  // A byte-aligned footer search wrongly accepted real compressed draft GLBs.
  // This is an opaque-container *rejection* gate, not a decompressor: a BZh
  // level followed by the 48-bit block marker is enough to fail closed.
  if (offset < 0 || offset + 14 > bytes.length ||
      bytes.toString('ascii', offset, offset + 3) !== 'BZh' ||
      bytes[offset + 3] < 0x31 || bytes[offset + 3] > 0x39) return false;
  return bytes.subarray(offset + 4, offset + 10)
    .equals(Buffer.from([0x31, 0x41, 0x59, 0x26, 0x53, 0x59]));
}

function hasXzAt(bytes, offset) {
  const magic = Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]);
  if (offset < 0 || offset + 12 > bytes.length ||
      !bytes.subarray(offset, offset + 6).equals(magic)) return false;
  const flags = bytes.subarray(offset + 6, offset + 8);
  if (flags[0] !== 0 || (flags[1] & 0xf0) !== 0 ||
      crc32(flags) !== bytes.readUInt32LE(offset + 8)) return false;
  const footerMagic = Buffer.from([0x59, 0x5a]);
  for (let end = bytes.indexOf(footerMagic, offset + 14); end >= 0; end = bytes.indexOf(footerMagic, end + 1)) {
    const footer = end - 10;
    if (footer < offset + 12 || footer + 12 > bytes.length) continue;
    if (crc32(bytes.subarray(footer + 4, footer + 10)) !== bytes.readUInt32LE(footer) ||
        !bytes.subarray(footer + 8, footer + 10).equals(flags)) continue;
    const indexSize = (bytes.readUInt32LE(footer + 4) + 1) * 4;
    if (Number.isSafeInteger(indexSize) && footer - indexSize >= offset + 12) return true;
  }
  return false;
}

function hasZstdAt(bytes, offset) {
  if (offset < 0 || offset + 6 > bytes.length ||
      !bytes.subarray(offset, offset + 4).equals(Buffer.from([0x28, 0xb5, 0x2f, 0xfd]))) return false;
  const descriptor = bytes[offset + 4];
  if ((descriptor & 0x18) !== 0) return false;
  const singleSegment = (descriptor & 0x20) !== 0;
  const contentSizeFlag = descriptor >>> 6;
  const dictionarySize = [0, 1, 2, 4][descriptor & 0x03];
  const contentSize = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) :
    contentSizeFlag === 1 ? 2 : contentSizeFlag === 2 ? 4 : 8;
  let cursor = offset + 5;
  if (!singleSegment) cursor += 1; // Window descriptor.
  cursor += dictionarySize + contentSize;
  if (cursor > bytes.length) return false;
  for (let blocks = 0; blocks < 1_000_000; blocks += 1) {
    if (cursor + 3 > bytes.length) return false;
    const header = bytes[cursor] | (bytes[cursor + 1] << 8) | (bytes[cursor + 2] << 16);
    cursor += 3;
    const last = (header & 1) !== 0;
    const type = (header >>> 1) & 3;
    const blockSize = header >>> 3;
    if (type === 3 || blockSize > 128 * 1024) return false;
    cursor += type === 1 ? 1 : blockSize;
    if (cursor > bytes.length) return false;
    if (last) {
      if (descriptor & 0x04) cursor += 4; // Optional frame checksum.
      return cursor <= bytes.length;
    }
  }
  return false;
}

function has7zAt(bytes, offset) {
  const magic = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
  if (offset < 0 || offset + 32 > bytes.length || !bytes.subarray(offset, offset + 6).equals(magic)) return false;
  const nextOffset = bytes.readBigUInt64LE(offset + 12);
  const nextSize = bytes.readBigUInt64LE(offset + 20);
  if (crc32(bytes.subarray(offset + 12, offset + 32)) !== bytes.readUInt32LE(offset + 8) ||
      nextSize < 1n || nextOffset > BigInt(Number.MAX_SAFE_INTEGER) ||
      nextSize > BigInt(Number.MAX_SAFE_INTEGER)) return false;
  const start = offset + 32 + Number(nextOffset);
  const end = start + Number(nextSize);
  return end <= bytes.length && crc32(bytes.subarray(start, end)) === bytes.readUInt32LE(offset + 28);
}

function readVarint(bytes, offset) {
  let value = 0n;
  for (let index = 0; index < 10 && offset + index < bytes.length; index += 1) {
    const byte = bytes[offset + index];
    value |= BigInt(byte & 0x7f) << BigInt(index * 7);
    if ((byte & 0x80) === 0) return { value, next: offset + index + 1 };
  }
  return null;
}

function hasRarAt(bytes, offset) {
  const rar4 = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]);
  if (offset >= 0 && offset + 20 <= bytes.length && bytes.subarray(offset, offset + 7).equals(rar4)) {
    const header = offset + 7;
    const size = bytes.readUInt16LE(header + 5);
    return bytes[header + 2] === 0x73 && size >= 13 && header + size <= bytes.length &&
      // RAR4 HEAD_CRC is the low 16 bits of CRC32, not CRC16/A001.
      (crc32(bytes.subarray(header + 2, header + size)) & 0xffff) === bytes.readUInt16LE(header);
  }
  const rar5 = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]);
  if (offset < 0 || offset + 15 > bytes.length || !bytes.subarray(offset, offset + 8).equals(rar5)) return false;
  const crc = bytes.readUInt32LE(offset + 8);
  const size = readVarint(bytes, offset + 12);
  if (!size || size.value < 2n || size.value > 1_000_000n) return false;
  const end = size.next + Number(size.value);
  if (end > bytes.length || crc32(bytes.subarray(offset + 12, end)) !== crc) return false;
  const type = readVarint(bytes, size.next);
  // Header-encrypted RAR5 archives begin with type 4, before the encrypted
  // main header. Both types must be treated as opaque production containers.
  // https://www.rarlab.com/technote.htm#arcenc
  return Boolean(type && (type.value === 1n || type.value === 4n));
}

function hasCabAt(bytes, offset) {
  if (offset < 0 || offset + 44 > bytes.length || bytes.toString('ascii', offset, offset + 4) !== 'MSCF') return false;
  const cabinetSize = bytes.readUInt32LE(offset + 8);
  const filesOffset = bytes.readUInt32LE(offset + 16);
  const minor = bytes[offset + 24];
  const major = bytes[offset + 25];
  const folders = bytes.readUInt16LE(offset + 26);
  const files = bytes.readUInt16LE(offset + 28);
  const flags = bytes.readUInt16LE(offset + 30);
  if (cabinetSize < 44 || offset + cabinetSize > bytes.length ||
      filesOffset < 36 || filesOffset >= cabinetSize ||
      major !== 1 || minor > 3 || folders < 1 || (flags & ~0x0007) !== 0) return false;
  const folderTableStart = offset + 36;
  return folderTableStart + folders * 8 <= offset + filesOffset &&
    (files === 0 || filesOffset + files * 16 <= offset + cabinetSize);
}

function hasArAt(bytes, offset) {
  if (offset < 0 || offset + 68 > bytes.length ||
      bytes.toString('ascii', offset, offset + 8) !== '!<arch>\n') return false;
  let cursor = offset + 8;
  let members = 0;
  while (cursor + 60 <= bytes.length && bytes.toString('ascii', cursor + 58, cursor + 60) === '`\n') {
    const name = bytes.toString('ascii', cursor, cursor + 16).trim();
    const sizeField = bytes.toString('ascii', cursor + 48, cursor + 58).trim();
    if (!name || !/^\d+$/u.test(sizeField)) return false;
    const size = Number(sizeField);
    if (!Number.isSafeInteger(size) || size < 0 || cursor + 60 + size > bytes.length) return false;
    cursor += 60 + size + (size & 1);
    members += 1;
    if (members > 100_000) return false;
  }
  return members > 0;
}

function hasZipEndRecordAt(bytes, offset) {
  if (offset < 0 || offset + 22 > bytes.length || bytes.readUInt32LE(offset) !== 0x06054b50) return false;
  const commentLength = bytes.readUInt16LE(offset + 20);
  return offset + 22 + commentLength <= bytes.length &&
    bytes.readUInt16LE(offset + 4) === 0 && bytes.readUInt16LE(offset + 6) === 0;
}

function containsValidatedArchive(bytes) {
  if (containsTarHeader(bytes) || containsZipLocalHeader(bytes, 0, bytes.length)) return true;
  const checks = [
    { signature: [0x1f, 0x8b], test: hasGzipAt },
    { signature: [0x42, 0x5a, 0x68], test: hasBzip2At },
    { signature: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], test: hasXzAt },
    { signature: [0x28, 0xb5, 0x2f, 0xfd], test: hasZstdAt },
    { signature: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], test: has7zAt },
    { signature: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07], test: hasRarAt },
    { signature: [0x4d, 0x53, 0x43, 0x46], test: hasCabAt },
    { signature: [0x21, 0x3c, 0x61, 0x72, 0x63, 0x68, 0x3e, 0x0a], test: hasArAt },
  ];
  for (const { signature, test } of checks) {
    const marker = Buffer.from(signature);
    for (let offset = bytes.indexOf(marker); offset >= 0; offset = bytes.indexOf(marker, offset + 1)) {
      if (test(bytes, offset)) return true;
    }
  }
  const emptyZip = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  for (let offset = bytes.indexOf(emptyZip); offset >= 0; offset = bytes.indexOf(emptyZip, offset + 1)) {
    if (hasZipEndRecordAt(bytes, offset)) return true;
  }
  return false;
}

function hasArchiveMagic(path, includeEmbeddedGlb = true) {
  if (!Number.isInteger(fsConstants.O_NOFOLLOW)) throw new Error('this platform cannot safely audit symbolic links');
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stats = fstatSync(fd);
    if (!stats.isFile()) throw new Error('not a regular file');
    const size = stats.size;
    const header = Buffer.alloc(Math.min(size, 512));
    if (header.length) readSync(fd, header, 0, header.length, 0);
    const includeAsciiMarkers = !TEXT_ASSET.test(path);
    // A structurally valid Unix ar archive is still an archive when served
    // with a reviewed text suffix. The eight-byte marker is meaningful at
    // offset zero, but not as a stray reference in ordinary prose.
    let archiveCandidate = hasArchiveMagicHeader(header, includeAsciiMarkers) ||
      header.subarray(0, 8).equals(Buffer.from('!<arch>\n', 'ascii'));

    const chunkSize = 64 * 1024;
    const overlapSize = 511; // Retain a full 512-byte TAR header across chunk boundaries.
    let position = 0;
    let carry = Buffer.alloc(0);
    while (position < size) {
      const chunk = Buffer.alloc(Math.min(chunkSize, size - position));
      const bytesRead = readSync(fd, chunk, 0, chunk.length, position);
      if (bytesRead <= 0) break;
      const window = carry.length
        ? Buffer.concat([carry, chunk.subarray(0, bytesRead)])
        : chunk.subarray(0, bytesRead);
      const windowStart = position - carry.length;
      // Arbitrary signature bytes naturally occur in compressed images, fonts
      // and media. Nested archives need a plausible ZIP entry or a complete
      // TAR header/checksum; nested models need full GLB framing.
      if (hasArchiveMagicBytes(window, includeAsciiMarkers, true)) archiveCandidate = true;
      if ((includeEmbeddedGlb && containsGlbHeaderAtOffset(window, windowStart, size))) return true;
      carry = window.subarray(Math.max(0, window.length - overlapSize));
      position += bytesRead;
    }
    if (!archiveCandidate) return false;
    try {
      return containsValidatedArchive(readRegularBytesNoFollow(path, MAX_ARCHIVE_INSPECTION_BYTES));
    } catch {
      // Oversized or unreadable files with an archive-looking envelope fail closed.
      return true;
    }
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
function containsReservedAnatomyId(text, draftIds) {
  if (/\bFIX\d{3,}\b/u.test(text)) return true;
  for (const match of text.matchAll(STRUCTURE_TOKEN)) {
    if (draftIds.has(match[0])) return true;
  }
  return false;
}

function validPagefindCbor(bytes, draftIds = new Set()) {
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
      // CBOR major-type-2 values are opaque bytes, not searchable prose.
      // The complete Pagefind payload was already checked for real GLB/archive
      // framing; only major-type-3 text strings are scanned for anatomy IDs.
      if (major === 2 && containsGlbHeader(value)) return false;
      if (major === 3) {
        let decodedText;
        try {
          decodedText = new TextDecoder('utf-8', { fatal: true }).decode(value);
        } catch {
          return false;
        }
        // Pagefind index/filter/meta text is publicly searchable data too.
        // Never allow a draft structure ID or synthetic fixture ID into it.
        if (containsReservedAnatomyId(decodedText, draftIds)) return false;
        // The complete decompressed Pagefind payload was structurally checked
        // before CBOR parsing; do not treat incidental short magic bytes in
        // otherwise valid text strings as proof of an embedded archive.
        if (containsGlbHeader(value)) return false;
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



/**
 * Gzip optional headers are public bytes but disappear after decompression.
 * Inspect the metadata rather than reject safe Pagefind WASM filenames.
 */
function safePagefindGzipHeader(bytes, draftIds) {
  if (bytes.length < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b ||
      bytes[2] !== 8 || (bytes[3] & 0xe0) !== 0) return false;
  const flags = bytes[3];
  let cursor = 10;
  if (flags & 0x04) {
    if (cursor + 2 > bytes.length) return false;
    const size = bytes.readUInt16LE(cursor);
    cursor += 2 + size;
    if (cursor > bytes.length) return false;
  }
  for (const present of [0x08, 0x10]) {
    if (!(flags & present)) continue;
    const nul = bytes.indexOf(0, cursor);
    if (nul < 0) return false;
    cursor = nul + 1;
  }
  if (flags & 0x02) cursor += 2;
  if (cursor > bytes.length - 8) return false;

  const metadata = bytes.subarray(10, cursor);
  if (containsGlbHeader(metadata) || containsValidatedArchive(metadata)) return false;
  // Node's gunzip accepts concatenated members. Without this exact-end check,
  // a second empty member could conceal draft IDs in a second FNAME header
  // while leaving the decompressed Pagefind payload unchanged.
  try {
    const first = inflateRawSync(bytes.subarray(cursor), {
      info: true, maxOutputLength: MAX_PAGEFIND_DECOMPRESSED_BYTES,
    });
    const footer = cursor + first.engine.bytesWritten;
    if (footer + 8 !== bytes.length ||
        crc32(first.buffer) !== bytes.readUInt32LE(footer) ||
        (first.buffer.length >>> 0) !== bytes.readUInt32LE(footer + 4)) return false;
  } catch {
    return false;
  }
  const raw = metadata.toString('latin1');
  return ![
    raw,
    decodeAsciiEscapesForAudit(raw, 'script'),
    decodeAsciiEscapesForAudit(raw, 'markup'),
    decodeAsciiEscapesForAudit(raw, 'css'),
  ].some((value) => containsReservedAnatomyId(value, draftIds));
}

/** Validate Pagefind's actual generated formats; a matching filename alone is never trusted. */
function validPagefindArtifact(path, kind, draftIds = new Set()) {
  let bytes;
  try {
    bytes = readRegularBytesNoFollow(path, 64 * 1024 * 1024);
  } catch {
    return false;
  }
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (isGzip && !safePagefindGzipHeader(bytes, draftIds)) return false;
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
  // Inspect the complete payload for structurally valid embedded GLBs/archives.
  // Do not reinterpret opaque CBOR byte strings or WASM code/data as UTF-8
  // prose: reserved anatomy IDs are checked only in JSON and CBOR text strings.
  if (payload.length > MAX_ARCHIVE_INSPECTION_BYTES || containsGlbHeader(payload)) return false;
  if (kind === 'wasm') {
    // Executable WASM instruction bytes may resemble container signatures by
    // coincidence. Validate the module and inspect custom sections rather than
    // treating arbitrary opcode bytes as a complete hidden archive.
    if (payload.length < 8 ||
        !payload.subarray(0, 4).equals(Buffer.from([0x00, 0x61, 0x73, 0x6d])) ||
        payload.readUInt32LE(4) !== 1 || !WebAssembly.validate(payload)) return false;
    // Every WASM section is downloadable, not only named custom sections.
    // A data section can contain the same reserved source identifier, so
    // scan the validated module's complete bytes before accepting it.
    const publicBytes = payload.toString('latin1');
    if ([
      publicBytes,
      decodeAsciiEscapesForAudit(publicBytes, 'script'),
      decodeAsciiEscapesForAudit(publicBytes, 'markup'),
      decodeAsciiEscapesForAudit(publicBytes, 'css'),
    ].some((value) => containsReservedAnatomyId(value, draftIds))) return false;
    let cursor = 8;
    const readLeb = () => {
      let value = 0;
      for (let i = 0; i < 5 && cursor < payload.length; i += 1) {
        const byte = payload[cursor++];
        value += (byte & 0x7f) * 2 ** (7 * i);
        if (!(byte & 0x80)) return Number.isSafeInteger(value) ? value : null;
      }
      return null;
    };
    while (cursor < payload.length) {
      const type = payload[cursor++];
      const size = readLeb();
      if (size === null || size > payload.length - cursor) return false;
      const end = cursor + size;
      // Each section has its own length-delimited public payload. Scanning
      // only the complete serialized module can swallow a source-ID boundary:
      // e.g. an LEB length of 65 is ASCII 'A' immediately before FMA24497.
      // Inspect each section independently and reject embedded GLB/archive
      // containers in data segments, not just custom sections.
      const sectionBytes = payload.subarray(cursor, end);
      const sectionText = sectionBytes.toString('latin1');
      if ([
        sectionText,
        decodeAsciiEscapesForAudit(sectionText, 'script'),
        decodeAsciiEscapesForAudit(sectionText, 'markup'),
        decodeAsciiEscapesForAudit(sectionText, 'css'),
      ].some((value) => containsReservedAnatomyId(value, draftIds))) return false;
      if (type === 11) {
        // Passive/active WASM data entries are length-framed within their
        // section. Scan those payloads independently: the preceding LEB length
        // can be an ASCII word byte and mask a leading draft ID (e.g. 0x41 +
        // FMA999991). A serialized-section scan is insufficient.
        let dataCursor = cursor;
        const readDataLeb = () => {
          let value = 0;
          for (let i = 0; i < 5 && dataCursor < end; i += 1) {
            const byte = payload[dataCursor++];
            value += (byte & 0x7f) * 2 ** (7 * i);
            if (!(byte & 0x80)) return Number.isSafeInteger(value) ? value : null;
          }
          return null;
        };
        const segments = readDataLeb();
        if (segments === null || segments > 100000) return false;
        for (let segment = 0; segment < segments; segment += 1) {
          const flags = readDataLeb();
          if (flags === null || flags > 2) return false;
          // Active segments contain an init expression ending in end opcode.
          // Only integer-constant offsets are accepted by this conservative
          // audit; any unsupported expression fails closed.
          if (flags !== 1) {
            if (flags === 2 && readDataLeb() === null) return false; // memory index
            if (dataCursor >= end || ![0x41, 0x42].includes(payload[dataCursor++])) return false;
            if (readDataLeb() === null || payload[dataCursor++] !== 0x0b) return false;
          }
          const length = readDataLeb();
          if (length === null || length > end - dataCursor) return false;
          const segmentBytes = payload.subarray(dataCursor, dataCursor + length);
          dataCursor += length;
          const segmentText = segmentBytes.toString('latin1');
          if ([
            segmentText,
            decodeAsciiEscapesForAudit(segmentText, 'script'),
            decodeAsciiEscapesForAudit(segmentText, 'markup'),
            decodeAsciiEscapesForAudit(segmentText, 'css'),
          ].some((value) => containsReservedAnatomyId(value, draftIds))) return false;
          if (containsGlbHeader(segmentBytes) || containsValidatedArchive(segmentBytes)) return false;
        }
        if (dataCursor !== end) return false;
      }
      if ((type === 0 || type === 11) &&
          (containsGlbHeader(sectionBytes) || containsValidatedArchive(sectionBytes))) return false;
      if (type === 0) {
        const nameSize = readLeb();
        if (nameSize === null || nameSize > end - cursor) return false;
        cursor += nameSize;
        const opaque = payload.subarray(cursor, end);
        if (containsGlbHeader(opaque) || containsValidatedArchive(opaque)) return false;
        // WASM custom sections are public byte arrays. Their metadata can carry
        // source identifiers even when the rest of the module is executable code.
        // Reject escaped and unescaped draft/fixture IDs just as in text assets.
        const customText = opaque.toString('latin1');
        if ([
          customText,
          decodeAsciiEscapesForAudit(customText, 'script'),
          decodeAsciiEscapesForAudit(customText, 'markup'),
          decodeAsciiEscapesForAudit(customText, 'css'),
        ].some((value) => containsReservedAnatomyId(value, draftIds))) return false;
      }
      cursor = end;
    }
    return true;
  }
  if (containsValidatedArchive(payload)) return false;
  if (path.endsWith('.pf_fragment')) {
    try {
      const fragment = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payload));
      // These are the serialized fields Pagefind 1.5.2 consumes from a
      // fragment. Requiring the shape prevents a valid glTF JSON document
      // from being accepted merely because it is wrapped in Pagefind's header.
      const validShape = fragment !== null && typeof fragment === 'object' && !Array.isArray(fragment) &&
        typeof fragment.url === 'string' && typeof fragment.content === 'string' &&
        Number.isFinite(fragment.word_count) && fragment.word_count >= 0 &&
        fragment.filters !== null && typeof fragment.filters === 'object' && !Array.isArray(fragment.filters) &&
        fragment.meta !== null && typeof fragment.meta === 'object' && !Array.isArray(fragment.meta) &&
        Array.isArray(fragment.anchors);
      // JSON.parse decodes escaped text before this full-field scan, including
      // content, metadata, anchors, URLs and nested filter values.
      return validShape && !containsReservedAnatomyId(JSON.stringify(fragment), draftIds);
    } catch {
      return false;
    }
  }
  return validPagefindCbor(payload, draftIds);
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
/**
 * Inspect the actual document structure rather than treating HTML-looking
 * text inside scripts, styles or comments as real elements. This intentionally
 * accepts a conservative subset of Astro's generated HTML: ambiguous syntax
 * fails closed instead of certifying a broken release artifact.
 */
function hasUsableSiteEntrypoint(html) {
  let cursor = 0;
  let state = 'doctype';
  let bodyHasElement = false;
  const allowedInside = () => state === 'head-content' || state === 'body-content';
  const rawTags = new Set([
    'script', 'style', 'title', 'textarea', 'template', 'noscript',
    'xmp', 'iframe', 'noembed', 'noframes',
  ]);
  const notRendered = new Set([
    'script', 'style', 'template', 'noscript', 'link', 'meta', 'source', 'track',
  ]);

  // Astro/Vite may append hoisted module scripts after the closed document.
  // Keep these strict: only actual script elements with a matching closing tag
  // are permitted after </html>, never arbitrary trailing markup or text.
  // Only Astro's hoisted module scripts are permitted beyond </html>.
  // Ordinary scripts and malformed tags must not pass the release gate.
  const afterDocumentScript = /^<script\b/i;
  const validTrailingModuleTag = (tag) => {
    if (!/^<script\b/i.test(tag) || !tag.endsWith('>')) return false;
    let pos = 7; // After the "script" tag name.
    let moduleType = false;
    const attributes = new Set();
    while (pos < tag.length - 1) {
      if (!/\s/.test(tag[pos])) return false;
      while (/\s/.test(tag[pos] ?? '')) pos++;
      if (pos === tag.length - 1) break;
      const nameMatch = /^[^\s=/>"'<>]+/.exec(tag.slice(pos));
      if (!nameMatch) return false;
      const name = nameMatch[0].toLowerCase();
      if (attributes.has(name)) return false;
      attributes.add(name);
      pos += nameMatch[0].length;
      while (/\s/.test(tag[pos] ?? '')) pos++;
      let value = '';
      if (tag[pos] === '=') {
        pos++;
        while (/\s/.test(tag[pos] ?? '')) pos++;
        const quote = tag[pos];
        if (quote === '"' || quote === "'") {
          pos++;
          const closing = tag.indexOf(quote, pos);
          if (closing < 0 || closing >= tag.length - 1) return false;
          value = tag.slice(pos, closing);
          pos = closing + 1;
        } else {
          // Production hoisted scripts use quoted attributes. Ambiguous
          // unquoted values are rejected rather than certified.
          return false;
        }
      }
      if (name === 'type') {
        if (moduleType || value !== 'module') return false;
        moduleType = true;
      }
    }
    return moduleType;
  };

  while (cursor < html.length) {
    const next = html.indexOf('<', cursor);
    const end = next === -1 ? html.length : next;
    // Text outside the document is not evidence of a valid entrypoint.
    // Astro may append valid deferred module scripts after </html>. Such
    // scripts are not evidence of the page body, which must be verified first.
    if (['doctype', 'html-open', 'done'].includes(state) && html.slice(cursor, end).trim()) return false;
    cursor = end;
    if (next === -1) break;

    if (state === 'done' && afterDocumentScript.test(html.slice(cursor))) {
      // A regex over [^<>]* accepts a '>' or type='module' inside an
      // unterminated quoted attribute. Scan the opening tag quote-aware.
      let tagEnd = cursor + 1;
      let quote = '';
      for (; tagEnd < html.length; tagEnd++) {
        const char = html[tagEnd];
        if (quote) {
          if (char === quote) quote = '';
        } else if (char === '"' || char === "'") quote = char;
        else if (char === '<') return false;
        else if (char === '>') break;
      }
      if (tagEnd >= html.length || quote ||
          !validTrailingModuleTag(html.slice(cursor, tagEnd + 1))) return false;
      const closing = /<\/script\s*>/i.exec(html.slice(tagEnd + 1));
      if (!closing) return false;
      // The browser treats only the first matching end tag as the end of
      // this raw-text element. Additional script openers inside its source
      // are suspicious release output even though they are not DOM elements.
      // Reject rather than claiming to validate a malformed module.
      if (/<script\b/i.test(html.slice(tagEnd + 1, tagEnd + 1 + closing.index))) return false;
      cursor = tagEnd + 1 + closing.index + closing[0].length;
      continue;
    }

    if (html.startsWith('<!--', cursor)) {
      const closing = html.indexOf('-->', cursor + 4);
      if (closing < 0) return false;
      cursor = closing + 3;
      continue;
    }
    if (html.startsWith('<!', cursor)) {
      const doctype = /^<!doctype\s+html\s*>/i.exec(html.slice(cursor));
      if (!doctype || state !== 'doctype') return false;
      cursor += doctype[0].length;
      state = 'html-open';
      continue;
    }

    // A > inside quoted attributes does not close the tag.
    let ending = cursor + 1;
    let quote = '';
    while (ending < html.length) {
      const char = html[ending];
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '<') return false;
      else if (char === '>') break;
      ending++;
    }
    if (ending >= html.length || quote) return false;
    const token = html.slice(cursor, ending + 1);
    cursor = ending + 1;
    const closing = token.startsWith('</');
    const match = closing
      ? /^<\/([a-z][a-z\d:-]*)\s*>$/i.exec(token)
      : /^<([a-z][a-z\d:-]*)(?:\s[\s\S]*?)?\s*\/?>$/i.exec(token);
    if (!match) return false;
    const tag = match[1].toLowerCase();

    if (tag === 'html') {
      if (closing && state === 'html-close') state = 'done';
      else if (!closing && state === 'html-open') state = 'head-open';
      else return false;
      continue;
    }
    if (tag === 'head') {
      if (closing && state === 'head-content') state = 'body-open';
      else if (!closing && state === 'head-open') state = 'head-content';
      else return false;
      continue;
    }
    if (tag === 'body') {
      if (closing && state === 'body-content') state = 'html-close';
      else if (!closing && state === 'body-open') state = 'body-content';
      else return false;
      continue;
    }
    if (!allowedInside()) return false;

    if (!closing && rawTags.has(tag)) {
      // HTML treats these elements' contents as opaque text. In particular,
      // literal <body> strings in JS and CSS must not satisfy the release gate.
      const close = new RegExp('</' + tag + '\\s*>', 'i').exec(html.slice(cursor));
      if (!close) return false;
      cursor += close.index + close[0].length;
      continue;
    }
    if (!closing && state === 'body-content' && !notRendered.has(tag)) bodyHasElement = true;
  }
  return state === 'done' && bodyHasElement;
}

export function builtSiteEntrypointErrors(distDir) {
  const entry = join(resolve(distDir), 'index.html');
  try {
    const html = readRegularFileNoFollow(entry);
    if (hasUsableSiteEntrypoint(html)) return [];
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
  const textModels = new Set();
  for (const path of linked) errors.push(`symbolic link in production output: ${toUrl(path)}`);
  for (const path of builtFiles) {
    const url = toUrl(path);
    const pagefindKind = pagefindArtifactKind(url);
    // Pagefind's binary extensions are already validated by their own format parser.
    // No other arbitrary output extension is implicitly safe for publication.
    if (!pagefindKind && !REVIEWED_OUTPUT_TYPE.test(path) && !MODEL_ASSET.test(path) &&
        !REVIEWED_EXTENSIONLESS_OUTPUT.has(url)) {
      errors.push(`unreviewed output asset type requires explicit review: ${url}`);
    }
    try {
      if (!MODEL_ASSET.test(path) && hasTextGltfModel(path)) {
        textModels.add(path);
      }
    } catch {
      errors.push(`cannot safely inspect output asset: ${url}`);
    }
    if (ARCHIVE_ASSET.test(path) ||
        (pagefindKind
          ? !validPagefindArtifact(path, pagefindKind, draftIds)
          // Top-level model assets use the stricter approved-manifest parser,
          // checked-in byte parity, and real MeshoptDecoder regression. Their
          // opaque compressed BIN bytes are not scanned as nested archives.
          : (!MODEL_ASSET.test(path) && hasArchiveMagic(path)))) {
      errors.push(`archive/container in production output requires explicit review: ${url}`);
    }
  }
  const shipped = [...new Set(builtFiles
    .filter((path) => MODEL_ASSET.test(path) || hasGlbMagic(path) || textModels.has(path))
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
    const variants = [contents, decodePercentEscapesForAudit(contents)];
    if (SCRIPT_ESCAPES_ASSET.test(file)) variants.push(decodeAsciiEscapesForAudit(contents, 'script'));
    if (MARKUP_ESCAPES_ASSET.test(file)) variants.push(decodeAsciiEscapesForAudit(contents, 'markup'));
    // Inline <style> and style attributes in HTML/SVG can carry active CSS escapes too.
    if (CSS_ESCAPES_ASSET.test(file) || MARKUP_ESCAPES_ASSET.test(file)) variants.push(decodeAsciiEscapesForAudit(contents, 'css'));
    // HTML style attributes decode numeric entities before parsing their CSS escapes.
    if (MARKUP_ESCAPES_ASSET.test(file)) variants.push(decodeAsciiEscapesForAudit(decodeAsciiEscapesForAudit(contents, 'markup'), 'css'));
    // Normalization order matters: percent-encoded backslashes can become
    // active JavaScript, CSS or markup escapes only after URL decoding.
    // Expand both orders twice (bounded), so nested source-ID encodings
    // cannot evade the production gate through composition.
    const expand = (value) => {
      const decoded = [decodePercentEscapesForAudit(value)];
      if (SCRIPT_ESCAPES_ASSET.test(file)) decoded.push(decodeAsciiEscapesForAudit(value, 'script'));
      if (MARKUP_ESCAPES_ASSET.test(file)) decoded.push(decodeAsciiEscapesForAudit(value, 'markup'));
      if (CSS_ESCAPES_ASSET.test(file) || MARKUP_ESCAPES_ASSET.test(file)) {
        decoded.push(decodeAsciiEscapesForAudit(value, 'css'));
      }
      return decoded;
    };
    for (let pass = 0; pass < 2; pass++) {
      const current = [...new Set(variants)];
      for (const variant of current) {
        for (const decoded of expand(variant)) {
          if (!variants.includes(decoded)) variants.push(decoded);
        }
      }
    }
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

// Resolve the invoked script path before comparing it with Node's canonical
// module URL. Symlinked launch paths and macOS /var -> /private/var aliases
// must not silently skip the production audit.
if (process.argv[1]) {
  let invokedScript;
  try { invokedScript = realpathSync(process.argv[1]); } catch { /* An invalid entrypoint is not this module. */ }
  if (invokedScript && import.meta.url === pathToFileURL(invokedScript).href) runCli();
}
