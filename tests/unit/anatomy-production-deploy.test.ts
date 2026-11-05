import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deployProduction } from '../../scripts/anatomy-production-deploy.mjs';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cueory-anatomy-preupload-'));
  roots.push(root);
  const distDir = join(root, 'dist');
  const contentDir = join(root, 'content', 'visuals');
  mkdirSync(distDir, { recursive: true });
  mkdirSync(contentDir, { recursive: true });
  writeFileSync(join(distDir, 'index.html'), '<!doctype html><html><body>synthetic only</body></html>');
  writeFileSync(join(contentDir, 'anatomy-test.json'), JSON.stringify({
    status: 'draft',
    model: { file: '/models/anatomy/draft.glb', release: 'BodyParts3D 4.0' },
    labels: [{ id: 'FMA999991', text: 'synthetic only', source: 'bp3d-FMA999991' }],
  }));
  return { distDir, contentDir };
}

describe('production pre-upload anatomy gate', () => {
  it('refuses a prebuilt draft GLB without invoking Wrangler', () => {
    const f = fixture();
    mkdirSync(join(f.distDir, 'models', 'anatomy'), { recursive: true });
    writeFileSync(join(f.distDir, 'models', 'anatomy', 'draft.glb'), 'synthetic fixture');
    const runDeploy = vi.fn(() => ({ status: 0 }));
    const result = deployProduction({ ...f, runDeploy });
    expect(result.attempted).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('unapproved model exposed in production: /models/anatomy/draft.glb');
    expect(runDeploy).not.toHaveBeenCalled();
  });

  it('invokes Wrangler only when the exact build output contains no drafts', () => {
    const f = fixture();
    const runDeploy = vi.fn(() => ({ status: 0 }));
    const result = deployProduction({ ...f, runDeploy });
    expect(result).toEqual({ attempted: true, exitCode: 0, errors: [] });
    expect(runDeploy).toHaveBeenCalledOnce();
  });

  it('fails closed if the output directory is absent', () => {
    const f = fixture();
    rmSync(f.distDir, { recursive: true, force: true });
    const runDeploy = vi.fn(() => ({ status: 0 }));
    const result = deployProduction({ ...f, runDeploy });
    expect(result.attempted).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(runDeploy).not.toHaveBeenCalled();
  });

  it('blocks missing or invalid website entrypoints even when anatomy files are clean', () => {
    const f = fixture();
    const runDeploy = vi.fn(() => ({ status: 0 }));
    rmSync(join(f.distDir, 'index.html'));
    expect(deployProduction({ ...f, runDeploy }).errors)
      .toContain('production site entry point is missing or unreadable: /index.html');
    writeFileSync(join(f.distDir, 'index.html'), 'synthetic broken page');
    expect(deployProduction({ ...f, runDeploy }).errors)
      .toContain('production site entry point is invalid: /index.html');
    expect(runDeploy).not.toHaveBeenCalled();
  });

  it('propagates a failed Wrangler exit status or launch failure', () => {
    const f = fixture();
    expect(deployProduction({ ...f, runDeploy: () => ({ status: 23 }) })).toMatchObject({ attempted: true, exitCode: 23 });
    // An underlying spawn failure cannot become a successful shell exit even
    // if an injected runner supplies a contradictory zero status.
    expect(deployProduction({ ...f, runDeploy: () => ({ status: 0, error: new Error('synthetic spawn error') }) }))
      .toMatchObject({ attempted: true, exitCode: 1, errors: ['Wrangler deployment command could not start'] });
    expect(deployProduction({ ...f, runDeploy: () => { throw new Error('synthetic failure'); } })).toMatchObject({ attempted: true, exitCode: 1 });
  });

  it('exposes a dedicated production deploy command without changing preview mode', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(pkg.scripts['deploy:production']).toBe('node scripts/anatomy-production-deploy.mjs');
    expect(pkg.scripts.postbuild).toBe('node scripts/check-anatomy-build.mjs');
  });
});
