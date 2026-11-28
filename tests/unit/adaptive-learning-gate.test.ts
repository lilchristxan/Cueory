import { describe, expect, it } from 'vitest';
import { adaptiveLearnEnabled } from '../../src/lessons/adaptive-gate';

const sample = 'study-skills-01';
const staging = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' };
const enabled = { ...staging, CUEORY_ADAPTIVE_LEARN: '1' };

describe('adaptive Learn pilot', () => {
  it('is off by default and opens only for the labeled sample deck when enabled', () => {
    expect(adaptiveLearnEnabled(sample, 'placeholder', staging)).toBe(false);
    expect(adaptiveLearnEnabled(sample, 'placeholder', enabled)).toBe(true);
    expect(adaptiveLearnEnabled(sample, 'reviewed', enabled)).toBe(false);
    expect(adaptiveLearnEnabled('other', 'sample', enabled)).toBe(false);
  });

  it('rejects a live or unknown Workers branch even with the opt-in set', () => {
    for (const branch of ['main', 'refs/heads/main', undefined]) {
      expect(adaptiveLearnEnabled(sample, 'sample', {
        ...enabled,
        WORKERS_CI_BRANCH: branch,
        CUEORY_ANATOMY_DRAFTS: '1',
      })).toBe(false);
    }
  });
});
