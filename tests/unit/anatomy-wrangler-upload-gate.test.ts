import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { shouldAuditWranglerUpload } from '../../scripts/anatomy-wrangler-upload-gate.mjs';

const temporaryRoots: string[] = [];
const cli = fileURLToPath(new URL('../../scripts/anatomy-wrangler-upload-gate.mjs', import.meta.url));
afterEach(() => temporaryRoots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cueory-anatomy-wrangler-'));
  temporaryRoots.push(root);
  const models = join(root, 'dist', 'models', 'anatomy');
  const sources = join(root, 'content', 'visuals');
  mkdirSync(models, { recursive: true });
  mkdirSync(sources, { recursive: true });
  writeFileSync(join(sources, 'anatomy-fixture.json'), JSON.stringify({
    status: 'draft',
    model: { file: '/models/anatomy/fixture.glb' },
    labels: [{ id: 'FMA999991', text: 'synthetic test structure', source: 'bp3d-FMA999991' }],
  }));
  const model = join(models, 'fixture.glb');
  writeFileSync(model, 'synthetic test geometry, never published');
  return { root, model };
}

function runGate(root: string, command: string, drafts = '1') {
  return spawnSync(process.execPath, [cli], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_COMMAND: command, CUEORY_ANATOMY_DRAFTS: drafts },
  });
}

describe('direct Wrangler anatomy upload safety', () => {
  it('registers the audit as a Wrangler custom-build command', () => {
    const config = readFileSync('wrangler.jsonc', 'utf8');
    expect(config).toMatch(/"build"\s*:\s*\{\s*"command"\s*:\s*"node scripts\/anatomy-wrangler-upload-gate\.mjs"/);
    expect(config).toContain('"directory": "./dist"');
  });

  it('checks uploads even when a draft-enabled build left prebuilt files behind', () => {
    for (const command of ['deploy', 'versions upload', 'unknown-command', '']) {
      expect(shouldAuditWranglerUpload({
        WRANGLER_COMMAND: command,
        CUEORY_ANATOMY_DRAFTS: '1',
      }), command).toBe(true);
    }
    for (const command of ['dev', 'types', 'preview']) {
      expect(shouldAuditWranglerUpload({ WRANGLER_COMMAND: command }), command).toBe(false);
    }
  });

  it('rejects a real draft .glb in dist before standard direct deploy', () => {
    const { root } = fixture();
    for (const command of ['deploy', 'versions upload']) {
      const result = runGate(root, command);
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain('unapproved model exposed in production');
    }
  });

  it('allows an audited production artifact with drafts excluded', () => {
    const { root, model } = fixture();
    unlinkSync(model);
    const result = runGate(root, 'deploy');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('anatomy Wrangler upload audit PASS');
  });

  it('does not obstruct a local draft preview or type generation', () => {
    const { root } = fixture();
    for (const command of ['dev', 'types', 'preview']) {
      const result = runGate(root, command);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('local non-upload command');
    }
  });

  it('fails closed when the output directory was never built', () => {
    const root = mkdtempSync(join(tmpdir(), 'cueory-anatomy-no-dist-'));
    temporaryRoots.push(root);
    const result = runGate(root, 'deploy', '0');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('production output does not exist');
  });
});
