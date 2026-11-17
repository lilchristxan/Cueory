import { describe, expect, it } from 'vitest';
import { publicAnatomySystems } from '../../src/islands/anatomypublic';

type Status = 'draft' | 'approved';

function syntheticModel(key: string, status: Status) {
  return {
    id: 'anatomy-' + key,
    title: 'synthetic ' + key,
    kind: 'model',
    status,
    model: { file: '/models/anatomy/' + key + '.glb', release: 'synthetic release' },
    labels: [{ id: 'SIM-' + key, text: 'synthetic shape ' + key, source: 'test-source' }],
  };
}

describe('the public Anatomy Lab publication gate', () => {
  it('never exposes draft systems, even with the preview opt-in set', () => {
    const old = process.env.CUEORY_ANATOMY_DRAFTS;
    process.env.CUEORY_ANATOMY_DRAFTS = '1';
    try {
      expect(publicAnatomySystems({
        'content/visuals/anatomy-alpha.json': syntheticModel('alpha', 'draft'),
        'content/visuals/anatomy-beta.json': syntheticModel('beta', 'draft'),
      })).toEqual([]);
    } finally {
      if (old === undefined) delete process.env.CUEORY_ANATOMY_DRAFTS;
      else process.env.CUEORY_ANATOMY_DRAFTS = old;
    }
  });

  it('returns only explicitly approved systems from mixed manifests', () => {
    const found = publicAnatomySystems({
      'content/visuals/anatomy-beta.json': syntheticModel('beta', 'draft'),
      'content/visuals/anatomy-alpha.json': syntheticModel('alpha', 'approved'),
    });
    expect(found).toHaveLength(1);
    expect(found[0]?.key).toBe('alpha');
    expect(found[0]?.structures).toEqual([{ id: 'SIM-alpha', text: 'synthetic shape alpha' }]);
    expect(found[0]?.model.file).toBe('/models/anatomy/alpha.glb');
  });

  it('does not interpret an unrelated file as an approval', () => {
    expect(publicAnatomySystems({
      'content/visuals/other.json': { status: 'approved' },
    })).toEqual([]);
  });

  it('fails the build on an invalid manifest instead of silently treating it as approved', () => {
    expect(() => publicAnatomySystems({
      'content/visuals/anatomy-alpha.json': { status: 'approved' },
    })).toThrow('anatomy-alpha.json');
  });
});
