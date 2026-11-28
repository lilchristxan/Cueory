import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dist } from './perf-scan';

describe('home hero logo loading (performance, 2026-11-19)', () => {
  it('Home has one full logo in two palettes, with both images lazy so its hidden palette stays unloaded', () => {
    const html = readFileSync(`${dist}index.html`, 'utf8');
    const start = html.indexOf('home-brand justify-self-center');
    expect(start, 'home brand link').toBeGreaterThan(-1);
    const row = html.slice(start, html.indexOf('</a>', start));
    const logos = [...row.matchAll(/<img\b[^>]*>/g)].map(([tag]) => ({
      src: /\ssrc="([^"]+)"/.exec(tag)![1]!,
      loading: /\sloading="([^"]+)"/.exec(tag)?.[1],
    }));
    expect(logos).toHaveLength(2);
    expect(logos.some(logo => logo.src.includes('/emblem-'))).toBe(false);
    expect(logos.filter((logo) => logo.src.includes('/logo-full-')).map((logo) => logo.loading)).toEqual(['lazy', 'lazy']);
  });
});
