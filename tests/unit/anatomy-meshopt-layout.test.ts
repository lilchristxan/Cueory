import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseApprovedGlb, validMeshoptLayout } from '../../scripts/anatomy-production-audit.mjs';

describe('BodyParts3D meshopt release-layout contract', () => {
  const layout = (mode: string, stride: number, count: number, filter?: string) => ({
    view: { byteLength: stride * count },
    compression: { mode, byteStride: stride, count, ...(filter === undefined ? {} : { filter }) },
  });

  it('accepts valid attribute, triangle, and index mode/filter layouts', () => {
    const valid: Array<[string, number, number, string | undefined]> = [
      ['ATTRIBUTES', 4, 3, undefined],
      ['ATTRIBUTES', 4, 3, 'OCTAHEDRAL'],
      ['ATTRIBUTES', 8, 3, 'OCTAHEDRAL'],
      ['ATTRIBUTES', 8, 3, 'QUATERNION'],
      ['ATTRIBUTES', 12, 3, 'EXPONENTIAL'],
      ['ATTRIBUTES', 256, 1, 'NONE'],
      ['TRIANGLES', 2, 6, undefined],
      ['TRIANGLES', 4, 3, 'NONE'],
      ['INDICES', 2, 5, undefined],
      ['INDICES', 4, 5, 'NONE'],
    ];
    for (const [mode, stride, count, filter] of valid) {
      const { view, compression } = layout(mode, stride, count, filter);
      expect(validMeshoptLayout(view, compression), mode + ':' + stride).toBe(true);
    }
  });

  it('refuses mode/filter, stride, triangle-count, and parent-stride violations', () => {
    const invalid: Array<[string, number, number, string | undefined]> = [
      ['ATTRIBUTES', 6, 3, undefined],
      ['ATTRIBUTES', 12, 3, 'OCTAHEDRAL'],
      ['ATTRIBUTES', 4, 3, 'QUATERNION'],
      ['ATTRIBUTES', 12, 3, 'UNKNOWN'],
      ['TRIANGLES', 2, 3, 'OCTAHEDRAL'],
      ['TRIANGLES', 4, 3, 'EXPONENTIAL'],
      ['TRIANGLES', 2, 4, undefined],
      ['TRIANGLES', 1, 6, undefined],
      ['INDICES', 4, 4, 'QUATERNION'],
      ['INDICES', 6, 4, undefined],
    ];
    for (const [mode, stride, count, filter] of invalid) {
      const { view, compression } = layout(mode, stride, count, filter);
      expect(validMeshoptLayout(view, compression), mode + ':' + stride).toBe(false);
    }
    expect(validMeshoptLayout({ byteLength: 24, byteStride: 4 },
      { mode: 'ATTRIBUTES', byteStride: 8, count: 3 })).toBe(false);
    expect(validMeshoptLayout({ byteLength: 10 },
      { mode: 'TRIANGLES', byteStride: 2, count: 3 })).toBe(false);
  });

  it('rejects an illegal triangle filter inside a real checked-in GLB', () => {
    const original = readFileSync(new URL('../../public/models/anatomy/kidneys.glb', import.meta.url));
    expect(() => parseApprovedGlb(original)).not.toThrow();
    const jsonLength = original.readUInt32LE(12);
    const model = JSON.parse(original.subarray(20, 20 + jsonLength).toString('utf8'));
    const triangleView = model.bufferViews.find((v: any) =>
      v.extensions?.EXT_meshopt_compression?.mode === 'TRIANGLES');
    expect(triangleView).toBeDefined();
    triangleView.extensions.EXT_meshopt_compression.filter = 'OCTAHEDRAL';

    // Reframe only the glTF JSON chunk. Keep the original compressed BIN bytes.
    const encoded = Buffer.from(JSON.stringify(model), 'utf8');
    const padded = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 0x20)]);
    const tail = original.subarray(20 + jsonLength);
    const corrupted = Buffer.alloc(20 + padded.length + tail.length);
    corrupted.write('glTF', 0, 'ascii');
    corrupted.writeUInt32LE(2, 4);
    corrupted.writeUInt32LE(corrupted.length, 8);
    corrupted.writeUInt32LE(padded.length, 12);
    corrupted.writeUInt32LE(0x4e4f534a, 16);
    padded.copy(corrupted, 20);
    tail.copy(corrupted, 20 + padded.length);

    expect(() => parseApprovedGlb(corrupted))
      .toThrow('GLB meshopt range or decoder metadata invalid');
  });
});
