/**
 * Run after npm run build (CI does). Starts `wrangler dev` on the built site in dist/ and checks that the Workers
 * build answers an unknown address with HTTP 404 and our 404 page, while real pages stay at HTTP 200.
 * The internal link and #fragment checks live in internal-links.test.ts.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dist = fileURLToPath(new URL('../../dist', import.meta.url));

describe('Workers build 404', () => {
  const port = Number(process.env.CUEORY_WRANGLER_PORT ?? 4323);
  const base = `http://127.0.0.1:${port}`;
  // Config and miniflare state both live in a temp folder, so nothing is written to .wrangler/ in the repository.
  const dir = mkdtempSync(join(tmpdir(), 'cueory-wrangler-'));
  let child: ChildProcess | undefined;

  beforeAll(async () => {
    // Same assets settings as wrangler.jsonc (read from it, never edited); an older compatibility date because the
    // local workerd can lag the one in wrangler.jsonc, and asset serving does not depend on it.
    const real = readFileSync(fileURLToPath(new URL('../../wrangler.jsonc', import.meta.url)), 'utf8');
    const notFound = /"not_found_handling":\s*"([^"]+)"/.exec(real)?.[1];
    const html = /"html_handling":\s*"([^"]+)"/.exec(real)?.[1];
    const config = join(dir, 'wrangler.jsonc');
    writeFileSync(
      config,
      JSON.stringify({
        name: 'cueory-404-test',
        compatibility_date: '2024-09-23',
        assets: { directory: dist, not_found_handling: notFound, html_handling: html },
      }),
    );
    const args = ['wrangler', 'dev', '-c', config, '--port', String(port), '--ip', '127.0.0.1', '--persist-to', join(dir, 'state')];
    // Own process group, so afterAll can stop npx, wrangler and workerd together.
    child = spawn('npx', args, {
      stdio: 'ignore',
      detached: process.platform !== 'win32',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
    });
    // Ready means the home page itself is served (HTTP 200), not just that something answers on the port.
    for (let i = 0; i < 90; i++) {
      try {
        const res = await fetch(`${base}/`);
        await res.arrayBuffer();
        if (res.ok) return;
      } catch {
        // not listening yet
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('wrangler dev did not start');
  }, 120_000);

  afterAll(async () => {
    if (child?.pid && child.exitCode === null) {
      const exited = new Promise((r) => child!.once('exit', r));
      try {
        if (process.platform === 'win32') child.kill();
        else process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill();
      }
      await Promise.race([exited, new Promise((r) => setTimeout(r, 10_000))]);
    }
    rmSync(dir, { recursive: true, force: true });
  }, 20_000);

  it('answers an unknown address with HTTP 404 and the 404 page', async () => {
    const res = await fetch(`${base}/this-page-does-not-exist`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('page not found');
  });

  it('keeps real pages at HTTP 200', async () => {
    expect((await fetch(`${base}/`)).status).toBe(200);
  });
});
