import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { auditAnatomyProduction } from '../../scripts/anatomy-production-audit.mjs';
import { unreviewedMediaPayload } from '../../scripts/anatomy-output-media.mjs';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cueory-anatomy-media-'));
  roots.push(root);
  const dist = join(root, 'dist');
  const content = join(root, 'content', 'visuals');
  mkdirSync(dist, { recursive: true });
  mkdirSync(content, { recursive: true });
  // Synthetic test-only ID and label. Nothing here is clinical anatomy.
  writeFileSync(join(content, 'anatomy-draft.json'), JSON.stringify({
    status: 'draft',
    model: { file: '/models/anatomy/draft.glb' },
    labels: [{ id: 'FMA999991', text: 'synthetic draft-only model' }],
  }));
  const file = (name: string, bytes: string | Buffer) => {
    const path = join(dist, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    return path;
  };
  return { root, file, audit: () => auditAnatomyProduction(dist, content) };
}

const OBJ = '# synthetic 3D data, not an image\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';
const STL = 'solid synthetic\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid\n';
const PLY = 'ply\nformat ascii 1.0\nelement vertex 3\nelement face 1\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n';

describe('production media signatures and renamed anatomy geometry', () => {
  it('rejects a Wavefront OBJ disguised as an ordinary JPEG from the production artifact walk', () => {
    const f = fixture();
    expect(f.audit().errors).toEqual([]);
    f.file('assets/photo.jpg', OBJ);
    expect(f.audit().errors).toContain(
      'unreviewed media payload or raw geometry in production output: /assets/photo.jpg',
    );
  });

  it('refuses OBJ, STL and PLY even when a media-looking file has a matching header', () => {
    const f = fixture();
    for (const [name, text] of [
      ['obj.jpg', OBJ], ['stl.png', STL], ['ply.webp', PLY],
    ] as const) {
      const disguised = Buffer.concat([Buffer.from([255, 216, 255, 224]), Buffer.from('\n' + text)]);
      // The misleading JPEG signature alone must never make the OBJ safe.
      if (name === 'obj.jpg') {
        const path = f.file(name, disguised);
        expect(unreviewedMediaPayload(path), name).toBe(true);
      } else {
        const path = f.file(name, text);
        expect(unreviewedMediaPayload(path), name).toBe(true);
      }
    }
  });

  it('rejects an OBJ whose first vertex follows JPEG magic without a separator', () => {
    const f = fixture();
    const payload = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'),
    ]);
    const path = f.file('assets/triangle.jpg', payload);
    expect(unreviewedMediaPayload(path)).toBe(true);
    expect(f.audit().errors).toContain(
      'unreviewed media payload or raw geometry in production output: /assets/triangle.jpg',
    );
  });

  it('does not flag printable prose ending in a vertex-shaped phrase as a binary-prefixed mesh', () => {
    const f = fixture();
    const bytes = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('ordinary prose ending with v 0 0 0\nf 1 2 3\n'),
    ]);
    // A genuine OBJ vertex directly after the media magic is blocked by the
    // neighboring regression. A printable preamble is not such a vertex.
    expect(unreviewedMediaPayload(f.file('assets/prose.jpg', bytes))).toBe(false);
  });

  it('rejects OBJ geometry appended after the initial media scan window', () => {
    const f = fixture();
    const disguised = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(65 * 1024, 0),
      Buffer.from(OBJ),
    ]);
    const path = f.file('assets/late-geometry.jpg', disguised);
    expect(unreviewedMediaPayload(path)).toBe(true);
    expect(f.audit().errors).toContain(
      'unreviewed media payload or raw geometry in production output: /assets/late-geometry.jpg',
    );
  });

  it('rejects raw OBJ split between two streaming media windows', () => {
    const f = fixture();
    const prefix = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(64 * 1024 - 8, 0),
    ]);
    const model = Buffer.from(OBJ);
    const path = f.file('assets/split-model.jpg', Buffer.concat([prefix, model]));
    expect(unreviewedMediaPayload(path)).toBe(true);
    expect(f.audit().errors).toContain(
      'unreviewed media payload or raw geometry in production output: /assets/split-model.jpg',
    );
  });

  it('rejects a raw OBJ when its vertex and face declarations are separated by a full scan window', () => {
    const f = fixture();
    const hidden = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\n'),
      Buffer.alloc(129 * 1024, 0),
      Buffer.from('f 1 2 3\n'),
    ]);
    const file = f.file('assets/separated-model.jpg', hidden);
    expect(unreviewedMediaPayload(file)).toBe(true);
    expect(f.audit().errors).toContain(
      'unreviewed media payload or raw geometry in production output: /assets/separated-model.jpg',
    );
  });

  it('accepts known compatible media signatures without certifying a full decoder pass', () => {
    const f = fixture();
    const safe: Array<[string, Buffer]> = [
      ['image.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])],
      ['photo.jpg', Buffer.from([255, 216, 255, 224])],
      ['picture.webp', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])],
      ['icon.ico', Buffer.from([0, 0, 1, 0, 1, 0])],
      ['font.woff2', Buffer.from('wOF2')],
      ['sound.ogg', Buffer.from('OggS')],
    ];
    for (const [name, bytes] of safe) {
      expect(unreviewedMediaPayload(f.file(name, bytes)), name).toBe(false);
    }
    // Standalone WASM is intentionally founder-held by the release auditor,
    // and is not an accepted media type in this helper.
    expect(f.audit().errors).toEqual([]);
  });

  it('rejects media payloads whose header claims the wrong binary format', () => {
    const f = fixture();
    const jpegHeader = Buffer.from([255, 216, 255, 224]);
    const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const wrongJpeg = f.file('assets/png-as-jpeg.jpg', pngHeader);
    const wrongPng = f.file('assets/jpeg-as-png.png', jpegHeader);
    expect(unreviewedMediaPayload(wrongJpeg)).toBe(true);
    expect(unreviewedMediaPayload(wrongPng)).toBe(true);
    expect(f.audit().errors).toContain(
      'unreviewed media payload or raw geometry in production output: /assets/png-as-jpeg.jpg',
    );
    expect(f.audit().errors).toContain(
      'unreviewed media payload or raw geometry in production output: /assets/jpeg-as-png.png',
    );
  });

  it('rejects an unsupported media signature while leaving unrelated source text unaffected', () => {
    const f = fixture();
    f.file('assets/normal.css', 'body { color: black }');
    const wrong = f.file('assets/a-photo.jpg', 'This is plain text, not JPEG bytes.');
    expect(unreviewedMediaPayload(wrong)).toBe(true);
    expect(f.audit().errors).toContain(
      'unreviewed media payload or raw geometry in production output: /assets/a-photo.jpg',
    );
    expect(unreviewedMediaPayload(join(dirname(wrong), 'normal.css'))).toBe(false);
  });

  it('rejects media symlinks even when their targets have valid signatures', () => {
    const f = fixture();
    const validTarget = f.file('assets/valid.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const link = join(f.root, 'dist', 'assets', 'linked.png');
    symlinkSync(validTarget, link);
    expect(unreviewedMediaPayload(link)).toBe(true);
    expect(f.audit().errors).toContain('symbolic link in production output: /assets/linked.png');
  });

  it('fails closed on a missing media asset within a private fixture directory', () => {
    const f = fixture();
    const missing = join(f.root, 'nonexistent-image.jpg');
    expect(unreviewedMediaPayload(missing)).toBe(true);
    f.file('assets/normal.css', 'body { color: black }');
    expect(f.audit().errors).toEqual([]);
  });
});
