import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditAnatomyProduction, decodeAsciiEscapesForAudit, modelUrls, parseApprovedGlb, readRegularFileNoFollow } from '../../scripts/anatomy-production-audit.mjs';
import { keepsDrafts } from '../../src/visuals/prunedrafts';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })));

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'cueory-anatomy-publish-'));
  roots.push(root);
  const dist = join(root, 'dist');
  const content = join(root, 'content', 'visuals');
  mkdirSync(dist, { recursive: true });
  mkdirSync(content, { recursive: true });
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
      nodes: ids.map((id, mesh) => ({ name: id, mesh })),
      meshes: ids.map(() => ({ primitives: [{ indices: 0, attributes: { POSITION: 1 } }] })),
      accessors: [{ count: 3, componentType: 5123, type: 'SCALAR', bufferView: 0 },
        { count: 3, componentType: 5126, type: 'VEC3', bufferView: 0 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
      buffers: [{ byteLength: 4 }],
    };
    const bytes = Buffer.from(JSON.stringify(modelJson), 'utf8');
    const padded = Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4, 0x20)]);
    const glb = Buffer.alloc(20 + padded.length + 12);
    glb.write('glTF', 0, 'ascii');
    glb.writeUInt32LE(2, 4);
    glb.writeUInt32LE(glb.length, 8);
    glb.writeUInt32LE(padded.length, 12);
    glb.writeUInt32LE(0x4e4f534a, 16);
    padded.copy(glb, 20);
    glb.writeUInt32LE(4, 20 + padded.length);
    glb.writeUInt32LE(0x004e4942, 24 + padded.length);
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
      file(urls[0].slice(1), makeApprovedGlb(ids));
    }
  };
  system('draft', 'draft', ['/models/anatomy/draft.glb'], ['FMA999991']);
  system('approved', 'approved', ['/models/anatomy/approved.glb'], ['FMA999992']);
  file('preview/anatomy-lab.html', '<html><meta name="robots" content="noindex"></html>');
  return { dist, content, file, system, check: () => auditAnatomyProduction(dist, content) };
}

describe('anatomy production artifact audit', () => {
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

  it('rejects missing and out-of-range embedded geometry data references', () => {
    const f = setup();
    const path = join(f.dist, 'models', 'anatomy', 'approved.glb');
    const original = readFileSync(path);
    const mutate = (change: (json: any) => void) => {
      const jsonLength = original.readUInt32LE(12);
      const json = JSON.parse(original.toString('utf8', 20, 20 + jsonLength));
      change(json);
      const encoded = Buffer.from(JSON.stringify(json), 'utf8');
      const padded = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 0x20)]);
      const output = Buffer.alloc(20 + padded.length + 12);
      output.write('glTF', 0, 'ascii');
      output.writeUInt32LE(2, 4);
      output.writeUInt32LE(output.length, 8);
      output.writeUInt32LE(padded.length, 12);
      output.writeUInt32LE(0x4e4f534a, 16);
      padded.copy(output, 20);
      output.writeUInt32LE(4, 20 + padded.length);
      output.writeUInt32LE(0x004e4942, 24 + padded.length);
      writeFileSync(path, output);
      expect(f.check().errors).toContain(
        'approved model failed built GLB geometry, identity or credit verification: /models/anatomy/approved.glb',
      );
    };
    mutate((json) => { delete json.bufferViews; });
    mutate((json) => { json.accessors[0].bufferView = 9; });
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
      expect(json.bufferViews.every((view) =>
        view.buffer === 1 && view.extensions?.EXT_meshopt_compression?.buffer === 0
      ), system).toBe(true);
      expect(json.nodes.map((node) => node.name).sort(), system)
        .toEqual(manifest.labels.map((label) => label.id).sort());
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
