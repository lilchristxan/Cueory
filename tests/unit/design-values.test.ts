import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = resolve('src');

function sourceFiles(folder = src): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(astro|tsx|ts|css)$/.test(entry.name) && !path.endsWith('src/styles/tokens.css')) files.push(path);
  }
  return files;
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function lineNumber(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

describe('design values stay token based (Task 197)', () => {
  const files = sourceFiles();

  it('has a non-empty source inventory outside the token definition', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('does not introduce raw colors or composited numeric colors', () => {
    const findings: string[] = [];
    for (const file of files) {
      const relativePath = relative(resolve('.'), file);
      const source = withoutComments(readFileSync(file, 'utf8'));
      for (const match of source.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
        // Layout's two theme-color metadata values are a browser API contract, not component styling.
        const allowedThemeColor = relativePath === 'src/layouts/Layout.astro' &&
          (match[0]!.toLowerCase() === '#f9f5ef' || match[0]!.toLowerCase() === '#1c1917');
        if (!allowedThemeColor) findings.push(`${relativePath}:${lineNumber(source, match.index!)} raw hex ${match[0]}`);
      }
      for (const match of source.matchAll(/\b(?:rgb|hsl)\(\s*\d/gi)) {
        findings.push(`${relativePath}:${lineNumber(source, match.index!)} numeric ${match[0]}`);
      }
    }
    expect(findings).toEqual([]);
  });

  it('keeps font families in CSS declarations token based outside font-face definitions', () => {
    const findings: string[] = [];
    for (const file of files.filter((path) => path.endsWith('.css'))) {
      const relativePath = relative(resolve('.'), file);
      const source = withoutComments(readFileSync(file, 'utf8'));
      const fontFaces = [...source.matchAll(/@font-face\s*\{[^}]*\}/g)].map((match) => [match.index!, match.index! + match[0].length]);
      for (const match of source.matchAll(/font-family\s*:\s*([^;]+);/g)) {
        const insideFontFace = fontFaces.some(([start, end]) => match.index! >= start && match.index! < end);
        if (!insideFontFace && !match[1]!.includes('var(')) findings.push(`${relativePath}:${lineNumber(source, match.index!)} ${match[1]!.trim()}`);
      }
    }
    expect(findings).toEqual([]);
  });

  it('does not put raw px or rem values in class strings or CSS layout declarations', () => {
    const findings: string[] = [];
    for (const file of files) {
      const relativePath = relative(resolve('.'), file);
      const source = withoutComments(readFileSync(file, 'utf8'));
      for (const match of source.matchAll(/\bclass(?:Name)?\s*=\s*["'`]([^"'`]*?(?:\d+(?:\.\d+)?(?:px|rem)|\[[^\]]*(?:px|rem))[^"'`]*)["'`]/gi)) {
        findings.push(`${relativePath}:${lineNumber(source, match.index!)} class ${match[1]}`);
      }
      if (!file.endsWith('.css')) continue;
      for (const match of source.matchAll(/^\s*([\w-]+)\s*:\s*([^;{}]+);/gm)) {
        if (match[1]!.startsWith('--') || !/\b(?:px|rem)\b/i.test(match[2]!)) continue;
        findings.push(`${relativePath}:${lineNumber(source, match.index!)} ${match[1]}: ${match[2].trim()}`);
      }
    }
    expect(findings).toEqual([]);
  });
});
