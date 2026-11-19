/**
 * Run after npm run build (CI does). Starts `wrangler dev` on the built site in dist/ and checks that the Workers
 * build answers an unknown address with HTTP 404 and our 404 page, while real pages stay at HTTP 200.
 * The internal link and #fragment checks live in internal-links.test.ts.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dist = fileURLToPath(new URL('../../dist', import.meta.url));
const wrangler = join(dirname(createRequire(import.meta.url).resolve('wrangler/package.json')), 'bin', 'wrangler.js');

function workerPort(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4_000);
    });
    const quit = (reason: string) => {
      clearTimeout(timeout);
      reject(new Error(`${reason}${stderr ? `\n${stderr.trim()}` : ''}`));
    };
    const timeout = setTimeout(() => quit('wrangler dev did not report readiness'), 90_000);
    child.once('error', (error) => quit(`could not start wrangler dev: ${error.message}`));
    child.once('exit', (code, signal) => quit(`wrangler dev exited before readiness (${signal ?? code})`));
    child.on('message', (message) => {
      if (typeof message !== 'string') return;
      let ready: { event?: string; ip?: string; port?: number };
      try {
        ready = JSON.parse(message) ?? {};
      } catch {
        return;
      }
      const { event, ip, port } = ready;
      if (event !== 'DEV_SERVER_READY' || ip !== '127.0.0.1' || typeof port !== 'number'
        || !Number.isInteger(port) || port < 1 || port > 65_535) return;
      clearTimeout(timeout);
      resolve(port);
    });
  });
}

describe('Workers build 404', () => {
  // Ask the OS for a free port unless the caller explicitly selects one.
  const port = Number(process.env.CUEORY_WRANGLER_PORT ?? 0);
  let base: string;
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
    const args = [wrangler, 'dev', '-c', config, '--port', String(port), '--ip', '127.0.0.1', '--persist-to', join(dir, 'state')];
    // Wrangler forwards the launched server's readiness over IPC. A response from another preview is not enough.
    child = spawn(process.execPath, args, {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      detached: process.platform !== 'win32',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
    });
    base = `http://127.0.0.1:${await workerPort(child)}`;
    // The proxy can report a port before the home page is ready to serve assets.
    const signal = AbortSignal.timeout(20_000);
    while (!signal.aborted && child.exitCode === null && child.signalCode === null) {
      try {
        const home = await fetch(`${base}/`, { signal });
        await home.arrayBuffer();
        if (home.ok && child.exitCode === null && child.signalCode === null) return;
      } catch {
        // Still loading; the probe's shared timeout bounds both requests and the retry loop.
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('wrangler dev did not serve the home page after reporting readiness');
  }, 120_000);

  afterAll(async () => {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
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
    const res = await fetch(`${base}/this-page-does-not-exist`, { signal: AbortSignal.timeout(5_000) });
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('page not found');
  });

  it('keeps real pages at HTTP 200', async () => {
    expect((await fetch(`${base}/`, { signal: AbortSignal.timeout(5_000) })).status).toBe(200);
  });
});
