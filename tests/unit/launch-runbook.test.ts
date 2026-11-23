import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runbook = readFileSync(new URL('../../docs/LAUNCH-RUNBOOK.md', import.meta.url), 'utf8');

describe('launch runbook', () => {
  it('puts the all-engine freeze check before Christian opens the Tuesday release', () => {
    const freeze = runbook.indexOf('6:00 p.m. Phoenix on Monday, November 23 (01:00 UTC on Tuesday, November 24)');
    const testedHead = runbook.indexOf('staging head tested by the successful run matches the full SHA recorded at the freeze');
    const closeDryRun = runbook.indexOf('Have Christian close the CI-only #634 dry run');
    const tuesdayRelease = runbook.indexOf('## Tuesday morning, November 24, 2026 — Christian-only release');
    const openRelease = runbook.indexOf('Open the actual release pull request from `staging` to `main`');

    expect(freeze).toBeGreaterThanOrEqual(0);
    expect(testedHead).toBeGreaterThan(freeze);
    expect(closeDryRun).toBeGreaterThan(testedHead);
    expect(tuesdayRelease).toBeGreaterThan(closeDryRun);
    expect(openRelease).toBeGreaterThan(tuesdayRelease);
  });

  it('keeps a rollback section so a failed release can be undone', () => {
    expect(runbook).toMatch(/^## Rollback$/m);
  });
});
