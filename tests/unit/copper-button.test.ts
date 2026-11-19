import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');
const rules = [...css.matchAll(/\.copper-button\s*\{([^}]*)\}/g)].map((match) => match[1]);

describe('the shared copper button', () => {
  it('is defined exactly once', () => {
    expect(rules).toHaveLength(1);
  });

  it('uses the copper tokens and full-opacity Charcoal ink, with a 44 px minimum target', () => {
    const rule = rules[0];
    expect(rule).toMatch(/color:\s*var\(--cueory-copper-ink\)/);
    expect(rule).toMatch(/linear-gradient\([^)]*var\(--cueory-copper-start\)[^)]*var\(--cueory-copper-end\)[^)]*var\(--cueory-copper-shine\)\)/);
    expect(rule).toMatch(/min-block-size:\s*var\(--tap-min\)/);
    expect(rule).not.toMatch(/opacity/);
    expect(rule).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
