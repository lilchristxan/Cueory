import { describe, expect, it } from 'vitest';
import { decodeAnatomySystem, encodeAnatomySystem } from '../../src/islands/anatomy-island-data';
import type { AnatomySystem } from '../../src/islands/anatomylab';

describe('anatomy island data', () => {
  it('serializes a system identifier under its own name and restores the internal model after hydration', () => {
    const fixture: AnatomySystem = {
      key: 'sample',
      title: 'sample shapes',
      status: 'draft',
      model: { file: '/sample.glb', release: 'sample' },
      structures: [{ id: 'shape', text: 'sample shape' }],
      fixture: true,
    };

    const encoded = encodeAnatomySystem(fixture);
    expect(encoded).not.toHaveProperty('key');
    expect(encoded.systemId).toBe(fixture.key);
    expect(decodeAnatomySystem(JSON.parse(JSON.stringify(encoded)))).toEqual(fixture);
  });

  it('preserves model metadata and the absent fixture flag on a regular system', () => {
    const system: AnatomySystem = {
      key: 'example',
      title: 'example shapes',
      status: 'approved',
      hierarchyTree: 'partof',
      model: { file: '/example.glb', release: 'sample', layerFiles: { skin: ['/layer.glb'] } },
      structures: [{ id: 'example', text: 'example shape', parents: ['group'] }],
    };

    const restored = decodeAnatomySystem(encodeAnatomySystem(system));
    expect(restored).toEqual(system);
    expect(restored).not.toHaveProperty('fixture');
  });
});
