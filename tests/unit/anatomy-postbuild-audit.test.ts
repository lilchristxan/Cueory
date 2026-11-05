import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { auditAnatomyPostbuild, shouldAuditAnatomyPostbuild } from '../../scripts/anatomy-postbuild-audit.mjs';

const script = fileURLToPath(new URL('../../scripts/anatomy-postbuild-audit.mjs', import.meta.url));

describe('production anatomy postbuild gate', () => {
  it('is automatically invoked after Astro and Pagefind by npm run build', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(packageJson.scripts.build).toBe('astro build && pagefind --site dist');
    expect(packageJson.scripts.postbuild).toBe('node scripts/anatomy-postbuild-audit.mjs');
  });

  it.each([
    [{ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, true],
    [{ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/main' }, true],
    [{ WORKERS_CI: '1', WORKERS_CI_BRANCH: ' refs/heads/main ' }, true],
    [{ WORKERS_CI: '1' }, true],
    [{ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/' }, true],
    [{ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main', CUEORY_ANATOMY_DRAFTS: '1' }, true],
    [{ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' }, false],
    [{ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/staging' }, false],
    [{ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'task-178/example' }, false],
    [{ CI: 'true' }, false],
    [{ CUEORY_ANATOMY_DRAFTS: '1' }, false],
    [{ CUEORY_ANATOMY_PRODUCTION_AUDIT: '1' }, true],
  ] as const)('chooses the correct production audit for %j', (env, expected) => {
    expect(shouldAuditAnatomyPostbuild(env)).toBe(expected);
  });

  it('rejects a real leaked draft GLB at the production build boundary and skips previews', () => {
    const root = mkdtempSync(join(tmpdir(), 'cueory-anatomy-postbuild-'));
    const dist = join(root, 'dist');
    const content = join(root, 'content', 'visuals');
    try {
      mkdirSync(join(dist, 'models', 'anatomy'), { recursive: true });
      mkdirSync(content, { recursive: true });
      writeFileSync(join(dist, 'models', 'anatomy', 'draft.glb'), 'synthetic test payload');
      writeFileSync(join(content, 'anatomy-draft.json'), JSON.stringify({
        status: 'draft',
        model: { file: '/models/anatomy/draft.glb' },
        labels: [{ id: 'FMA999991', text: 'synthetic fixture only' }],
      }));
      expect(auditAnatomyPostbuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' }, dist, content)).toBeNull();
      expect(auditAnatomyPostbuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, dist, content)?.errors)
        .toContain('unapproved model exposed in production: /models/anatomy/draft.glb');

      const env = {
        ...process.env,
        WORKERS_CI: '1',
        WORKERS_CI_BRANCH: 'main',
        CUEORY_ANATOMY_PRODUCTION_AUDIT: '',
      };
      const fail = spawnSync(process.execPath, [script], { cwd: root, env, encoding: 'utf8' });
      expect(fail.status).toBe(1);
      expect(fail.stderr).toContain('unapproved model exposed in production');
      const preview = spawnSync(process.execPath, [script], {
        cwd: root, env: { ...env, WORKERS_CI_BRANCH: 'staging' }, encoding: 'utf8',
      });
      expect(preview.status).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
