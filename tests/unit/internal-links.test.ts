/**
 * Crawls the built site in dist/ (run `npm run build` first, CI does) and checks that every root-relative link or
 * file reference points at a page or file that exists, and that the Workers build answers an unknown address with
 * HTTP 404 and our 404 page.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dist = fileURLToPath(new URL('../../dist', import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Does a root-relative path resolve to a built file, the way Workers assets serve it (html_handling: drop-trailing-slash)? */
export function resolves(published: Set<string>, path: string): boolean {
  let p: string;
  try {
    p = decodeURI(path);
  } catch {
    return false;
  }
  if (p === '/') return published.has('/index.html');
  const bare = p.replace(/\/$/, '');
  return published.has(p) || published.has(`${bare}.html`) || published.has(`${bare}/index.html`);
}

export function brokenLinks(files: string[], root: string): string[] {
  const published = new Set(files.map((f) => f.slice(root.length).replaceAll('\\', '/')));
  const broken: string[] = [];
  for (const file of files.filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8');
    for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      const url = m[1]!;
      if (!url.startsWith('/') || url.startsWith('//')) continue;
      const path = url.split(/[?#]/)[0]!;
      if (!resolves(published, path)) broken.push(`${file.slice(root.length)} -> ${url}`);
    }
  }
  return broken;
}

describe('internal links', () => {
  it('resolves paths like the Workers assets server', () => {
    const set = new Set(['/index.html', '/learn.html', '/learn/a/index.html', '/x.css']);
    expect(resolves(set, '/')).toBe(true);
    expect(resolves(set, '/learn')).toBe(true);
    expect(resolves(set, '/learn/')).toBe(true);
    expect(resolves(set, '/learn/a')).toBe(true);
    expect(resolves(set, '/x.css')).toBe(true);
    expect(resolves(set, '/missing')).toBe(false);
    expect(resolves(set, '/%E0%A4%A')).toBe(false);
  });

  it('every root-relative href and src in the built pages exists', () => {
    expect(brokenLinks(walk(dist), dist)).toEqual([]);
  });
});

describe('Workers build 404', () => {
  const port = Number(process.env.CUEORY_WRANGLER_PORT ?? 4323);
  const base = `http://127.0.0.1:${port}`;
  let child: ChildProcess | undefined;

  beforeAll(async () => {
    // Same assets settings as wrangler.jsonc (read from it, never edited); an older compatibility date because the
    // local workerd can lag the one in wrangler.jsonc, and asset serving does not depend on it.
    const real = readFileSync(fileURLToPath(new URL('../../wrangler.jsonc', import.meta.url)), 'utf8');
    const notFound = /"not_found_handling":\s*"([^"]+)"/.exec(real)?.[1];
    const html = /"html_handling":\s*"([^"]+)"/.exec(real)?.[1];
    const dir = mkdtempSync(join(tmpdir(), 'cueory-wrangler-'));
    const config = join(dir, 'wrangler.jsonc');
    writeFileSync(
      config,
      JSON.stringify({
        name: 'cueory-404-test',
        compatibility_date: '2024-09-23',
        assets: { directory: dist, not_found_handling: notFound, html_handling: html },
      }),
    );
    child = spawn('npx', ['wrangler', 'dev', '-c', config, '--port', String(port), '--ip', '127.0.0.1'], {
      stdio: 'ignore',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
    });
    for (let i = 0; i < 90; i++) {
      try {
        await fetch(`${base}/`);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error('wrangler dev did not start');
  }, 120_000);

  afterAll(() => {
    child?.kill();
  });

  it('answers an unknown address with HTTP 404 and the 404 page', async () => {
    const res = await fetch(`${base}/this-page-does-not-exist`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('page not found');
  });

  it('keeps real pages at HTTP 200', async () => {
    expect((await fetch(`${base}/`)).status).toBe(200);
  });
});
