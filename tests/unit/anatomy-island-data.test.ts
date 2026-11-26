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
});
