/**
 * The initial-JavaScript scanner shared by tests/unit/build-output.test.ts (each route's own budget) and
 * tests/unit/perf-budget.test.ts (the budget per page type, docs/PERFORMANCE.md). Moved here unchanged so both use
 * exactly the same count: each page's external scripts, Astro island components and renderers, their static imports,
 * and inline scripts, all gzip. Dynamic imports are not counted. Not a test file itself (vitest runs *.test.ts only).
 */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

export function initialJsFiles(page: string, root: string = dist): string[] {
  const html = readFileSync(page, 'utf8');
  const queue = [...html.matchAll(/(?:src|component-url|renderer-url)="([^"]+\.js(?:\?[^" ]*)?)"/g)].map((match) => match[1]!);
  const files = new Set<string>();
  const resolveAsset = (from: string, url: string) => {
    if (isAbsolute(url) && url.startsWith(root)) return url;
    return url.startsWith('/') ? join(root, url.slice(1)) : join(from, '..', url);
  };

  while (queue.length > 0) {
    const url = queue.shift()!.split('?')[0]!;
    const file = resolveAsset(page, url);
    if (files.has(file) || !file.endsWith('.js') || !existsSync(file)) continue;
    files.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:import|export)\s*(?:[^"'();]*?\bfrom\s*)?["']([^"']+\.js)["']/g)) {
      const imported = match[1]!.split('?')[0]!;
      queue.push(imported.startsWith('/') ? imported : join(file, '..', imported));
    }
  }
  return [...files];
}

/**
 * Read script bodies in our built HTML without an incomplete closing-tag regex.
 * End tags can use mixed case and whitespace or additional text before >.
 */
export function inlineScriptBodies(html: string): string[] {
  // ASCII-only case folding preserves positions even around non-ASCII text.
  const lower = html.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  const isBoundary = (character: string | undefined) =>
    character === undefined || character === '>' || character === '/' || /\s/u.test(character);
  const bodies: string[] = [];
  let at = 0;
  for (;;) {
    const open = lower.indexOf('<script', at);
    if (open === -1) return bodies;
    if (!isBoundary(lower[open + 7])) {
      at = open + 7;
      continue;
    }
    const startEnd = lower.indexOf('>', open + 7);
    if (startEnd === -1) return bodies;
    let close = lower.indexOf('</script', startEnd + 1);
    while (close !== -1 && !isBoundary(lower[close + 8])) {
      close = lower.indexOf('</script', close + 8);
    }
    if (close === -1) return bodies;
    const closeEnd = lower.indexOf('>', close + 8);
    if (closeEnd === -1) return bodies;
    bodies.push(html.slice(startEnd + 1, close));
    at = closeEnd + 1;
  }
}

export function initialJsGzipBytes(page: string, root: string = dist): number {
  const html = readFileSync(page, 'utf8');
  const external = initialJsFiles(page, root).reduce((total, file) => total + gzipSync(readFileSync(file)).length, 0);
  const inline = inlineScriptBodies(html).reduce((total, body) => total + gzipSync(body).length, 0);
  return external + inline;
}
