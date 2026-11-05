import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fingerprint = 'cefdb48a6e27bd0d3f73531f991f2dca6ed8ae83:scripts/automerge/decide.ts:generic-api-key:74';

describe('Gitleaks false-positive baseline (Issue #610)', () => {
  it('contains only the single reviewed historical fingerprint, not a broad exception', () => {
    const entries = readFileSync(new URL('../../.gitleaksignore', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));
    expect(entries).toEqual([fingerprint]);
  });

  it('keeps full-history scanning fail-closed with redacted output', () => {
    const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    const scan = workflow.split(/\n/).find((line) => line.includes('./gitleaks git'));
    expect(scan).toBeDefined();
    expect(scan).toContain('--redact');
    expect(scan).toContain('--exit-code 1');
    expect(scan).not.toContain('--no-git');
  });
});
