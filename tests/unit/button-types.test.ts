import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A <button> with no type submits the form around it, so a stray "show hint" button inside a form would send it.
 * Every button says what it is: type="button", or type="submit" only when it really sends a form (inside a <form>).
 * Lint-style: reads the source in src/ (Astro pages and components, React islands, page scripts).
 */
const root = fileURLToPath(new URL('../../', import.meta.url));

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p, ext);
    return ext.test(p) ? [p] : [];
  });
}

const markupFiles = files(join(root, 'src'), /\.(astro|tsx)$/);
const scriptFiles = files(join(root, 'src'), /\.(astro|tsx|ts)$/);
const lineOf = (s: string, i: number) => s.slice(0, i).split('\n').length;
const where = (f: string, s: string, i: number) => `${relative(root, f)}:${lineOf(s, i)}`;

const quotedValue = /"[^"]*"|'[^']*'/.source;
const expressionText = /[^{}"'`]|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/.source;
const expression = String.raw`\{(?:${expressionText}|\{(?:${expressionText})*\})*\}`;
const buttonTag = new RegExp(String.raw`<button(?=\s|/?>)((?:${quotedValue}|${expression}|[^>"'{])*)>`, 'g');
const attribute = new RegExp(
  String.raw`\s+(?:([^\s="'{}<>/]+)(?:\s*=\s*(${quotedValue}|${expression}|[^\s"'{}<>]+))?|${expression})`,
  'gy',
);

function buttonType(attrs: string) {
  // Consume whole attribute values, so text inside quotes, expressions or another attribute cannot supply a type.
  const value = [...attrs.matchAll(attribute)].find(([, name]) => name === 'type')?.[2];
  if (!value) return undefined;
  const literal = value.startsWith('{') ? value.slice(1, -1).trim() : value;
  return /^(["'])(button|submit|reset)\1$/.exec(literal)?.[2];
}

function buttonTags(source: string) {
  return [...source.matchAll(buttonTag)].map((m) => ({ type: buttonType(m[1]), index: m.index }));
}

function submitButtonsOutsideForm(source: string) {
  return buttonTags(source).filter(({ type, index }) => {
    if (type !== 'submit') return false;
    const before = source.slice(0, index);
    const open = (before.match(/<form\b/g) ?? []).length;
    const close = (before.match(/<\/form>/g) ?? []).length;
    return open <= close;
  });
}

describe('button type guard fixtures', () => {
  it.each([
    '<button data-type="button">',
    '<button aria-label=\'use type="button"\'>',
    '<button {...{ type: "button" }}>',
    '<button type={undefined}>',
    '<button type={ready ? "button" : undefined}>',
    '<button type={"other"}>',
  ])('rejects a missing or unrecognized standalone type in %s', (source) => {
    expect(buttonTags(source).map(({ type }) => type)).toEqual([undefined]);
  });

  it('recognizes quoted and brace-wrapped literal types after other attributes', () => {
    const source = '<button aria-label="show > details" type = \'button\'>'
      + '<button data-type="button" type={ "submit" }><button type={"reset"}>';
    expect(buttonTags(source).map(({ type }) => type)).toEqual(['button', 'submit', 'reset']);
  });

  it('checks the parsed submit type against its enclosing form', () => {
    const submit = '<button type={"submit"}>send</button>';
    expect(submitButtonsOutsideForm(submit)).toHaveLength(1);
    expect(submitButtonsOutsideForm(`<form>${submit}</form>`)).toEqual([]);
    expect(submitButtonsOutsideForm('<button data-type="submit" type="button">skip</button>')).toEqual([]);
  });
});

describe('button types', () => {
  it('finds buttons to check', () => {
    expect(markupFiles.flatMap((f) => buttonTags(readFileSync(f, 'utf8'))).length).toBeGreaterThan(50);
  });

  it('every <button> has an explicit type of button, submit or reset', () => {
    const bad = markupFiles.flatMap((f) => {
      const s = readFileSync(f, 'utf8');
      return buttonTags(s)
        .filter((b) => b.type === undefined)
        .map((b) => where(f, s, b.index));
    });
    expect(bad, `buttons without type="button" (or "submit" in a form):\n${bad.join('\n')}`).toEqual([]);
  });

  it('a type="submit" button sits inside a <form> in the same file', () => {
    const bad = markupFiles.flatMap((f) => {
      const s = readFileSync(f, 'utf8');
      return submitButtonsOutsideForm(s).map((b) => where(f, s, b.index));
    });
    expect(bad, `submit buttons outside a <form>:\n${bad.join('\n')}`).toEqual([]);
  });

  it('a button made in script sets its type', () => {
    const bad = scriptFiles.flatMap((f) => {
      const s = readFileSync(f, 'utf8');
      return [...s.matchAll(/const (\w+) = document\.createElement\(['"]button['"]\)/g)]
        .filter((m) => !new RegExp(`\\b${m[1]}\\.type = ['"](button|submit)['"]`).test(s.slice(m.index, m.index + 600)))
        .map((m) => where(f, s, m.index));
    });
    expect(bad, `scripted buttons without a type:\n${bad.join('\n')}`).toEqual([]);
  });
});
