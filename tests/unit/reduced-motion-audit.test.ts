import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Reduced-motion audit. Every script-driven motion (Web Animations, smooth scrolling) and every stylesheet animation
 * outside the two global files must be guarded where it runs, not merely in the same file, and the global fallbacks
 * must stay.
 *
 * A script call counts as guarded only when a reduced-motion condition steers it: the call line itself reads the
 * preference, or an `if` on the preference encloses it, or an earlier `if` at its own level on the preference returns
 * before it, all inside the same function. Declaring the media query is not a guard; the result must be checked.
 * A stylesheet animation counts only inside `prefers-reduced-motion: no-preference`, or when a `reduce` block has a
 * rule for the same selector (or `*`) that switches that animation off or ends it at once.
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
const REDUCED_WORDS = 'prefers-reduced-motion|reducedMotion|motion-reduce|motion-safe';
const FUNCTION_OPEN = /(=>\s*\{|\bfunction\b[^{]*\{)\s*$/;
const ANIMATE_CALL = /\.animate\(/;
const SMOOTH = /['"]smooth['"]/;
const MEDIA_QUERY_VARIABLE = /\b(?:const|let|var)\s+(\w+)\s*=[^;\n]*prefers-reduced-motion/g;

/** Matches any condition that reads the preference: the keywords, or the result of a query declared in this file. */
function signalFor(text: string): RegExp {
  const names = [...text.matchAll(MEDIA_QUERY_VARIABLE)].map((match) => match[1]!);
  const results = names.length ? `|\\b(?:${names.join('|')})\\??\\.matches\\b` : '';
  return new RegExp(`${REDUCED_WORDS}${results}`);
}

/** The code on a line, without comment lines or a trailing line comment. */
function codeOf(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return '';
  return line.replace(/\s\/\/.*$/, '');
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/** For a line holding `if (...)`, the condition and whatever follows it on the line; otherwise null. */
function splitIf(code: string): { condition: string; rest: string } | null {
  const open = /\bif\s*\(/.exec(code);
  if (!open) return null;
  const start = open.index + open[0].length;
  let depth = 1;
  let end = start;
  while (end < code.length && depth > 0) {
    if (code[end] === '(') depth += 1;
    else if (code[end] === ')') depth -= 1;
    end += 1;
  }
  return depth === 0 ? { condition: code.slice(start, end - 1), rest: code.slice(end) } : null;
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
 * True when a reduced-motion condition steers the call on line `at` inside its function: the line itself reads the
 * preference, an enclosing `if` tests it, or an earlier `if` at the call's level tests it and returns.
 */
function guardedAt(lines: string[], at: number, signal: RegExp): boolean {
  if (signal.test(codeOf(lines[at]!))) return true;
  let limit = indentOf(lines[at]!);
  for (let i = at - 1; i >= 0; i -= 1) {
    const code = codeOf(lines[i]!);
    if (!code.trim()) continue;
    const indent = indentOf(code);
    if (indent > limit) continue;
    const check = splitIf(code);
    const reads = check !== null && signal.test(check.condition);
    if (indent < limit) {
      if (FUNCTION_OPEN.test(code.trimEnd())) return false;
      limit = indent;
      if (reads) return true;
      continue;
    }
    if (reads && (/\breturn\b/.test(check!.rest) || (code.trimEnd().endsWith('{') && exitsEarly(lines, i, at)))) return true;
  }
  return false;
}

/** 1-based lines holding a script animation or smooth scroll that no reduced-motion condition guards. */
function unguardedScriptLines(text: string): number[] {
  const lines = text.split(/\r?\n/);
  const signal = signalFor(text);
  const found: number[] = [];
  lines.forEach((line, index) => {
    const code = codeOf(line);
    if ((ANIMATE_CALL.test(code) || SMOOTH.test(code)) && !guardedAt(lines, index, signal)) found.push(index + 1);
  });
  return found;
}

interface Rule {
  header: string;
  decls: string;
  context: string[];
  line: number;
}

/** Every block in a stylesheet (or the style part of an .astro file), with the declarations written directly in it. */
function parseRules(source: string): Rule[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const rules: Rule[] = [];
  const stack: Array<{ header: string; decls: string; line: number }> = [];
  let buffer = '';
  let line = 1;
  for (const char of text) {
    if (char === '\n') line += 1;
    if (char === '{') {
      stack.push({ header: buffer.trim().replace(/\s+/g, ' '), decls: '', line });
      buffer = '';
    } else if (char === '}') {
      const top = stack.pop();
      if (top) rules.push({ header: top.header, decls: `${top.decls}${buffer}`, context: stack.map((block) => block.header), line: top.line });
      buffer = '';
    } else if (char === ';') {
      const top = stack[stack.length - 1];
      if (top) top.decls += `${buffer};`;
      buffer = '';
    } else {
      buffer += char;
    }
  }
  return rules;
}

const selectorsOf = (header: string) => header.split(',').map((selector) => selector.trim()).filter(Boolean);
const NO_PREFERENCE = /prefers-reduced-motion:\s*no-preference/;
const REDUCE = /prefers-reduced-motion:\s*reduce/;
const MOTION_KINDS = [
  { on: /\banimation(?:-name)?\s*:\s*(?!none)[a-z]/, off: /\banimation(?:-name)?\s*:\s*none\b|\banimation-duration\s*:\s*(?:0|0?\.0*1)m?s\b/ },
  { on: /\bscroll-behavior\s*:\s*smooth\b/, off: /\bscroll-behavior\s*:\s*auto\b/ },
];

/**
 * 1-based lines of stylesheet rules with an animation or smooth scroll that sits outside `no-preference` and has no
 * rule in a `reduce` block, for the same selector or `*`, that switches that motion off.
 */
function unguardedStyleLines(source: string): number[] {
  const rules = parseRules(source);
  const overrides = rules.filter((rule) => rule.context.some((header) => REDUCE.test(header)));
  const found: number[] = [];
  for (const rule of rules) {
    if (rule.context.some((header) => NO_PREFERENCE.test(header) || REDUCE.test(header))) continue;
    for (const kind of MOTION_KINDS) {
      if (!kind.on.test(rule.decls)) continue;
      const covered = selectorsOf(rule.header).every((selector) =>
        overrides.some((override) => kind.off.test(override.decls) && selectorsOf(override.header).some((s) => s === selector || s === '*')),
      );
      if (!covered) found.push(rule.line);
    }
  }
  return found;
}

const GLOBAL_FALLBACKS = [
  'animation-duration: 0.01ms !important',
  'animation-iteration-count: 1 !important',
  'transition-duration: 0.01ms !important',
  'scroll-behavior: auto !important',
];

/** Returns the global reduced-motion declarations missing from the universal reduce rule in global.css. */
function missingGlobalFallbacks(css: string) {
  const rule = /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after \{([^}]*)\}/.exec(css)?.[1];
  if (rule === undefined) return ['the universal reduce rule'];
  return GLOBAL_FALLBACKS.filter((declaration) => !rule.includes(declaration));
}

describe('reduced motion audit', () => {
  it('keeps the global fallbacks', () => {
    const global = files.find((f) => f.name === 'styles/global.css')!.text;
    expect(missingGlobalFallbacks(global)).toEqual([]);
    const none = files.find((f) => f.name === 'styles/reduced-motion.css')!.text;
    expect(none).toContain('transition-property: none !important');
  });

  it('notices when a global animation fallback is deleted from the real global.css', () => {
    const global = files.find((f) => f.name === 'styles/global.css')!.text;
    for (const declaration of GLOBAL_FALLBACKS) {
      expect(global).toContain(declaration);
      expect(missingGlobalFallbacks(global.replace(declaration, ''))).toEqual([declaration]);
    }
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
  const query = "  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');";

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

  it('accepts a media query whose result returns early', () => {
    const text = lines('function shake(el) {', query, '  if (motion?.matches) return;', '  el.animate(a, b);', '}');
    expect(unguardedScriptLines(text)).toEqual([]);
  });

  it('rejects a media query that is declared but never checked', () => {
    const text = lines('function shake(el) {', query, '  el.animate(a, b);', '}');
    expect(unguardedScriptLines(text)).toEqual([3]);
  });

  it('rejects a media query result that is read but does not stop the motion', () => {
    const text = lines('function shake(el) {', query, '  if (motion.matches) console.log("reduced");', '  el.animate(a, b);', '}');
    expect(unguardedScriptLines(text)).toEqual([4]);
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

  it('rejects a reduced-motion block that does not return before the call', () => {
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

  it('accepts a stylesheet animation only inside no-preference or beside a matching reduce override', () => {
    const spin = '.a {\n  animation: spin 1s infinite;\n}';
    expect(unguardedStyleLines(spin)).toEqual([1]);
    expect(unguardedStyleLines(`@media (prefers-reduced-motion: no-preference) {\n${spin}\n}`)).toEqual([]);
    expect(unguardedStyleLines(`${spin}\n@media (prefers-reduced-motion: reduce) {\n  .a {\n    animation: none;\n  }\n}`)).toEqual([]);
    expect(unguardedStyleLines(`${spin}\n@media (prefers-reduced-motion: reduce) {\n  * {\n    animation-duration: 0.01ms !important;\n  }\n}`)).toEqual([]);
  });

  it('rejects a reduce override that targets another selector or does not switch the animation off', () => {
    const spin = '.a {\n  animation: spin 1s infinite;\n}';
    expect(unguardedStyleLines(`${spin}\n@media (prefers-reduced-motion: reduce) {\n  .b {\n    animation: none;\n  }\n}`)).toEqual([1]);
    expect(unguardedStyleLines(`${spin}\n@media (prefers-reduced-motion: reduce) {\n  .a {\n    animation-duration: 60s;\n  }\n}`)).toEqual([1]);
    expect(unguardedStyleLines(`${spin}\n@media (prefers-reduced-motion: reduce) {\n  .a {\n    color: red;\n  }\n}`)).toEqual([1]);
  });

  it('needs scroll-behavior auto, not an animation override, for smooth scrolling in a stylesheet', () => {
    const smooth = 'html {\n  scroll-behavior: smooth;\n}';
    expect(unguardedStyleLines(`${smooth}\n@media (prefers-reduced-motion: reduce) {\n  html {\n    animation: none;\n  }\n}`)).toEqual([1]);
    expect(unguardedStyleLines(`${smooth}\n@media (prefers-reduced-motion: reduce) {\n  html {\n    scroll-behavior: auto;\n  }\n}`)).toEqual([]);
  });

  describe('against the real sources', () => {
    const source = (name: string) => files.find((f) => f.name === name)!.text;
    const without = (name: string, guard: RegExp) => {
      const text = source(name);
      expect(text, `${name} no longer has the guard this regression test removes; update the test`).toMatch(guard);
      return text.replace(guard, '');
    };

    it.each([
      ['islands/SutureGame.tsx', /^[ \t]*if \(motion\?\.matches\) return;\r?\n/m],
      ['islands/MatchingBoard.tsx', /^[ \t]*if \(motion\.matches\) return;\r?\n/m],
      ['islands/OrganizerBoard.tsx', /^[ \t]*if \(motion\.matches\) return;\r?\n/m],
    ])('catches the media query result no longer being checked in %s', (name, guard) => {
      expect(unguardedScriptLines(source(name))).toEqual([]);
      expect(unguardedScriptLines(without(name, guard)).length).toBeGreaterThanOrEqual(1);
    });

    it('catches the reduce override being removed from pillo.css', () => {
      expect(unguardedStyleLines(source('styles/pillo.css'))).toEqual([]);
      const override = /@media \(prefers-reduced-motion: reduce\) \{\s*\.pillo-pill\.pillo-typed \{\s*animation: none;\s*transition: none;\s*\}\s*\}/;
      expect(unguardedStyleLines(without('styles/pillo.css', override))).not.toEqual([]);
    });
  });
});
