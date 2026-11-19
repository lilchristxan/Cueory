import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..', 'src');
const files: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(tsx|astro)$/.test(path)) files.push(path);
  }
})(join(root, 'islands'));
(function walk(dir: string) {
  for (const name of readdirSync(dir)) if (name.endsWith('.astro')) files.push(join(dir, name));
})(join(root, 'components'));

const read = (path: string) => readFileSync(path, 'utf8');
const tag = /<(div|span|li|p|section|article|svg|g|img|td|tr|label|ul)\b((?:[^<>{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)>/g;

describe('keyboard access (source guard)', () => {
  it('no non-interactive element carries a pointer handler without a keyboard route', () => {
    const bad: string[] = [];
    for (const file of files) {
      const text = read(file);
      for (const m of text.matchAll(tag)) {
        const attrs = m[2] ?? '';
        if (!/\bon(Click|PointerDown|PointerUp|MouseDown|TouchStart)\s*=/.test(attrs)) continue;
        // A backdrop that only dismisses with the pointer is fine when the dialog also closes on Escape.
        if (/event\.target === event\.currentTarget/.test(attrs)) continue;
        if (/role=/.test(attrs) && /tabIndex/.test(attrs) && /onKey/.test(attrs)) continue;
        bad.push(`${file.slice(root.length)}:${text.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('no positive tabIndex anywhere', () => {
    const bad = files.filter((file) => /tabIndex=\{?["']?[1-9]|tabindex="[1-9]/.test(read(file)));
    expect(bad).toEqual([]);
  });

  it('the cueword help warning dialog closes on Escape', () => {
    const text = read(join(root, 'islands', 'CuewordGame.tsx'));
    const m = text.match(/role="alertdialog"[\s\S]*?crossword-warning"[\s\S]*?cancelHelp\(\)/);
    expect(m?.[0]).toMatch(/onKeyDown=[\s\S]*'Escape'[\s\S]*cancelHelp\(\)/);
  });
});
