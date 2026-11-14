/**
 * Production anatomy audit: a filename such as "photo.jpg" is not evidence
 * that the shipped bytes are an image. Reject raw model text hidden under
 * binary media extensions and reject media with an incompatible signature.
 * This is a bounded, read-only content check, not a general image decoder.
 */
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { extname } from 'node:path';

const MEDIA = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp', '.tif', '.tiff',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.pdf', '.mp4', '.m4a',
  '.webm', '.mp3', '.wav', '.ogg', '.vtt',
]);
const SCAN_BYTES = 64 * 1024;

function starts(bytes, prefix) {
  return bytes.length >= prefix.length && bytes.subarray(0, prefix.length).equals(Buffer.from(prefix));
}

function textAt(bytes, position, value) {
  return bytes.length >= position + value.length &&
    bytes.toString('ascii', position, position + value.length) === value;
}

/** High-confidence Wavefront OBJ, ASCII STL and PLY syntax, regardless of suffix. */
function looksLikeRawMesh(bytes) {
  // A valid-looking media header can precede otherwise recognizable mesh
  // records. Search the bounded text rather than trusting just its prefix.
  const text = bytes.toString('utf8').replace(/^\uFEFF/u, '');
  // A handful of binary-format signature bytes can be attached directly to
  // the first OBJ vertex with no newline separator. Inspect that first line
  // independently rather than allowing a JPEG/PNG magic prefix to hide it.
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  // Only a binary-like header may prefix the first OBJ record. Plain text
  // ending in a vertex-looking phrase is not proof of a geometry asset.
  const firstVertex = /v\s+[-+\d.eE]+\s+[-+\d.eE]+\s+[-+\d.eE]+\s*$/.exec(firstLine);
  const prefix = firstVertex ? firstLine.slice(0, firstVertex.index) : '';
  const embeddedVertex = Boolean(firstVertex && prefix && /[^\x20-\x7e]/.test(prefix));
  if (embeddedVertex && /^f\s+\d+(?:\/\d*)?(?:\/\d*)?\s+\d+(?:\/\d*)?(?:\/\d*)?\s+\d+(?:\/\d*)?(?:\/\d*)?(?:\s|$)/m.test(text)) return true;
  if (/^ply\r?\nformat\s+(?:ascii|binary_little_endian|binary_big_endian)\s+1\.0\b/m.test(text) &&
      /\belement\s+vertex\s+\d+\b/.test(text)) return true;
  if (/^solid(?:\s+[^\r\n]*)?\r?\n/m.test(text) &&
      /\bfacet\s+normal\s+[-+\d.eE]+\s+[-+\d.eE]+\s+[-+\d.eE]+/.test(text) &&
      /\bvertex\s+[-+\d.eE]+\s+[-+\d.eE]+\s+[-+\d.eE]+/.test(text)) return true;
  // A single "v" line could be ordinary documentation. Require the face
  // plus a valid vertex declaration. The signature check below separately
  // rejects a long OBJ containing only vertices in the bounded prefix.
  if (/^v\s+[-+\d.eE]+\s+[-+\d.eE]+\s+[-+\d.eE]+(?:\s|$)/m.test(text) &&
      /^f\s+\d+(?:\/\d*)?(?:\/\d*)?\s+\d+(?:\/\d*)?(?:\/\d*)?\s+\d+(?:\/\d*)?(?:\/\d*)?(?:\s|$)/m.test(text)) return true;
  return false;
}

/** Check only format-identifying header bytes, not full file validity. */
function matchesMediaSignature(ext, bytes) {
  switch (ext) {
    case '.png': return starts(bytes, [137, 80, 78, 71, 13, 10, 26, 10]);
    case '.jpg':
    case '.jpeg': return starts(bytes, [255, 216, 255]);
    case '.gif': return textAt(bytes, 0, 'GIF87a') || textAt(bytes, 0, 'GIF89a');
    case '.webp': return textAt(bytes, 0, 'RIFF') && textAt(bytes, 8, 'WEBP');
    case '.avif': return textAt(bytes, 4, 'ftyp') &&
      (textAt(bytes, 8, 'avif') || textAt(bytes, 8, 'avis') ||
       bytes.toString('ascii', 16, Math.min(bytes.length, 48)).includes('avif'));
    case '.ico': return starts(bytes, [0, 0, 1, 0]) || starts(bytes, [0, 0, 2, 0]);
    case '.bmp': return textAt(bytes, 0, 'BM');
    case '.tif':
    case '.tiff': return starts(bytes, [73, 73, 42, 0]) || starts(bytes, [77, 77, 0, 42]);
    case '.woff': return textAt(bytes, 0, 'wOFF');
    case '.woff2': return textAt(bytes, 0, 'wOF2');
    case '.ttf': return starts(bytes, [0, 1, 0, 0]) || textAt(bytes, 0, 'true');
    case '.otf': return textAt(bytes, 0, 'OTTO');
    case '.eot': return bytes.length >= 36 && bytes.readUInt16LE(34) === 0x504c;
    case '.wasm': return starts(bytes, [0, 97, 115, 109, 1, 0, 0, 0]);
    case '.pdf': return textAt(bytes, 0, '%PDF-');
    case '.mp4':
    case '.m4a': return textAt(bytes, 4, 'ftyp') && bytes.length >= 16;
    case '.webm': return starts(bytes, [26, 69, 223, 163]);
    case '.mp3': return textAt(bytes, 0, 'ID3') ||
      (bytes.length >= 2 && bytes[0] === 255 && (bytes[1] & 224) === 224);
    case '.wav': return textAt(bytes, 0, 'RIFF') && textAt(bytes, 8, 'WAVE');
    case '.ogg': return textAt(bytes, 0, 'OggS');
    case '.vtt': return textAt(bytes, 0, 'WEBVTT') ||
      (starts(bytes, [239, 187, 191]) && textAt(bytes, 3, 'WEBVTT'));
    default: return false;
  }
}

/**
 * True when an allowlisted public media file is not format-compatible or
 * contains recognizable OBJ/STL/PLY source text. Errors fail closed.
 * All reads use the opened descriptor with O_NOFOLLOW.
 */
export function unreviewedMediaPayload(path) {
  const ext = extname(path).toLowerCase();
  if (!MEDIA.has(ext)) return false;
  let fd;
  try {
    if (!Number.isInteger(constants.O_NOFOLLOW)) return true;
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = fstatSync(fd);
    if (!info.isFile() || info.size <= 0) return true;
    // Verify the claimed media magic at offset zero, then inspect the entire
    // file for raw meshes with overlapping, bounded windows. Geometry may be
    // appended beyond the initial 64 KiB without changing the media header.
    const headerSize = Math.min(info.size, SCAN_BYTES);
    const header = Buffer.alloc(headerSize);
    let filled = 0;
    while (filled < headerSize) {
      const read = readSync(fd, header, filled, headerSize - filled, filled);
      if (read === 0) return true;
      filled += read;
    }
    if (!matchesMediaSignature(ext, header) || looksLikeRawMesh(header)) return true;
    let offset = headerSize;
    let preceding = header;
    while (offset < info.size) {
      const bytes = Buffer.alloc(Math.min(SCAN_BYTES, info.size - offset));
      let filledChunk = 0;
      while (filledChunk < bytes.length) {
        const read = readSync(fd, bytes, filledChunk, bytes.length - filledChunk, offset + filledChunk);
        if (read === 0) return true;
        filledChunk += read;
      }
      const combined = Buffer.concat([preceding, bytes]);
      if (looksLikeRawMesh(combined)) return true;
      preceding = combined.subarray(Math.max(0, combined.length - SCAN_BYTES));
      offset += bytes.length;
    }
    return false;
  } catch {
    return true;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
