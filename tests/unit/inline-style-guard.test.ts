import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Brand rule: no inline style="" (the CSP also blocks it). Templates must use token classes. React `style={...}` objects go
// through the CSSOM, which the CSP allows, but are only for values computed at runtime. Each use is listed with a reason.
const src = new URL('../../src/', import.meta.url);
const files = readdirSync(src, { recursive: true, encoding: 'utf8' })
  .map((file) => file.replaceAll('\\', '/'))
  .filter((file) => /\.(astro|tsx|ts)$/.test(file));

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[ \t])\/\/[^\n]*/gm, (c) => c.replace(/[^\n]/g, ' '));

const countJsxStyles = (source: string) => (strip(source).match(/\bstyle\s*=\s*\{/g) ?? []).length;

// path -> [expected count of JSX style props, reason]
const jsxStyleAllowlist: Record<string, [number, string]> = {
  'islands/PulseGame.tsx': [1, 'sets only the --pillo-share custom property, which the stylesheet turns into a bar length'],
  'islands/LabelItBoard.tsx': [1, 'label boxes are positioned from submitted image percentages at runtime'],
  'islands/AnatomyLab.tsx': [1, 'bulk-download preview boxes are positioned from measured pixel geometry at runtime'],
  'islands/ShareSheet.tsx': [1, 'false positive: `style` is a card-option prop naming a share style, not CSS'],
};

describe('inline style guard', () => {
  it('has no style="" or style=\'\' attribute in templates or markup strings', () => {
    const hits: string[] = [];
    for (const file of files) {
      strip(readFileSync(new URL(file, src), 'utf8')).split('\n').forEach((line, i) => {
        if (/\bstyle\s*=\s*["']/.test(line)) hits.push(`${file}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it('counts inline JSX style props even with spaces or line breaks around the equals sign', () => {
    expect(countJsxStyles('<div style={{ display: "none" }} />')).toBe(1);
    expect(countJsxStyles('<div style = {{ display: "none" }} />')).toBe(1);
    expect(countJsxStyles('<div style\n=\n{{ display: "none" }} />')).toBe(1);
  });

  it('limits JSX style={...} objects to the documented runtime-geometry list', () => {
    const found: Record<string, number> = {};
    for (const file of files) {
      const count = countJsxStyles(readFileSync(new URL(file, src), 'utf8'));
      if (count) found[file] = count;
    }
    expect(found).toEqual(Object.fromEntries(Object.entries(jsxStyleAllowlist).map(([file, [count]]) => [file, count])));
    for (const [, reason] of Object.values(jsxStyleAllowlist)) expect(reason.length).toBeGreaterThan(0);
  });
});
