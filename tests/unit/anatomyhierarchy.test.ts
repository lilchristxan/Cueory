import { describe, expect, it } from 'vitest';
import { breadcrumb, children, siblings, type HierarchyLabel } from '../../src/islands/anatomyhierarchy';

// Synthetic labels shaped like content/visuals/anatomy-<system>.json. The names are placeholders for the test, not
// anatomy; the real lab shows only the source file's names.
const labels: HierarchyLabel[] = [
  { id: 'S1', text: 'organ one', group: 'root body' },
  { id: 'S2', text: 'part a of organ one', group: 'organ one' },
  { id: 'S3', text: 'part b of organ one', group: 'organ one' },
  { id: 'S4', text: 'piece of part a', group: 'part a of organ one' },
  { id: 'S5', text: 'organ two', group: 'root body' },
  { id: 'S6', text: 'loose piece' },
];

describe('breadcrumb', () => {
  it('does not present IS-A classification as a physical body location', () => {
    expect(breadcrumb(labels, 'S4', 'isa')).toEqual([]);
    expect(breadcrumb(labels, 'S4', 'partof')).toEqual(breadcrumb(labels, 'S4'));
  });
  it('walks the group chain from the root to the structure', () => {
    expect(breadcrumb(labels, 'S4')).toEqual(['root body', 'organ one', 'part a of organ one', 'piece of part a']);
    expect(breadcrumb(labels, 'S1')).toEqual(['root body', 'organ one']);
  });

  it('treats a group that is not a label as the root', () => {
    expect(breadcrumb(labels, 'S5')).toEqual(['root body', 'organ two']);
  });

  it('gives just the name for a label without a group, and nothing for an unknown id', () => {
    expect(breadcrumb(labels, 'S6')).toEqual(['loose piece']);
    expect(breadcrumb(labels, 'nope')).toEqual([]);
  });

  it('prefers the file\'s parents when present, root first, then the name', () => {
    const withParents: HierarchyLabel[] = [
      { id: 'S4', text: 'piece of part a', group: 'part a of organ one', parents: ['whole body', 'region', 'organ one', 'part a of organ one'] },
      { id: 'S7', text: 'empty parents', group: 'organ one', parents: [] },
      { id: 'S1', text: 'organ one', group: 'region' },
    ];
    expect(breadcrumb(withParents, 'S4')).toEqual(['whole body', 'region', 'organ one', 'part a of organ one', 'piece of part a']);
    // An empty parents list falls back to the group chain.
    expect(breadcrumb(withParents, 'S7')).toEqual(['region', 'organ one', 'empty parents']);
  });

  it('stops on a cycle in the group chain instead of looping', () => {
    const loop: HierarchyLabel[] = [
      { id: 'A', text: 'a', group: 'b' },
      { id: 'B', text: 'b', group: 'a' },
    ];
    expect(breadcrumb(loop, 'A')).toEqual(['b', 'a']);
  });
});

describe('children', () => {
  it('lists the labels grouped under a structure, by id or by name, in file order', () => {
    expect(children(labels, 'S1').map((l) => l.id)).toEqual(['S2', 'S3']);
    expect(children(labels, 'organ one').map((l) => l.id)).toEqual(['S2', 'S3']);
    expect(children(labels, 'root body').map((l) => l.id)).toEqual(['S1', 'S5']);
  });

  it('gives nothing for a leaf or an unknown name', () => {
    expect(children(labels, 'S4')).toEqual([]);
    expect(children(labels, 'nothing here')).toEqual([]);
  });
});

describe('siblings', () => {
  it('lists the other labels under the same group, in file order', () => {
    expect(siblings(labels, 'S2').map((l) => l.id)).toEqual(['S3']);
    expect(siblings(labels, 'S1').map((l) => l.id)).toEqual(['S5']);
  });

  it('gives nothing for a label without a group or an unknown id', () => {
    expect(siblings(labels, 'S6')).toEqual([]);
    expect(siblings(labels, 'nope')).toEqual([]);
  });
});

describe('the lab shows a location trail only for the PART-OF tree', () => {
  const readText = async (path: string) => (await import('node:fs')).readFileSync(path, 'utf8');
  const ISA = ['skeleton-axial', 'skeleton-limbs', 'muscle', 'vessels', 'nerves', 'skin'];
  const PARTOF = ['heart', 'lungs', 'kidneys', 'digestive', 'nervous'];

  it('tags all six IS-A systems "isa" and the others "partof" in the committed files', async () => {
    for (const key of ISA) expect(JSON.parse(await readText(`content/visuals/anatomy-${key}.json`)).hierarchyTree, key).toBe('isa');
    for (const key of PARTOF) expect(JSON.parse(await readText(`content/visuals/anatomy-${key}.json`)).hierarchyTree, key).toBe('partof');
  });

  it('gives a trail in a PART-OF system and none in an IS-A system, for the same labels', () => {
    const labels = [{ id: 'S1', text: 'sample part', group: 'sample whole', parents: ['sample body', 'sample whole'] }];
    expect(breadcrumb(labels, 'S1', 'partof')).toEqual(['sample body', 'sample whole', 'sample part']);
    expect(breadcrumb(labels, 'S1', 'isa')).toEqual([]);
  });

  it('is wired: the name card passes the open system\'s tree to breadcrumb', async () => {
    const source = await readText('src/islands/AnatomyLab.tsx');
    expect(source).toMatch(/breadcrumb\(system\.structures, selected, selectedTree\)/);
    expect(source).toMatch(/const selectedTree = structureTree\(system, selectedStructure\);/);
    expect([...source.matchAll(/\bbreadcrumb\(/g)]).toHaveLength(1);
  });
});
