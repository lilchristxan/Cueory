/**
 * Lane 10: every link or resource in the built pages that leaves cueory goes only to a host we chose, over https, and
 * every external link carries rel="noopener". Embedded resources (scripts, images, styles, fonts, frames) stay
 * self-hosted, except the click-to-play video frame on youtube-nocookie.com (CLAUDE.md, D-40).
 *
 * Reads dist/ (run `npm run build` first; CI does). blank-link-noopener.test.ts already checks every target="_blank"
 * link; this adds the host allowlist, https only, and noopener on external links that open in the same tab.
 *
 * Adding a host (a new social account, the Kit form once it exists) means adding it below on purpose.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { newsletter, site, socials } from '../../src/config/site';

/** Hosts a visitor may be sent to by a link or form. */
export const linkHosts = new Set([
  'cueory.app', // canonical and share links to our own site
  'www.instagram.com', 'www.tiktok.com', 'www.youtube.com', 'x.com', 'www.facebook.com', 'www.pinterest.com', // socials
  'ko-fi.com', // tip page
  'more.ko-fi.com', // Ko-fi's terms, linked from the approved Terms of Use (v5)
  'kit.com', 'policies.google.com', 'www.cloudflare.com', // privacy policies linked from the Privacy Notice (p3)
  // (more.ko-fi.com also serves Ko-fi's privacy policy, linked from the Privacy Notice)
  'cueory.kit.com', // Kit landing page for launch updates, a plain link until the Kit form exists
  'creativecommons.org', 'dbarchive.biosciencedbc.jp', // licence and source credits for the anatomy models
]);
/** Hosts the page itself may load from (only the click-to-play lesson video frame). */
export const embedHosts = new Set(['www.youtube-nocookie.com']);

type Finding = { at: number; problem: string };

const urlAttributes = new Set(['href', 'src', 'action', 'formaction', 'poster', 'data', 'srcset', 'imagesrcset', 'ping', 'background']);
const linkTags = new Set(['a', 'area', 'form', 'button', 'input']);
const rawText = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'noembed', 'noframes']);

function decodeAttribute(value: string): string {
  return value
    .replace(/&#(x[\da-f]+|\d+);?/gi, (whole, numeric: string) => {
      const point = Number.parseInt(numeric.replace(/^x/i, ''), /^x/i.test(numeric) ? 16 : 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
    })
    .replace(/&colon;/gi, ':').replace(/&sol;/gi, '/').replace(/&Tab;|&NewLine;/g, '').replace(/&amp;/gi, '&');
}

/** Opening tags in order with their attributes, skipping comments and raw-text element bodies. */
function* tags(html: string): Generator<{ name: string; attrs: Map<string, string>; at: number }> {
  const lower = html.toLowerCase();
  let at = 0;
  while (at < html.length) {
    const open = html.indexOf('<', at);
    if (open < 0) return;
    if (html.startsWith('<!--', open)) {
      const end = html.indexOf('-->', open + 4);
      at = end < 0 ? html.length : end + 3;
      continue;
    }
    let end = open + 1;
    let quote = '';
    for (; end < html.length; end++) {
      const char = html[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    at = end + 1;
    const tag = /^<([a-z][\w:-]*)\b/i.exec(html.slice(open, end + 1));
    if (!tag) continue;
    const name = tag[1]!.toLowerCase();
    const attrs = new Map<string, string>();
    for (const match of html.slice(open + tag[0].length, end).matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      const key = match[1]!.toLowerCase();
      if (!attrs.has(key)) attrs.set(key, decodeAttribute(match[2] ?? match[3] ?? match[4] ?? ''));
    }
    yield { name, attrs, at: open };
    if (rawText.has(name)) {
      const close = new RegExp(`</${name}(?=[\\s/>])`, 'g');
      close.lastIndex = at;
      at = close.exec(lower)?.index ?? html.length;
    }
  }
}

/** Every external URL in one attribute value (srcset-style lists give several). */
function externalUrls(attribute: string, value: string): string[] {
  const candidates = attribute.endsWith('srcset')
    ? value.split(',').map((part) => part.trim().split(/\s+/)[0] ?? '')
    : attribute === 'ping' ? value.split(/\s+/) : [value];
  // Browsers ignore leading/embedded tabs and newlines and accept backslashes in URLs, so normalise like they do.
  return candidates.map((url) => url.replace(/[\t\n\r]/g, '').trim().replace(/\\/g, '/'))
    .filter((url) => /^([a-z][a-z\d+.-]*:|\/\/)/i.test(url) && !/^(mailto|tel|data|blob):/i.test(url));
}

export function checkPage(html: string): Finding[] {
  const findings: Finding[] = [];
  for (const { name, attrs, at } of tags(html)) {
    for (const [attribute, value] of attrs) {
      if (!urlAttributes.has(attribute)) continue;
      for (const raw of externalUrls(attribute, value)) {
        let url: URL;
        try {
          url = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
        } catch {
          findings.push({ at, problem: `<${name} ${attribute}> has an unreadable external address` });
          continue;
        }
        const label = `<${name} ${attribute}=${url.protocol}//${url.host}>`;
        if (url.protocol !== 'https:') {
          findings.push({ at, problem: `${label} is not https` });
          continue;
        }
        if (url.username || url.password) findings.push({ at, problem: `${label} carries credentials` });
        const isLink = linkTags.has(name) || (name === 'link' && /\bcanonical\b|\balternate\b/i.test(attrs.get('rel') ?? ''));
        const allowed = isLink ? linkHosts : name === 'iframe' && attribute === 'src' ? embedHosts : new Set<string>();
        if (!allowed.has(url.hostname)) {
          findings.push({ at, problem: `${label} goes to a host that is not allowed for <${name}>` });
        }
        if ((name === 'a' || name === 'area') && url.hostname !== new URL(site.url).hostname &&
            !(attrs.get('rel') ?? '').toLowerCase().split(/[\t\n\f\r ]+/).includes('noopener')) {
          findings.push({ at, problem: `${label} has no rel="noopener"` });
        }
      }
    }
  }
  return findings;
}

describe('external link checker (fixtures)', () => {
  const problems = (html: string) => checkPage(html).map((finding) => finding.problem);

  it('accepts allowed links with noopener, our own canonical link and the video frame', () => {
    expect(problems([
      '<link rel="canonical" href="https://cueory.app/play">',
      '<a href="https://ko-fi.com/cueory" target="_blank" rel="noopener noreferrer">tip</a>',
      '<a href="https://cueory.app/">home</a><a href="/play">play</a><a href="mailto:hello@cueory.app">mail</a>',
      '<iframe src="https://www.youtube-nocookie.com/embed/xxxxxxxxxxx"></iframe>',
      '<img src="/brand/v1/logo.png" srcset="/a.png 1x, /b.png 2x">',
      '<script>const u = "https://evil.example";</script><!-- <a href="https://evil.example"> -->',
    ].join(''))).toEqual([]);
  });

  it('refuses other hosts, http, credentials, lookalikes and encoded tricks', () => {
    expect(problems('<a href="https://evil.example" rel="noopener">x</a>')).toHaveLength(1);
    expect(problems('<a href="http://ko-fi.com/cueory" rel="noopener">x</a>')).toEqual(['<a href=http://ko-fi.com> is not https']);
    expect(problems('<a href="https://me@ko-fi.com/" rel="noopener">x</a>')).toHaveLength(1);
    expect(problems('<a href="https://ko-fi.com.evil.example/" rel="noopener">x</a>')).toHaveLength(1);
    expect(problems('<a href="//evil.example/x" rel="noopener">x</a>')).toHaveLength(1);
    expect(problems('<a href="&#x2F;/evil.example" rel="noopener">x</a>')).toHaveLength(1);
    expect(problems('<a href="javascript:alert(1)">x</a>')).toEqual(['<a href=javascript://> is not https']);
    expect(problems('<form action="https://evil.example/collect"></form>')).toHaveLength(1);
  });

  it('refuses an external link without noopener, even in the same tab', () => {
    expect(problems('<a href="https://x.com/cueory">x</a>')).toEqual(['<a href=https://x.com> has no rel="noopener"']);
    expect(problems('<a href="https://x.com/cueory" rel="noopener-ish">x</a>')).toHaveLength(1);
  });

  it('refuses third-party scripts, images, styles and frames, even from a link host', () => {
    for (const html of [
      '<script src="https://cdn.example/x.js"></script>',
      '<img src="https://ko-fi.com/img.png">',
      '<img srcset="/a.png 1x, https://cdn.example/b.png 2x">',
      '<link rel="stylesheet" href="https://fonts.example/css">',
      '<iframe src="https://www.youtube.com/embed/x"></iframe>',
      '<video poster="https://cdn.example/p.jpg"></video>',
    ]) {
      expect(problems(html), html).toHaveLength(1);
    }
  });
});

describe('site config only names allowed hosts', () => {
  it('socials, tip page, site address, newsletter form and landing page', () => {
    const urls = [site.url, site.tipPageUrl, ...socials.map((social) => social.href), newsletter.formAction, newsletter.landingUrl]
      .filter(Boolean);
    for (const url of urls) expect(linkHosts, url).toContain(new URL(url).hostname);
  });
});

describe('built pages: external links and resources', () => {
  const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
  const htmlFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });

  it('go only to allowed hosts, over https, with noopener on every external link', () => {
    expect(existsSync(dist), 'dist is missing: run npm run build first').toBe(true);
    const pages = htmlFiles(dist);
    expect(pages.length).toBeGreaterThan(10);
    const findings = pages.flatMap((file) =>
      checkPage(readFileSync(file, 'utf8')).map((finding) => `${relative(dist, file)} @${finding.at}: ${finding.problem}`));
    expect(findings).toEqual([]);
  });
});
