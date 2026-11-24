import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A content editor sees these messages when the build rejects a file, so every size, pattern and choice check in
 * src/content.config.ts must say in plain words what is wrong. Zod's default ("Too small: expected string to have >=1
 * characters") does not.
 */
const source = readFileSync(new URL('../../src/content.config.ts', import.meta.url), 'utf8');
const lines = source.split('\n').map((text, i) => ({ text, n: i + 1 }));

describe('content schema messages', () => {
  it.each([
    ['a size check', /\.(min|max)\(\d+\)/],
    ['a regex check', /\.regex\(\/(?:[^/\\]|\\.)+\/\)/],
    ['an enum', /z\.enum\(\[[^\]]*\]\)/],
    ['a literal', /z\.literal\('[^']*'\)/],
    ['a number check', /\.(int|positive|nonnegative)\(\)/],
  ])('has no %s without a message', (_name, bare) => {
    const bad = lines.filter((l) => bare.test(l.text)).map((l) => `line ${l.n}: ${l.text.trim()}`);
    expect(bad).toEqual([]);
  });
});
