import { describe, expect, it } from 'vitest';
import { knownMissingStructureIds } from '../../src/islands/anatomylazy';
import type { AnatomyStructure } from '../../src/islands/anatomylab';

// Entirely synthetic IDs and GLB URLs. One file contains candidates for
// multiple layers; another layer spans two files.
const structures: Array<Pick<AnatomyStructure, 'id' | 'layer'>> = [
  { id: 'sample-a', layer: 'vessels' },
  { id: 'sample-b', layer: 'organs' },
  { id: 'sample-c', layer: 'organs' },
  { id: 'sample-absent', layer: 'organs' },
  { id: 'sample-unlayered' },
];
const layerFiles: Record<string, string[]> = {
  vessels: ['shared.glb', 'vessels.glb'],
  organs: ['shared.glb', 'other.glb'],
};
const allFiles = ['shared.glb', 'vessels.glb', 'other.glb'];
const filesFor = (layer: string): readonly string[] => layerFiles[layer] ?? [];
const missing = (found: ReadonlySet<string>, loaded: ReadonlySet<string>) =>
  knownMissingStructureIds(structures, found, filesFor, allFiles, (url) => loaded.has(url));

describe('whole-body verified missing structure summary', () => {
  it('does not count IDs from model files that have not downloaded yet', () => {
    const loaded = new Set(['shared.glb', 'vessels.glb']);
    const found = new Set(['sample-a', 'sample-b']);
    expect(missing(found, loaded)).toEqual([]);
  });

  it('does not believe a single GLB when another GLB contains the requested ID', () => {
    // All three source files arrived: a mesh found in the second GLB is not
    // missing just because it was not present in the shared GLB.
    const loaded = new Set(allFiles);
    const found = new Set(['sample-a', 'sample-b', 'sample-c']);
    expect(missing(found, loaded)).toEqual(['sample-absent', 'sample-unlayered']);
  });

  it('removes newly found IDs from the summary after a later integration', () => {
    const loaded = new Set(allFiles);
    const found = new Set(['sample-a', 'sample-b', 'sample-c']);
    expect(missing(found, loaded)).toContain('sample-absent');
    found.add('sample-absent');
    expect(missing(found, loaded)).toEqual(['sample-unlayered']);
  });

  it('waits for every system file before reporting an unlayered missing ID', () => {
    const found = new Set(['sample-a', 'sample-b', 'sample-c', 'sample-absent']);
    expect(missing(found, new Set(['shared.glb', 'other.glb']))).toEqual([]);
    expect(missing(found, new Set(allFiles))).toEqual(['sample-unlayered']);
  });
  it('waits while cached GLBs have not been reflected in the combined found set', () => {
    // In an overlapping load the loader may have cached all URLs while an
    // earlier layer's ensure() is still waiting for a sibling GLB. The scene
    // has sample-b, but the React found set has not received the batch yet.
    const loaded = new Set(allFiles);
    const staleFound = new Set(['sample-a', 'sample-c', 'sample-absent', 'sample-unlayered']);
    expect(missing(staleFound, loaded)).toEqual(['sample-b']);
    expect(knownMissingStructureIds(
      structures, staleFound, filesFor, allFiles, (url) => loaded.has(url), true,
    )).toEqual([]);
    const committed = new Set([...staleFound, 'sample-b']);
    expect(knownMissingStructureIds(
      structures, committed, filesFor, allFiles, (url) => loaded.has(url), false,
    )).toEqual([]);
  });
});
