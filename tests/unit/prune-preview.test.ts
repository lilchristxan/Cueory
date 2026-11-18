import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isProductionBuild, prunePreview } from '../../scripts/prune-preview.mjs';

const made: string[] = [];
function fakeDist() {
  const dist = mkdtempSync(join(tmpdir(), 'cueory-dist-'));
  made.push(dist);
  mkdirSync(join(dist, 'preview', 'share'), { recursive: true });
  writeFileSync(join(dist, 'preview', 'share', 'index.html'), 'x');
  writeFileSync(join(dist, 'index.html'), 'home');
  return dist;
}
afterEach(() => { while (made.length) rmSync(made.pop()!, { recursive: true, force: true }); });

describe('live build prunes /preview/*', () => {
  it('prunes only the production build', () => {
    expect(isProductionBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' })).toBe(true);
    expect(isProductionBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/main' })).toBe(true);
    expect(isProductionBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: ' main ' })).toBe(true);
    // Same as draftsAllowed: a Workers build without a branch name is treated as production.
    expect(isProductionBuild({ WORKERS_CI: '1' })).toBe(true);
    expect(isProductionBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: '  ' })).toBe(true);
  });
  it('keeps them for staging, named branches, local builds and the drafts flag', () => {
    expect(isProductionBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' })).toBe(false);
    expect(isProductionBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'task-1/x' })).toBe(false);
    expect(isProductionBuild({})).toBe(false);
    expect(isProductionBuild({ CUEORY_ANATOMY_DRAFTS: '1' })).toBe(false);
    expect(isProductionBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main', CUEORY_ANATOMY_DRAFTS: '1' })).toBe(true);
  });
  it('removes dist/preview and leaves the rest in production', () => {
    const dist = fakeDist();
    expect(prunePreview({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, dist)).toBe(true);
    expect(existsSync(join(dist, 'preview'))).toBe(false);
    expect(existsSync(join(dist, 'index.html'))).toBe(true);
  });
  it('removes it too when the Workers branch name is missing', () => {
    const dist = fakeDist();
    expect(prunePreview({ WORKERS_CI: '1' }, dist)).toBe(true);
    expect(existsSync(join(dist, 'preview'))).toBe(false);
  });
  it('leaves dist/preview alone everywhere else', () => {
    const dist = fakeDist();
    expect(prunePreview({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' }, dist)).toBe(false);
    expect(prunePreview({}, dist)).toBe(false);
    expect(existsSync(join(dist, 'preview', 'share', 'index.html'))).toBe(true);
  });
});
