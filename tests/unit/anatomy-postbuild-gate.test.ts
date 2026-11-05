import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shouldAuditAnatomyBuild, checkAnatomyBuild } from '../../scripts/check-anatomy-build.mjs';
import { keepsDrafts } from '../../src/visuals/prunedrafts';

describe('postbuild anatomy release audit', () => {
  const cases = [
    { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' },
    { WORKERS_CI: '1', WORKERS_CI_BRANCH: ' refs/heads/main ', CUEORY_ANATOMY_DRAFTS: '1' },
    { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' },
    { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/task-178/anatomy-lab' },
    { WORKERS_CI: '1' },
    { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/' },
    { CUEORY_ANATOMY_DRAFTS: '1' },
    {},
  ];
  it.each(cases)('uses the same draft boundary as the built-model pruning guard: %j', (env) => {
    expect(shouldAuditAnatomyBuild(env)).toBe(!keepsDrafts(env));
  });

  it('always audits a GitHub main release regardless of a draft override', () => {
    expect(shouldAuditAnatomyBuild({
      GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', CUEORY_ANATOMY_DRAFTS: '1',
    })).toBe(true);
    expect(shouldAuditAnatomyBuild({
      GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main', CUEORY_ANATOMY_DRAFTS: '1',
    })).toBe(true);
  });

  it('rejects a production-style build without dist rather than reporting success', () => {
    const out = checkAnatomyBuild({}, '/nonexistent-anatomy-production-output', 'content/visuals');
    expect(out.skipped).toBe(false);
    expect(out.errors[0]).toMatch(/production output does not exist/);
  });

  it('never audits a known preview build using the production-only artifact rule', () => {
    const out = checkAnatomyBuild(
      { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' },
      '/nonexistent-anatomy-production-output', '/nonexistent-content',
    );
    expect(out).toEqual({ skipped: true, errors: [] });
  });

  it('keeps the audit after the complete site and Pagefind build through npm postbuild', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(pkg.scripts.build).toContain('pagefind --site dist');
    expect(pkg.scripts.postbuild).toBe('node scripts/check-anatomy-build.mjs');
  });
});
