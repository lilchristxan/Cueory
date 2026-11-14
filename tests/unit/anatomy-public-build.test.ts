/**
 * Task 178 release gate: build a completely isolated, throwaway Git worktree
 * with one simulated approval and the other real-source manifests held as draft.
 * The tracked source manifests are NEVER changed or published. This covers
 * the otherwise-unreachable positive path while the founder keeps all 11 draft.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../', import.meta.url));

function scriptsReferencedBy(htmlFile: string, dist: string): string[] {
  const queue: { url: string; from: string }[] = [];
  const refs = (source: string, from: string) => {
    for (const match of source.matchAll(/(?:src|component-url|renderer-url)="([^"]+\.js(?:\?[^"]*)?)"/g)) {
      queue.push({ url: match[1]!, from });
    }
  };
  refs(readFileSync(htmlFile, 'utf8'), htmlFile);
  const seen = new Set<string>();
  const output: string[] = [];
  while (queue.length) {
    const entry = queue.shift()!;
    const url = entry.url.split('?')[0]!;
    if (url.startsWith('http:') || url.startsWith('https:')) continue;
    const path = url.startsWith('/') ? join(dist, url.slice(1)) : resolve(dirname(entry.from), url);
    if (!path.endsWith('.js') || seen.has(path) || !existsSync(path)) continue;
    seen.add(path);
    const code = readFileSync(path, 'utf8');
    output.push(code);
    for (const match of code.matchAll(/(?:import|export)\s*(?:[^"'();]*?\bfrom\s*)?["']([^"']+\.js)["']/g)) {
      queue.push({ url: match[1]!, from: path });
    }
  }
  return output;
}

it('renders only a simulated approved source on /anatomy and a complete no-JavaScript fallback', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'cueory-anatomy-gate-'));
  const checkout = join(scratch, 'checkout');
  let mounted = false;
  try {
    execFileSync('git', ['worktree', 'add', '--detach', checkout, 'HEAD'], {
      cwd: repo, stdio: 'pipe', timeout: 45_000,
    });
    mounted = true;
    symlinkSync(join(repo, 'node_modules'), join(checkout, 'node_modules'), 'dir');
    const manifests = join(checkout, 'content', 'visuals');
    const filenames = readdirSync(manifests).filter((name) => /^anatomy-[a-z0-9-]+\.json$/.test(name));
    expect(filenames).toContain('anatomy-skin.json');
    const fakeApproved = 'anatomy-skin.json';
    const draftIds: string[] = [];
    let approvedLabels: { id: string; text: string }[] = [];
    for (const filename of filenames) {
      const source = join(manifests, filename);
      const data = JSON.parse(readFileSync(source, 'utf8')) as {
        status: 'draft' | 'approved';
        labels: { id: string; text: string }[];
      };
      // Only in the disposable worktree: simulate a founder-approved system
      // without inventing source names or changing a tracked model/status.
      data.status = filename === fakeApproved ? 'approved' : 'draft';
      if (data.status === 'approved') approvedLabels = data.labels;
      else draftIds.push(...data.labels.map((label) => label.id));
      writeFileSync(source, JSON.stringify(data));
    }
    expect(draftIds.length).toBeGreaterThan(0);
    expect(approvedLabels.length).toBeGreaterThan(0);

    const env: NodeJS.ProcessEnv = { ...process.env, CUEORY_ANATOMY_DRAFTS: '1' };
    delete env.WORKERS_CI;
    delete env.WORKERS_CI_BRANCH;
    execFileSync('npm', ['run', 'build'], {
      cwd: checkout, env, stdio: 'pipe', timeout: 240_000, maxBuffer: 4 * 1024 * 1024,
    });

    const dist = join(checkout, 'dist');
    const publicPage = readFileSync(join(dist, 'anatomy.html'), 'utf8');
    const homePage = readFileSync(join(dist, 'index.html'), 'utf8');
    const draftToken = new RegExp('\\b(?:' + draftIds.join('|') + ')\\b');
    expect(publicPage).not.toMatch(draftToken);
    expect(homePage).not.toMatch(draftToken);
    for (const js of scriptsReferencedBy(join(dist, 'anatomy.html'), dist)) {
      expect(js).not.toMatch(draftToken);
    }
    for (const label of approvedLabels) expect(publicPage).toContain(label.id);
    expect(publicPage).not.toMatch(/<meta name="robots" content="noindex/i);
    expect(homePage).toContain('href="/anatomy"');

    // Astro emits noscript markup statically. When scripting is off, the
    // browser parses this into headings, lists, official names and licenses.
    const noScriptBlocks = [...publicPage.matchAll(/<noscript(?:\s[^>]*)?>([\s\S]*?)<\/noscript>/gi)]
      .map((match) => match[1]!);
    const textFallback = noScriptBlocks.find((block) => block.includes('structure names (text-only)'));
    expect(textFallback).toBeDefined();
    for (const label of approvedLabels) expect(textFallback).toContain(label.text);
    expect(textFallback).toContain('CC Attribution 4.0 International');
    expect(textFallback).not.toContain('/preview/anatomy-text');
  } finally {
    if (mounted) {
      const nodeModules = join(checkout, 'node_modules');
      if (existsSync(nodeModules)) unlinkSync(nodeModules);
      try {
        execFileSync('git', ['worktree', 'remove', '--force', checkout], {
          cwd: repo, stdio: 'pipe', timeout: 45_000,
        });
      } catch {
        // The original working tree and all manifests remain untouched.
        execFileSync('git', ['worktree', 'prune'], { cwd: repo, stdio: 'pipe' });
      }
    }
    rmSync(scratch, { recursive: true, force: true });
  }
}, 300_000);
