/**
 * A link that opens a new tab (target="_blank") must not hand the new page control of ours (rel="noopener"), must say
 * so to screen readers, and must show sighted visitors a cue: the ↗ that global.css adds after it, or a cue of its own
 * when it is marked data-new-tab-cue. Checks dist/; run `npm run build` first (CI does). Links React builds only in the
 * browser are checked in src/ too.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = join(root, 'dist');

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p, ext);
    return ext.test(p) ? [p] : [];
  });
}

const said = /\(opens in a new tab\)/i;
const ownCue = (inner: string) => said.test(inner.replace(/<span class="sr-only">[^<]*<\/span>/g, '')) || /<svg\b[^>]*aria-hidden="true"/.test(inner);

const builtLinks = files(dist, /\.html$/).flatMap((file) => {
  const html = readFileSync(file, 'utf8');
  return [...html.matchAll(/<a\b([^>]*\btarget="_blank"[^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    page: relative(dist, file),
    attrs: m[1],
    inner: m[2],
    href: /href="([^"]*)"/.exec(m[1])?.[1] ?? '',
  }));
});

describe('links that open a new tab (built pages)', () => {
  it('finds some', () => {
    expect(builtLinks.length).toBeGreaterThan(5);
  });

  it('every one has rel="noopener"', () => {
    const bad = builtLinks.filter((l) => !/\brel="[^"]*\bnoopener\b/.test(l.attrs)).map((l) => `${l.page}: ${l.href}`);
    expect([...new Set(bad)]).toEqual([]);
  });

  it('every one tells screen readers it opens a new tab', () => {
    const bad = builtLinks
      .filter((l) => !said.test(/aria-label="([^"]*)"/.exec(l.attrs)?.[1] ?? '') && !said.test(l.inner))
      .map((l) => `${l.page}: ${l.href}`);
    expect([...new Set(bad)]).toEqual([]);
  });

  it('a link marked data-new-tab-cue really shows its own cue', () => {
    const bad = builtLinks.filter((l) => /\bdata-new-tab-cue\b/.test(l.attrs) && !ownCue(l.inner)).map((l) => `${l.page}: ${l.href}`);
    expect([...new Set(bad)]).toEqual([]);
  });

  it('the built CSS draws the ↗ after every other one', () => {
    const css = files(join(dist, '_astro'), /\.css$/).map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(css).toMatch(/a\[target=(?:"_blank"|_blank)\]:not\(\[data-new-tab-cue\]\):?:after\{[^}]*content:"(?:\\2197|↗)"/);
  });
});

describe('links that open a new tab (source)', () => {
  it('every target="_blank" in src/ has rel="noopener" and says it opens a new tab', () => {
    const bad = files(join(root, 'src'), /\.(astro|tsx)$/).flatMap((file) => {
      const s = readFileSync(file, 'utf8');
      return [...s.matchAll(/<a\b((?:[^>{]|\{(?:[^{}]|\{[^{}]*\})*\})*)>([\s\S]*?)<\/a>/g)]
        .filter((m) => /target="_blank"/.test(m[1]))
        .filter((m) => !/rel="[^"]*\bnoopener\b/.test(m[1]) || !said.test(m[0]))
        .map((m) => `${relative(root, file)}:${s.slice(0, m.index).split('\n').length}`);
    });
    expect(bad).toEqual([]);
  });
});
