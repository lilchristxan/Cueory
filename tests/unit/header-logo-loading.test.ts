import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dist } from './perf-scan';

/** The header's home link in a built page, and the loading attribute of each logo picture in it. */
function headerLogos(page: string): { src: string; loading: string | undefined }[] {
  const html = readFileSync(`${dist}${page}`, 'utf8');
  const start = html.indexOf('aria-label="Cueory home"');
  expect(start, `${page}: header home link`).toBeGreaterThan(-1);
  const link = html.slice(start, html.indexOf('</a>', start));
  return [...link.matchAll(/<img\b[^>]*>/g)].map(([tag]) => ({
    src: /\ssrc="([^"]+)"/.exec(tag)![1]!,
    loading: /\sloading="([^"]+)"/.exec(tag)?.[1],
  }));
}

describe('header logo loading (performance, 2026-11-19)', () => {
  it.each(['support.html', 'about.html', 'play.html'])(
    '%s: the phone emblem is eager and the full logo, hidden on phones, is lazy',
    (page) => {
      const logos = headerLogos(page);
      expect(logos.filter((logo) => logo.src.includes('/emblem-')).map((logo) => logo.loading)).toEqual(['eager', 'eager']);
      expect(logos.filter((logo) => logo.src.includes('/logo-full-')).map((logo) => logo.loading)).toEqual(['lazy', 'lazy']);
    },
  );
});
