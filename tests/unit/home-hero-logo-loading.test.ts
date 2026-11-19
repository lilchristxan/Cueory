import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dist } from './perf-scan';

describe('home hero logo loading (performance, 2026-11-19)', () => {
  it('the phone emblem is eager and the full logo, hidden on phones, is lazy', () => {
    const html = readFileSync(`${dist}index.html`, 'utf8');
    const start = html.indexOf('ps-(--hero-logo-inset)');
    expect(start, 'hero logo row').toBeGreaterThan(-1);
    const row = html.slice(start, html.indexOf('</div>', start));
    const logos = [...row.matchAll(/<img\b[^>]*>/g)].map(([tag]) => ({
      src: /\ssrc="([^"]+)"/.exec(tag)![1]!,
      loading: /\sloading="([^"]+)"/.exec(tag)?.[1],
    }));
    expect(logos.filter((logo) => logo.src.includes('/emblem-')).map((logo) => logo.loading)).toEqual(['eager', 'eager']);
    expect(logos.filter((logo) => logo.src.includes('/logo-full-')).map((logo) => logo.loading)).toEqual(['lazy', 'lazy']);
  });
});
