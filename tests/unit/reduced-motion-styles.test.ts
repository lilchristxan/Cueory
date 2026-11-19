import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Every animation and transition in src/styles respects prefers-reduced-motion (CLAUDE.md rule 6). The site does it
 * with one reset, in @layer base so its !important beats every later layer and unlayered rule: under "reduce" nothing
 * transitions, animations run once in 0.01ms, nothing waits on a delay, and scrolling jumps. This test keeps that reset
 * whole, keeps it loaded on every page, and checks no stylesheet adds motion under "reduce" or forces motion past it.
 */
const dir = new URL('../../src/styles/', import.meta.url);
const sheets = readdirSync(dir)
  .filter((f) => f.endsWith('.css'))
  .map((name) => ({ name, css: readFileSync(new URL(name, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }));

interface Block { prelude: string; body: string; context: string[] }

/** Every { } block with the chain of at-rules around it. Good enough for our own hand-written CSS. */
function blocks(css: string, context: string[] = []): Block[] {
  const out: Block[] = [];
  let i = 0;
  let start = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === ';' ) start = i + 1;
    if (ch === '}') start = i + 1;
    if (ch === '{') {
      const prelude = css.slice(start, i).trim();
      let depth = 1;
      let j = i + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      const body = css.slice(i + 1, j - 1);
      if (prelude.startsWith('@')) out.push(...blocks(body, [...context, prelude]));
      else {
        out.push({ prelude, body, context });
        // CSS nesting: rules inside rules.
        if (body.includes('{')) out.push(...blocks(body, [...context, prelude]));
      }
      i = j;
      start = j;
      continue;
    }
    i++;
  }
  return out;
}

/** Declarations directly in a block (not in nested blocks). */
function declarations(body: string): [string, string][] {
  let flat = '';
  let depth = 0;
  for (const ch of body) {
    if (ch === '{') depth++;
    if (depth === 0) flat += ch;
    if (ch === '}') depth--;
  }
  return flat
    .split(';')
    .map((d) => d.split(':'))
    .filter((p) => p.length >= 2)
    .map(([prop, ...value]) => [prop.trim().toLowerCase(), value.join(':').trim()]);
}

const reduce = (b: Block) => b.context.some((c) => /prefers-reduced-motion:\s*reduce/.test(c));
const motionProp = /^(animation|transition)(-|$)/;

describe('reduced motion in src/styles', () => {
  const reset = blocks(sheets.map((s) => s.css).join('\n')).filter(
    (b) => reduce(b) && b.context.includes('@layer base') && /^\*\s*,\s*\*::before\s*,\s*\*::after$/.test(b.prelude),
  );
  const resetDecls = new Map(reset.flatMap((b) => declarations(b.body)));

  it.each([
    ['animation-duration', /^0\.01ms !important$/],
    ['animation-iteration-count', /^1 !important$/],
    ['animation-delay', /^0s? !important$/],
    ['transition-duration', /^0\.01ms !important$/],
    ['transition-property', /^none !important$/],
    ['transition-delay', /^0s? !important$/],
    ['scroll-behavior', /^auto !important$/],
  ])('the base-layer reset sets %s', (prop, value) => {
    expect(resetDecls.get(prop)).toMatch(value);
  });

  it('the reset is in stylesheets every page loads', () => {
    const layout = readFileSync(new URL('../../src/layouts/Layout.astro', import.meta.url), 'utf8');
    for (const file of ['global.css', 'reduced-motion.css']) expect(layout).toContain(`../styles/${file}`);
  });

  it.each(sheets.map((s) => [s.name, s.css]))('%s adds no motion under reduced motion', (_name, css) => {
    const bad = blocks(css)
      .filter(reduce)
      .flatMap((b) => declarations(b.body).map(([p, v]) => ({ b, p, v })))
      .filter(({ p, v }) => motionProp.test(p) && !/^(none|0s?|0\.01ms|1|auto|initial|unset)(\s*!important)?$/.test(v))
      .map(({ b, p, v }) => `${b.prelude} { ${p}: ${v} }`);
    expect(bad).toEqual([]);
  });

  it.each(sheets.map((s) => [s.name, s.css]))('%s never forces motion with !important outside the reset', (_name, css) => {
    const bad = blocks(css)
      .filter((b) => !reduce(b))
      .flatMap((b) => declarations(b.body).map(([p, v]) => ({ b, p, v })))
      // A rule that turns motion down (the games' own "reduce motion" setting) may use !important; one that adds motion may not.
      .filter(({ p, v }) => motionProp.test(p) && /!important/.test(v) && !/^(none|0s?|0\.01ms|1|auto)\s*!important$/.test(v))
      .map(({ b, p, v }) => `${b.prelude} { ${p}: ${v} }`);
    expect(bad).toEqual([]);
  });
});
