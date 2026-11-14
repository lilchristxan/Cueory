import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { shouldAuditAnatomyBuild, checkAnatomyBuild } from '../../scripts/check-anatomy-build.mjs';
import { keepsDrafts } from '../../src/visuals/prunedrafts';
import { draftsAllowed } from '../../src/islands/anatomylab';

describe('postbuild anatomy release audit', () => {
  const cases = [
    { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' },
    { WORKERS_CI: 'true', WORKERS_CI_BRANCH: 'main', CUEORY_ANATOMY_DRAFTS: '1' },
    { WORKERS_CI: 'true', WORKERS_CI_BRANCH: 'legacy/main', CUEORY_ANATOMY_DRAFTS: '1' },
    { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'refs/heads/legacy/main', CUEORY_ANATOMY_DRAFTS: '1' },
    { WORKERS_CI: 'true', WORKERS_CI_BRANCH: 'staging' },
    { WORKERS_CI: 'true', WORKERS_CI_BRANCH: 'refs/heads/task-178/anatomy-lab' },
    { WORKERS_CI: 'true', CUEORY_ANATOMY_DRAFTS: '1' },
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
    expect(keepsDrafts(env)).toBe(draftsAllowed(env));
  });

  it('does not treat WORKERS_CI=true on main as an opt-in local draft build', () => {
    const production = { WORKERS_CI: 'true', WORKERS_CI_BRANCH: 'main', CUEORY_ANATOMY_DRAFTS: '1' };
    expect(draftsAllowed(production)).toBe(false);
    expect(keepsDrafts(production)).toBe(false);
    expect(shouldAuditAnatomyBuild(production)).toBe(true);
    const preview = { WORKERS_CI: 'true', WORKERS_CI_BRANCH: 'staging' };
    expect(draftsAllowed(preview)).toBe(true);
    expect(keepsDrafts(preview)).toBe(true);
    expect(shouldAuditAnatomyBuild(preview)).toBe(false);
    const missingBranch = { WORKERS_CI: 'true', CUEORY_ANATOMY_DRAFTS: '1' };
    expect(draftsAllowed(missingBranch)).toBe(false);
    expect(keepsDrafts(missingBranch)).toBe(false);
    expect(shouldAuditAnatomyBuild(missingBranch)).toBe(true);
  });

  it('treats the connected legacy/main as a production branch, not a preview', () => {
    for (const name of ['legacy/main', 'refs/heads/legacy/main', ' refs/heads/legacy/main ']) {
      const env = { WORKERS_CI: 'true', WORKERS_CI_BRANCH: name, CUEORY_ANATOMY_DRAFTS: '1' };
      expect(shouldAuditAnatomyBuild(env)).toBe(true);
      expect(keepsDrafts(env)).toBe(false);
      expect(draftsAllowed(env)).toBe(false);
    }
  });

  it('always audits a GitHub main release regardless of a draft override', () => {
    expect(shouldAuditAnatomyBuild({
      GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', CUEORY_ANATOMY_DRAFTS: '1',
    })).toBe(true);
    // A manual main release has the same publication risk as a push.
    expect(shouldAuditAnatomyBuild({
      GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', CUEORY_ANATOMY_DRAFTS: '1',
    })).toBe(true);
    expect(shouldAuditAnatomyBuild({
      GITHUB_EVENT_NAME: 'schedule', GITHUB_REF: 'refs/heads/main', CUEORY_ANATOMY_DRAFTS: '1',
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

  it('rejects empty, missing-entrypoint and malformed production output', () => {
    const root = mkdtempSync(join(tmpdir(), 'cueory-anatomy-entry-'));
    const dist = join(root, 'dist');
    const content = join(root, 'content', 'visuals');
    const env = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' };
    try {
      mkdirSync(dist, { recursive: true });
      mkdirSync(content, { recursive: true });
      // Valid, synthetic draft-only source. With no index.html the old
      // postbuild gate would have returned errors: [] for an empty dist.
      writeFileSync(join(content, 'anatomy-draft.json'), JSON.stringify({
        status: 'draft', model: { file: '/models/anatomy/draft.glb' },
        labels: [{ id: 'FMA999991', text: 'synthetic test label' }],
      }));
      expect(checkAnatomyBuild(env, dist, content).errors).toContain(
        'production site entry point is missing or unreadable: /index.html',
      );
      writeFileSync(join(dist, 'index.html'), 'not an HTML document');
      expect(checkAnatomyBuild(env, dist, content).errors).toContain(
        'production site entry point is invalid: /index.html',
      );
      for (const malformed of [
        '<!-- <html><body> -->',
        '<!doctype html><html><body>',
        '<html><body><p>not completed</p>',
        '<!doctype html><html><head></head><body></body></html>',
        '<!doctype html><html><head></head><!-- <body><main>not rendered</main></body></html>',
        '<!doctype html><html><head></head><!-<!--x-->- <body><main>not rendered</main></body></html>',
        '<!doctype html><html><head><script>const fake = "<body><main>not rendered</main></body></html>"</script></head>',
        '<!doctype html><html><head><style>/* <body><main>not rendered</main></body></html> */</style></head>',
      ]) {
        writeFileSync(join(dist, 'index.html'), malformed);
        expect(checkAnatomyBuild(env, dist, content).errors).toContain(
          'production site entry point is invalid: /index.html',
        );
      }
      // A real body still counts when head scripts and styles mention fake tags.
      writeFileSync(join(dist, 'index.html'),
        '<!doctype html><html><head><script>const fake = "<body><main>no</main></body>"</script>' +
        '<style>/* <body><main>no</main></body> */</style></head>' +
        '<body><main data-note="1 > 0">real body</main></body></html>');
      expect(checkAnatomyBuild(env, dist, content).errors).toEqual([]);
      // Complete ordinary comments must not invalidate otherwise sound Astro HTML.
      writeFileSync(join(dist, 'index.html'), '<!doctype html><html><head><title>Site</title></head><!-- ordinary comment --><body><main>test</main></body></html>');
      expect(checkAnatomyBuild(env, dist, content).errors).toEqual([]);
      writeFileSync(join(dist, 'index.html'), '<!doctype html><html><head><title>Site</title></head><body><main>test</main></body></html>');
      expect(checkAnatomyBuild(env, dist, content).errors).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('never audits a known preview build using the production-only artifact rule', () => {
    const out = checkAnatomyBuild(
      { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' },
      '/nonexistent-anatomy-production-output', '/nonexistent-content',
    );
    expect(out).toEqual({ skipped: true, errors: [] });
  });

  it('fails the actual postbuild CLI for leaked draft geometry but keeps previews usable', () => {
    const root = mkdtempSync(join(tmpdir(), 'cueory-anatomy-postbuild-'));
    const script = fileURLToPath(new URL('../../scripts/check-anatomy-build.mjs', import.meta.url));
    const dist = join(root, 'dist', 'models', 'anatomy');
    const content = join(root, 'content', 'visuals');
    try {
      mkdirSync(dist, { recursive: true });
      mkdirSync(content, { recursive: true });
      writeFileSync(join(dist, 'draft.glb'), 'synthetic fixture bytes only');
      writeFileSync(join(content, 'anatomy-draft.json'), JSON.stringify({
        status: 'draft',
        model: { file: '/models/anatomy/draft.glb' },
        labels: [{ id: 'FMA999991', text: 'synthetic fixture only' }],
      }));
      const run = (env: Record<string, string>) => spawnSync(process.execPath, [script], {
        cwd: root, env: { ...process.env, ...env }, encoding: 'utf8',
      });
      const main = run({
        WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main', CUEORY_ANATOMY_DRAFTS: '',
      });
      expect(main.status).toBe(1);
      expect(main.stderr).toContain('unapproved model exposed in production');
      // Actual Workers Builds sets WORKERS_CI=true in some preview/deploy paths.
      // A mislabeled main artifact must still fail before public upload.
      const cloudflareMain = run({
        WORKERS_CI: 'true', WORKERS_CI_BRANCH: 'main', CUEORY_ANATOMY_DRAFTS: '1',
        GITHUB_EVENT_NAME: '', GITHUB_REF: '', GITHUB_BASE_REF: '',
      });
      expect(cloudflareMain.status).toBe(1);
      expect(cloudflareMain.stderr).toContain('unapproved model exposed in production');
      const unknown = run({
        WORKERS_CI: '', WORKERS_CI_BRANCH: '', CUEORY_ANATOMY_DRAFTS: '',
      });
      expect(unknown.status).toBe(1);
      const preview = run({
        WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging', CUEORY_ANATOMY_DRAFTS: '',
      });
      expect(preview.status).toBe(0);
      expect(preview.stdout).toContain('skipped for explicitly draft-enabled preview');

      // A real release-PR build still fails closed on draft geometry even
      // when its fixture flag was accidentally enabled.
      const releaseWithDraft = run({
        WORKERS_CI: '', WORKERS_CI_BRANCH: '',
        GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main',
        GITHUB_REF: 'refs/pull/12/merge', CUEORY_ANATOMY_DRAFTS: '1',
      });
      expect(releaseWithDraft.status).toBe(1);
      expect(releaseWithDraft.stderr).toContain('unapproved model exposed in production');

      // Playwright's webServer uses env -u on the three GitHub release
      // variables. Execute that same subprocess boundary, not only a
      // source-string assertion, so browser fixtures remain testable.
      const browserInRelease = spawnSync('env', [
        '-u', 'GITHUB_EVENT_NAME', '-u', 'GITHUB_BASE_REF', '-u', 'GITHUB_REF',
        process.execPath, script,
      ], {
        cwd: root,
        env: {
          ...process.env, WORKERS_CI: '', WORKERS_CI_BRANCH: '',
          GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main',
          GITHUB_REF: 'refs/pull/12/merge', CUEORY_ANATOMY_DRAFTS: '1',
        },
        encoding: 'utf8',
      });
      expect(browserInRelease.status).toBe(0);
      expect(browserInRelease.stdout).toContain('skipped for explicitly draft-enabled preview');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('isolates the draft Playwright fixture without weakening the main release audit', () => {
    const config = readFileSync(new URL('../../playwright.config.ts', import.meta.url), 'utf8');
    // A release PR's process environment is inherited by the Playwright web server.
    // Clear only that subprocess's release context so its intentional draft fixture can build.
    expect(config).toContain(
      'env -u GITHUB_EVENT_NAME -u GITHUB_BASE_REF -u GITHUB_REF CUEORY_ANATOMY_DRAFTS=1 npm run build',
    );
    expect(shouldAuditAnatomyBuild({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main' })).toBe(true);
    expect(shouldAuditAnatomyBuild({ CUEORY_ANATOMY_DRAFTS: '1' })).toBe(false);
  });

  it('keeps the audit after the complete site and Pagefind build through npm postbuild', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    expect(pkg.scripts.build).toContain('pagefind --site dist');
    expect(pkg.scripts.postbuild).toBe('node scripts/check-anatomy-build.mjs');
  });
});
