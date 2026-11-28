/**
 * Issue #746: puts the whole content security policy in the HTTP header, not only in Astro's <meta> tag.
 *
 * Astro writes the hash-based policy as a <meta> on each page (astro.config.mjs). A <meta> policy only covers what the
 * browser reads after it, and Layout.astro's theme script comes before it, so the HTTP header must carry the policy
 * too. After the build, this reads every built page's <meta> policy, joins their sources per directive (the same
 * directives on every page, script and style hashes pooled), adds them to the header-only directives in
 * public/_headers, and writes the result into dist/_headers. The browser enforces both the header and the <meta>, so
 * each page stays exactly as strict as its own <meta> after the tag, and the header covers what comes before it.
 *
 * Fails the build instead of shipping a weaker or broken header: a page without exactly one policy <meta>, pages that
 * disagree on anything but script and style sources, a header directive that differs from the <meta> one, an unsafe
 * source, or a line over Cloudflare's 2,000-character _headers limit.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Policy = Map<string, string[]>;

/** Cloudflare: "Each line in the `_headers` file has a 2,000 character limit." */
export const HEADERS_LINE_LIMIT = 2000;

/** The only directives whose sources may differ from page to page (Astro's per-page hashes). */
const POOLED = new Set(['script-src', 'style-src']);

export function parsePolicy(text: string): Policy {
  const policy: Policy = new Map();
  for (const part of text.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/).filter(Boolean);
    if (!name) continue;
    const key = name.toLowerCase();
    if (policy.has(key)) throw new Error(`CSP header: duplicate directive ${key}`);
    policy.set(key, sources);
  }
  return policy;
}

export function formatPolicy(policy: Policy): string {
  return [...policy].map(([name, sources]) => [name, ...sources].join(' ')).join('; ');
}

function decodeAttribute(value: string): string {
  return value
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

/** The one Content-Security-Policy <meta> of a built page. */
export function metaPolicy(html: string, page = 'page'): string {
  const tags = html.match(/<meta\b[^>]*\bhttp-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi) ?? [];
  if (tags.length !== 1) throw new Error(`CSP header: ${page} has ${tags.length} policy <meta> tags, expected 1`);
  const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tags[0]!);
  if (!content) throw new Error(`CSP header: ${page} has a policy <meta> without content`);
  return decodeAttribute(content[1] ?? content[2] ?? '');
}

function sameSources(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((source, i) => source === b[i]);
}

/** Joins the pages' policies: identical directives everywhere, script and style sources pooled in first-seen order. */
export function joinPagePolicies(pages: { page: string; policy: string }[]): Policy {
  if (pages.length === 0) throw new Error('CSP header: no built pages found');
  const joined: Policy = new Map();
  const first = parsePolicy(pages[0]!.policy);
  for (const [name, sources] of first) joined.set(name, [...sources]);
  for (const { page, policy } of pages) {
    const parsed = parsePolicy(policy);
    const names = [...parsed.keys()].sort().join(' ');
    if (names !== [...joined.keys()].sort().join(' ')) {
      throw new Error(`CSP header: ${page} has different directives from ${pages[0]!.page}`);
    }
    for (const [name, sources] of parsed) {
      const into = joined.get(name)!;
      if (POOLED.has(name)) {
        for (const source of sources) if (!into.includes(source)) into.push(source);
      } else if (!sameSources(into, sources)) {
        throw new Error(`CSP header: ${page} has a different ${name} from ${pages[0]!.page}`);
      }
    }
  }
  return joined;
}

/** Header-only directives first (frame-ancestors and the like), then the pages' directives. */
export function headerPolicy(headerOnly: Policy, pages: Policy): Policy {
  const result: Policy = new Map([...headerOnly].map(([name, sources]) => [name, [...sources]]));
  for (const [name, sources] of pages) {
    const existing = result.get(name);
    if (existing && !sameSources(existing, sources)) {
      throw new Error(`CSP header: public/_headers and the page policy disagree on ${name}`);
    }
    if (!existing) result.set(name, [...sources]);
  }
  checkPolicy(result);
  return result;
}

/** The floor issue #746 sets for the header. */
export function checkPolicy(policy: Policy): void {
  for (const [name, sources] of policy) {
    for (const source of sources) {
      if (source.includes('*')) throw new Error(`CSP header: wildcard in ${name}`);
      if (/^'unsafe-(inline|eval|hashes)'$/i.test(source)) throw new Error(`CSP header: ${source} in ${name}`);
    }
  }
  for (const name of ['default-src', 'script-src', 'object-src', 'base-uri', 'frame-ancestors']) {
    if (!policy.has(name)) throw new Error(`CSP header: missing ${name}`);
  }
  if (!sameSources(policy.get('frame-src') ?? [], ['https://www.youtube-nocookie.com'])) {
    throw new Error('CSP header: frame-src must be https://www.youtube-nocookie.com only');
  }
}

/** Replaces the value of the one Content-Security-Policy line in the site-wide `/*` rule. */
export function rewriteHeaders(headersText: string, build: (headerOnly: Policy) => Policy): string {
  const lines = headersText.split('\n');
  let rule = '';
  let found = -1;
  lines.forEach((line, i) => {
    if (/^\S/.test(line) && !line.startsWith('#')) rule = line.trim();
    if (/^\s+Content-Security-Policy\s*:/i.test(line)) {
      if (rule !== '/*') throw new Error(`CSP header: Content-Security-Policy under ${rule || 'no rule'}, expected /*`);
      if (found >= 0) throw new Error('CSP header: more than one Content-Security-Policy line');
      found = i;
    }
  });
  if (found < 0) throw new Error('CSP header: no Content-Security-Policy line in the /* rule');
  const [, indent, name, value] = /^(\s+)(Content-Security-Policy)\s*:\s*(.*?)\r?$/i.exec(lines[found]!)!;
  const line = `${indent}${name}: ${formatPolicy(build(parsePolicy(value!)))}`;
  if (line.length > HEADERS_LINE_LIMIT) {
    throw new Error(`CSP header: line is ${line.length} characters, over Cloudflare's ${HEADERS_LINE_LIMIT} limit`);
  }
  lines[found] = line;
  return lines.join('\n');
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.isFile() && entry.name.endsWith('.html') ? [path] : [];
  });
}

/** Writes the full policy into dist/_headers; returns it. */
export function writeCspHeader(dist: string): string {
  const pages = htmlFiles(dist)
    .sort()
    .map((file) => {
      const page = relative(dist, file);
      return { page, policy: metaPolicy(readFileSync(file, 'utf8'), page) };
    });
  const joined = joinPagePolicies(pages);
  const headersFile = join(dist, '_headers');
  let policy = '';
  const text = rewriteHeaders(readFileSync(headersFile, 'utf8'), (headerOnly) => {
    const result = headerPolicy(headerOnly, joined);
    policy = formatPolicy(result);
    return result;
  });
  writeFileSync(headersFile, text);
  return policy;
}

/** Astro integration: runs once the build is written (dist/_headers is copied from public/ by then). */
export function cspHeaderIntegration() {
  return {
    name: 'cueory-csp-header',
    hooks: {
      'astro:build:done': ({ dir, logger }: { dir: URL; logger: { info: (message: string) => void } }) => {
        const policy = writeCspHeader(fileURLToPath(dir));
        logger.info(`wrote the full content security policy into _headers (${policy.length} characters)`);
      },
    },
  };
}
