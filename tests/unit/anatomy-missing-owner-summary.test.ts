import { describe, expect, it } from 'vitest';
import { knownMissingStructureIds } from '../../src/islands/anatomylazy';
import type { AnatomyStructure } from '../../src/islands/anatomylab';

// Made-up structure IDs and URLs only. No released anatomy content.
const structures: Array<Pick<AnatomyStructure, 'id' | 'layer'>> = [
  { id: 'part-a', layer: 'organs' },
  { id: 'part-b', layer: 'organs' },
  { id: 'shared-part', layer: 'organs' },
  { id: 'unlayered-part' },
  { id: 'unmapped-part', layer: 'organs' },
];
const layerFiles: Record<string, string[]> = {
  organs: ['a.glb', 'b.glb'],
};
const fileIds = {
  'a.glb': ['part-a', 'shared-part', 'unlayered-part'],
  'b.glb': ['part-b', 'shared-part'],
};
const allFiles = ['a.glb', 'b.glb'];
const filesForLayer = (id: string) => layerFiles[id] ?? [];
const countMissing = (
  found: ReadonlySet<string>,
  loaded: ReadonlySet<string>,
  owners: Readonly<Record<string, readonly string[]>> | undefined = fileIds,
) => knownMissingStructureIds(
  structures, found, filesForLayer, allFiles, (url) => loaded.has(url), owners,
);

describe('whole-body missing structure counts by owning GLB', () => {
  it('does not treat an unrelated pending layer sibling as the owner of a missing mesh', () => {
    const loaded = new Set(['a.glb']);
    const found = new Set(['part-a', 'unlayered-part']);
    // b.glb is pending, so neither its part nor a shared part is called missing.
    expect(countMissing(found, loaded)).toEqual(['unmapped-part']);
    // Once a.glb is loaded, a missing part belonging only to a.glb is verifiable.
    expect(countMissing(new Set(['unlayered-part']), loaded)).toEqual(['part-a', 'unmapped-part']);
  });

  it('requires every owner of a shared structure to finish before declaring it missing', () => {
    const found = new Set(['part-a', 'part-b', 'unlayered-part']);
    expect(countMissing(found, new Set(['a.glb']))).not.toContain('shared-part');
    expect(countMissing(found, new Set(allFiles))).toEqual(['shared-part', 'unmapped-part']);
    found.add('shared-part');
    expect(countMissing(found, new Set(allFiles))).toEqual(['unmapped-part']);
  });

  it('uses the same exact owner for an unlayered structure', () => {
    const found = new Set(['part-a', 'part-b', 'shared-part']);
    expect(countMissing(found, new Set())).toEqual(['unmapped-part']);
    expect(countMissing(found, new Set(['a.glb']))).toEqual(['unlayered-part', 'unmapped-part']);
  });

  it('preserves the layer-wide fallback when the manifest has no fileIds', () => {
    const found = new Set(['part-a', 'unlayered-part']);
    // No per-file map: all organ IDs await the sibling as in the legacy lab.
    expect(knownMissingStructureIds(
      structures, found, filesForLayer, allFiles,
      (url) => url === 'a.glb',
    )).toEqual([]);
    expect(knownMissingStructureIds(
      structures, found, filesForLayer, allFiles,
      () => true,
    )).toEqual(['part-b', 'shared-part', 'unmapped-part']);
  });

  it('does not declare owned files missing before their results are committed', () => {
    const found = new Set(['part-a']);
    const loaded = new Set(allFiles);
    expect(knownMissingStructureIds(
      structures, found, filesForLayer, allFiles,
      (url) => loaded.has(url) && false,
      fileIds,
    )).toEqual(['unmapped-part']);
    expect(countMissing(found, loaded)).toEqual([
      'part-b', 'shared-part', 'unlayered-part', 'unmapped-part',
    ]);
  });
});
