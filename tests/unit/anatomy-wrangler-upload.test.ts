import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAnatomyWranglerUpload, shouldAuditWranglerUpload } from '../../scripts/check-anatomy-wrangler.mjs';

const temp: string[] = [];
afterEach(() => { for (const path of temp.splice(0)) rmSync(path, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cueory-wrangler-audit-'));
  temp.push(root);
  const dist = join(root, 'dist');
  const content = join(root, 'content', 'visuals');
  mkdirSync(join(dist, 'models', 'anatomy'), { recursive: true });
  mkdirSync(content, { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><html><body>synthetic only</body></html>');
  writeFileSync(join(content, 'anatomy-draft.json'), JSON.stringify({
    status: 'draft',
    model: { file: '/models/anatomy/draft.glb', release: 'BodyParts3D 4.0' },
    labels: [{ id: 'FMA999991', text: 'synthetic fixture only', source: 'bp3d-FMA999991' }],
  }));
  return { dist, content };
}

describe('Wrangler direct-upload anatomy safety gate', () => {
  it('audits production uploads despite intentionally draft-enabled build flags', () => {
    const previewEnv = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'feature', CUEORY_ANATOMY_DRAFTS: '1' };
    expect(shouldAuditWranglerUpload({ ...previewEnv, WRANGLER_COMMAND: 'deploy' })).toBe(true);
    expect(shouldAuditWranglerUpload({ ...previewEnv, WRANGLER_COMMAND: 'versions upload' })).toBe(true);
    expect(shouldAuditWranglerUpload({ WRANGLER_COMMAND: 'deploy', CUEORY_ANATOMY_DRAFTS: '1' })).toBe(true);
    expect(shouldAuditWranglerUpload({})).toBe(true);
  });

  it('does not treat Wrangler development or preview commands as production releases', () => {
    for (const command of ['dev', 'types', 'preview']) {
      expect(shouldAuditWranglerUpload({ WRANGLER_COMMAND: command })).toBe(false);
    }
    expect(shouldAuditWranglerUpload({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'task-178/preview' })).toBe(false);
    // Real Cloudflare previews may not supply WRANGLER_COMMAND at all.
    expect(shouldAuditWranglerUpload({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'task-178/preview', CUEORY_ANATOMY_DRAFTS: '1' })).toBe(false);
    expect(shouldAuditWranglerUpload({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' })).toBe(true);
  });

  it('rejects a stale draft GLB in dist before Wrangler uploads it', () => {
    const f = fixture();
    writeFileSync(join(f.dist, 'models', 'anatomy', 'draft.glb'), 'synthetic bytes');
    const out = checkAnatomyWranglerUpload({
      WRANGLER_COMMAND: 'deploy', CUEORY_ANATOMY_DRAFTS: '1',
    }, f.dist, f.content);
    expect(out.skipped).toBe(false);
    expect(out.errors).toContain('unapproved model exposed in production: /models/anatomy/draft.glb');
    expect(checkAnatomyWranglerUpload({ WRANGLER_COMMAND: 'preview' }, f.dist, f.content))
      .toEqual({ skipped: true, errors: [] });
  });

  it('allows a clean artifact and fails closed when output is absent', () => {
    const f = fixture();
    expect(checkAnatomyWranglerUpload({ WRANGLER_COMMAND: 'deploy' }, f.dist, f.content).errors)
      .toEqual([]);
    rmSync(f.dist, { recursive: true, force: true });
    expect(checkAnatomyWranglerUpload({ WRANGLER_COMMAND: 'deploy' }, f.dist, f.content).errors[0])
      .toMatch(/production output does not exist/);
  });

  it('blocks missing or invalid site entrypoints before a direct production upload', () => {
    const f = fixture();
    rmSync(join(f.dist, 'index.html'));
    expect(checkAnatomyWranglerUpload({ WRANGLER_COMMAND: 'deploy' }, f.dist, f.content).errors)
      .toContain('production site entry point is missing or unreadable: /index.html');
    writeFileSync(join(f.dist, 'index.html'), 'synthetic broken page');
    expect(checkAnatomyWranglerUpload({ WRANGLER_COMMAND: 'deploy' }, f.dist, f.content).errors)
      .toContain('production site entry point is invalid: /index.html');
  });

  it('is wired into Wrangler custom builds, not just the optional npm deploy command', () => {
    const config = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8');
    expect(config).toContain('"command": "node scripts/check-anatomy-wrangler.mjs"');
  });
});
