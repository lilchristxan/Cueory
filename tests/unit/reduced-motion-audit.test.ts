import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Reduced-motion audit. Every script-driven motion (Web Animations, smooth scrolling) and every stylesheet animation
 * outside the two global files must be guarded where it runs, not merely in the same file, and the global fallbacks
 * must stay. A script call counts as guarded only when a reduced-motion check sits on its own line, earlier at its own
 * nesting level, or in a block that encloses it, inside the same function. A stylesheet animation counts only inside
 * `prefers-reduced-motion: no-preference`, or when the file also has a `reduce` block that switches animation off.
 */
const root = resolve('src');
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(astro|tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}
const files = walk(root).map((path) => ({ name: relative(root, path), text: readFileSync(path, 'utf8') }));
const REDUCED = /prefers-reduced-motion|reducedMotion|motion-reduce|motion-safe/;
const FUNCTION_OPEN = /(=>\s*\{|\bfunction\b[^{]*\{)\s*$/;
const ANIMATE_CALL = /\.animate\(/;
const SMOOTH = /['"]smooth['"]/;
const CSS_ANIMATION = /\banimation(?:-name)?\s*:\s*(?!none)[a-z]/g;
const CSS_SMOOTH = /scroll-behavior\s*:\s*smooth/g;

/** The code on a line, without comment lines or a trailing line comment. */
function codeOf(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return '';
  return line.replace(/\s\/\/.*$/, '');
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/** True when the block opened on line `start` returns before line `end`, so code after it only runs without that condition. */
function exitsEarly(lines: string[], start: number, end: number): boolean {
  const base = indentOf(lines[start]!);
  for (let i = start + 1; i < end; i += 1) {
    const code = codeOf(lines[i]!);
    if (!code.trim()) continue;
    if (indentOf(code) <= base) return false;
    if (/\breturn\b/.test(code)) return true;
  }
  return false;
}

/**
 * True when a reduced-motion check guards the call on line `at`: on that line, in a block that encloses it, or earlier
 * at its own level as a statement or as a block that returns, without leaving the function the call sits in.
 */
function guardedAt(lines: string[], at: number): boolean {
  if (REDUCED.test(codeOf(lines[at]!))) return true;
  let limit = indentOf(lines[at]!);
  for (let i = at - 1; i >= 0; i -= 1) {
    const code = codeOf(lines[i]!);
    if (!code.trim()) continue;
    const indent = indentOf(code);
    if (indent > limit) continue;
    if (indent < limit) {
      if (FUNCTION_OPEN.test(code.trimEnd())) return false;
      limit = indent;
      if (REDUCED.test(code)) return true;
      continue;
    }
    if (REDUCED.test(code) && (!code.trimEnd().endsWith('{') || exitsEarly(lines, i, at))) return true;
  }
  return false;
}

/** 1-based lines holding a script animation or smooth scroll that no reduced-motion check guards. */
function unguardedScriptLines(text: string): number[] {
  const lines = text.split(/\r?\n/);
  const found: number[] = [];
  lines.forEach((line, index) => {
    const code = codeOf(line);
    if ((ANIMATE_CALL.test(code) || SMOOTH.test(code)) && !guardedAt(lines, index)) found.push(index + 1);
  });
  return found;
}

/** The headers of every block that is open at `at`, outermost first. */
function openHeaders(text: string, at: number): string[] {
  const stack: string[] = [];
  let header = '';
  for (let i = 0; i < at; i += 1) {
    const char = text[i]!;
    if (char === '{') {
      stack.push(header);
      header = '';
    } else if (char === '}') {
      stack.pop();
      header = '';
    } else if (char === ';') {
      header = '';
    } else {
      header += char;
    }
  }
  return stack;
}

/** True when the file has a `reduce` block that turns animation off or ends it at once. */
function hasReduceOverride(text: string): boolean {
  for (const open of text.matchAll(/@media[^{]*prefers-reduced-motion:\s*reduce[^{]*\{/g)) {
    let depth = 1;
    let end = open.index + open[0].length;
    while (end < text.length && depth > 0) {
      if (text[end] === '{') depth += 1;
      else if (text[end] === '}') depth -= 1;
      end += 1;
    }
    const body = text.slice(open.index + open[0].length, end);
    if (/\banimation(?:-name)?\s*:\s*none|animation-duration|scroll-behavior\s*:\s*auto/.test(body)) return true;
  }
  return false;
}

/** 1-based lines holding a stylesheet animation or smooth scroll with neither a no-preference block nor a reduce override. */
function unguardedStyleLines(source: string): number[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const override = hasReduceOverride(text);
  const found: number[] = [];
  for (const pattern of [CSS_ANIMATION, CSS_SMOOTH]) {
    for (const match of text.matchAll(pattern)) {
      const inNoPreference = openHeaders(text, match.index).some((header) => /prefers-reduced-motion:\s*no-preference/.test(header));
      if (!inNoPreference && !override) found.push(text.slice(0, match.index).split('\n').length);
    }
  }
  return found;
}

describe('reduced motion audit', () => {
  it('keeps the global fallbacks', () => {
    const global = files.find((f) => f.name === 'styles/global.css')!.text;
    expect(global).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after \{[^}]*scroll-behavior: auto !important/);
    const none = files.find((f) => f.name === 'styles/reduced-motion.css')!.text;
    expect(none).toContain('transition-property: none !important');
  });

  it('guards every Web Animations call where it runs', () => {
    const bad = files
      .filter((f) => ANIMATE_CALL.test(f.text))
      .flatMap((f) => unguardedScriptLines(f.text).map((line) => `${f.name}:${line}`));
    expect(bad).toEqual([]);
  });

  it('never asks for smooth scrolling without a reduced-motion check beside it', () => {
    const bad = files
      .filter((f) => SMOOTH.test(f.text))
      .flatMap((f) => unguardedScriptLines(f.text).map((line) => `${f.name}:${line}`));
    expect(bad).toEqual([]);
  });

  it('guards keyframe animations and smooth scrolling declared outside global.css', () => {
    const bad = files
      .filter((f) => f.name !== 'styles/global.css' && /\.(astro|css)$/.test(f.name))
      .flatMap((f) => unguardedStyleLines(f.text).map((line) => `${f.name}:${line}`));
    expect(bad).toEqual([]);
  });

  it('guards looping animations in global.css with a none override', () => {
    const global = files.find((f) => f.name === 'styles/global.css')!.text;
    expect(global).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.modes \.ill \* \{\s*animation: none !important/);
    expect(global).toMatch(/\.modes\[data-motion\]:not\(\[data-paused\]\)/);
  });
});

describe('reduced motion audit detectors', () => {
  const lines = (...rows: string[]) => rows.join('\n');

  it('accepts a bail-out earlier in the same function', () => {
    const text = lines('const open = () => {', '  if (state.reducedMotion) return;', '  panel.animate(a, b);', '};');
    expect(unguardedScriptLines(text)).toEqual([]);
  });

  it('accepts an earlier block that checks reduced motion and returns', () => {
    const text = lines(
      'const close = () => {',
      '  if (state.reducedMotion) {',
      '    dialog.close();',
      '    return;',
      '  }',
      '  panel.animate(a, b);',
      '};',
    );
    expect(unguardedScriptLines(text)).toEqual([]);
  });

  it('accepts a call inside a block that checks reduced motion', () => {
    const text = lines('const step = () => {', '  if (!state.reducedMotion) {', '    panel.animate(a, b);', '  }', '};');
    expect(unguardedScriptLines(text)).toEqual([]);
  });

  it('accepts a matchMedia check with an early return', () => {
    const text = lines(
      'function shake(el) {',
      "  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');",
      '  if (motion.matches) return;',
      '  el.animate(a, b);',
      '}',
    );
    expect(unguardedScriptLines(text)).toEqual([]);
  });

  it('rejects a call whose guard was removed, even when the file still mentions reduced motion elsewhere', () => {
    const text = lines(
      'const apply = () => {',
      '  state.reducedMotion = query.matches;',
      '};',
      'const open = () => {',
      '  takeOver();',
      '  panel.animate(a, b);',
      '};',
    );
    expect(unguardedScriptLines(text)).toEqual([6]);
  });

  it('rejects a guard that lives in a different function', () => {
    const text = lines(
      'const close = () => {',
      '  if (state.reducedMotion) return;',
      '};',
      'const open = () => {',
      '  panel.animate(a, b);',
      '};',
    );
    expect(unguardedScriptLines(text)).toEqual([5]);
  });

  it('rejects a guard that only sits in a comment', () => {
    const text = lines('const open = () => {', '  // honour prefers-reduced-motion', '  panel.animate(a, b);', '};');
    expect(unguardedScriptLines(text)).toEqual([3]);
  });

  it('rejects a guard inside a sibling block that does not enclose the call', () => {
    const text = lines(
      'const open = () => {',
      '  if (state.reducedMotion) {',
      '    dialog.close();',
      '  }',
      '  panel.animate(a, b);',
      '};',
    );
    expect(unguardedScriptLines(text)).toEqual([5]);
  });

  it('rejects a smooth scroll with no check beside it', () => {
    expect(unguardedScriptLines("const go = () => {\n  el.scrollIntoView({ behavior: 'smooth' });\n};")).toEqual([2]);
    expect(unguardedScriptLines("return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';")).toEqual([]);
  });

  it('accepts a stylesheet animation only inside no-preference or beside a reduce override', () => {
    expect(unguardedStyleLines('.a { animation: spin 1s; }')).toEqual([1]);
    expect(unguardedStyleLines('@media (prefers-reduced-motion: no-preference) {\n  .a { animation: spin 1s; }\n}')).toEqual([]);
    expect(unguardedStyleLines('.a { animation: spin 1s; }\n@media (prefers-reduced-motion: reduce) {\n  .a { animation: none; }\n}')).toEqual([]);
    expect(unguardedStyleLines('.a { animation: spin 1s; }\n@media (prefers-reduced-motion: reduce) {\n  .b { color: red; }\n}')).toEqual([1]);
  });

  it('catches the real preview guard being removed from the modes carousel', () => {
    const carousel = files.find((f) => f.name === 'components/ModesCarousel.astro')!.text;
    expect(unguardedScriptLines(carousel)).toEqual([]);
    const guard = /^[ \t]*if \(state\.reducedMotion\) return;\r?\n(?=[ \t]*const to = bottle\.getBoundingClientRect\(\);)/m;
    expect(carousel).toMatch(guard);
    const without = carousel.replace(guard, '');
    expect(unguardedScriptLines(without).length).toBeGreaterThanOrEqual(4);
  });
});
