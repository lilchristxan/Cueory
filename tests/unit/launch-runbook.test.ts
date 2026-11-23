import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runbook = readFileSync(new URL('../../docs/LAUNCH-RUNBOOK.md', import.meta.url), 'utf8');

describe('launch runbook', () => {
  it('keeps a rollback section so a failed release can be undone', () => {
    expect(runbook).toMatch(/^## Rollback$/m);
  });
});
