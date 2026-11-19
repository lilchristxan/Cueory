import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Source-level guard (complements accessibility-names.test.ts, which reads built HTML): every icon-only control,
// form control and svg picture in the components and islands has an accessible name or is hidden as decoration.
// Same-length blanking keeps line numbers; comments and docs may mention tags like <select>.
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\/|(?<=^|\s)\/\/[^\n]*|<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
const folders = ['src/components', 'src/islands'];
const files = folders.flatMap((dir) =>
  readdirSync(resolve(dir))
    .filter((name) => /\.(astro|tsx)$/.test(name))
    .map((name) => ({ name: join(dir, name), source: stripComments(readFileSync(resolve(dir, name), 'utf8')) })),
);
// An opening tag whose attribute text may hold quoted strings and {braced} expressions.
const TAG = (names: string) =>
  new RegExp(`<(${names})\\b((?:[^>"'{]|"[^"]*"|'[^']*'|\\{(?:[^{}]|\\{[^{}]*\\})*\\})*?)(/?)>`, 'g');
const line = (source: string, index: number) => source.slice(0, index).split('\n').length;

function attributeParts(attributes: string, attribute: string): RegExpExecArray | null {
  return new RegExp(`(?:^|\\s)${attribute}=(?:"([^"]*)"|'([^']*)'|\\{((?:[^{}]|\\{[^{}]*\\})*)\\})`).exec(attributes);
}

// The value of one attribute as source text, so ids compare as the same expression whether written id="x",
// id={`${id}-x`} or id={"x"}.
function attributeValue(attributes: string, attribute: string): string | undefined {
  const found = attributeParts(attributes, attribute);
  return found ? (found[1] ?? found[2] ?? found[3]).trim().replace(/^[`"']|[`"']$/g, '') : undefined;
}

const isNonTextValue = /^(?:null|undefined|true|false)$/;
const readableAttributeValue = (text: string) => !isNonTextValue.test(text) && text.replace(/^[`"']|[`"']$/g, '').trim() !== '';
const readableChildValue = (text: string) => !isNonTextValue.test(text) && /[A-Za-z0-9]/.test(text);

/**
 * Whether the attributes name the element. A statically empty value (aria-label="", aria-label={''}, title=" ") is
 * not a name; a spread or a value this walk cannot read counts, since it cannot be judged from source.
 */
function hasNamingAttribute(attributes: string, names = ['aria-label', 'aria-labelledby', 'title']): boolean {
  if (/\{\.\.\./.test(attributes)) return true;
  return names.some((name) => {
    if (!new RegExp(`(?:^|\\s)${name}=`).test(attributes)) return false;
    const parts = attributeParts(attributes, name);
    if (!parts) return true;
    const [, doubleQuoted, singleQuoted, expression] = parts;
    return expression === undefined
      ? (doubleQuoted ?? singleQuoted ?? '').trim() !== ''
      : readableExpression(expression, readableAttributeValue);
  });
}

/** Form controls with no accessible name. An id alone is not a name: a <label for> with the same id must exist. */
function unnamedControls(file: string, source: string): string[] {
  const labelled = new Set<string>();
  for (const label of source.matchAll(TAG('label')) as Iterable<RegExpExecArray>) {
    const target = attributeValue(label[2], 'htmlFor') ?? attributeValue(label[2], 'for');
    if (target) labelled.add(target);
  }
  const bad: string[] = [];
  for (const m of source.matchAll(TAG('input|select|textarea')) as Iterable<RegExpExecArray>) {
    if (/type="(hidden|submit|button)"/.test(m[2]) || hasNamingAttribute(m[2])) continue;
    const before = source.slice(Math.max(0, m.index - 1500), m.index);
    if (before.lastIndexOf('<label') > before.lastIndexOf('</label>')) continue; // wrapped in a <label>
    const id = attributeValue(m[2], 'id');
    if (id && labelled.has(id)) continue;
    bad.push(`${file}:${line(source, m.index)} <${m[1]}>`);
  }
  return bad;
}

const VOID_ELEMENTS = new Set(['area', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ANY_TAG = /<(\/?)([A-Za-z][\w.:-]*)?((?:[^>"'{]|"[^"]*"|'[^']*'|\{(?:[^{}]|\{[^{}]*\})*\})*?)(\/?)>/y;
// Statically hidden: aria-hidden="true", aria-hidden={true}, a bare aria-hidden, or the hidden attribute.
// A dynamic aria-hidden={expression} cannot be judged from source, so its text still counts.
const HIDDEN = /(?:^|\s)(?:aria-hidden(?:=(?:"true"|'true'|\{true\}|\{"true"\}))?|hidden(?:=(?:""|"hidden"|\{true\}))?)(?=[\s/]|$)/;

/**
 * Walks markup in order with the stack of open elements. Reports each run of text and each opening tag, with whether
 * a real ancestor hides it from assistive tech (aria-hidden, hidden, or an enclosing svg).
 */
function walkMarkup(
  markup: string,
  onText: (text: string, hidden: boolean) => void,
  onOpen: (name: string, attributes: string, hidden: boolean, index: number) => void,
  base = 0,
  outerHidden = false,
): void {
  const stack: Array<{ name: string; hidden: boolean }> = [];
  const inHidden = () => outerHidden || stack.some((entry) => entry.hidden);
  let index = 0;
  while (index < markup.length) {
    const open = markup.indexOf('<', index);
    onText(markup.slice(index, open === -1 ? markup.length : open), inHidden());
    if (open === -1) break;
    ANY_TAG.lastIndex = open;
    const tag = ANY_TAG.exec(markup);
    const name = tag?.[2]?.toLowerCase();
    if (!tag || (!name && tag[3] !== '')) {
      // A bare "<" in text, not a tag.
      onText('<', inHidden());
      index = open + 1;
      continue;
    }
    index = open + tag[0].length;
    if (tag[1] === '/') {
      const at = stack.map((entry) => entry.name).lastIndexOf(name ?? '');
      if (at !== -1) stack.length = at;
      continue;
    }
    const hides = name === 'svg' || HIDDEN.test(tag[3]);
    onOpen(name ?? '', tag[3], inHidden(), base + open);
    // JSX handed over as a prop (end={<button>...</button>}) sits inside the attributes: walk it too, as a child.
    if (/<[A-Za-z]/.test(tag[3])) {
      walkMarkup(tag[3], () => {}, onOpen, base + open + 1 + (tag[2]?.length ?? 0), inHidden() || hides);
    }
    if (tag[4] !== '/' && !(name && VOID_ELEMENTS.has(name))) stack.push({ name: name ?? '', hidden: hides });
  }
}

/** The text of some markup that a screen reader would read: skips svg and any element hidden from assistive tech. */
function visibleText(markup: string): string {
  let text = '';
  walkMarkup(markup, (run, hidden) => { if (!hidden) text += run; }, () => {});
  return text;
}

// The svg's own aria-hidden: static true, bare, or an expression; never an explicit false.
const SVG_OWN_HIDDEN = /(?:^|\s)aria-hidden=\{(?!false\}|"false"\}|'false'\})/;

/** Svgs that are neither hidden (own attribute or a real ancestor) nor named with role="img" and a label. */
function unnamedSvgs(file: string, source: string): { seen: number; bad: string[] } {
  const bad: string[] = [];
  let seen = 0;
  walkMarkup(source, () => {}, (name, attributes, hidden, index) => {
    if (name !== 'svg') return;
    seen += 1;
    if (hidden || /\{\.\.\./.test(attributes) || HIDDEN.test(attributes) || SVG_OWN_HIDDEN.test(attributes)) return;
    const named = /(?:^|\s)role="img"/.test(attributes) && hasNamingAttribute(attributes, ['aria-label', 'aria-labelledby']);
    if (!named) bad.push(`${file}:${line(source, index)} <svg>`);
  });
  return { seen, bad };
}

/** Marks which characters of an expression sit at nesting depth 0, outside any string. */
function topLevelMask(text: string): boolean[] {
  const mask: boolean[] = [];
  let depth = 0;
  let quote = '';
  for (let at = 0; at < text.length; at += 1) {
    const ch = text[at];
    mask.push(false);
    if (quote) {
      if (ch === '\\') {
        mask.push(false);
        at += 1;
      } else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === '`' || (ch === "'" && !/[A-Za-z0-9]/.test(text[at - 1] ?? ' '))) {
      quote = ch; // an apostrophe inside a word (don't) is text, not a quote
    } else if ('([{'.includes(ch)) {
      depth += 1;
    } else if (')]}'.includes(ch)) {
      depth -= 1;
    } else mask[at] = depth === 0;
  }
  return mask;
}

const isTernaryMark = (text: string, mask: boolean[], at: number) =>
  mask[at] && text[at] === '?' && text[at - 1] !== '?' && text[at + 1] !== '?' && !(text[at + 1] === '.' && !/\d/.test(text[at + 2] ?? ''));

function ternaryBranches(text: string, mask = topLevelMask(text)) {
  for (let at = 0; at < text.length; at += 1) {
    if (!isTernaryMark(text, mask, at)) continue;
    let nested = 0;
    for (let end = at + 1; end < text.length; end += 1) {
      if (isTernaryMark(text, mask, end)) nested += 1;
      else if (mask[end] && text[end] === ':') {
        if (nested > 0) nested -= 1;
        else return {
          condition: text.slice(0, at).trim(),
          whenTrue: text.slice(at + 1, end),
          whenFalse: text.slice(end + 1),
        };
      }
    }
    return null; // not a ternary this walk can follow
  }
}

/**
 * Whether a JSX expression provides a name. A ternary needs both branches readable. An `&&` expression alone
 * may leave a control unnamed. An `||` or `??` expression is checked through its fallback.
 */
function readableExpression(expression: string, readableValue = readableChildValue): boolean {
  const text = expression.trim();
  const mask = topLevelMask(text);
  if (text.startsWith('(') && text.endsWith(')') && !mask.some(Boolean)) {
    return readableExpression(text.slice(1, -1), readableValue);
  }
  const ternary = ternaryBranches(text, mask);
  if (ternary === null) return true;
  if (ternary) {
    return readableExpression(ternary.whenTrue, readableValue) && readableExpression(ternary.whenFalse, readableValue);
  }
  let fallback = -1;
  let conditional = false;
  for (let at = 0; at < text.length - 1; at += 1) {
    if (!mask[at]) continue;
    const operator = text.slice(at, at + 2);
    if (operator === '&&') conditional = true;
    if (operator === '||' || operator === '??') fallback = at + 2;
  }
  if (fallback !== -1) return readableExpression(text.slice(fallback), readableValue);
  return !conditional && readableValue(text);
}

/** Whether the visible text of a button or link names it: plain text, or a top-level expression that reads. */
function namesControl(text: string): boolean {
  let depth = 0;
  let start = 0;
  let plain = '';
  for (let at = 0; at < text.length; at += 1) {
    if (text[at] === '{') {
      if (depth === 0) start = at + 1;
      depth += 1;
    } else if (text[at] === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && readableExpression(text.slice(start, at))) return true;
    } else if (depth === 0) plain += text[at];
  }
  return /[A-Za-z0-9]/.test(plain);
}

/** A simple mode switch may supply an aria-label in one state and visible text in the other. */
function hasComplementaryLabel(attributes: string, visible: string): boolean {
  const label = attributeParts(attributes, 'aria-label')?.[3];
  const child = /^\{((?:[^{}]|\{[^{}]*\})*)\}$/.exec(visible.trim())?.[1];
  if (label === undefined || child === undefined) return false;

  const named = ternaryBranches(label);
  const shown = ternaryBranches(child);
  if (!named || !shown || named.condition !== shown.condition || !/^[A-Za-z_$][\w$]*$/.test(named.condition)) return false;
  return (
    (readableExpression(named.whenTrue, readableAttributeValue) || readableExpression(shown.whenTrue)) &&
    (readableExpression(named.whenFalse, readableAttributeValue) || readableExpression(shown.whenFalse))
  );
}

/** Buttons and links with no name: no label attribute and no visible text or expression. */
function unnamedButtonsAndLinks(file: string, source: string): string[] {
  const bad: string[] = [];
  for (const m of source.matchAll(TAG('button|a')) as Iterable<RegExpExecArray>) {
    if (hasNamingAttribute(m[2])) continue;
    const start = m.index + m[0].length;
    // A self-closing control has no children, so only its own attributes can name it.
    const end = m[3] === '/' ? -1 : source.indexOf(`</${m[1]}>`, start);
    const text = end === -1 ? '' : visibleText(source.slice(start, end));
    if (!namesControl(text) && !hasComplementaryLabel(m[2], text)) bad.push(`${file}:${line(source, m.index)} <${m[1]}>`);
  }
  return bad;
}

function scan(test: (file: string, source: string, m: RegExpExecArray) => boolean) {
  const bad: string[] = [];
  for (const { name, source } of files) {
    for (const m of source.matchAll(TAG('button|a|input|select|textarea|svg|img')) as Iterable<RegExpExecArray>) {
      if (!test(name, source, m)) bad.push(`${name}:${line(source, m.index)} <${m[1]}>`);
    }
  }
  return bad;
}

describe('accessible names in component and island source', () => {
  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('gives every button and link a name: label attributes or visible text', () => {
    expect(files.flatMap(({ name, source }) => unnamedButtonsAndLinks(name, source))).toEqual([]);
  });

  it('does not count text inside hidden descendants as a name (negative fixtures)', () => {
    const bad = (markup: string) => unnamedButtonsAndLinks('x.tsx', markup);
    expect(bad('<button type="button"><span aria-hidden="true">{number}</span></button>')).toHaveLength(1);
    expect(bad('<button><span aria-hidden={true}>x</span></button>')).toHaveLength(1);
    expect(bad('<button><span hidden>close</span><svg aria-hidden="true"></svg></button>')).toHaveLength(1);
    expect(bad('<button><span aria-hidden><b>nested</b></span></button>')).toHaveLength(1);
    expect(bad('<a href="/x"><svg viewBox="0 0 1 1"><title>go</title></svg></a>')).toHaveLength(1);
    expect(bad('<button type="button"></button>')).toHaveLength(1);
    expect(bad('<button type="button" class="preview" hidden />')).toHaveLength(1);
    expect(bad('<a href="/x" />')).toHaveLength(1);
    // The pause button pattern with its aria-label removed: only the {cond ? : } skeleton is left.
    expect(
      bad('<button type="button" className="icon" disabled={solved} onClick={toggle}>{paused\n  ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v11" /></svg>\n  : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v11" /></svg>}</button>'),
    ).toHaveLength(1);
    expect(bad('<button>{open && <svg aria-hidden="true" />}</button>')).toHaveLength(1);
    expect(bad('<button>{open ? <svg aria-hidden="true" /> : \'open\'}</button>')).toHaveLength(1);
    expect(bad('<button>{open ? <span>close</span> : null}</button>')).toHaveLength(1);
    expect(bad('<button>{open ? \'\' : \'\'}</button>')).toHaveLength(1);
  });

  it('counts visible text next to hidden icons (positive fixtures)', () => {
    const bad = (markup: string) => unnamedButtonsAndLinks('x.tsx', markup);
    expect(bad('<button><svg aria-hidden="true"></svg><span>open</span></button>')).toEqual([]);
    expect(bad('<button><span aria-hidden="true">{n}</span><span>open set</span></button>')).toEqual([]);
    expect(bad('<button aria-label="close"><span aria-hidden="true">x</span></button>')).toEqual([]);
    expect(bad('<button><span aria-hidden="true"><b>nested</b></span>text</button>')).toEqual([]);
    expect(bad('<button>{label}</button>')).toEqual([]);
    expect(bad('<button type="button" aria-label={`preview ${mode.name}`} hidden />')).toEqual([]);
    expect(bad("<button>{t('x')}</button>")).toEqual([]);
    expect(bad("<button>{open ? 'close' : 'open'}</button>")).toEqual([]);
    expect(bad('<button>{open ? <span>close</span> : <span>open</span>}</button>')).toEqual([]);
    expect(bad('<button>{a ? b : c ? \'x\' : \'y\'}</button>')).toEqual([]);
    expect(bad('<button>{shown && <span aria-hidden="true">✓</span>}{names[key]}</button>')).toEqual([]);
    expect(bad('<a href="/x"><img src="/a.svg" alt="" />home</a>')).toEqual([]);
  });

  it('requires a name whenever the control is present', () => {
    const bad = (markup: string) => unnamedButtonsAndLinks('x.tsx', markup);
    expect(bad('<button>{ready && <span>go</span>}</button>')).toHaveLength(1);
    expect(bad('<button>{(ready && <span>go</span>)}</button>')).toHaveLength(1);
    expect(bad('{ready && <button><span>go</span></button>}')).toEqual([]);
    expect(bad('{ready && <button></button>}')).toHaveLength(1);
    expect(bad('<button>{(ready && <span>go</span>) || "wait"}</button>')).toEqual([]);
  });

  it('gives every image alt text', () => {
    expect(scan((_n, _s, m) => m[1] !== 'img' || /\balt=|\{\.\.\./.test(m[2]))).toEqual([]);
  });

  it('labels every form control: aria name, wrapping label, or a label for its id', () => {
    expect(files.flatMap(({ name, source }) => unnamedControls(name, source))).toEqual([]);
  });

  it('rejects a control that has an id but no matching label (negative fixtures)', () => {
    expect(unnamedControls('x.tsx', '<input id="a" name="a" />')).toHaveLength(1);
    expect(unnamedControls('x.tsx', '<label htmlFor="b">b</label><input id="a" />')).toHaveLength(1);
    expect(unnamedControls('x.tsx', '<input id={`${id}-confirm`} name="confirm" />')).toHaveLength(1);
    expect(unnamedControls('x.tsx', '<label htmlFor={`${id}-other`}>x</label><input id={`${id}-confirm`} />')).toHaveLength(1);
    expect(unnamedControls('x.astro', '<input data-title="t" data-aria-label="t" type="text" />')).toHaveLength(1);
  });

  it('accepts named controls (positive fixtures)', () => {
    expect(unnamedControls('x.tsx', '<label htmlFor="a">a</label><input id="a" />')).toEqual([]);
    expect(unnamedControls('x.astro', '<label for="a">a</label><input id="a" />')).toEqual([]);
    expect(unnamedControls('x.tsx', '<label htmlFor={`${id}-confirm`}>c</label><input id={`${id}-confirm`} />')).toEqual([]);
    expect(unnamedControls('x.tsx', '<label>name <input name="n" /></label>')).toEqual([]);
    expect(unnamedControls('x.tsx', '<input aria-label="search" />')).toEqual([]);
    expect(unnamedControls('x.tsx', '<input type="hidden" name="n" />')).toEqual([]);
  });

  it('hides decorative svgs (own attribute or a real ancestor) or names them with role="img"', () => {
    expect(files.flatMap(({ name, source }) => unnamedSvgs(name, source).bad)).toEqual([]);
  });

  it('sees every svg in the walk, so none is skipped', () => {
    for (const { name, source } of files) {
      expect([name, unnamedSvgs(name, source).seen]).toEqual([name, [...source.matchAll(TAG('svg'))].length]);
    }
  });

  it('needs a hidden ancestor, not hidden markup nearby (svg fixtures)', () => {
    const bad = (markup: string) => unnamedSvgs('x.tsx', markup).bad;
    // A hidden sibling that is already closed does not hide the next svg.
    expect(bad('<button aria-label="a"><svg aria-hidden="true"></svg></button><button aria-label="b"><svg viewBox="0 0 1 1"></svg></button>')).toHaveLength(1);
    expect(bad('<span aria-hidden="true">x</span><svg viewBox="0 0 1 1"></svg>')).toHaveLength(1);
    expect(bad('<svg role="img" viewBox="0 0 1 1"></svg>')).toHaveLength(1);
    expect(bad('<svg role="img" aria-label="" viewBox="0 0 1 1"></svg>')).toHaveLength(1);
    expect(bad('<svg aria-hidden="false" viewBox="0 0 1 1"></svg>')).toHaveLength(1);
    expect(bad('<Header end={<button aria-label="print" onClick={() => go()}><svg viewBox="0 0 1 1"></svg></button>} />')).toHaveLength(1);
    expect(bad('<span aria-hidden="true"><svg viewBox="0 0 1 1"></svg></span>')).toEqual([]);
    expect(bad('<span aria-hidden="true">{on && (<svg viewBox="0 0 1 1"><path d="M1" /></svg>)}</span>')).toEqual([]);
    expect(bad('<svg aria-hidden="true" viewBox="0 0 1 1"></svg>')).toEqual([]);
    expect(bad('<svg role="img" aria-label={description} viewBox="0 0 1 1"></svg>')).toEqual([]);
  });

  it('does not accept a statically empty naming attribute (negative fixtures)', () => {
    const svg = '<svg aria-hidden="true"></svg>';
    expect(unnamedButtonsAndLinks('x.tsx', `<button aria-label="">${svg}</button>`)).toHaveLength(1);
    expect(unnamedButtonsAndLinks('x.tsx', `<button aria-label={''}>${svg}</button>`)).toHaveLength(1);
    expect(unnamedButtonsAndLinks('x.tsx', `<button title="">${svg}</button>`)).toHaveLength(1);
    expect(unnamedButtonsAndLinks('x.tsx', `<a href="/x" aria-labelledby="">${svg}</a>`)).toHaveLength(1);
    expect(unnamedButtonsAndLinks('x.tsx', '<button aria-label=" " />')).toHaveLength(1);
    expect(unnamedControls('x.tsx', '<input aria-label="" />')).toHaveLength(1);
    expect(unnamedButtonsAndLinks('x.tsx', `<button aria-label="sudoku settings">${svg}</button>`)).toEqual([]);
    expect(unnamedButtonsAndLinks('x.tsx', `<button aria-label={open ? 'close' : 'open'}>${svg}</button>`)).toEqual([]);
  });

  it('requires conditional naming attributes to name the control in each state', () => {
    const bad = (markup: string) => unnamedButtonsAndLinks('x.tsx', markup);
    const icon = '<svg aria-hidden="true"></svg>';
    expect(bad(`<button aria-label={paused ? '' : 'pause puzzle'}>${icon}</button>`)).toHaveLength(1);
    expect(bad(`<button aria-label={ready && 'go'}>${icon}</button>`)).toHaveLength(1);
    expect(bad(`<button aria-label={paused ? 'resume puzzle' : 'pause puzzle'}>${icon}</button>`)).toEqual([]);
    expect(bad(`<button aria-label={label || 'open'}>${icon}</button>`)).toEqual([]);
    expect(bad(`<button aria-label={ready ? 'go' : '進む'}>${icon}</button>`)).toEqual([]);
    expect(bad(`<button aria-label={iconOnly ? 'report' : undefined}>{iconOnly ? ${icon} : 'report'}</button>`)).toEqual([]);
    expect(bad(`<button aria-label={iconOnly ? 'report' : undefined}>{anotherMode ? ${icon} : 'report'}</button>`)).toHaveLength(1);
  });

  it('keeps live regions coherent: status and alert roles are never switched off', () => {
    const bad: string[] = [];
    for (const { name, source } of files) {
      for (const m of source.matchAll(/<[a-zA-Z][^<>]*?(?:role="(?:status|alert)"|aria-live=)[^<>]*>/g)) {
        const tag = m[0];
        if (/role="(status|alert)"/.test(tag) && /aria-live="off"/.test(tag)) bad.push(`${name}:${line(source, m.index)} off`);
        const live = /aria-live="([^"]*)"/.exec(tag)?.[1];
        if (live !== undefined && !['polite', 'assertive', 'off'].includes(live)) bad.push(`${name}:${line(source, m.index)} ${live}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('keeps at least the known status regions present (announce form and account messages)', () => {
    const text = (n: string) => files.find((f) => f.name.endsWith(n))!.source;
    expect(text('AccountCorner.astro')).toMatch(/role="status"[^>]*aria-live="polite"/);
    expect(text('AccountSettings.tsx')).toContain('role="status"');
    expect(text('SiteMenu.astro')).toMatch(/aria-live="polite"[^>]*data-search-status/);
  });
});
