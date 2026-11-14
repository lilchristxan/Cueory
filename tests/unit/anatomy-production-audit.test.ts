import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync, gunzipSync, gzipSync } from 'node:zlib';
import { auditAnatomyProduction, decodeAsciiEscapesForAudit, modelUrls, parseApprovedGlb, readRegularFileNoFollow } from '../../scripts/anatomy-production-audit.mjs';
import { keepsDrafts } from '../../src/visuals/prunedrafts';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })));

function makeStoredZip(
  name = 'hidden-model.bin',
  payload = Buffer.from('synthetic archive payload'),
  dataDescriptor = false,
): Buffer {
  const filename = Buffer.from(name, 'utf8');
  const data = Buffer.from(payload);
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  crc = (crc ^ 0xffffffff) >>> 0;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(dataDescriptor ? 0x0008 : 0, 6);
  if (!dataDescriptor) {
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
  }
  local.writeUInt16LE(filename.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(dataDescriptor ? 0x0008 : 0, 8);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(filename.length, 28);

  const descriptor = Buffer.alloc(dataDescriptor ? 16 : 0);
  if (dataDescriptor) {
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(data.length, 8);
    descriptor.writeUInt32LE(data.length, 12);
  }
  const localRecord = Buffer.concat([local, filename, data, descriptor]);
  const centralRecord = Buffer.concat([central, filename]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralRecord.length, 12);
  end.writeUInt32LE(localRecord.length, 16);
  return Buffer.concat([localRecord, centralRecord, end]);
}


/** A complete deflated ZIP whose decoded file is much larger than its archive. */
function makeDeflatedZip(name: string, payload: Buffer, zip64Uncompressed = false): Buffer {
  const filename = Buffer.from(name, 'utf8');
  const data = Buffer.from(payload);
  const compressed = deflateRawSync(data);
  const crc = testCrc32(data);
  const localExtra = zip64Uncompressed ? Buffer.alloc(12) : Buffer.alloc(0);
  if (zip64Uncompressed) {
    localExtra.writeUInt16LE(0x0001, 0);
    localExtra.writeUInt16LE(8, 2);
    localExtra.writeBigUInt64LE(BigInt(data.length), 4);
  }

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(zip64Uncompressed ? 45 : 20, 4);
  local.writeUInt16LE(8, 8); // Deflate.
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(zip64Uncompressed ? 0xffffffff : data.length, 22);
  local.writeUInt16LE(filename.length, 26);
  local.writeUInt16LE(localExtra.length, 28);
  const localRecord = Buffer.concat([local, filename, localExtra, compressed]);

  const centralExtra = zip64Uncompressed ? Buffer.alloc(12) : Buffer.alloc(0);
  if (zip64Uncompressed) {
    centralExtra.writeUInt16LE(0x0001, 0);
    centralExtra.writeUInt16LE(8, 2);
    centralExtra.writeBigUInt64LE(BigInt(data.length), 4);
  }
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(zip64Uncompressed ? 45 : 20, 4);
  central.writeUInt16LE(zip64Uncompressed ? 45 : 20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(zip64Uncompressed ? 0xffffffff : data.length, 24);
  central.writeUInt16LE(filename.length, 28);
  central.writeUInt16LE(centralExtra.length, 30);
  const centralRecord = Buffer.concat([central, filename, centralExtra]);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralRecord.length, 12);
  end.writeUInt32LE(localRecord.length, 16);
  return Buffer.concat([localRecord, centralRecord, end]);
}

function testCrc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function embeddedArchiveFixtures(): Array<[string, Buffer]> {
  const fixtures: Array<[string, Buffer]> = [];

  // A real gzip member with a valid deflate stream, CRC32 and ISIZE footer.
  fixtures.push(['gzip', gzipSync(Buffer.from('glTF synthetic hidden model payload'))]);

  // Real BZip2 stream from Python bz2.compress(minimal glTF 2.0 GLB).
  // It decompresses to a 124-byte valid GLB envelope. Critically, the
  // 48-bit BZip2 EOS marker is not byte-aligned in this real stream.
  fixtures.push(['bzip2', Buffer.from(
    'QlpoOTFBWSZTWQQvPkMAACbfgFAAEAdQEAERjAou550uIABoRqTQDQ9QeoNpGhoGqepvSg0DQAAyabSa0g50NyiO5C4UzH0zj6qCJYqERLm9XnWLzYlsUD5Hr7iPpQzOfurAg8Qg+1yhBF1gvUBQ2LSULZ2Ex5Gjl8RPxdyRThQkAQvPkMA=',
    'base64',
  )]);

  // Header/footer CRC and backward-size framing for an XZ stream envelope.
  const xzFlags = Buffer.from([0, 0]);
  const xzHeader = Buffer.alloc(12);
  Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]).copy(xzHeader, 0);
  xzFlags.copy(xzHeader, 6);
  xzHeader.writeUInt32LE(testCrc32(xzFlags), 8);
  const xzFooter = Buffer.alloc(12);
  xzFooter.writeUInt32LE(testCrc32(xzFooter.subarray(4, 10)), 0);
  xzFooter.writeUInt32LE(0, 4); // Four-byte Index field.
  xzFlags.copy(xzFooter, 8);
  xzFooter.write('YZ', 10, 'ascii');
  fixtures.push(['xz', Buffer.concat([xzHeader, Buffer.alloc(4), xzFooter])]);

  // A single-segment Zstandard frame with one final raw block.
  fixtures.push(['zstd', Buffer.from([
    0x28, 0xb5, 0x2f, 0xfd, // frame magic
    0x20, 0x04, // single segment, four-byte content size
    0x21, 0x00, 0x00, // last raw block, four bytes
    0x67, 0x6c, 0x54, 0x46, // "glTF"
  ])]);

  // 7z StartHeader CRCs and a two-byte NextHeader ("Header", "End").
  const sevenZip = Buffer.alloc(34);
  Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0x00, 0x04]).copy(sevenZip, 0);
  sevenZip.writeBigUInt64LE(0n, 12);
  sevenZip.writeBigUInt64LE(2n, 20);
  Buffer.from([0x01, 0x00]).copy(sevenZip, 32);
  // The StartHeader CRC covers the NextHeader CRC field at bytes 28..31.
  sevenZip.writeUInt32LE(testCrc32(sevenZip.subarray(32)), 28);
  sevenZip.writeUInt32LE(testCrc32(sevenZip.subarray(12, 32)), 8);
  fixtures.push(['7z', sevenZip]);

  // RAR4 MAIN_HEAD uses the low 16 bits of CRC32 over bytes after HEAD_CRC.
  // The minimal standards-shaped header's checksum is 0x90cf.
  const rar4 = Buffer.alloc(20);
  Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]).copy(rar4, 0);
  rar4[9] = 0x73; // Main archive header.
  rar4.writeUInt16LE(13, 12);
  rar4.writeUInt16LE(testCrc32(rar4.subarray(9)) & 0xffff, 7);
  fixtures.push(['rar4', rar4]);

  const rar5 = Buffer.alloc(15);
  Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]).copy(rar5, 0);
  rar5[12] = 2; // Two bytes in the header: type and flags.
  rar5[13] = 1; // Archive header.
  rar5[14] = 0; // No flags.
  rar5.writeUInt32LE(testCrc32(rar5.subarray(12)), 8);
  fixtures.push(['rar5', rar5]);

  // RAR5 header-encrypted archives start with an unencrypted type-4 header.
  // Header fields: type, flags, encryption version, encryption flags, KDF
  // count and a 16-byte salt (official RAR5 technote, Archive encryption).
  const rar5Encrypted = Buffer.alloc(34);
  Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]).copy(rar5Encrypted, 0);
  rar5Encrypted[12] = 21; // Header payload size after this vint.
  rar5Encrypted[13] = 4; // Archive encryption header.
  rar5Encrypted[17] = 15; // KDF count, all other flags/version are zero.
  Buffer.from('00112233445566778899aabbccddeeff', 'hex').copy(rar5Encrypted, 18);
  rar5Encrypted.writeUInt32LE(testCrc32(rar5Encrypted.subarray(12)), 8);
  fixtures.push(['rar5-encrypted', rar5Encrypted]);

  // Cabinet header and one folder record, with all offsets inside the cabinet.
  const cab = Buffer.alloc(52);
  cab.write('MSCF', 0, 'ascii');
  cab.writeUInt32LE(cab.length, 8);
  cab.writeUInt32LE(44, 16);
  cab[24] = 3;
  cab[25] = 1;
  cab.writeUInt16LE(1, 26);
  fixtures.push(['cab', cab]);

  // One empty ar member with the required fixed-width header trailer.
  const ar = Buffer.alloc(68, 0x20);
  ar.write('!<arch>\n', 0, 'ascii');
  ar.write('hidden.o/', 8, 'ascii');
  ar.write('0', 24, 'ascii');
  ar.write('0', 36, 'ascii');
  ar.write('100644', 48, 'ascii');
  ar.write('0', 56, 'ascii');
  ar.write('`\n', 66, 'ascii');
  fixtures.push(['ar', ar]);

  return fixtures;
}

function makeZip64AesLocalHeader(uncompressedSize = 0n): Buffer {
  const name = Buffer.from('zip64-hidden-model.bin', 'ascii');
  const payload = Buffer.from('encrypted model archive payload', 'ascii');
  // ZIP64 sizes are stored in extra field 0x0001 (uncompressed, then compressed).
  // AES method 99 is declared by extra field 0x9901 and is a valid ZIP method.
  const extra = Buffer.alloc(4 + 16 + 4 + 7);
  extra.writeUInt16LE(0x0001, 0);
  extra.writeUInt16LE(16, 2);
  extra.writeBigUInt64LE(uncompressedSize || BigInt(payload.length), 4);
  extra.writeBigUInt64LE(BigInt(payload.length), 12);
  extra.writeUInt16LE(0x9901, 20);
  extra.writeUInt16LE(7, 22);
  extra.writeUInt16LE(2, 24);
  extra.write('AE', 26, 'ascii');
  extra[28] = 3;
  extra.writeUInt16LE(8, 29);

  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(51, 4);
  header.writeUInt16LE(99, 8);
  header.writeUInt32LE(0xffffffff, 18);
  header.writeUInt32LE(0xffffffff, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(extra.length, 28);
  return Buffer.concat([header, name, extra, payload]);
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'cueory-anatomy-publish-'));
  roots.push(root);
  const dist = join(root, 'dist');
  const content = join(root, 'content', 'visuals');
  mkdirSync(dist, { recursive: true });
  mkdirSync(content, { recursive: true });
  const sourceModels = join(root, 'public', 'models', 'anatomy');
  mkdirSync(sourceModels, { recursive: true });
  const file = (path: string, body: string | Buffer = '') => {
    const dest = join(dist, path);
    mkdirSync(join(dest, '..'), { recursive: true });
    writeFileSync(dest, body);
  };
  /** Realistic synthetic GLB for tests only. Node identities follow the manifest currently being tested. */
  const makeApprovedGlb = (ids: string[]): Buffer => {
    const modelJson = {
      asset: { version: '2.0', copyright: 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International' },
      extensionsRequired: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
      extensionsUsed: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
      scene: 0,
      scenes: [{ nodes: ids.map((_, i) => i) }],
      nodes: ids.map((id, mesh) => ({ name: id, mesh })),
      meshes: ids.map(() => ({ primitives: [{ indices: 0, attributes: { POSITION: 1 } }] })),
      accessors: [{ count: 3, componentType: 5123, type: 'SCALAR', bufferView: 0 },
        { count: 3, componentType: 5126, type: 'VEC3', bufferView: 1 }],
      // Synthetic metadata contract only. Binary bytes here are NOT a genuine
      // meshopt payload. Real checked-in GLBs are decoded in a separate test.
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 6,
          extensions: { EXT_meshopt_compression: {
            buffer: 0, byteOffset: 0, byteLength: 6,
            count: 3, byteStride: 2, mode: 'TRIANGLES',
          } } },
        { buffer: 0, byteOffset: 8, byteLength: 36,
          extensions: { EXT_meshopt_compression: {
            buffer: 0, byteOffset: 8, byteLength: 36,
            count: 3, byteStride: 12, mode: 'ATTRIBUTES',
          } } },
      ],
      buffers: [{ byteLength: 44 }],
    };
    const bytes = Buffer.from(JSON.stringify(modelJson), 'utf8');
    const padded = Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4, 0x20)]);
    const bin = Buffer.alloc(44);
    bin.writeUInt16LE(0, 0);
    bin.writeUInt16LE(1, 2);
    bin.writeUInt16LE(2, 4);
    // A real triangle: three FLOAT VEC3 positions, with 4-byte alignment.
    bin.writeFloatLE(1, 20);
    bin.writeFloatLE(1, 36);
    const glb = Buffer.alloc(20 + padded.length + 8 + bin.length);
    glb.write('glTF', 0, 'ascii');
    glb.writeUInt32LE(2, 4);
    glb.writeUInt32LE(glb.length, 8);
    glb.writeUInt32LE(padded.length, 12);
    glb.writeUInt32LE(0x4e4f534a, 16);
    padded.copy(glb, 20);
    glb.writeUInt32LE(bin.length, 20 + padded.length);
    glb.writeUInt32LE(0x004e4942, 24 + padded.length);
    bin.copy(glb, 28 + padded.length);
    return glb;
  };
  const system = (name: string, status: 'draft' | 'approved' | 'other', urls: string[], ids: string[] = []) => {
    writeFileSync(join(content, `anatomy-${name}.json`), JSON.stringify({
      status,
      model: { file: urls[0], files: urls.slice(1), release: 'BodyParts3D 4.0' },
      labels: ids.map((id) => ({ id, text: 'fixture label', source: `bp3d-${id}` })),
      // Fake, test-only evidence. Never used as an anatomy quotation.
      sources: ids.map((id) => ({
        id: `bp3d-${id}`,
        quote: id.startsWith('BP') ? `FMA999999 ${id} fixture label` : `${id} BP999999 fixture label`,
        book: 'BodyParts3D',
        section: 'partof_parts_list_e.txt, Release 4.0',
        url: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_parts_list_e.txt',
        license: 'CC BY 4.0',
        retrieved: '2026-11-04',
      })),
    }));
    if (status === 'approved' && urls[0]?.startsWith('/models/anatomy/')) {
      const original = makeApprovedGlb(ids);
      file(urls[0].slice(1), original);
      writeFileSync(join(root, 'public', urls[0].slice(1)), original);
    }
  };
  system('draft', 'draft', ['/models/anatomy/draft.glb'], ['FMA999991']);
  system('approved', 'approved', ['/models/anatomy/approved.glb'], ['FMA999992']);
  file('preview/anatomy-lab.html', '<html><meta name="robots" content="noindex"></html>');
  return { dist, content, file, system, check: () => auditAnatomyProduction(dist, content) };
}

describe('anatomy audit CLI entry point', () => {
  it('runs through a symlink and fails closed for a missing production dist', () => {
    const root = mkdtempSync(join(tmpdir(), 'cueory-anatomy-cli-'));
    roots.push(root);
    const script = new URL('../../scripts/anatomy-production-audit.mjs', import.meta.url);
    const link = join(root, 'audit-link.mjs');
    symlinkSync(script, link);
    const result = spawnSync(process.execPath, [link, join(root, 'missing-dist'), join(root, 'missing-source')], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('anatomy production audit FAILED');
    expect(result.stderr).toContain('production output does not exist');
  });
});

describe('anatomy production artifact audit', () => {
  it('accepts approved GLB bytes while detecting a copied model under a misleading extension', () => {
    const f = setup();
    expect(f.check().errors).toEqual([]);
    const approvedBytes = readFileSync(join(f.dist, 'models', 'anatomy', 'approved.glb'));
    f.file('downloads/disguised-model.dat', approvedBytes);
    expect(f.check().errors).toContain(
      'unapproved model exposed in production: /downloads/disguised-model.dat',
    );
  });

  it('validates Pagefind gzip envelopes and rejects compressed models or nested archives', () => {
    const f = setup();
    const prefix = Buffer.from('pagefind_dcd', 'ascii');
    // Pagefind 1.5.2 derives these records as positional CBOR arrays:
    // WordIndex=[words], FilterIndex=[filter, values], MetaIndex=[version, pages, chunks, filters, sorts, fields].
    const indexCbor = Buffer.from([0x81, 0x80]);
    const filterCbor = Buffer.from([0x82, 0x61, 0x66, 0x80]);
    const metaCbor = Buffer.from([0x86, 0x65, 0x31, 0x2e, 0x35, 0x2e, 0x32, 0x80, 0x80, 0x80, 0x80, 0x80]);
    const gzipIndex = gzipSync(Buffer.concat([prefix, indexCbor]));
    const gzipFilter = gzipSync(Buffer.concat([prefix, filterCbor]));
    const gzipMeta = gzipSync(Buffer.concat([prefix, metaCbor]));
    const fragmentPayload = JSON.stringify({
      url: '/', content: 'safe search text', word_count: 3,
      filters: {}, meta: {}, anchors: [],
    });
    const fragment = gzipSync(Buffer.concat([prefix, Buffer.from(fragmentPayload)]));
    const wasm = gzipSync(Buffer.concat([prefix, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])]));
    const wasmHeader = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    const hiddenZip = makeStoredZip();
    const encodeWasmU32 = (value: number): Buffer => {
      const bytes: number[] = [];
      do {
        let byte = value & 0x7f;
        value >>>= 7;
        if (value > 0) byte |= 0x80;
        bytes.push(byte);
      } while (value > 0);
      return Buffer.from(bytes);
    };
    // A valid custom section may contain either a harmless magic-shaped byte
    // sequence or a complete hidden archive. Only the archive is rejected.
    const harmlessWasmCustom = Buffer.concat([
      Buffer.from([0x01, 0x78]), Buffer.from('BZh ordinary WASM custom data', 'ascii'),
    ]);
    const wasmWithHarmlessMarker = gzipSync(Buffer.concat([
      prefix, wasmHeader, Buffer.from([0x00]),
      encodeWasmU32(harmlessWasmCustom.length), harmlessWasmCustom,
    ]));
    // A valid WebAssembly custom section can still smuggle a complete ZIP.
    const wasmCustomName = Buffer.from('archive', 'ascii');
    const wasmZipCustomPayload = Buffer.concat([
      encodeWasmU32(wasmCustomName.length), wasmCustomName, hiddenZip,
    ]);
    const wasmWithZip = gzipSync(Buffer.concat([
      prefix, wasmHeader, Buffer.from([0x00]),
      encodeWasmU32(wasmZipCustomPayload.length), wasmZipCustomPayload,
    ]));
    // A normal WebAssembly custom-section string may contain the word "ustar";
    // it is not a tar archive unless the complete 512-byte header/checksum exists.
    const wasmCustomData = Buffer.alloc(300, 0x61);
    wasmCustomData.write('ustar', 257, 'ascii');
    const wasmCustomPayload = Buffer.concat([Buffer.from([0x01, 0x78]), wasmCustomData]);
    const wasmWithUstarWord = gzipSync(Buffer.concat([
      prefix, wasmHeader, Buffer.from([0x00, 0xae, 0x02]), wasmCustomPayload,
    ]));
    // WASM custom-section bytes are opaque binary payload, not student-facing
    // anatomy text. ID-shaped bytes must not cause a false release rejection.
    const wasmOpaqueData = Buffer.alloc(300, 0x61);
    wasmOpaqueData.write('FMA999991 FIX001', 32, 'ascii');
    const wasmWithOpaqueIds = gzipSync(Buffer.concat([
      prefix, wasmHeader, Buffer.from([0x00, 0xae, 0x02]),
      Buffer.concat([Buffer.from([0x01, 0x78]), wasmOpaqueData]),
    ]));
    f.file('pagefind/fragment/en_test.pf_fragment', fragment);
    f.file('pagefind/index/en_test.pf_index', gzipIndex);
    f.file('pagefind/filter/en_test.pf_filter', gzipFilter);
    f.file('pagefind/pagefind.en_test.pf_meta', gzipMeta);
    f.file('pagefind/wasm.en.pagefind', wasm);
    f.file('pagefind/wasm.en_harmless.pagefind', wasmWithHarmlessMarker);
    f.file('pagefind/wasm.en_opaque_ids.pagefind', wasmWithOpaqueIds);
    // Pagefind also accepts already-decompressed data with the same marker.
    f.file('pagefind/fragment/en_raw_test.pf_fragment', Buffer.concat([prefix, Buffer.from(JSON.stringify({
      url: '/', content: 'safe raw search text', word_count: 4,
      filters: {}, meta: {}, anchors: [],
    }))]));
    f.file('pagefind/index/en_raw_test.pf_index', Buffer.concat([prefix, indexCbor]));
    f.file('pagefind/filter/en_raw_test.pf_filter', Buffer.concat([prefix, filterCbor]));
    f.file('pagefind/wasm.en_raw.pagefind', Buffer.concat([prefix, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])]));
    // Incidental short signatures inside valid CBOR byte/text strings are
    // not proof of a complete embedded archive. Only structurally validated
    // containers should be rejected from these Pagefind payloads.
    const incidentalBinaryMarkers = Buffer.from([
      0x1f, 0x8b, 0x42, 0x5a, 0x68, 0x50, 0x4b, 0x03, 0x04,
    ]);
    const incidentalTextMarkers = Buffer.concat([
      Buffer.from('BZh PK'),
      Buffer.from([0x03, 0x04]),
      Buffer.from(' are text markers'),
    ]);
    const safeMentionCbor = Buffer.concat([
      Buffer.from([0x82, 0x49]), incidentalBinaryMarkers,
      Buffer.from([0x78, incidentalTextMarkers.length]), incidentalTextMarkers,
    ]);
    f.file('pagefind/index/en_safe_glb_mention.pf_index', gzipSync(Buffer.concat([prefix, safeMentionCbor])));
    f.file('pagefind/index/en_safe_glb_mention_raw.pf_index', Buffer.concat([prefix, safeMentionCbor]));
    expect(f.check().errors).toEqual([]);

    // A gzip text hint is harmless: the body still has to validate as an
    // ordinary Pagefind fragment. Gzip optional metadata is rejected below.
    const textHintFragment = Buffer.from(fragment);
    textHintFragment[3] |= 0x01;
    f.file('pagefind/fragment/en_text_hint.pf_fragment', textHintFragment);
    expect(f.check().errors).toEqual([]);

    // Safe, standards-compliant optional metadata must remain compatible with
    // Pagefind's real gzip-wrapped search artifacts, including the WASM path.
    for (const [name, flag, metadata] of [
      ['filename', 0x08, Buffer.concat([Buffer.from('pagefind-index'), Buffer.from([0])])],
      ['comment', 0x10, Buffer.concat([Buffer.from('safe search data'), Buffer.from([0])])],
      ['extra', 0x04, Buffer.from([0x04, 0x00, 0x10, 0x20, 0x30, 0x40])],
    ] as const) {
      const ordinary = Buffer.concat([fragment.subarray(0, 10), metadata, fragment.subarray(10)]);
      ordinary[3] = flag;
      expect(gunzipSync(ordinary)).toEqual(gunzipSync(fragment));
      f.file(`pagefind/fragment/en_safe_header_${name}.pf_fragment`, ordinary);
    }
    expect(f.check().errors).toEqual([]);

    // A gzip member can hide public data in optional header fields that
    // gunzipSync strips before Pagefind JSON/CBOR inspection. These fields
    // must not be allowed even when the decoded fragment is safe.
    for (const [name, flag, metadata] of [
      ['filename', 0x08, Buffer.concat([Buffer.from('FMA999991', 'utf8'), Buffer.from([0])])],
      ['comment', 0x10, Buffer.concat([Buffer.from('FIX001', 'utf8'), Buffer.from([0])])],
      ['extra', 0x04, Buffer.from([0x09, 0x00, 0x46, 0x4d, 0x41, 0x39, 0x39, 0x39, 0x39, 0x39, 0x31])],
    ] as const) {
      const altered = Buffer.concat([fragment.subarray(0, 10), metadata, fragment.subarray(10)]);
      altered[3] = flag;
      f.file(`pagefind/fragment/en_header_${name}.pf_fragment`, altered);
    }
    for (const name of ['filename', 'comment', 'extra']) {
      expect(f.check().errors).toContain(
        `archive/container in production output requires explicit review: /pagefind/fragment/en_header_${name}.pf_fragment`,
      );
    }

    // A second empty gzip member does not alter gunzipSync's output. Its
    // separate filename header must never bypass the draft-ID release gate.
    const emptyMember = gzipSync(Buffer.alloc(0));
    const second = Buffer.concat([
      emptyMember.subarray(0, 10), Buffer.concat([Buffer.from('FMA999991'), Buffer.from([0])]), emptyMember.subarray(10),
    ]);
    second[3] = 0x08;
    const concatenated = Buffer.concat([fragment, second]);
    expect(gunzipSync(concatenated)).toEqual(gunzipSync(fragment));
    f.file('pagefind/fragment/en_second_member.pf_fragment', concatenated);
    expect(f.check().errors).toContain(
      'archive/container in production output requires explicit review: /pagefind/fragment/en_second_member.pf_fragment',
    );

    // Draft IDs in a valid compressed fragment must be rejected, including
    // JSON-escaped content and nested metadata/anchor strings. Fixture IDs are
    // never real anatomy and must also stay out of the public search index.
    const draftFragment = setup();
    const leakedFragment = JSON.stringify({
      url: '/', content: 'FMA999991', word_count: 1,
      filters: {}, meta: { source: 'FIX001' }, anchors: ['FMA999991'],
    }).replace('FMA999991', '\\u0046MA999991');
    draftFragment.file('pagefind/fragment/en_draft_ids.pf_fragment',
      gzipSync(Buffer.concat([prefix, Buffer.from(leakedFragment)])));
    expect(draftFragment.check().errors).toContain(
      'archive/container in production output requires explicit review: /pagefind/fragment/en_draft_ids.pf_fragment',
    );

    // The same protection applies to uncompressed Pagefind envelopes.
    const rawDraftFragment = setup();
    rawDraftFragment.file('pagefind/fragment/en_raw_draft_id.pf_fragment', Buffer.concat([
      prefix,
      Buffer.from(JSON.stringify({
        url: '/', content: 'FMA999991', word_count: 1,
        filters: {}, meta: {}, anchors: [],
      })),
    ]));
    expect(rawDraftFragment.check().errors).toContain(
      'archive/container in production output requires explicit review: /pagefind/fragment/en_raw_draft_id.pf_fragment',
    );

    // Fixture IDs are independently blocked even when no draft FMA/BP ID is present.
    const fixtureFragment = setup();
    fixtureFragment.file('pagefind/fragment/en_fixture_id.pf_fragment', gzipSync(Buffer.concat([
      prefix,
      Buffer.from(JSON.stringify({
        url: '/', content: 'FIX001', word_count: 1,
        filters: {}, meta: {}, anchors: [],
      })),
    ])));
    expect(fixtureFragment.check().errors).toContain(
      'archive/container in production output requires explicit review: /pagefind/fragment/en_fixture_id.pf_fragment',
    );

    // CBOR byte strings are opaque binary data, not searchable prose. An ID-shaped
    // sequence is allowed there; the equivalent major-type-3 text string below is not.
    const byteIndex = setup();
    const byteWord = Buffer.from('FMA999991 FIX001', 'ascii');
    byteIndex.file('pagefind/index/en_opaque_id_bytes.pf_index', gzipSync(Buffer.concat([
      prefix, Buffer.from([0x81, 0x40 + byteWord.length]), byteWord,
    ])));
    expect(byteIndex.check().errors).toEqual([]);

    // CBOR text strings in the word index are public searchable content too.
    const draftIndex = setup();
    const draftWord = Buffer.from('FMA999991');
    const draftWordCbor = Buffer.concat([Buffer.from([0x81, 0x69]), draftWord]);
    draftIndex.file('pagefind/index/en_draft_ids.pf_index', gzipSync(Buffer.concat([prefix, draftWordCbor])));
    expect(draftIndex.check().errors).toContain(
      'archive/container in production output requires explicit review: /pagefind/index/en_draft_ids.pf_index',
    );

    // A reviewed/approved ID remains valid and is not confused with a draft.
    const approvedFragment = setup();
    approvedFragment.file('pagefind/fragment/en_approved_id.pf_fragment', gzipSync(Buffer.concat([
      prefix,
      Buffer.from(JSON.stringify({
        url: '/', content: 'FMA999992 FIX1', word_count: 1,
        filters: {}, meta: {}, anchors: [],
      })),
    ])));
    expect(approvedFragment.check().errors).toEqual([]);

    f.file('pagefind/wasm.en_hidden_archive.pagefind', wasmWithZip);
    f.file('pagefind/wasm.en_ustar_word.pagefind', wasmWithUstarWord);
    f.file('pagefind/fragment/en_corrupt.pf_fragment', Buffer.from([0x1f, 0x8b, 0x08, 0x00]));
    // A raw compressed GLB is not a Pagefind data envelope.
    f.file('pagefind/fragment/en_hidden_model.pf_fragment', gzipSync(Buffer.from('glTF' + 'x'.repeat(32))));
    // A valid glTF JSON document is not a Pagefind search fragment.
    f.file('pagefind/fragment/en_glb_json.pf_fragment', gzipSync(Buffer.concat([
      prefix,
      Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [], nodes: [], meshes: [], accessors: [] })),
    ])));
    // Even a correctly prefixed Pagefind envelope must not hide a model/container payload.
    f.file('pagefind/index/en_prefixed_model.pf_index', gzipSync(Buffer.concat([prefix, Buffer.from('glTF' + 'x'.repeat(32))])));
    // A full ZIP entry is rejected in CBOR byte strings, even after harmless data.
    const zipByteString = Buffer.concat([Buffer.from([0x81, 0x58, hiddenZip.length]), hiddenZip]);
    f.file('pagefind/index/en_hidden_archive.pf_index', gzipSync(Buffer.concat([prefix, zipByteString])));
    // A complete 512-byte TAR header in a CBOR text string is also an archive.
    const textTar = Buffer.alloc(1536, 0);
    textTar.write('hidden-model.bin', 0, 'ascii');
    textTar.write('0000644', 100, 'ascii');
    textTar.write('0000000', 108, 'ascii');
    textTar.write('0000000', 116, 'ascii');
    textTar.write('00000000000', 124, 'ascii');
    textTar.write('00000000000', 136, 'ascii');
    textTar.fill(0x20, 148, 156);
    textTar.write('0', 156, 'ascii');
    textTar.write('ustar', 257, 'ascii'); // zero-filled byte 262 is the NUL terminator
    textTar.write('00', 263, 'ascii');
    let textTarChecksum = 0;
    for (let index = 0; index < 512; index += 1) textTarChecksum += index >= 148 && index < 156 ? 0x20 : textTar[index];
    textTar.write(textTarChecksum.toString(8).padStart(6, '0'), 148, 'ascii');
    textTar[154] = 0;
    textTar[155] = 0x20;
    const textStringTar = Buffer.concat([Buffer.from([0x81, 0x79, 0x06, 0x00]), textTar]);
    f.file('pagefind/index/en_text_string_archive.pf_index', gzipSync(Buffer.concat([prefix, textStringTar])));
    f.file('pagefind/filter/en_hidden_model.pf_filter', gzipSync(Buffer.concat([prefix, Buffer.from('glTF' + 'x'.repeat(32))])));
    // A valid CBOR array with a complete ZIP byte string after 700 bytes is still scanned.
    const lateZipCbor = Buffer.concat([
      Buffer.from([0x82, 0x59, 0x02, 0xbc]),
      Buffer.alloc(700, 0x61),
      Buffer.from([0x58, hiddenZip.length]),
      hiddenZip,
    ]);
    f.file('pagefind/index/en_late_archive.pf_index', gzipSync(Buffer.concat([prefix, lateZipCbor])));
    f.file('pagefind/index/en_raw_prefixed_model.pf_index', Buffer.concat([prefix, Buffer.from('glTF' + 'x'.repeat(32))]));
    const zstdFrame = embeddedArchiveFixtures().find(([format]) => format === 'zstd')?.[1];
    if (!zstdFrame) throw new Error('Missing Zstandard archive fixture.');
    f.file('pagefind/index/en_hidden_zstd.pf_index', gzipSync(Buffer.concat([
      prefix, Buffer.from([0x81, 0x58, zstdFrame.length]), zstdFrame,
    ])));
    // A complete, correctly framed GLB hidden in a valid CBOR byte string must fail.
    const model = readFileSync(join(f.dist, 'models', 'anatomy', 'approved.glb'));
    const modelLength = Buffer.alloc(4);
    modelLength.writeUInt32BE(model.length);
    const cborWithModel = Buffer.concat([Buffer.from([0x81, 0x5a]), modelLength, model]);
    f.file('pagefind/index/en_embedded_model.pf_index', gzipSync(Buffer.concat([prefix, cborWithModel])));
    const cborWithZip = zipByteString;
    f.file('pagefind/filter/en_embedded_zip.pf_filter', gzipSync(Buffer.concat([prefix, cborWithZip])));
    // Bytes after a valid gzip member must not be silently ignored by gunzip.
    f.file('pagefind/index/en_trailing_bytes.pf_index', Buffer.concat([gzipSync(Buffer.concat([prefix, Buffer.from('safe index payload')])), Buffer.from('glTF' + 'x'.repeat(32))]));
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'archive/container in production output requires explicit review: /pagefind/wasm.en_hidden_archive.pagefind',
      'archive/container in production output requires explicit review: /pagefind/fragment/en_corrupt.pf_fragment',
      'archive/container in production output requires explicit review: /pagefind/fragment/en_hidden_model.pf_fragment',
      'archive/container in production output requires explicit review: /pagefind/fragment/en_glb_json.pf_fragment',
      'archive/container in production output requires explicit review: /pagefind/index/en_prefixed_model.pf_index',
      'archive/container in production output requires explicit review: /pagefind/index/en_hidden_archive.pf_index',
      'archive/container in production output requires explicit review: /pagefind/index/en_text_string_archive.pf_index',
      'archive/container in production output requires explicit review: /pagefind/filter/en_hidden_model.pf_filter',
      'archive/container in production output requires explicit review: /pagefind/index/en_late_archive.pf_index',
      'archive/container in production output requires explicit review: /pagefind/index/en_embedded_model.pf_index',
      'archive/container in production output requires explicit review: /pagefind/filter/en_embedded_zip.pf_filter',
      'archive/container in production output requires explicit review: /pagefind/index/en_raw_prefixed_model.pf_index',
      'archive/container in production output requires explicit review: /pagefind/index/en_hidden_zstd.pf_index',
      'archive/container in production output requires explicit review: /pagefind/index/en_trailing_bytes.pf_index',
    ]));
  });


  it('rejects framed embedded archive formats under benign file extensions', () => {
    const f = setup();
    const realBzip2 = embeddedArchiveFixtures().find(([name]) => name === 'bzip2')![1];
    // Unlike the old hand-built fixture, this actual BZip2 stream has
    // no byte-aligned EOS marker, so the old scanner would have missed it.
    expect(realBzip2.indexOf(Buffer.from([0x17, 0x72, 0x45, 0x38, 0x50, 0x90]))).toBe(-1);
    const cases = embeddedArchiveFixtures();
    for (const [name, archive] of cases) {
      // Prefixes prove the format recognizers do not rely on offset-zero magic.
      f.file(`downloads/embedded-${name}.dat`, Buffer.concat([Buffer.alloc(900, 0x61), archive]));
    }
    const errors = f.check().errors;
    for (const [name] of cases) {
      expect(errors).toContain(
        `archive/container in production output requires explicit review: /downloads/embedded-${name}.dat`,
      );
    }
  });

  it('rejects archive containers that could conceal unapproved model assets', () => {
    const f = setup();
    // ZIP and TAR payloads are deliberately opaque to the outer dist walker.
    // Test both content sniffing under misleading suffixes and archive suffixes.
    const hiddenZip = makeStoredZip();
    f.file('downloads/hidden-model.dat', hiddenZip);
    // POSIX permits newlines in filenames; ZIP byte-string names remain valid.
    const controlNameZip = makeStoredZip(
      'hidden\nmodel.bin', Buffer.from('archive with control-character filename'),
    );
    expect(controlNameZip.includes(Buffer.from([0x0a]))).toBe(true);
    f.file('downloads/control-name-hidden-model.dat', controlNameZip);
    // Every supported embedded archive format must be recognized after a
    // harmless prefix and under a non-archive suffix.
    for (const [format, archive] of embeddedArchiveFixtures()) {
      f.file(`downloads/embedded-${format}.dat`, Buffer.concat([
        Buffer.from('ordinary prefix: '), archive,
      ]));
    }
    // Streaming ZIP writers use general-purpose bit 3 and put sizes/CRC in
    // a data descriptor after the entry; this is still an archive container.
    f.file('downloads/streaming-hidden-model.dat', makeStoredZip(
      'streaming-model.bin', Buffer.from('streamed archive payload'), true,
    ));
    // ZIP bombs are still valid ZIP containers: their decoded data can be
    // far larger than the complete archive. Cover ordinary and ZIP64 sizes.
    const repetitivePayload = Buffer.alloc(1024 * 1024, 0x61);
    f.file('downloads/deflated-hidden-model.dat',
      makeDeflatedZip('deflated-hidden-model.bin', repetitivePayload));
    f.file('downloads/zip64-deflated-hidden-model.dat',
      makeDeflatedZip('zip64-deflated-hidden-model.bin', repetitivePayload, true));
    // ZIP64 sentinels and AES method 99 must not bypass local-header detection.
    f.file('downloads/zip64-aes-hidden-model.dat', makeZip64AesLocalHeader());
    // A tiny compressed member may advertise an enormous expansion size;
    // the production gate must still recognize and reject the archive.
    f.file('downloads/zip-bomb-hidden-model.dat', makeZip64AesLocalHeader(1n << 40n));
    const tar = Buffer.alloc(512);
    const nul = String.fromCharCode(0);
    tar.write('hidden-model.bin', 0, 'ascii');
    tar.write('0000644' + nul, 100, 'ascii');
    tar.write('0000000' + nul, 108, 'ascii');
    tar.write('0000000' + nul, 116, 'ascii');
    tar.write('00000000000' + nul, 124, 'ascii');
    tar.write('00000000000' + nul, 136, 'ascii');
    tar.fill(0x20, 148, 156);
    tar[156] = 0x30;
    tar.write('ustar' + nul, 257, 'ascii');
    tar.write('00', 263, 'ascii');
    const checksum = tar.reduce((sum, byte) => sum + byte, 0);
    tar.write(checksum.toString(8).padStart(6, '0') + nul + ' ', 148, 'ascii');
    f.file('downloads/hidden-model.bin', tar);
    f.file('downloads/prefixed-tar.dat', Buffer.concat([Buffer.alloc(64 * 1024 - 100, 0x61), tar]));
    // Pre-ustar V7 has no "ustar" marker. Its checksum still identifies a
    // complete 512-byte header embedded under a benign file extension.
    const v7Tar = Buffer.from(tar);
    v7Tar.fill(0, 257, 265);
    v7Tar.fill(0x20, 148, 156);
    let v7Checksum = 0;
    for (let index = 0; index < 512; index += 1) v7Checksum += v7Tar[index]!;
    v7Tar.write(v7Checksum.toString(8).padStart(6, '0') + nul + ' ', 148, 'ascii');
    f.file('downloads/v7-hidden-model.bin', v7Tar);
    f.file('downloads/prefixed-v7-tar.dat', Buffer.concat([Buffer.alloc(257, 0x61), v7Tar]));
    f.file('downloads/unrecognized.zip', Buffer.from('opaque archive payload'));
    // Long prefixes and chunk boundaries must not hide a valid GLB or ZIP signature.
    const approvedGlb = readFileSync(join(f.dist, 'models', 'anatomy', 'approved.glb'));
    f.file('downloads/prefixed-model.bin', Buffer.concat([Buffer.alloc(700, 0x61), approvedGlb]));
    f.file('downloads/prefixed-archive.dat', Buffer.concat([
      Buffer.alloc(64 * 1024 - 100, 0x61), hiddenZip,
    ]));
    f.file('docs/archive-reference.txt', 'The word ustar is discussed here, but this is ordinary text.');
    f.file('docs/ar-reference.txt', '!<arch>' + String.fromCharCode(10) + ' is discussed in ordinary text.');
    const textTarMarker = Buffer.alloc(300, 0x61);
    textTarMarker.write('ustar', 257, 'ascii');
    f.file('docs/ustar-at-header-offset.txt', textTarMarker);
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'archive/container in production output requires explicit review: /downloads/hidden-model.dat',
      'archive/container in production output requires explicit review: /downloads/control-name-hidden-model.dat',
      ...embeddedArchiveFixtures().map(([format]) =>
        `archive/container in production output requires explicit review: /downloads/embedded-${format}.dat`,
      ),
      'archive/container in production output requires explicit review: /downloads/streaming-hidden-model.dat',
      'archive/container in production output requires explicit review: /downloads/deflated-hidden-model.dat',
      'archive/container in production output requires explicit review: /downloads/zip64-deflated-hidden-model.dat',
      'archive/container in production output requires explicit review: /downloads/zip64-aes-hidden-model.dat',
      'archive/container in production output requires explicit review: /downloads/zip-bomb-hidden-model.dat',
      'archive/container in production output requires explicit review: /downloads/hidden-model.bin',
      'archive/container in production output requires explicit review: /downloads/prefixed-tar.dat',
      'archive/container in production output requires explicit review: /downloads/v7-hidden-model.bin',
      'archive/container in production output requires explicit review: /downloads/prefixed-v7-tar.dat',
      'archive/container in production output requires explicit review: /downloads/unrecognized.zip',
      'archive/container in production output requires explicit review: /downloads/prefixed-model.bin',
      'archive/container in production output requires explicit review: /downloads/prefixed-archive.dat',
    ]));
  });

  it('rejects corrupted built compressed bytes despite unchanged GLB metadata', () => {
    const f = setup();
    const builtPath = join(f.dist, 'models', 'anatomy', 'approved.glb');
    const corrupt = Buffer.from(readFileSync(builtPath));
    // A one-byte BIN change preserves file size, JSON, node IDs and citation.
    corrupt[corrupt.length - 1] ^= 1;
    writeFileSync(builtPath, corrupt);
    expect(f.check().errors).toContain(
      'approved model failed built GLB geometry, identity or credit verification: /models/anatomy/approved.glb',
    );
  });

  it('still checks GLB scene, node identity and accessors when built and source bytes match', () => {
    const f = setup();
    const built = join(f.dist, 'models', 'anatomy', 'approved.glb');
    const source = join(f.dist, '..', 'public', 'models', 'anatomy', 'approved.glb');
    const valid = readFileSync(built);
    expect(f.check().errors).toEqual([]);

    // Mutating only dist now fails the byte-parity check, even if the deeper
    // GLB validator is accidentally removed. Keep both test-only files equal
    // so these cases exercise the actual publication metadata checks.
    for (const [before, after] of [
      ['"scene":0', '"scene":1'],
      ['"name":"FMA999992"', '"name":"FMA999993"'],
      ['"bufferView":0', '"bufferView":9'],
    ]) {
      expect(after).toHaveLength(before.length);
      const changed = Buffer.from(valid);
      const offset = changed.indexOf(before, 20, 'utf8');
      expect(offset).toBeGreaterThanOrEqual(20);
      changed.write(after, offset, 'utf8');
      writeFileSync(built, changed);
      writeFileSync(source, changed);
      expect(readFileSync(built).equals(readFileSync(source))).toBe(true);
      expect(f.check().errors).toContain(
        'approved model failed built GLB geometry, identity or credit verification: /models/anatomy/approved.glb',
      );
    }
  });

  it('rejects CSS hex-escaped draft and fixture IDs in published stylesheets', () => {
    const f = setup();
    f.file('_astro/escaped-anatomy.css', String.raw`.draft::before { content: "\46 MA999991"; } .fixture::after { content: "\46 IX001"; }`);
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'draft anatomy ID exposed in built text: _astro/escaped-anatomy.css (FMA999991)',
      'test fixture ID exposed in built text: _astro/escaped-anatomy.css (FIX001)',
    ]));
  });

  it('rejects CSS hex-escaped draft and fixture IDs inside generated HTML and SVG styles', () => {
    const f = setup();
    f.file('index.html', String.raw`<style>.draft::before { content: "\46 MA999991"; }</style>`);
    f.file('images/embedded-style.svg', String.raw`<svg><style>.fixture::after { content: "\46 IX001"; }</style></svg>`);
    f.file('nested-entity.html', String.raw`<div style="--anatomy-id:'&#92;46 MA999991'"></div>`);
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'draft anatomy ID exposed in built text: index.html (FMA999991)',
      'test fixture ID exposed in built text: images/embedded-style.svg (FIX001)',
      'draft anatomy ID exposed in built text: nested-entity.html (FMA999991)',
    ]));
    const literal = setup();
    literal.file('index.html', String.raw`<style>.literal::before { content: "\\46 MA999991"; }</style>`);
    literal.file('paired-entities.html', String.raw`<div style="--anatomy-id:'&#92;&#92;46 MA999991'"></div>`);
    expect(literal.check().errors).toEqual([]);
  });
  it('decodes only active CSS hex escapes with at most six digits', () => {
    expect(decodeAsciiEscapesForAudit(String.raw`\000046 IX001`, 'css')).toBe('FIX001');
    expect(decodeAsciiEscapesForAudit(String.raw`\0042 P24`, 'css')).toBe('BP24');
    expect(decodeAsciiEscapesForAudit(String.raw`\46  MA999991`, 'css')).toBe('F MA999991');
    expect(decodeAsciiEscapesForAudit(String.raw`\\46 MA999991`, 'css')).toBe(String.raw`\\46 MA999991`);
    expect(decodeAsciiEscapesForAudit(String.raw`\\\46 IX001`, 'css')).toBe(String.raw`\\FIX001`);
    expect(decodeAsciiEscapesForAudit(String.raw`\00000046IX001`, 'css')).toBe(String.raw`\00000046IX001`);
    const f = setup();
    f.file('_astro/escaped-literals.css', String.raw`.literal::before { content: "\\46 MA999991"; } .invalid::after { content: "\00000046IX001"; }`);
    expect(f.check().errors).toEqual([]);
  });
  it('refuses a displayed approved label with a mismatched FMA source name or identity', () => {
    const f = setup();
    const path = join(f.content, 'anatomy-approved.json');
    const record = JSON.parse(readFileSync(path, 'utf8'));
    const finding = 'anatomy-approved.json: approved label FMA999992 does not match its cited source row';

    record.labels[0].text = 'incorrect synthetic name';
    writeFileSync(path, JSON.stringify(record));
    expect(f.check().errors).toContain(finding);

    record.labels[0].text = 'fixture label';
    record.sources[0].quote = 'FMA999990 BP999999 fixture label';
    writeFileSync(path, JSON.stringify(record));
    expect(f.check().errors).toContain(finding);

    record.sources[0].quote = 'FMA999992 BP999999 fixture label';
    writeFileSync(path, JSON.stringify(record));
    expect(f.check().errors).toEqual([]);
  });

  it('rejects a malformed BodyParts3D row with BP in the FMA column', () => {
    const f = setup();
    const path = join(f.content, 'anatomy-approved.json');
    const record = JSON.parse(readFileSync(path, 'utf8'));
    // A BodyParts3D parts-list row is FMA ID, BP ID, then exact source name.
    // Treating BP as either column accepts a synthetic row the publisher never defines.
    record.sources[0].quote = 'BP999992 BP999999 fixture label';
    writeFileSync(path, JSON.stringify(record));
    expect(f.check().errors).toContain(
      'anatomy-approved.json: approved label FMA999992 does not match its cited source row',
    );
  });

  it('rejects an approved structure node that has no attached mesh or an invalid mesh index', () => {
    const f = setup();
    const path = join(f.dist, 'models', 'anatomy', 'approved.glb');
    const valid = readFileSync(path);
    const jsonLength = valid.readUInt32LE(12);
    const json = valid.toString('utf8', 20, 20 + jsonLength);
    expect(json).toContain('"mesh":0');
    for (const replacement of ['"void":0', '"mesh":9']) {
      // These replacements preserve GLB framing and JSON length. Only the
      // link from the named structure node to a renderable mesh is broken.
      const corrupted = Buffer.from(valid);
      corrupted.write(json.replace('"mesh":0', replacement), 20, 'utf8');
      writeFileSync(path, corrupted);
      expect(f.check().errors, replacement).toContain(
        'approved model failed built GLB geometry, identity or credit verification: /models/anatomy/approved.glb',
      );
    }
  });

  it('rejects duplicate ownership of a structure mesh or an unused extra mesh', () => {
    const f = setup();
    const path = join(f.dist, 'models', 'anatomy', 'approved.glb');
    f.system('approved', 'approved', ['/models/anatomy/approved.glb'], ['FMA999992', 'FMA999993']);
    const original = readFileSync(path);
    const decode = () => JSON.parse(original.toString('utf8', 20, 20 + original.readUInt32LE(12)));
    const edit = (change: (json: any) => void) => {
      const json = decode();
      change(json);
      const bytes = Buffer.from(JSON.stringify(json), 'utf8');
      const padded = Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4, 0x20)]);
      const payload = original.subarray(20 + original.readUInt32LE(12));
      const rebuilt = Buffer.alloc(20 + padded.length + payload.length);
      rebuilt.write('glTF', 0, 'ascii');
      rebuilt.writeUInt32LE(2, 4);
      rebuilt.writeUInt32LE(rebuilt.length, 8);
      rebuilt.writeUInt32LE(padded.length, 12);
      rebuilt.writeUInt32LE(0x4e4f534a, 16);
      padded.copy(rebuilt, 20);
      payload.copy(rebuilt, 20 + padded.length);
      writeFileSync(path, rebuilt);
    };
    expect(f.check().errors).toEqual([]);
    edit((json) => { json.nodes[1].mesh = 0; });
    expect(f.check().errors).toContain(
      'approved model failed built GLB geometry, identity or credit verification: /models/anatomy/approved.glb',
    );
    edit((json) => { json.meshes.push({ primitives: [{ indices: 0, attributes: { POSITION: 1 } }] }); });
    expect(f.check().errors).toContain(
      'approved model failed built GLB geometry, identity or credit verification: /models/anatomy/approved.glb',
    );
  });

  it('rejects missing scenes, orphaned nodes, empty structure meshes and invalid geometry references', () => {
    const f = setup();
    // Two approved structures: one mesh may remain valid while the other has
    // no primitives. Aggregate triangle counts must not hide that empty node.
    f.system('approved', 'approved', ['/models/anatomy/approved.glb'], ['FMA999992', 'FMA999993']);
    const path = join(f.dist, 'models', 'anatomy', 'approved.glb');
    const original = readFileSync(path);
    const mutate = (change: (json: any) => void) => {
      const jsonLength = original.readUInt32LE(12);
      const json = JSON.parse(original.toString('utf8', 20, 20 + jsonLength));
      change(json);
      const encoded = Buffer.from(JSON.stringify(json), 'utf8');
      const padded = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 0x20)]);
      const binLength = original.readUInt32LE(20 + jsonLength);
      const bin = original.subarray(28 + jsonLength, 28 + jsonLength + binLength);
      const output = Buffer.alloc(20 + padded.length + 8 + bin.length);
      output.write('glTF', 0, 'ascii');
      output.writeUInt32LE(2, 4);
      output.writeUInt32LE(output.length, 8);
      output.writeUInt32LE(padded.length, 12);
      output.writeUInt32LE(0x4e4f534a, 16);
      padded.copy(output, 20);
      output.writeUInt32LE(bin.length, 20 + padded.length);
      output.writeUInt32LE(0x004e4942, 24 + padded.length);
      bin.copy(output, 28 + padded.length);
      writeFileSync(path, output);
      expect(f.check().errors).toContain(
        'approved model failed built GLB geometry, identity or credit verification: /models/anatomy/approved.glb',
      );
    };
    // The viewer reads gltf.scene, so orphaned meshes are never publication-safe.
    mutate((json) => { delete json.scene; });
    mutate((json) => { delete json.scenes; });
    mutate((json) => { json.scene = 1; });
    mutate((json) => { json.scenes[0].nodes = []; });
    mutate((json) => { json.scenes[0].nodes = [1]; });
    mutate((json) => { json.scenes[0].nodes = [0, 0]; });
    mutate((json) => { json.nodes[0].children = [0]; });
    mutate((json) => { json.meshes[1].primitives = []; });
    mutate((json) => { delete json.bufferViews; });
    mutate((json) => { json.accessors[0].bufferView = 9; });
    mutate((json) => { json.accessors[1].count = 100; });
    mutate((json) => { json.accessors[0].byteOffset = 5; });
    mutate((json) => { json.bufferViews[1].byteStride = 4; });
    mutate((json) => { json.bufferViews[0].byteLength = 999; });
    mutate((json) => { json.bufferViews[0].buffer = 1; });
    mutate((json) => { json.bufferViews[0].extensions = { EXT_meshopt_compression:
      { buffer: 0, byteOffset: 1000, byteLength: 10, byteStride: 2, count: 3, mode: 'ATTRIBUTES' } }; });
    writeFileSync(path, original);
    expect(f.check().errors).toEqual([]);
  });

  it('rejects a forged approved GLB filename with invalid or truncated model bytes', () => {
    const f = setup();
    const path = join(f.dist, 'models', 'anatomy', 'approved.glb');
    writeFileSync(path, 'synthetic malformed model, not a GLB');
    expect(f.check().errors).toContain(
      'approved model failed built GLB geometry, identity or credit verification: /models/anatomy/approved.glb',
    );
    writeFileSync(path, Buffer.from('glTF'));
    expect(f.check().errors).toContain(
      'approved model failed built GLB geometry, identity or credit verification: /models/anatomy/approved.glb',
    );
  });

  it('rejects an approved GLB with missing node identity, credit, or decoder extension', () => {
    const f = setup();
    const path = join(f.dist, 'models', 'anatomy', 'approved.glb');
    const original = readFileSync(path);
    const edit = (mutate: (j: any) => void, binSize = 4) => {
      const length = original.readUInt32LE(12);
      const json = JSON.parse(original.toString('utf8', 20, 20 + length));
      mutate(json);
      const raw = Buffer.from(JSON.stringify(json));
      const padded = Buffer.concat([raw, Buffer.alloc((4 - raw.length % 4) % 4, 0x20)]);
      const out = Buffer.alloc(20 + padded.length + 8 + binSize);
      out.write('glTF', 0, 'ascii');
      out.writeUInt32LE(2, 4);
      out.writeUInt32LE(out.length, 8);
      out.writeUInt32LE(padded.length, 12);
      out.writeUInt32LE(0x4e4f534a, 16);
      padded.copy(out, 20);
      out.writeUInt32LE(binSize, 20 + padded.length);
      out.writeUInt32LE(0x004e4942, 24 + padded.length);
      writeFileSync(path, out);
    };
    for (const mutate of [
      (j: any) => { j.nodes[0].name = 'FMA999993'; },
      (j: any) => { j.asset.copyright = 'unapproved credit'; },
      (j: any) => { j.asset.version = '1.0'; },
      (j: any) => { delete j.asset.version; },
      (j: any) => { j.extensionsRequired = ['KHR_mesh_quantization']; },
      (j: any) => { delete j.meshes[0].primitives[0].attributes; },
      (j: any) => { delete j.meshes[0].primitives[0].attributes.POSITION; },
      (j: any) => { delete j.accessors[0].componentType; },
      (j: any) => { delete j.accessors[0].type; },
      (j: any) => { j.accessors[1].componentType = 5123; },
      (j: any) => { j.accessors[1].type = 'SCALAR'; },
      (j: any) => { j.accessors[0].count = 450003; },
      (j: any) => { j.buffers[0].byteLength = 50; },
      (j: any) => { j.buffers.push({ byteLength: 4, uri: 'https://example.invalid/external.bin' }); },
      (j: any) => { j.images = [{ uri: 'https://example.invalid/unreviewed.png' }]; },
      (j: any) => { j.images = [{ uri: 'data:image/png;base64,ZmFrZQ==' }]; j.textures = [{ source: 0 }]; },
    ]) {
      edit(mutate);
      expect(f.check().errors).toContain(
        'approved model failed built GLB geometry, identity or credit verification: /models/anatomy/approved.glb',
      );
    }
    // A zero-byte BIN with negative declared byteLength passed the former range-only check.
    edit((j: any) => { j.buffers[0].byteLength = -1; }, 0);
    expect(f.check().errors).toContain(
      'approved model failed built GLB geometry, identity or credit verification: /models/anatomy/approved.glb',
    );
    writeFileSync(path, original);
    expect(f.check().errors).toEqual([]);
  });

  it('rejects an unreviewed extra chunk after an otherwise valid approved GLB', () => {
    const f = setup();
    const path = join(f.dist, 'models', 'anatomy', 'approved.glb');
    const original = readFileSync(path);
    expect(f.check().errors).toEqual([]);
    // A self-consistent GLB header plus a valid JSON/BIN pair must not
    // conceal extra data in a third, nonstandard chunk.
    const altered = Buffer.alloc(original.length + 12);
    original.copy(altered);
    altered.writeUInt32LE(altered.length, 8);
    altered.writeUInt32LE(4, original.length);
    altered.write('HIDE', original.length + 4, 'ascii');
    altered.write('DATA', original.length + 8, 'ascii');
    writeFileSync(path, altered);
    expect(f.check().errors).toContain(
      'approved model failed built GLB geometry, identity or credit verification: /models/anatomy/approved.glb',
    );
  });

  it('rejects a GLB whose declared length mismatches the actual file', () => {
    const f = setup();
    const path = join(f.dist, 'models', 'anatomy', 'approved.glb');
    const original = Buffer.from(readFileSync(path));
    original.writeUInt32LE(original.length + 4, 8);
    writeFileSync(path, original);
    expect(f.check().errors).toContain(
      'approved model failed built GLB geometry, identity or credit verification: /models/anatomy/approved.glb',
    );
  });

  it('rejects invalid GLB JSON even when its header and byte lengths are correct', () => {
    const f = setup();
    const path = join(f.dist, 'models', 'anatomy', 'approved.glb');
    const bytes = Buffer.from(readFileSync(path));
    bytes.write('!', 20, 'ascii');
    writeFileSync(path, bytes);
    expect(f.check().errors).toContain(
      'approved model failed built GLB geometry, identity or credit verification: /models/anatomy/approved.glb',
    );
  });

  it('rejects corrupted compressed meshopt bytes in the built GLB while preserving its JSON and framing', () => {
    const f = setup();
    const manifest = JSON.parse(readFileSync(new URL('../../content/visuals/anatomy-kidneys.json', import.meta.url), 'utf8'));
    expect(manifest.status).toBe('draft');
    manifest.status = 'approved';
    writeFileSync(join(f.content, 'anatomy-kidneys.json'), JSON.stringify(manifest));

    const filename = 'models/anatomy/kidneys.glb';
    const source = readFileSync(new URL('../../public/models/anatomy/kidneys.glb', import.meta.url));
    const jsonLength = source.readUInt32LE(12);
    const json = JSON.parse(source.toString('utf8', 20, 20 + jsonLength));
    const compressed = json.bufferViews
      .map((view: { extensions?: { EXT_meshopt_compression?: { buffer: number; byteOffset: number; byteLength: number } } }) =>
        view.extensions?.EXT_meshopt_compression)
      .find((view: { buffer: number; byteOffset: number; byteLength: number } | undefined) =>
        view?.buffer === 0 && Number.isSafeInteger(view.byteOffset) &&
        Number.isSafeInteger(view.byteLength) && view.byteLength > 0);
    if (!compressed) throw new Error('real GLB has no compressed meshopt payload');

    // The GLB BIN chunk starts after the 12-byte header and 8-byte JSON chunk header.
    // Corrupt the middle of a real compressed payload, not JSON metadata or fallback bytes.
    const payloadOffset = 28 + jsonLength + compressed.byteOffset + Math.floor(compressed.byteLength / 2);
    expect(payloadOffset).toBeLessThan(source.length);
    const corrupted = Buffer.from(source);
    corrupted[payloadOffset] = (corrupted[payloadOffset] ?? 0) ^ 0xff;
    expect(corrupted.subarray(0, 28 + jsonLength)).toEqual(source.subarray(0, 28 + jsonLength));
    expect(corrupted.readUInt32LE(8)).toBe(source.readUInt32LE(8));

    f.file(filename, corrupted);
    writeFileSync(join(f.dist, '..', 'public', filename), source);
    expect(f.check().errors).toContain(
      'approved model failed built GLB geometry, identity or credit verification: /models/anatomy/kidneys.glb',
    );
  });

  it('parses all eleven real draft GLBs with the exact release decoder without approving them', () => {
    const modelDir = new URL('../../public/models/anatomy/', import.meta.url);
    const files = readdirSync(modelDir).filter((name) => name.endsWith('.glb')).sort();
    expect(files).toHaveLength(11);

    for (const file of files) {
      const system = file.slice(0, -'.glb'.length);
      const manifest = JSON.parse(readFileSync(
        new URL(`../../content/visuals/anatomy-${system}.json`, import.meta.url), 'utf8',
      ));
      // A parser compatibility test must never approve source content by changing its status.
      expect(manifest.status, system).toBe('draft');
      const json = parseApprovedGlb(readFileSync(new URL(
        `../../public/models/anatomy/${file}`, import.meta.url,
      )));
      expect(json.buffers, system).toHaveLength(2);
      expect(json.buffers[1].extensions?.EXT_meshopt_compression?.fallback, system).toBe(true);
      expect(json.bufferViews.length, system).toBeGreaterThan(0);
      expect(json.bufferViews.every((view: { buffer: number, extensions?: { EXT_meshopt_compression?: { buffer: number } } }) =>
        view.buffer === 1 && view.extensions?.EXT_meshopt_compression?.buffer === 0
      ), system).toBe(true);
      expect(json.nodes.map((node: { name: string }) => node.name).sort(), system)
        .toEqual(manifest.labels.map((label: { id: string }) => label.id).sort());
    }
  });

  it('accepts the checked-in gltfpack meshopt fallback format, but refuses a forged fallback marker', () => {
    // Use real generator output, NOT a newly invented clinical or anatomical model.
    // The source manifest remains draft in Git. Approval exists only in this temporary test directory.
    const f = setup();
    const manifest = JSON.parse(readFileSync(new URL('../../content/visuals/anatomy-kidneys.json', import.meta.url), 'utf8'));
    expect(manifest.status).toBe('draft');
    manifest.status = 'approved';
    writeFileSync(join(f.content, 'anatomy-kidneys.json'), JSON.stringify(manifest));

    const actualGlb = readFileSync(new URL('../../public/models/anatomy/kidneys.glb', import.meta.url));
    const filename = 'models/anatomy/kidneys.glb';
    f.file(filename, actualGlb);
    // Match the new release gate's checked-in source byte check. Only the
    // temporary dist copy is corrupted in the negative case below.
    writeFileSync(join(f.dist, '..', 'public', filename), actualGlb);
    // gltfpack writes a real BIN buffer and a virtual EXT_meshopt_compression
    // fallback buffer. Rejecting every GLB with two buffers rejects the actual source models.
    expect(f.check().errors).toEqual([]);

    const jsonLength = actualGlb.readUInt32LE(12);
    const json = actualGlb.toString('utf8', 20, 20 + jsonLength);
    expect(json).toContain('"fallback":true');
    const changed = json.replace('"fallback":true', '"fallback":null');
    expect(Buffer.byteLength(changed, 'utf8')).toBe(jsonLength);
    const forgedGlb = Buffer.from(actualGlb);
    Buffer.from(changed, 'utf8').copy(forgedGlb, 20);
    f.file(filename, forgedGlb);
    expect(f.check().errors).toContain(
      'approved model failed built GLB geometry, identity or credit verification: /models/anatomy/kidneys.glb',
    );
  });

  it('rejects declared meshopt without compressed index or position data', () => {
    const f = setup();
    const path = join(f.dist, 'models', 'anatomy', 'approved.glb');
    const original = readFileSync(path);
    const jsonLength = original.readUInt32LE(12);
    const originalJson = JSON.parse(original.toString('utf8', 20, 20 + jsonLength));
    const bin = original.subarray(28 + jsonLength);
    expect(f.check().errors).toEqual([]);

    const saveMutation = (mutate: (json: any) => void) => {
      const json = structuredClone(originalJson);
      mutate(json);
      const encoded = Buffer.from(JSON.stringify(json));
      const padded = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 0x20)]);
      const glb = Buffer.alloc(20 + padded.length + 8 + bin.length);
      glb.write('glTF', 0, 'ascii');
      glb.writeUInt32LE(2, 4);
      glb.writeUInt32LE(glb.length, 8);
      glb.writeUInt32LE(padded.length, 12);
      glb.writeUInt32LE(0x4e4f534a, 16);
      padded.copy(glb, 20);
      glb.writeUInt32LE(bin.length, 20 + padded.length);
      glb.writeUInt32LE(0x004e4942, 24 + padded.length);
      bin.copy(glb, 28 + padded.length);
      writeFileSync(path, glb);
    };
    const error = 'approved model failed built GLB geometry, identity or credit verification: /models/anatomy/approved.glb';

    for (const accessorIndex of [0, 1]) {
      saveMutation((json) => {
        delete json.bufferViews[json.accessors[accessorIndex].bufferView].extensions;
      });
      expect(f.check().errors, 'uncompressed accessor ' + accessorIndex).toContain(error);
    }

    saveMutation((json) => {
      for (const view of json.bufferViews) delete view.extensions;
    });
    expect(f.check().errors, 'extension declared but never used').toContain(error);
  });

  it('accepts a build with approved models and no exposed drafts', () => {
    expect(setup().check()).toEqual({ errors: [], approvedSystems: 1, draftSystems: 1, shippedModels: 1 });
  });

  it('rejects impossible retrieval dates while accepting a real leap day', () => {
    const f = setup();
    const filename = join(f.content, 'anatomy-approved.json');
    const record = JSON.parse(readFileSync(filename, 'utf8'));
    const error = 'anatomy-approved.json: approved source bp3d-FMA999992 has incomplete or incompatible citation and rights evidence';
    for (const invalid of ['2026-02-30', '2026-13-01', '2025-02-29', '0000-01-01', '2026-11-4']) {
      record.sources[0].retrieved = invalid;
      writeFileSync(filename, JSON.stringify(record));
      expect(f.check().errors, invalid).toContain(error);
    }
    record.sources[0].retrieved = '2024-02-29';
    writeFileSync(filename, JSON.stringify(record));
    expect(f.check().errors).toEqual([]);
  });

  it('reports null and primitive approved source records without crashing', () => {
    const f = setup();
    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb', release: 'BodyParts3D 4.0' },
      labels: [{ id: 'FMA999992', text: 'fixture label', source: 'bp3d-FMA999992' }],
      sources: [
        null, 7, [],
        {
          id: 'bp3d-FMA999992', quote: 'synthetic test words only',
          book: 'BodyParts3D', section: 'partof_parts_list_e.txt, Release 4.0',
          url: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_parts_list_e.txt',
          license: 'CC BY 4.0', retrieved: '2026-11-04',
        },
      ],
    }));

    const result = f.check();
    expect(result.approvedSystems).toBe(1);
    expect(result.errors.filter((message) =>
      message === 'anatomy-approved.json: invalid approved source ID')).toHaveLength(3);
  });

  it('accepts canonical BP IDs and FMA IDs with lowercase suffixes for approved anatomy', () => {
    const f = setup();
    f.system('approved', 'approved', ['/models/anatomy/approved.glb'], ['BP24', 'FMA7198nsn']);
    expect(f.check().errors).toEqual([]);
  });

  it('flags draft BP and suffixed FMA IDs in built text without matching longer tokens', () => {
    const f = setup();
    f.system('draft', 'draft', ['/models/anatomy/draft.glb'], ['BP24', 'FMA7198nsn']);
    f.file('index.html', '<p>BP24 FMA7198nsn BP240 FMA7198nsna</p>');
    const errors = f.check().errors;
    expect(errors).toContain('draft anatomy ID exposed in built text: index.html (BP24)');
    expect(errors).not.toContain('anatomy-draft.json: invalid draft label ID');
    expect(errors.filter((e) => e.includes('draft anatomy ID exposed in built text: index.html'))).toHaveLength(1);
  });

  it('rejects approved sources with missing, duplicate or unsupported structure IDs', () => {
    const f = setup();
    f.system('approved', 'approved', ['/models/anatomy/approved.glb'], []);
    expect(f.check().errors).toContain('anatomy-approved.json: approved labels are missing');

    f.system('approved', 'approved', ['/models/anatomy/approved.glb'], ['FMA999992', 'FMA999992', 'not-a-structure-id']);
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'anatomy-approved.json: duplicate approved label ID FMA999992',
      'anatomy-approved.json: invalid approved label ID',
    ]));
  });

  it('rejects approved structure names without an official name or source citation', () => {
    const f = setup();
    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb', release: 'BodyParts3D 4.0' },
      labels: [
        { id: 'FMA999992', text: ' ', source: 'bp3d-FMA999992' },
        { id: 'FMA999993', text: 'fixture only', source: '' },
      ],
      sources: [{ id: 'bp3d-FMA999992' }],
    }));
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'anatomy-approved.json: approved label FMA999992 has no official name',
      'anatomy-approved.json: approved label FMA999993 has no source citation',
    ]));
  });

  it('rejects missing source records and source IDs absent from an approved manifest', () => {
    const f = setup();
    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb', release: 'BodyParts3D 4.0' },
      labels: [{ id: 'FMA999992', text: 'fixture label', source: 'orphan-source' }],
    }));
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'anatomy-approved.json: approved source records are missing',
      'anatomy-approved.json: approved label FMA999992 references unknown source orphan-source',
    ]));

    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb', release: 'BodyParts3D 4.0' },
      labels: [{ id: 'FMA999992', text: 'fixture label', source: 'orphan-source' }],
      sources: [{ id: 'valid-source' }],
    }));
    expect(f.check().errors).toContain(
      'anatomy-approved.json: approved label FMA999992 references unknown source orphan-source',
    );
  });

  it('rejects an invalid or duplicated approved source record identifier', () => {
    const f = setup();
    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb', release: 'BodyParts3D 4.0' },
      labels: [{ id: 'FMA999992', text: 'fixture label', source: 'valid-source' }],
      // A corrupt null record must be reported instead of crashing the audit.
      sources: [null, { id: 'valid-source' }, { id: 'valid-source' }, { id: '' }],
    }));
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'anatomy-approved.json: duplicate approved source ID valid-source',
      'anatomy-approved.json: invalid approved source ID',
    ]));
  });

  it('rejects a label citing another structure even when that source exists', () => {
    const f = setup();
    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb', release: 'BodyParts3D 4.0' },
      labels: [
        { id: 'FMA999992', text: 'fixture only', source: 'bp3d-FMA999993' },
      ],
      sources: [{ id: 'bp3d-FMA999993' }],
    }));
    expect(f.check().errors).toContain(
      'anatomy-approved.json: approved label FMA999992 source does not match structure ID',
    );
  });

  it('rejects a properly formatted citation if its source object is missing', () => {
    const f = setup();
    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb', release: 'BodyParts3D 4.0' },
      labels: [
        { id: 'FMA999992', text: 'fixture only', source: 'bp3d-FMA999992' },
      ],
      sources: [],
    }));
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'anatomy-approved.json: approved source records are missing',
      'anatomy-approved.json: approved label FMA999992 references unknown source bp3d-FMA999992',
    ]));
  });

  it('rejects an approved citation with a matching ID but missing quotation or section', () => {
    const f = setup();
    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb', release: 'BodyParts3D 4.0' },
      labels: [{ id: 'FMA999992', text: 'fixture label', source: 'bp3d-FMA999992' }],
      sources: [{
        id: 'bp3d-FMA999992', quote: '', book: 'BodyParts3D', section: '',
        url: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_parts_list_e.txt',
        license: 'CC BY 4.0', retrieved: '2026-11-04',
      }],
    }));
    expect(f.check().errors).toContain(
      'anatomy-approved.json: approved source bp3d-FMA999992 has incomplete or incompatible citation and rights evidence',
    );
  });

  it('rejects an approved source with unapproved licensing or off-site evidence', () => {
    const f = setup();
    writeFileSync(join(f.content, 'anatomy-approved.json'), JSON.stringify({
      status: 'approved',
      model: { file: '/models/anatomy/approved.glb', release: 'BodyParts3D 4.0' },
      labels: [{ id: 'FMA999992', text: 'fixture label', source: 'bp3d-FMA999992' }],
      sources: [{
        id: 'bp3d-FMA999992', quote: 'synthetic words', book: 'Other Atlas',
        section: 'partof_parts_list_e.txt, Release 4.0', url: 'https://example.org/unverified',
        license: 'CC BY-NC 4.0', retrieved: 'invalid date',
      }],
    }));
    expect(f.check().errors).toContain(
      'anatomy-approved.json: approved source bp3d-FMA999992 has incomplete or incompatible citation and rights evidence',
    );
  });

  it('rejects a wrong official citation target despite a valid LATEST archive URL', () => {
    const f = setup();
    const file = join(f.content, 'anatomy-approved.json');
    const original = JSON.parse(readFileSync(file, 'utf8'));
    const problem = 'anatomy-approved.json: approved source bp3d-FMA999992 has incomplete or incompatible citation and rights evidence';
    for (const url of [
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_parts_list_e.txt',
    ]) {
      writeFileSync(file, JSON.stringify({
        ...original, sources: [{ ...original.sources[0], url }],
      }));
      expect(f.check().errors, url).toContain(problem);
    }
    writeFileSync(file, JSON.stringify({
      ...original, sources: [{ ...original.sources[0], section: 'unreviewed source file' }],
    }));
    expect(f.check().errors).toContain(problem);
    writeFileSync(file, JSON.stringify(original));
    expect(f.check().errors).toEqual([]);
  });

  it('rejects an approved structure name whose citation points to the overview README', () => {
    const f = setup();
    const path = join(f.content, 'anatomy-approved.json');
    const original = JSON.parse(readFileSync(path, 'utf8'));
    const source = {
      ...original.sources[0],
      section: 'README_e.html, Release 4.0',
      url: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html',
    };
    writeFileSync(path, JSON.stringify({ ...original, sources: [source] }));
    expect(f.check().errors).toContain(
      'anatomy-approved.json: approved label FMA999992 must cite a Release 4.0 parts-list table',
    );
    writeFileSync(path, JSON.stringify(original));
    expect(f.check().errors).toEqual([]);
  });

  it('rejects a structure-specific source that cites only the general README', () => {
    const f = setup();
    const path = join(f.content, 'anatomy-approved.json');
    const original = JSON.parse(readFileSync(path, 'utf8'));
    const source = { ...original.sources[0], section: 'README_e.html, Release 4.0',
      url: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html' };
    writeFileSync(path, JSON.stringify({ ...original, sources: [source] }));
    expect(f.check().errors).toContain(
      'anatomy-approved.json: approved source bp3d-FMA999992 has incomplete or incompatible citation and rights evidence',
    );
    writeFileSync(path, JSON.stringify(original));
    expect(f.check().errors).toEqual([]);
  });

  it('rejects an archived BodyParts3D citation despite a claimed current CC BY license', () => {
    const f = setup();
    const file = join(f.content, 'anatomy-approved.json');
    const data = JSON.parse(readFileSync(file, 'utf8'));
    data.sources[0].url = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/README_e.html';
    writeFileSync(file, JSON.stringify(data));
    expect(f.check().errors).toContain(
      'anatomy-approved.json: approved source bp3d-FMA999992 has incomplete or incompatible citation and rights evidence',
    );
  });

  it('rejects an approved model with a missing or older BodyParts3D release', () => {
    const f = setup();
    const path = join(f.content, 'anatomy-approved.json');
    const original = JSON.parse(readFileSync(path, 'utf8'));
    const problem = 'anatomy-approved.json: approved model must use reviewed BodyParts3D 4.0 release';
    for (const release of [undefined, 'BodyParts3D 3.0', 'Unreviewed atlas release']) {
      const model = { ...original.model };
      if (release === undefined) delete model.release;
      else model.release = release;
      writeFileSync(path, JSON.stringify({ ...original, model }));
      expect(f.check().errors, String(release)).toContain(problem);
    }
    writeFileSync(path, JSON.stringify(original));
    expect(f.check().errors).toEqual([]);
  });

  it('rejects source traversal that the URL parser normalizes back into the current archive', () => {
    const f = setup();
    const file = join(f.content, 'anatomy-approved.json');
    const original = JSON.parse(readFileSync(file, 'utf8'));
    for (const url of [
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/../LATEST/README_e.html',
      'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/%2e%2e/LATEST/README_e.html',
    ]) {
      const edited = { ...original, sources: [{ ...original.sources[0], url }] };
      writeFileSync(file, JSON.stringify(edited));
      expect(f.check().errors, url).toContain(
        'anatomy-approved.json: approved source bp3d-FMA999992 has incomplete or incompatible citation and rights evidence',
      );
    }
  });

  it('rejects a directly fetchable draft model even if the anatomy page is clean', () => {
    const f = setup();
    f.file('models/anatomy/draft.glb', 'fixture');
    expect(f.check().errors).toContain('unapproved model exposed in production: /models/anatomy/draft.glb');
  });

  it('rejects missing approved models and stray models', () => {
    const f = setup();
    rmSync(join(f.dist, 'models', 'anatomy', 'approved.glb'));
    f.file('models/anatomy/stray.glb', 'fixture');
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'unapproved model exposed in production: /models/anatomy/stray.glb',
      'approved model missing from production: /models/anatomy/approved.glb',
    ]));
  });

  it('rejects 3D models copied outside the expected anatomy directory', () => {
    const f = setup();
    f.file('assets/copied-draft.glb', 'fixture');
    f.file('downloads/source.gltf', '{"asset":{"version":"2.0"}}');
    f.file('backup/source.obj', 'v 0 0 0');
    f.file('backup/source.stl', 'solid sample');
    f.file('assets/source.fbx', 'synthetic only');
    f.file('assets/source.ply', 'synthetic only');
    f.file('assets/source.dae', 'synthetic only');
    f.file('assets/source.3mf', 'synthetic only');
    f.file('assets/source.usdz', 'synthetic only');
    f.file('assets/source.blend', 'synthetic only');
    f.file('assets/source.USD', 'synthetic only');
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'unapproved model exposed in production: /assets/copied-draft.glb',
      'unapproved model exposed in production: /downloads/source.gltf',
      'unapproved model exposed in production: /backup/source.obj',
      'unapproved model exposed in production: /backup/source.stl',
      'unapproved model exposed in production: /assets/source.fbx',
      'unapproved model exposed in production: /assets/source.ply',
      'unapproved model exposed in production: /assets/source.dae',
      'unapproved model exposed in production: /assets/source.3mf',
      'unapproved model exposed in production: /assets/source.usdz',
      'unapproved model exposed in production: /assets/source.blend',
      'unapproved model exposed in production: /assets/source.USD',
    ]));
  });

  it('rejects a renamed GLB even when its extension is not on the model file list', () => {
    const f = setup();
    const source = readFileSync(join(f.dist, 'models', 'anatomy', 'approved.glb'));
    f.file('downloads/copied-anatomy.bin', source);
    f.file('assets/misnamed-model.dat', source);
    f.file('assets/ordinary.bin', Buffer.from([0, 1, 2, 3, 4]));
    const errors = f.check().errors;
    expect(errors).toContain('unapproved model exposed in production: /downloads/copied-anatomy.bin');
    expect(errors).toContain('unapproved model exposed in production: /assets/misnamed-model.dat');
    expect(errors).not.toContain('unapproved model exposed in production: /assets/ordinary.bin');
  });

  it('does not treat an approved model copied to a different URL as published approval', () => {
    const f = setup();
    rmSync(join(f.dist, 'models', 'anatomy', 'approved.glb'));
    f.file('other/approved.glb', 'fixture');
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'unapproved model exposed in production: /other/approved.glb',
      'approved model missing from production: /models/anatomy/approved.glb',
    ]));
  });

  it('rejects file and directory symlinks instead of following or silently skipping them', () => {
    const f = setup();
    mkdirSync(join(f.dist, 'assets'), { recursive: true });
    symlinkSync(join(f.dist, 'models', 'anatomy', 'approved.glb'), join(f.dist, 'assets', 'alias.glb'));
    symlinkSync(join(f.dist, 'models', 'anatomy'), join(f.dist, 'alias-models'), 'dir');
    const result = f.check();
    expect(result.errors).toEqual(expect.arrayContaining([
      'symbolic link in production output: /assets/alias.glb',
      'symbolic link in production output: /alias-models',
    ]));
    // The approved model counts once. An alias never becomes a reviewed asset.
    expect(result.shippedModels).toBe(1);
  });

  it('rejects broken symlinks even if the target no longer exists', () => {
    const f = setup();
    symlinkSync(join(f.dist, 'missing.glb'), join(f.dist, 'ghost.glb'));
    expect(f.check().errors).toContain('symbolic link in production output: /ghost.glb');
  });

  it('rejects a symlink used as the entire production output root', () => {
    const f = setup();
    const realDist = `${f.dist}-actual`;
    renameSync(f.dist, realDist);
    symlinkSync(realDist, f.dist, 'dir');
    expect(f.check().errors).toContain(`production output root is a symbolic link: ${f.dist}`);
  });

  it('rejects a symlink used as the entire anatomy source root', () => {
    const f = setup();
    const realContent = `${f.content}-actual`;
    renameSync(f.content, realContent);
    symlinkSync(realContent, f.content, 'dir');
    expect(f.check().errors).toContain(`anatomy source root is a symbolic link: ${f.content}`);
  });

  it('rejects linked anatomy source manifests rather than trusting an aliased approval', () => {
    const f = setup();
    symlinkSync(join(f.content, 'anatomy-approved.json'), join(f.content, 'anatomy-aliased.json'));
    expect(f.check().errors).toContain('anatomy-aliased.json: anatomy source must not be a symbolic link');
  });

  it('reads regular text through a descriptor and refuses symlink aliases', () => {
    const f = setup();
    const original = join(f.dist, 'preview', 'anatomy-lab.html');
    expect(readRegularFileNoFollow(original)).toContain('noindex');
    const alias = join(f.dist, 'preview', 'aliased-anatomy.html');
    symlinkSync(original, alias);
    expect(() => readRegularFileNoFollow(alias)).toThrow();
    expect(() => readRegularFileNoFollow(f.dist)).toThrow('not a regular file');
  });

  it('rejects a fixture endpoint even when no draft model is present', () => {
    const f = setup();
    f.file('preview/anatomy-fixture/fixture.glb', 'fixture');
    expect(f.check().errors).toContain('test fixture exposed in production: /preview/anatomy-fixture/fixture.glb');
  });

  it('rejects draft IDs serialized into the anatomy page or JavaScript assets', () => {
    const f = setup();
    f.file('preview/anatomy-lab.html', '<div>FMA999991</div>');
    f.file('_astro/study.js', 'const label="FMA999991";');
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'draft anatomy ID exposed in built text: preview/anatomy-lab.html (FMA999991)',
      'draft anatomy ID exposed in built text: _astro/study.js (FMA999991)',
    ]));
  });

  it('rejects synthetic fixture IDs from produced HTML, JS and search JSON', () => {
    const f = setup();
    f.file('preview/anatomy-lab.html', '<div data-test="FIX001">fixture shapes</div>');
    f.file('_astro/view.js', 'const id="FIX002";');
    f.file('pagefind/pagefind-entry.json', '{"id":"FIX003"}');
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'test fixture ID exposed in built text: preview/anatomy-lab.html (FIX001)',
      'test fixture ID exposed in built text: _astro/view.js (FIX002)',
      'test fixture ID exposed in built text: pagefind/pagefind-entry.json (FIX003)',
    ]));
  });

  it('detects fixture IDs even when no draft FMA source labels exist', () => {
    const f = setup();
    rmSync(join(f.content, 'anatomy-draft.json'));
    f.file('index.html', '<span>FIX004</span>');
    expect(f.check().errors).toContain('test fixture ID exposed in built text: index.html (FIX004)');
  });

  it('rejects escaped synthetic IDs in generated JS, JSON, HTML and SVG', () => {
    const f = setup();
    f.file('_astro/fixture.js', 'const id="\\u0046IX001";');
    f.file('pagefind/fixture.json', '{"id":"FIX\\u0030\\u0030\\u0032"}');
    f.file('preview/fixture.html', '<span>F&#73;X003</span>');
    f.file('images/fixture.svg', '<text>&#70;IX004</text>');
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'test fixture ID exposed in built text: _astro/fixture.js (FIX001)',
      'test fixture ID exposed in built text: pagefind/fixture.json (FIX002)',
      'test fixture ID exposed in built text: preview/fixture.html (FIX003)',
      'test fixture ID exposed in built text: images/fixture.svg (FIX004)',
    ]));
  });

  it('detects numeric HTML references without a semicolon in both decimal and hex', () => {
    expect(decodeAsciiEscapesForAudit('&#70IX001', 'markup')).toBe('FIX001');
    expect(decodeAsciiEscapesForAudit('&#x46IX002', 'markup')).toBe('FIX002');
    expect(decodeAsciiEscapesForAudit('FIX&#48&#48&#53', 'markup')).toBe('FIX005');
    expect(decodeAsciiEscapesForAudit('FMA&#57&#57&#57&#57&#57&#49', 'markup')).toBe('FMA999991');
  });

  it('detects valid numeric references with more than seven decimal or six hex digits', () => {
    expect(decodeAsciiEscapesForAudit('&#00000070IX001', 'markup')).toBe('FIX001');
    expect(decodeAsciiEscapesForAudit('&#x00000046IX002', 'markup')).toBe('FIX002');
    expect(decodeAsciiEscapesForAudit('&#00000070MA999991', 'markup')).toBe('FMA999991');

    const f = setup();
    f.file('index.html', '<span>&#00000070IX001 &#x00000046IX002 &#00000070MA999991</span>');
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'test fixture ID exposed in built text: index.html (FIX001)',
      'draft anatomy ID exposed in built text: index.html (FMA999991)',
    ]));
  });

  it('rejects decoded fixture and draft IDs from built HTML even when references omit semicolons', () => {
    const f = setup();
    f.file('preview/fixture.html', '<span data-anatomy="&#70IX001">synthetic</span>');
    f.file('index.html', '<div>FIX&#48&#48&#53</div><span>FMA&#57&#57&#57&#57&#57&#49</span>');
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'test fixture ID exposed in built text: preview/fixture.html (FIX001)',
      'test fixture ID exposed in built text: index.html (FIX005)',
      'draft anatomy ID exposed in built text: index.html (FMA999991)',
    ]));
  });

  it('does not flag a longer unrelated identifier after decoding semicolonless references', () => {
    const f = setup();
    f.file('index.html', '<div>FIX&#48&#48&#49extra</div>');
    expect(f.check().errors).toEqual([]);
  });

  it('detects encoded fixtures even if no real draft FMA label remains', () => {
    const f = setup();
    rmSync(join(f.content, 'anatomy-draft.json'));
    f.file('_astro/fixtures.js', 'const fixture="FIX\\x30\\x30\\x35";');
    expect(f.check().errors).toContain('test fixture ID exposed in built text: _astro/fixtures.js (FIX005)');
  });

  it('preserves token boundaries in encoded and unencoded anatomy data', () => {
    const f = setup();
    f.file('_astro/fixture.js', 'const a="FFIX001"; const b="FIX001extra";');
    f.file('pagefind/other.json', '{"id":"FIX0010extra"}');
    f.file('index.html', '<span>FIX&#48;&#48;1extra</span>');
    expect(f.check().errors).toEqual([]);
  });

  it('rejects reserved FIX IDs even when the number contains more than three digits', () => {
    const f = setup();
    f.file('pagefind/long-fixture.json', '{"id":"FIX0010"}');
    expect(f.check().errors).toContain('test fixture ID exposed in built text: pagefind/long-fixture.json (FIX0010)');
  });

  it('uses existing context-aware ASCII decoding for both FMA and FIX identifiers', () => {
    expect(decodeAsciiEscapesForAudit('\\u0046IX001', 'script')).toBe('FIX001');
    expect(decodeAsciiEscapesForAudit('FIX&#48;&#48;&#49;', 'markup')).toBe('FIX001');
    expect(decodeAsciiEscapesForAudit('FMA&#57;&#57;&#57;&#57;&#57;&#49;', 'markup')).toBe('FMA999991');
    expect(decodeAsciiEscapesForAudit('FIX0010', 'script')).toBe('FIX0010');
  });

  it('rejects padded braced Unicode fixture IDs in generated JavaScript', () => {
    const f = setup();
    f.file('_astro/fixture-four.js', 'const id="\\u{0046}IX001";');
    f.file('_astro/fixture-six.js', 'const id="F\\u{000049}X002";');
    f.file('_astro/fixture-eight.js', 'const id="FI\\u{00000058}003";');
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'test fixture ID exposed in built text: _astro/fixture-four.js (FIX001)',
      'test fixture ID exposed in built text: _astro/fixture-six.js (FIX002)',
      'test fixture ID exposed in built text: _astro/fixture-eight.js (FIX003)',
    ]));
  });

  it('detects BP and suffixed FMA draft IDs inside encoded built text', () => {
    const f = setup();
    f.system('draft', 'draft', ['/models/anatomy/draft.glb'], ['BP24', 'FMA7198nsn']);
    f.file('_astro/bp-draft.js', String.raw`const id="\u0042P24";`);
    f.file('preview/fma-draft.html', '<span>FMA7198&#110;sn</span>');
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'draft anatomy ID exposed in built text: _astro/bp-draft.js (BP24)',
      'draft anatomy ID exposed in built text: preview/fma-draft.html (FMA7198nsn)',
    ]));
  });

  it('does not flag longer BodyParts3D IDs as the shorter draft ID', () => {
    const f = setup();
    f.system('draft', 'draft', ['/models/anatomy/draft.glb'], ['BP24', 'FMA7198nsn']);
    f.file('index.html', '<div>BP240 FMA7198nsnextra</div>');
    expect(f.check().errors).toEqual([]);
  });

  it('rejects padded braced draft IDs but does not invent unrelated tokens', () => {
    const f = setup();
    f.file('_astro/draft-braced.js', 'const id="\\u{0046}MA999991";');
    f.file('_astro/unrelated.js', 'const prefix="PRE\\u{0046}IX001"; const accent="\\u{00E9}";');
    expect(f.check().errors).toContain(
      'draft anatomy ID exposed in built text: _astro/draft-braced.js (FMA999991)',
    );
    expect(f.check().errors.some((error) => error.includes('_astro/unrelated.js'))).toBe(false);
    expect(decodeAsciiEscapesForAudit('\\u{0046}IX001', 'script')).toBe('FIX001');
    expect(decodeAsciiEscapesForAudit('F\\u{000049}X002', 'script')).toBe('FIX002');
    expect(decodeAsciiEscapesForAudit('\\u{00E9}', 'script')).toBe('\\u{00E9}');
    expect(decodeAsciiEscapesForAudit('\\u{110000}', 'script')).toBe('\\u{110000}');
  });

  it('detects JavaScript code-point escapes with more than sixteen padded hex digits', () => {
    const padded = String.raw`\u{0000000000000000000046}IX001`;
    expect(decodeAsciiEscapesForAudit(padded, 'script')).toBe('FIX001');
    const f = setup();
    f.file('_astro/long-codepoint.js', `const id = "${padded}";`);
    expect(f.check().errors).toContain(
      'test fixture ID exposed in built text: _astro/long-codepoint.js (FIX001)',
    );
  });

  it('does not misclassify escaped literal backslashes as fixture IDs', () => {
    const f = setup();
    f.file('_astro/escaped-backslashes.js', String.raw`const text="\\u0046IX001"; const padded="\\u{0046}IX002"; const hex="\\x46IX003";`);
    expect(f.check().errors).toEqual([]);
    expect(decodeAsciiEscapesForAudit(String.raw`\\u0046IX001`, 'script')).toBe(String.raw`\\u0046IX001`);
    expect(decodeAsciiEscapesForAudit(String.raw`\\u{0046}IX002`, 'script')).toBe(String.raw`\\u{0046}IX002`);
    expect(decodeAsciiEscapesForAudit(String.raw`\\x46IX003`, 'script')).toBe(String.raw`\\x46IX003`);
  });

  it('still finds an active Unicode escape following a literal backslash pair', () => {
    const f = setup();
    f.file('_astro/odd-slashes.js', String.raw`const id="\\\u0046IX004";`);
    expect(decodeAsciiEscapesForAudit(String.raw`\\\u0046IX004`, 'script')).toBe(String.raw`\\FIX004`);
    expect(f.check().errors).toContain('test fixture ID exposed in built text: _astro/odd-slashes.js (FIX004)');
  });

  it('also catches escaped draft FMA IDs from the earlier audit review', () => {
    const f = setup();
    f.file('_astro/draft.js', 'const id="\\u0046MA999991";');
    f.file('draft.html', '<span>FMA&#57;&#57;&#57;&#57;&#57;&#49;</span>');
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'draft anatomy ID exposed in built text: _astro/draft.js (FMA999991)',
      'draft anatomy ID exposed in built text: draft.html (FMA999991)',
    ]));
  });

  it('does not confuse fixture IDs with longer unrelated tokens', () => {
    const f = setup();
    f.file('index.html', '<span>BEFOREFIX001 FIX001extra FIX </span>');
    expect(f.check().errors).toEqual([]);
  });

  it('avoids false positives from longer or unrelated structure identifiers', () => {
    const f = setup();
    f.file('preview/anatomy-lab.html', '<div>FMA9999910</div>');
    f.file('other.html', '<div>FMA999992</div>');
    expect(f.check().errors).toEqual([]);
  });

  it('rejects draft identifiers on unrelated pages, in search data and in SVG exports', () => {
    const f = setup();
    f.file('index.html', '<div>FMA999991</div>');
    f.file('pagefind/pagefind-entry.json', '{"id":"FMA999991"}');
    f.file('images/structure.svg', '<svg><title>FMA999991</title></svg>');
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'draft anatomy ID exposed in built text: index.html (FMA999991)',
      'draft anatomy ID exposed in built text: pagefind/pagefind-entry.json (FMA999991)',
      'draft anatomy ID exposed in built text: images/structure.svg (FMA999991)',
    ]));
  });

  it('fails closed when a draft has no labels or an unsupported identifier format', () => {
    const f = setup();
    f.system('draft', 'draft', ['/models/anatomy/draft.glb'], []);
    f.system('badid', 'draft', ['/models/anatomy/badid.glb'], ['local-sample']);
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'anatomy-draft.json: draft labels are missing',
      'anatomy-badid.json: invalid draft label ID',
    ]));
  });

  it('rejects one GLB approved by two different systems', () => {
    const f = setup();
    // Both approved manifests point at the same binary, despite different labels.
    f.system('another', 'approved', ['/models/anatomy/approved.glb'], ['FMA999993']);
    expect(f.check().errors).toContain(
      'ambiguous approval: /models/anatomy/approved.glb is claimed by multiple approved systems',
    );
  });

  it('rejects a model shared by an approved and a draft record', () => {
    const f = setup();
    f.system('draft', 'draft', ['/models/anatomy/approved.glb'], ['FMA999991']);
    expect(f.check().errors).toContain('ambiguous approval: /models/anatomy/approved.glb is also referenced by a draft');
  });

  it('fails closed on invalid status, invalid model URL and malformed JSON', () => {
    const f = setup();
    f.system('invalid', 'other', ['/models/anatomy/other.glb']);
    f.system('badpath', 'draft', ['/models/anatomy/../approved.glb']);
    writeFileSync(join(f.content, 'anatomy-broken.json'), '{oops');
    expect(f.check().errors).toEqual(expect.arrayContaining([
      'anatomy-invalid.json: invalid publication status',
      'anatomy-badpath.json: invalid model URL list',
      'anatomy-broken.json: cannot read valid JSON',
    ]));
  });

  it('refuses a missing dist or source folder', () => {
    const f = setup();
    expect(auditAnatomyProduction(join(f.dist, 'not-built'), f.content).errors[0]).toMatch(/production output does not exist/);
    expect(auditAnatomyProduction(f.dist, join(f.content, 'missing')).errors[0]).toMatch(/anatomy source directory does not exist/);
  });

  it('validates all model URL fields without accepting traversal or off-site data', () => {
    expect(modelUrls({ file: '/models/anatomy/a.glb', layerFiles: { organs: ['/models/anatomy/b.glb'] } })).toEqual([
      '/models/anatomy/a.glb', '/models/anatomy/b.glb',
    ]);
    expect(modelUrls({ file: 'https://example.com/a.glb' })).toBeNull();
    expect(modelUrls({ file: '/models/anatomy/../../secret.glb' })).toBeNull();
    expect(modelUrls({ file: '/models/anatomy/a.glb', files: 'other.glb' })).toBeNull();
  });

  it('does not mistake incidental gzip bytes in real compressed site assets for nested archives', () => {
    const f = setup();
    // These checked-in production assets contain incidental 1f 8b byte pairs
    // inside their own compressed image/font data; they are not gzip members.
    for (const asset of [
      'brand/v1/logo-full-light-1440.png',
      'brand/v1/icon-512.png',
      'fonts/lato-latin-400-italic.woff2',
      'gloves/glove-green.webp',
    ]) {
      f.file(asset, readFileSync(join(process.cwd(), 'public', asset)));
    }
    expect(f.check().errors).toEqual([]);
  });

});

/** Keep the built-output audit on the same branch gate as GLB pruning. */
type AuditBuildEnv = Parameters<typeof keepsDrafts>[0] & { CI?: string | undefined };
function shouldAuditBuiltAnatomy(env: AuditBuildEnv): boolean {
  return env.CI === 'true' && !keepsDrafts(env);
}

/** CI builds dist/ before running unit tests. Audit those real files, not only synthetic examples. */
describe('built production artifact gate', () => {
  const cases: { name: string; env: AuditBuildEnv; audit: boolean }[] = [
    { name: 'short main', env: { CI: 'true', WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, audit: true },
    { name: 'full main with local override', env: { CI: 'true', WORKERS_CI: '1', WORKERS_CI_BRANCH: ' refs/heads/main ', CUEORY_ANATOMY_DRAFTS: '1' }, audit: true },
    { name: 'unknown Workers branch', env: { CI: 'true', WORKERS_CI: '1' }, audit: true },
    { name: 'empty full ref', env: { CI: 'true', WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/' }, audit: true },
    { name: 'production-style CI build', env: { CI: 'true' }, audit: true },
    { name: 'preview full ref', env: { CI: 'true', WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/staging' }, audit: false },
    { name: 'preview short branch', env: { CI: 'true', WORKERS_CI: '1', WORKERS_CI_BRANCH: 'task-178/anatomy-lab' }, audit: false },
    { name: 'local draft build', env: { CI: 'true', CUEORY_ANATOMY_DRAFTS: '1' }, audit: false },
    { name: 'outside CI', env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, audit: false },
  ];
  it.each(cases)('$name: audit = $audit', ({ env, audit }) => {
    expect(shouldAuditBuiltAnatomy(env)).toBe(audit);
  });

  it('audits full-ref main and catches a draft model in output', () => {
    const env = { CI: 'true', WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/main', CUEORY_ANATOMY_DRAFTS: '1' };
    const f = setup();
    f.file('models/anatomy/draft.glb', 'synthetic fixture only');
    expect(shouldAuditBuiltAnatomy(env)).toBe(true);
    expect(f.check().errors).toContain('unapproved model exposed in production: /models/anatomy/draft.glb');
  });

  it('checks the actual dist output in CI unless the shared gate permits a preview', () => {
    if (!shouldAuditBuiltAnatomy(process.env)) return;
    // Missing dist/ is also an error. CI builds before Vitest.
    expect(auditAnatomyProduction('dist', 'content/visuals').errors).toEqual([]);
  });
});
