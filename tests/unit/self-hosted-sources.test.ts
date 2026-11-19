/**
 * Source-level twin of security-links.test.ts (which reads dist/): src and public never point a script, style, font,
 * image, frame, worker or import at another origin, and every island that fetches data has a failure path the
 * student can see. The only allowed third-party resource is the click-to-play youtube-nocookie.com frame (D-40).
 * The Kit form action is a form, not a loaded resource, so it is outside these patterns.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const textFiles = /\.(astro|tsx?|jsx?|mjs|css|html|svg|webmanifest|json)$/;
const allowedFrameOrigin = 'https://www.youtube-nocookie.com';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (textFiles.test(name)) out.push(path);
  }
  return out;
}

const external = String.raw`(?:https?:)?\/\/[a-z0-9]`;
/** Captures the tag, the attribute and the whole URL (HTML quotes or a JSX `{'...'}` / `{\`...\`}` value). */
const resourceTag = new RegExp(String.raw`<(script|img|iframe|source|video|audio|embed|object|track|input)\b[^>]*?\b(src|data|poster|srcset)\s*=\s*\{?\s*["'\x60]\s*((?:https?:)?\/\/[^"'\x60\s>]+)`, 'gi');
const patterns: [string, RegExp][] = [
  ['resource tag src', resourceTag],
  ['stylesheet or preload link', new RegExp(String.raw`<link\b(?![^>]*\brel=["'](?:canonical|alternate|me|author|license)["'])[^>]*?\bhref\s*=\s*["']\s*${external}`, 'gi')],
  ['css url()', new RegExp(String.raw`url\(\s*["']?${external}`, 'gi')],
  ['css @import', new RegExp(String.raw`@import\s+(?:url\(\s*)?["']?${external}`, 'gi')],
  ['module import', new RegExp(String.raw`(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)["']https?:\/\/`, 'gi')],
  ['script-assigned src', new RegExp(String.raw`\.(?:src|srcset)\s*=\s*["'\x60]${external}`, 'gi')],
  ['worker or importScripts', new RegExp(String.raw`(?:new\s+(?:Shared)?Worker\(|importScripts\()\s*["'\x60]${external}`, 'gi')],
];

/** Only an iframe src whose parsed origin is exactly the nocookie player passes; a URL that won't parse is a finding. */
function isAllowedFrame(tag: string, attribute: string, url: string): boolean {
  if (tag.toLowerCase() !== 'iframe' || attribute.toLowerCase() !== 'src') return false;
  try {
    return new URL(url).origin === allowedFrameOrigin;
  } catch {
    return false;
  }
}

function findingsIn(text: string, name: string): string[] {
  const found: string[] = [];
  for (const [label, pattern] of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (pattern === resourceTag && isAllowedFrame(match[1] ?? '', match[2] ?? '', match[3] ?? '')) continue;
      found.push(`${name}: ${label}: ${match[0].slice(0, 80)}`);
    }
  }
  return found;
}

const findings = (path: string) => findingsIn(readFileSync(path, 'utf8'), relative(root, path));

describe('src and public stay self-hosted', () => {
  const files = [...walk(join(root, 'src')), ...walk(join(root, 'public'))];

  it('scans real files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('loads no script, style, font, image, frame or worker from another origin', () => {
    expect(files.flatMap(findings)).toEqual([]);
  });

  it('the patterns catch what they should', () => {
    const probe = (text: string) => patterns.some(([, pattern]) => new RegExp(pattern.source, 'i').test(text));
    for (const bad of [
      '<script src="https://cdn.example/x.js"></script>',
      '<img alt="" src="//cdn.example/x.png">',
      '<link rel="stylesheet" href="https://fonts.example/css">',
      '<iframe src="https://evil.example/e"></iframe>',
      "src: url('https://fonts.example/f.woff2')",
      '@import "https://x.example/a.css";',
      "const m = await import('https://esm.example/m.js')",
      "img.src = 'https://x.example/p.png'",
    ]) expect(probe(bad), bad).toBe(true);
    for (const good of [
      '<link rel="canonical" href="https://cueory.app/">',
      '<a href="https://ko-fi.com/x">tip</a>',
      '<script src="/scripts/a.js"></script>',
      "src: url('/fonts/lato.woff2')",
    ]) expect(probe(good), good).toBe(false);
  });

  it('allows only an iframe src whose origin is exactly the nocookie player', () => {
    for (const allowed of [
      '<iframe title="video" src="https://www.youtube-nocookie.com/embed/xxxxxxxxxxx"></iframe>',
      '<iframe ref={frameRef} src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`} title={title} />',
    ]) expect(findingsIn(allowed, 'fixture'), allowed).toEqual([]);
    for (const blocked of [
      '<iframe src="https://www.youtube.com/embed/xxxxxxxxxxx"></iframe>', // different origin
      '<iframe src="https://www.youtube-nocookie.com.evil.test/embed/x"></iframe>', // look-alike host
      '<iframe src="https://www.youtube-nocookie.com@evil.test/embed/x"></iframe>', // userinfo trick
      '<iframe src="http://www.youtube-nocookie.com/embed/x"></iframe>', // not https
      '<iframe src="//www.youtube-nocookie.com/embed/x"></iframe>', // no scheme, so no exact origin
      '<iframe src={`https://${host}/embed/x`} />', // host decided at run time
      '<script src="https://www.youtube-nocookie.com/x.js"></script>', // the allowance is for the frame only
    ]) expect(findingsIn(blocked, 'fixture'), blocked).toHaveLength(1);
  });
});

describe('islands that fetch data show a failure state', () => {
  const islands = walk(join(root, 'src', 'islands')).filter((p) => /\.tsx$/.test(p));
  const fetching = islands.filter((p) => /\bfetch\(/.test(readFileSync(p, 'utf8')));

  it('finds the fetching islands', () => {
    expect(fetching.length).toBeGreaterThan(0);
  });

  it.each(fetching.map((p) => [relative(root, p), p]))('%s catches failures and announces them', (_name, path) => {
    const text = readFileSync(path, 'utf8');
    expect(text).toMatch(/\.catch\(|catch\s*(?:\(|\{)/);
    expect(text).toMatch(/role="alert"/);
    expect(text).toMatch(/loading|role="status"/);
  });
});
