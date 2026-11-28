import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The exported wordpill sticker and share card draw pills in the board's current colours:
// light green in place, pink elsewhere in the word, white when the letter is not in the word.
const tokens = readFileSync('src/styles/tokens.css', 'utf8');
const declared = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1]?.trim();

describe('wordpill sticker pill colours', () => {
  it('maps the sticker pills to the board tokens', () => {
    expect(declared('--vialo-sticker-here-light')).toBe('var(--wordpill-here-light)');
    expect(declared('--vialo-sticker-here-mid')).toBe('var(--wordpill-here)');
    expect(declared('--vialo-sticker-here-deep')).toBe('var(--wordpill-here-deep)');
    expect(declared('--vialo-sticker-elsewhere-light')).toBe('var(--wordpill-elsewhere-light)');
    expect(declared('--vialo-sticker-elsewhere-mid')).toBe('var(--wordpill-elsewhere)');
    expect(declared('--vialo-sticker-elsewhere-deep')).toBe('var(--wordpill-elsewhere-deep)');
  });
  it('keeps the board colours the sticker follows', () => {
    expect(declared('--wordpill-here')).toBe('#a8d5ba');
    expect(declared('--wordpill-here-light')).toBe('#dff1e6');
    expect(declared('--wordpill-here-deep')).toBe('#8fae8b');
    expect(declared('--wordpill-elsewhere')).toBe('#f4a6c0');
    expect(declared('--wordpill-elsewhere-light')).toBe('#f7c6d4');
    expect(declared('--wordpill-elsewhere-deep')).toBe('#ec8fb0');
  });
  it('no longer uses the old dark green or oxblood pills', () => {
    for (const old of ['rgb(14, 90, 61)', 'rgb(110, 32, 25)', 'rgb(160, 65, 58)', 'rgb(63, 138, 104)']) expect(tokens).not.toContain(old);
  });
});
