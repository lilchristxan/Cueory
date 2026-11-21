import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { isProductionBuild } from '../../scripts/prune-preview.mjs';
import {
  getApprovedModelPaths,
  modelPathsOfSystem,
  prodPruneGuard,
  verifyProductionDist,
} from '../../scripts/prod-prune-guard.mjs';
import { keepsDrafts } from '../../src/visuals/prunedrafts';
import { draftsAllowed } from '../../src/islands/anatomylab';

const tempRoots: string[] = [];
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

afterEach(() => {
  while (tempRoots.length) {
    const dir = tempRoots.pop();
    if (dir && existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('branch-to-production logic (pure)', () => {
  it('identifies production for "main" and refs/heads/main', () => {
    const envMain = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' };
    const envRefMain = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/main' };
    const envTrimMain = { WORKERS_CI: '1', WORKERS_CI_BRANCH: '  main  ' };

    expect(isProductionBuild(envMain)).toBe(true);
    expect(isProductionBuild(envRefMain)).toBe(true);
    expect(isProductionBuild(envTrimMain)).toBe(true);

    expect(keepsDrafts(envMain)).toBe(false);
    expect(keepsDrafts(envRefMain)).toBe(false);
    expect(draftsAllowed(envMain)).toBe(false);
    expect(draftsAllowed(envRefMain)).toBe(false);
  });

  it('identifies production when branch is empty or unset', () => {
    const envUnset = { WORKERS_CI: '1' };
    const envEmpty = { WORKERS_CI: '1', WORKERS_CI_BRANCH: '' };
    const envWhitespace = { WORKERS_CI: '1', WORKERS_CI_BRANCH: '   ' };

    expect(isProductionBuild(envUnset)).toBe(true);
    expect(isProductionBuild(envEmpty)).toBe(true);
    expect(isProductionBuild(envWhitespace)).toBe(true);

    expect(keepsDrafts(envUnset)).toBe(false);
    expect(keepsDrafts(envEmpty)).toBe(false);
    expect(draftsAllowed(envUnset)).toBe(false);
    expect(draftsAllowed(envEmpty)).toBe(false);
  });

  it('identifies non-production for "staging"', () => {
    const envStaging = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' };
    const envRefStaging = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/staging' };

    expect(isProductionBuild(envStaging)).toBe(false);
    expect(isProductionBuild(envRefStaging)).toBe(false);

    expect(keepsDrafts(envStaging)).toBe(true);
    expect(keepsDrafts(envRefStaging)).toBe(true);
    expect(draftsAllowed(envStaging)).toBe(true);
    expect(draftsAllowed(envRefStaging)).toBe(true);
  });

  it('identifies non-production for a task-* branch', () => {
    const envTask = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'task-634/prod-prune-guard' };
    const envRefTask = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/task-634/prod-prune-guard' };

    expect(isProductionBuild(envTask)).toBe(false);
    expect(isProductionBuild(envRefTask)).toBe(false);

    expect(keepsDrafts(envTask)).toBe(true);
    expect(keepsDrafts(envRefTask)).toBe(true);
    expect(draftsAllowed(envTask)).toBe(true);
    expect(draftsAllowed(envRefTask)).toBe(true);
  });

  it('evaluates Cloudflare docs production branch value ("production") under current logic', () => {
    // Cloudflare Workers Builds documentation lists "production" as an example branch name.
    // Under existing logic without behaviour change, the repo's production branch is hardcoded to "main".
    // Therefore, WORKERS_CI_BRANCH="production" evaluates as non-production (risk identified by launch audit).
    const envProdDocs = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'production' };
    const envRefProdDocs = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/production' };

    expect(isProductionBuild(envProdDocs)).toBe(false);
    expect(isProductionBuild(envRefProdDocs)).toBe(false);

    expect(keepsDrafts(envProdDocs)).toBe(true);
    expect(keepsDrafts(envRefProdDocs)).toBe(true);
    expect(draftsAllowed(envProdDocs)).toBe(true);
    expect(draftsAllowed(envRefProdDocs)).toBe(true);
  });

  it('evaluates non-Workers CI environments (local / unset WORKERS_CI) as non-production', () => {
    expect(isProductionBuild({})).toBe(false);
    expect(isProductionBuild({ WORKERS_CI_BRANCH: 'main' })).toBe(false);
    expect(isProductionBuild({ GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main' })).toBe(false);
  });
});

describe('post-build check: prod-prune-guard against fixture folders', () => {
  function setupFixtures() {
    const root = makeTempDir('cueory-guard-fixture-');
    const dist = join(root, 'dist');
    const content = join(root, 'content');
    mkdirSync(dist, { recursive: true });
    mkdirSync(content, { recursive: true });

    // Approved system
    writeFileSync(
      join(content, 'anatomy-heart.json'),
      JSON.stringify({
        status: 'approved',
        model: { file: '/models/anatomy/heart.glb' },
      }),
    );

    // Draft system
    writeFileSync(
      join(content, 'anatomy-brain.json'),
      JSON.stringify({
        status: 'draft',
        model: { file: '/models/anatomy/brain.glb' },
      }),
    );

    // System with layerFiles and files
    writeFileSync(
      join(content, 'anatomy-composite.json'),
      JSON.stringify({
        status: 'approved',
        model: {
          file: '/models/anatomy/composite.glb',
          files: ['/models/anatomy/composite-alt.glb'],
          layerFiles: { outer: ['/models/anatomy/composite-layer.glb'] },
        },
      }),
    );

    return { root, dist, content };
  }

  it('extracts declared model paths accurately', () => {
    expect(modelPathsOfSystem({ model: { file: '/a.glb' } })).toEqual(['/a.glb']);
    expect(modelPathsOfSystem({ model: { files: ['/b.glb', '/c.glb'] } })).toEqual(['/b.glb', '/c.glb']);
    expect(
      modelPathsOfSystem({ model: { file: '/a.glb', layerFiles: { l1: ['/l1.glb'], l2: ['/l2.glb'] } } }),
    ).toEqual(['/a.glb', '/l1.glb', '/l2.glb']);
  });

  it('collects approved model paths from content directory', () => {
    const { content } = setupFixtures();
    const approved = getApprovedModelPaths(content);
    expect(approved.has('/models/anatomy/heart.glb')).toBe(true);
    expect(approved.has('/models/anatomy/composite.glb')).toBe(true);
    expect(approved.has('/models/anatomy/composite-alt.glb')).toBe(true);
    expect(approved.has('/models/anatomy/composite-layer.glb')).toBe(true);
    expect(approved.has('/models/anatomy/brain.glb')).toBe(false);
  });

  it('skips checks when the build is not production', () => {
    const { dist, content } = setupFixtures();
    // Put preview and draft models into dist
    mkdirSync(join(dist, 'preview'), { recursive: true });
    writeFileSync(join(dist, 'preview', 'index.html'), 'preview page');
    mkdirSync(join(dist, 'models', 'anatomy'), { recursive: true });
    writeFileSync(join(dist, 'models', 'anatomy', 'brain.glb'), 'draft binary');

    const result = verifyProductionDist({
      dist,
      contentDir: content,
      env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' },
    });
    expect(result.isProduction).toBe(false);
    expect(result.violations).toHaveLength(0);

    const exitCode = prodPruneGuard(dist, content, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' });
    expect(exitCode).toBe(0);
  });

  it('fails production build when dist/preview exists', () => {
    const { dist, content } = setupFixtures();
    writeFileSync(join(dist, 'index.html'), '<h1>home</h1>');
    mkdirSync(join(dist, 'preview'), { recursive: true });
    writeFileSync(join(dist, 'preview', 'states.html'), 'preview state');

    const result = verifyProductionDist({
      dist,
      contentDir: content,
      env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' },
    });
    expect(result.isProduction).toBe(true);
    expect(result.violations.some((v) => v.includes('/preview/'))).toBe(true);

    const exitCode = prodPruneGuard(dist, content, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' });
    expect(exitCode).toBe(1);
  });

  it('fails production build when dist/preview.html exists', () => {
    const { dist, content } = setupFixtures();
    writeFileSync(join(dist, 'preview.html'), 'preview root');

    const result = verifyProductionDist({
      dist,
      contentDir: content,
      env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' },
    });
    expect(result.isProduction).toBe(true);
    expect(result.violations.some((v) => v.includes('preview.html'))).toBe(true);
  });

  it('fails production build when unapproved draft model is present', () => {
    const { dist, content } = setupFixtures();
    mkdirSync(join(dist, 'models', 'anatomy'), { recursive: true });
    // heart.glb is approved; brain.glb is draft
    writeFileSync(join(dist, 'models', 'anatomy', 'heart.glb'), 'binary heart');
    writeFileSync(join(dist, 'models', 'anatomy', 'brain.glb'), 'binary brain');

    const result = verifyProductionDist({
      dist,
      contentDir: content,
      env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' },
    });
    expect(result.isProduction).toBe(true);
    expect(result.violations.some((v) => v.includes('/models/anatomy/brain.glb'))).toBe(true);
    expect(result.violations.some((v) => v.includes('/models/anatomy/heart.glb'))).toBe(false);
  });

  it('fails production build when test fixture model is present', () => {
    const { dist, content } = setupFixtures();
    mkdirSync(join(dist, 'anatomy-fixture'), { recursive: true });
    writeFileSync(join(dist, 'anatomy-fixture', 'fixture.glb'), 'fixture');

    const result = verifyProductionDist({
      dist,
      contentDir: content,
      env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' },
    });
    expect(result.isProduction).toBe(true);
    expect(result.violations.some((v) => v.includes('fixture.glb'))).toBe(true);
  });

  it('passes production build when dist is clean and pruned', () => {
    const { dist, content } = setupFixtures();
    writeFileSync(join(dist, 'index.html'), '<h1>home</h1>');
    mkdirSync(join(dist, 'models', 'anatomy'), { recursive: true });
    writeFileSync(join(dist, 'models', 'anatomy', 'heart.glb'), 'binary heart');
    writeFileSync(join(dist, 'models', 'anatomy', 'composite.glb'), 'binary composite');

    const result = verifyProductionDist({
      dist,
      contentDir: content,
      env: { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' },
    });
    expect(result.isProduction).toBe(true);
    expect(result.violations).toEqual([]);

    const exitCode = prodPruneGuard(dist, content, { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' });
    expect(exitCode).toBe(0);
  });

  it('runs as a CLI script and exits with appropriate codes', () => {
    const scriptPath = fileURLToPath(new URL('../../scripts/prod-prune-guard.mjs', import.meta.url));
    const { dist, content } = setupFixtures();
    writeFileSync(join(dist, 'index.html'), '<h1>home</h1>');

    // Clean dist -> exit code 0
    expect(() => {
      execFileSync(process.execPath, [scriptPath, dist, content], {
        env: { ...process.env, WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' },
      });
    }).not.toThrow();

    // Dirty dist (add /preview/test.html) -> exit code 1
    mkdirSync(join(dist, 'preview'), { recursive: true });
    writeFileSync(join(dist, 'preview', 'test.html'), 'preview');

    expect(() => {
      execFileSync(process.execPath, [scriptPath, dist, content], {
        env: { ...process.env, WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' },
      });
    }).toThrow();
  });

  it('wires prod-prune-guard.mjs right after prune-preview.mjs in the build script', () => {
    const pkgPath = resolve(fileURLToPath(new URL('../../package.json', import.meta.url)));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const buildScript = pkg.scripts?.build;

    expect(buildScript).toBeDefined();

    const steps = buildScript.split('&&').map((s: string) => s.trim());
    const pruneIndex = steps.findIndex((s: string) => s.includes('scripts/prune-preview.mjs'));
    const guardIndex = steps.findIndex((s: string) => s.includes('scripts/prod-prune-guard.mjs'));
    const pagefindIndex = steps.findIndex((s: string) => s.includes('pagefind'));

    expect(pruneIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBe(pruneIndex + 1);
    expect(pagefindIndex).toBeGreaterThan(guardIndex);

    // Exact invocation checks
    expect(steps[guardIndex]).toBe('node scripts/prod-prune-guard.mjs');
    expect(steps[pruneIndex]).toBe('node scripts/prune-preview.mjs');
  });
});
