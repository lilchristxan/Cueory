import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { creditFor, manifestProblems, type ImageManifest } from '../../src/images/sources';

const root = join(__dirname, '..', '..');
const manifests = readdirSync(join(root, 'content', 'images'))
  .filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(readFileSync(join(root, 'content', 'images', name), 'utf8')) as ImageManifest);

function hosted(folder: string) {
  const dir = join(root, 'public', folder);
  const files = new Map<string, { bytes: number; sha256: string }>();
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const data = readFileSync(join(dir, name));
    files.set(name, { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
  }
  return files;
}

describe('outside illustrations (Servier Medical Art)', () => {
  it('has at least one manifest', () => {
    expect(manifests.length).toBeGreaterThan(0);
  });

  it.each(manifests.map((m) => [m.id, m] as const))('%s: every hosted file has a full record and every record has its file', (_id, manifest) => {
    expect(manifestProblems(manifest, hosted(manifest.folder))).toEqual([]);
  });

  it('every folder of Servier files belongs to a manifest', () => {
    const base = join(root, 'public', 'images', 'servier');
    const folders = readdirSync(base).map((name) => `/images/servier/${name}/`);
    expect(folders.filter((folder) => !manifests.some((m) => m.folder === folder))).toEqual([]);
  });

  it('uses the "adapted" credit as soon as a file was changed', () => {
    const manifest = manifests[0]!;
    const record = manifest.files[0]!;
    expect(creditFor(manifest, record)).toBe(manifest.credit);
    expect(creditFor(manifest, { ...record, changes: 'cropped to the left lung' })).toBe(manifest.creditAdapted);
  });

  it('reports a file with no record, a missing file, and a silent change', () => {
    const manifest = manifests[0]!;
    const files = hosted(manifest.folder);
    const first = manifest.files[0]!;
    expect(manifestProblems(manifest, new Map([...files, ['extra.png', { bytes: 1, sha256: 'x' }]]))).toContain(`${manifest.id}/extra.png: hosted without a record`);
    const without = new Map(files);
    without.delete(first.file);
    expect(manifestProblems(manifest, without)).toContain(`${manifest.id}/${first.file}: the file is not hosted`);
    expect(manifestProblems(manifest, new Map([...files, [first.file, { bytes: 1, sha256: 'x' }]])))
      .toContain(`${manifest.id}/${first.file}: the hosted file differs from the download, but "changes" says none`);
  });
});
