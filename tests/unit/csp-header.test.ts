/**
 * Issue #746: the HTTP Content-Security-Policy header carries the full hash-based policy, so the theme script that
 * runs before Astro's <meta> policy is covered too. The second block checks the built site in dist/ (run
 * `npm run build` first; CI does).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { themeHeadScript } from '../../src/scripts/theme';
import {
  HEADERS_LINE_LIMIT,
  checkPolicy,
  formatPolicy,
  headerPolicy,
  joinPagePolicies,
  metaPolicy,
  parsePolicy,
  rewriteHeaders,
} from '../../src/security/cspheader';

const headerOnly = "frame-ancestors 'none'; frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; upgrade-insecure-requests";
const pageA = "default-src 'self';frame-src https://www.youtube-nocookie.com;object-src 'none';base-uri 'self'; script-src 'self' 'sha256-AAA='; style-src 'self';";
const pageB = "default-src 'self';frame-src https://www.youtube-nocookie.com;object-src 'none';base-uri 'self'; script-src 'self' 'sha256-BBB=' 'sha256-AAA='; style-src 'self' 'sha256-CCC=';";
const headersFile = `# comment\n/*\n  Content-Security-Policy: ${headerOnly}\n  X-Frame-Options: DENY\n\n/sitemap.xml\n  Cache-Control: public, max-age=3600\n`;

function build(pages: string[]) {
  const joined = joinPagePolicies(pages.map((policy, i) => ({ page: `p${i}.html`, policy })));
  return (header: Map<string, string[]>) => headerPolicy(header, joined);
}

describe('CSP header builder (issue #746)', () => {
  it('pools script and style hashes from every page and keeps the header-only directives', () => {
    const out = rewriteHeaders(headersFile, build([pageA, pageB]));
    const line = out.split('\n').find((l) => l.includes('Content-Security-Policy'))!;
    expect(line).toBe(
      "  Content-Security-Policy: frame-ancestors 'none'; frame-src https://www.youtube-nocookie.com; object-src 'none'; " +
        "base-uri 'self'; upgrade-insecure-requests; default-src 'self'; script-src 'self' 'sha256-AAA=' 'sha256-BBB='; " +
        "style-src 'self' 'sha256-CCC='",
    );
    // Everything else in the file is untouched.
    expect(out.replace(line, '')).toBe(headersFile.replace(`  Content-Security-Policy: ${headerOnly}`, ''));
  });

  it('reads the one policy <meta>, decoding attribute quotes', () => {
    expect(metaPolicy(`<head><meta http-equiv="content-security-policy" content="script-src &#39;self&#39;"></head>`))
      .toBe("script-src 'self'");
    expect(() => metaPolicy('<head><script>1</script></head>', 'x.html')).toThrow('x.html has 0 policy');
    expect(() => metaPolicy(
      '<meta http-equiv="Content-Security-Policy" content="a"><meta http-equiv="content-security-policy" content="b">',
    )).toThrow('has 2 policy');
  });

  it('refuses pages that disagree on anything but script and style sources', () => {
    expect(() => build([pageA, pageB.replace("object-src 'none'", "object-src 'self'")])).toThrow('different object-src');
    expect(() => build([pageA, pageB.replace("base-uri 'self';", '')])).toThrow('different directives');
    expect(() => joinPagePolicies([])).toThrow('no built pages');
  });

  it('refuses a header directive that differs from the page one', () => {
    const header = headersFile.replace("base-uri 'self'", "base-uri 'none'");
    expect(() => rewriteHeaders(header, build([pageA]))).toThrow('disagree on base-uri');
  });

  it('refuses unsafe or wildcard sources, a missing script-src, and any other frame source', () => {
    for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", 'https://*.example.com']) {
      expect(() => rewriteHeaders(headersFile, build([pageA.replace("script-src 'self'", `script-src 'self' ${bad}`)])))
        .toThrow();
    }
    expect(() => checkPolicy(parsePolicy(headerOnly + "; default-src 'self'"))).toThrow('missing script-src');
    expect(() => rewriteHeaders(
      headersFile.replace('frame-src https://www.youtube-nocookie.com', 'frame-src https://www.youtube-nocookie.com https://www.youtube.com'),
      build([pageA.replace('frame-src https://www.youtube-nocookie.com', 'frame-src https://www.youtube-nocookie.com https://www.youtube.com')]),
    )).toThrow('frame-src must be');
  });

  it("stops at Cloudflare's 2,000-character line limit", () => {
    const hashes = Array.from({ length: 60 }, (_, i) => `'sha256-${String(i).padStart(43, 'x')}='`).join(' ');
    expect(() => rewriteHeaders(headersFile, build([pageA.replace("script-src 'self'", `script-src 'self' ${hashes}`)])))
      .toThrow(`over Cloudflare's ${HEADERS_LINE_LIMIT} limit`);
  });

  it('needs exactly one Content-Security-Policy line, in the /* rule', () => {
    expect(() => rewriteHeaders(headersFile.replace(/ {2}Content-Security-Policy:.*\n/, ''), build([pageA])))
      .toThrow('no Content-Security-Policy line');
    expect(() => rewriteHeaders(`${headersFile}/other\n  Content-Security-Policy: ${headerOnly}\n`, build([pageA])))
      .toThrow('under /other');
  });
});

// ---- The built site ----

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

const sha256 = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

describe('built dist/_headers (issue #746)', () => {
  const headersText = readFileSync(join(dist, '_headers'), 'utf8');
  const line = headersText.split('\n').find((l) => /^\s+Content-Security-Policy:/.test(l))!;
  const header = parsePolicy(line.replace(/^\s+Content-Security-Policy:\s*/, ''));
  const pages = htmlFiles(dist);

  it('ships every other protective header unchanged, including HSTS and frame denial (Lane 10)', () => {
    const source = readFileSync(fileURLToPath(new URL('../../public/_headers', import.meta.url)), 'utf8');
    const siteRule = (text: string) => {
      const lines = text.split('\n');
      const start = lines.findIndex((l) => l.trim() === '/*');
      const end = lines.findIndex((l, i) => i > start && /^\S/.test(l) && !l.startsWith('#'));
      return lines.slice(start + 1, end < 0 ? undefined : end).map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && !l.startsWith('Content-Security-Policy:'));
    };
    const built = siteRule(headersText);
    expect(built).toEqual(siteRule(source));
    expect(built).toContain('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    expect(built).toContain('X-Frame-Options: DENY');
    expect(built).toContain('X-Content-Type-Options: nosniff');
  });

  it('enforces the full policy: default-src, script-src, no unsafe sources, YouTube cookie-free frames only', () => {
    expect(line.length).toBeLessThanOrEqual(HEADERS_LINE_LIMIT);
    expect(() => checkPolicy(header)).not.toThrow();
    expect(header.get('default-src')).toEqual(["'self'"]);
    expect(header.get('frame-ancestors')).toEqual(["'none'"]);
    expect(header.get('frame-src')).toEqual(['https://www.youtube-nocookie.com']);
    expect(header.get('script-src')).not.toContain("'unsafe-inline'");
    expect(header.get('script-src')).not.toContain("'unsafe-eval'");
    expect(header.has('upgrade-insecure-requests')).toBe(true);
    // Only the documented WebAssembly allowance ('wasm-unsafe-eval', D-49), never JavaScript eval or inline code.
    for (const source of [...header.values()].flat()) {
      expect(source).not.toMatch(/^'unsafe-(inline|eval|hashes)'$/);
    }
    expect(formatPolicy(header).replaceAll("'wasm-unsafe-eval'", '')).not.toContain('unsafe');
  });

  it("allows every source each page's <meta> allows, and nothing in any other directive", () => {
    expect(pages.length).toBeGreaterThan(10);
    for (const file of pages) {
      const page = relative(dist, file);
      const meta = parsePolicy(metaPolicy(readFileSync(file, 'utf8'), page));
      for (const [name, sources] of meta) {
        const allowed = header.get(name);
        expect(allowed, `${page}: ${name}`).toBeDefined();
        if (name === 'script-src' || name === 'style-src') {
          for (const source of sources) expect(allowed, `${page}: ${name}`).toContain(source);
        } else {
          expect(allowed, `${page}: ${name}`).toEqual(sources);
        }
      }
    }
  });

  it('allows the theme script, which every page runs before its <meta> policy, by its hash', () => {
    const themeHash = sha256(themeHeadScript);
    expect(header.get('script-src')).toContain(themeHash);
    for (const file of pages) {
      const html = readFileSync(file, 'utf8');
      const theme = html.indexOf(`<script>${themeHeadScript}</script>`);
      const meta = html.search(/<meta http-equiv="content-security-policy"/i);
      expect(theme, relative(dist, file)).toBeGreaterThan(-1);
      expect(meta, relative(dist, file)).toBeGreaterThan(-1);
    }
  });

  it("allows every inline script on every page by hash, so the header blocks none of the site's own scripts", () => {
    const scriptSrc = header.get('script-src')!;
    for (const file of pages) {
      const html = readFileSync(file, 'utf8');
      for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)) {
        const [, attrs, body] = match;
        if (/\bsrc\s*=/i.test(attrs!) || /type\s*=\s*["']?application\/(ld\+)?json/i.test(attrs!)) continue;
        if (!body) continue;
        expect(scriptSrc, `${relative(dist, file)}: inline script ${body.slice(0, 60)}`).toContain(sha256(body));
      }
    }
  });
});
