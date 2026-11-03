import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve('src');
const sourceExtensions = new Set(['.astro', '.css', '.ts', '.tsx']);

// Deliberate console output belongs here with a file, line, and reason. The current
// source has no approved console.log or console.debug calls.
const allowed: Record<string, string> = {};

function sourceFiles(folder: string): string[] {
  return readdirSync(folder).flatMap(name => {
    const file = join(folder, name);
    if (statSync(file).isDirectory()) return sourceFiles(file);
    return sourceExtensions.has(file.slice(file.lastIndexOf('.'))) ? [file] : [];
  });
}

function unexpectedConsoleCalls(): string[] {
  const calls: string[] = [];
  const pattern = /\bconsole\.(?:log|debug)\s*\(/g;
  for (const file of sourceFiles(sourceRoot)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (!pattern.test(line)) return;
      pattern.lastIndex = 0;
      const location = `${relative(process.cwd(), file)}:${index + 1}`;
      if (!allowed[location]) calls.push(location);
    });
  }
  return calls;
}

describe('source console policy', () => {
  it('has no unapproved console.log or console.debug calls', () => {
    expect(unexpectedConsoleCalls()).toEqual([]);
  });
});
