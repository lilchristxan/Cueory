import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * The structural production audit validates GLB metadata and compressed byte
 * ranges. Independently exercise the ACTUAL decoder that the Anatomy Lab uses,
 * so valid-looking metadata cannot conceal undecodable checked-in geometry.
 *
 * This is a read-only CI regression, not human model/rights approval and not a
 * replacement for auditing the exact built production dist/ before uploading.
 */
const systems = [
  'digestive', 'heart', 'kidneys', 'lungs', 'muscle', 'nerves',
  'nervous', 'skeleton-axial', 'skeleton-limbs', 'skin', 'vessels',
] as const;

interface Compression {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  count: number;
  byteStride: number;
  mode: string;
  filter?: string;
}

interface GlbJson {
  bufferViews: Array<{
    extensions?: { EXT_meshopt_compression?: Compression };
  }>;
}

function checkedInModel(system: string) {
  const bytes = readFileSync(new URL(`../../public/models/anatomy/${system}.glb`, import.meta.url));
  expect(bytes.toString('ascii', 0, 4), system).toBe('glTF');
  expect(bytes.readUInt32LE(4), system).toBe(2);
  expect(bytes.readUInt32LE(8), system).toBe(bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength)) as GlbJson;
  // Cueory's reviewed generator writes the JSON chunk followed by the BIN header.
  expect(bytes.readUInt32LE(20 + jsonLength + 4), system).toBe(0x004e4942);
  return { bytes, json, binOffset: 20 + jsonLength + 8 };
}

function compressedPayload(bytes: Buffer, binOffset: number, compression: Compression) {
  const offset = binOffset + (compression.byteOffset ?? 0);
  return bytes.subarray(offset, offset + compression.byteLength);
}

describe('checked-in BodyParts3D 4.0 GLBs: real meshopt decoding', () => {
  it('decompresses the real payloads of all eleven draft models', async () => {
    await MeshoptDecoder.ready;
    let testedViews = 0;
    for (const system of systems) {
      const { bytes, json, binOffset } = checkedInModel(system);
      let decodedViews = 0;
      for (const view of json.bufferViews) {
        const compression = view.extensions?.EXT_meshopt_compression;
        if (!compression) continue;
        expect(compression.buffer, system).toBe(0);
        const result = new Uint8Array(compression.count * compression.byteStride);
        expect(() => MeshoptDecoder.decodeGltfBuffer(
          result,
          compression.count,
          compression.byteStride,
          compressedPayload(bytes, binOffset, compression),
          compression.mode,
          compression.filter ?? 'NONE',
        ), system).not.toThrow();
        decodedViews += 1;
      }
      expect(decodedViews, `${system} has no tested compressed mesh data`).toBeGreaterThan(0);
      testedViews += decodedViews;
    }
    expect(testedViews).toBeGreaterThanOrEqual(systems.length);
  }, 30_000);

  it('rejects a broken compressed-stream header even when GLB metadata is unchanged', async () => {
    await MeshoptDecoder.ready;
    const { bytes, json, binOffset } = checkedInModel('kidneys');
    const compression = json.bufferViews[0]?.extensions?.EXT_meshopt_compression;
    expect(compression).toBeDefined();
    const ext = compression!;
    const corrupt = Buffer.from(compressedPayload(bytes, binOffset, ext));
    // The real vertex stream starts with a meshopt codec signature. Zeroing it
    // leaves JSON, lengths, source identities and declared ranges unchanged.
    corrupt[0] = 0;
    const target = new Uint8Array(ext.count * ext.byteStride);
    expect(() => MeshoptDecoder.decodeGltfBuffer(
      target, ext.count, ext.byteStride, corrupt, ext.mode, ext.filter ?? 'NONE',
    )).toThrow();
  });
});
