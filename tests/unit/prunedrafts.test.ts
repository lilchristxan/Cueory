import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { draftsAllowed } from '../../src/islands/anatomylab';
import { keepsDrafts, pruneDraftModels } from '../../src/visuals/prunedrafts';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true })));

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'prune-'));
  roots.push(root);
  const content = join(root, 'content');
  const models = join(root, 'dist', 'models', 'anatomy');
  mkdirSync(content);
  mkdirSync(models, { recursive: true });
  const sys = (name: string, status: string, model: object) =>
    writeFileSync(join(content, `anatomy-${name}.json`), JSON.stringify({ status, model }));
  sys('a', 'approved', { file: '/models/anatomy/a.glb' });
  sys('b', 'draft', { file: '/models/anatomy/b.glb' });
  sys('c', 'draft', { files: ['/models/anatomy/c1.glb'], layerFiles: { x: ['/models/anatomy/c2.glb'] } });
  for (const f of ['a', 'b', 'c1', 'c2', 'stray']) writeFileSync(join(models, `${f}.glb`), 'x');
  return { dist: join(root, 'dist'), content, models };
}

describe('pruning draft anatomy models from a build', () => {
  it('on main, or when the environment is unknown, removes every model no approved system names', () => {
    for (const env of [{ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }, { WORKERS_CI: '1' }, {}]) {
      const { dist, content, models } = setup();
      const removed = pruneDraftModels(dist, content, env);
      expect(removed.sort()).toEqual(['/models/anatomy/b.glb', '/models/anatomy/c1.glb', '/models/anatomy/c2.glb', '/models/anatomy/stray.glb']);
      expect(readdirSync(models)).toEqual(['a.glb']);
    }
  });

  it('prunes draft model binaries on a full Git production ref despite a draft override', () => {
    for (const branch of ['refs/heads/main', ' refs/heads/main ']) {
      const env = { WORKERS_CI: '1', WORKERS_CI_BRANCH: branch, CUEORY_ANATOMY_DRAFTS: '1' };
      expect(keepsDrafts(env)).toBe(false);
      const { dist, content, models } = setup();
      expect(pruneDraftModels(dist, content, env).sort()).toEqual([
        '/models/anatomy/b.glb',
        '/models/anatomy/c1.glb',
        '/models/anatomy/c2.glb',
        '/models/anatomy/stray.glb',
      ]);
      expect(readdirSync(models)).toEqual(['a.glb']);
    }
  });

  it('keeps the page-data and downloadable-model publication gates aligned', () => {
    const refs = ['main', 'refs/heads/main', ' refs/heads/main ', 'staging', 'refs/heads/staging',
      'task-178/anatomy-lab', 'refs/heads/task-178/anatomy-lab', 'refs/heads/', '  ', undefined];
    for (const ref of refs) {
      for (const localDraft of ['0', '1']) {
        const env = { WORKERS_CI: '1', WORKERS_CI_BRANCH: ref, CUEORY_ANATOMY_DRAFTS: localDraft };
        expect(keepsDrafts(env), `model gate differs from page gate on ${String(ref)}`).toBe(draftsAllowed(env));
      }
    }

    const fullPreview = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/staging' };
    const { dist, content, models } = setup();
    expect(keepsDrafts(fullPreview)).toBe(true);
    expect(pruneDraftModels(dist, content, fullPreview)).toEqual([]);
    expect(readdirSync(models)).toHaveLength(5);
  });

  it('keeps drafts in a preview build and with the explicit local flag', () => {
    expect(keepsDrafts({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' })).toBe(true);
    expect(keepsDrafts({ CUEORY_ANATOMY_DRAFTS: '1' })).toBe(true);
    const { dist, content, models } = setup();
    expect(pruneDraftModels(dist, content, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' })).toEqual([]);
    expect(readdirSync(models)).toHaveLength(5);
  });
});
