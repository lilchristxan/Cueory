import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Touch-only check (390 px phone, no mouse). A phone has no hover, so nothing may be revealed or explained only by
 * resting a pointer on it. These checks keep the source that way: hover may style things, but every fact and every
 * control stays reachable by a tap (and by keyboard focus).
 */
const root = new URL('../../src/', import.meta.url).pathname;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const files = walk(root).map((path) => ({ name: relative(root, path), text: readFileSync(path, 'utf8') }));
const markup = files.filter((file) => /\.(astro|tsx)$/.test(file.name));
const styles = files.filter((file) => /\.(css|astro)$/.test(file.name));

/**
 * Every innermost CSS rule whose selector mentions :hover, as { selector, body }: the text between the previous brace
 * and "{", and the text up to the matching "}". One pass over the text. The earlier single regular expression did the
 * same job but re-scanned long stretches of the stylesheet for every candidate, so its time grew with the square of the
 * CSS size and reached the 5 second limit on slower machines.
 */
function hoverRules(text: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = [];
  const brace = /[{}]/g;
  let last = 0;
  for (let match = brace.exec(text); match; match = brace.exec(text)) {
    if (match[0] === '{') {
      const selector = text.slice(last, match.index);
      const next = text.slice(match.index + 1).search(/[{}]/);
      if (next >= 0 && text[match.index + 1 + next] === '}' && selector.includes(':hover')) {
        rules.push({ selector, body: text.slice(match.index + 1, match.index + 1 + next) });
      }
    }
    last = match.index + 1;
  }
  return rules;
}

describe('no hover-only information (touch)', () => {
  it('has no title="" tooltips on HTML elements (only the page title prop and the video frame)', () => {
    const found = markup.flatMap(({ name, text }) =>
      [...text.matchAll(/<(a|button|span|svg|img|div|li|td|th|abbr|circle|rect|path|g|input|label|p)\b[^>]*\stitle=/g)].map(() => name),
    );
    expect(found).toEqual([]);
  });

  it('has no help cursor, tooltip attribute or abbr that only a hover can open', () => {
    const found = files.flatMap(({ name, text }) =>
      /cursor-help|cursor:\s*help|data-tooltip|<abbr\b/.test(text) ? [name] : [],
    );
    expect(found).toEqual([]);
  });

  it('has no mouse-only listeners (mouseenter, mouseover, mouseleave, onMouseEnter/Over/Leave)', () => {
    const found = markup.flatMap(({ name, text }) =>
      /mouseenter|mouseover|mouseleave|onMouse(Enter|Over|Leave)/i.test(text) ? [name] : [],
    );
    expect(found).toEqual([]);
  });

  it('only listens for pointerenter/pointerover when it checks for a mouse first', () => {
    for (const { name, text } of markup) {
      for (const match of text.matchAll(/pointer(enter|over)['"]\s*,\s*\(?\s*(\w+)?/g)) {
        const after = text.slice(match.index!, match.index! + 200);
        expect(after, `${name} reacts to pointerenter/pointerover without a pointerType check`).toMatch(/pointerType/);
      }
    }
  });

  it('never reveals content with hover utilities (group-hover or peer-hover show/hide, hover:block/flex/visible)', () => {
    const found = markup.flatMap(({ name, text }) =>
      /(group|peer)-hover:(block|flex|inline|visible|opacity-100|translate|scale|h-|max-h-)|(?<![-\w])hover:(block|flex|inline-block|visible|opacity-100)/.test(text) ? [name] : [],
    );
    expect(found).toEqual([]);
  });

  it('never uses :hover to show, hide or size content (display, visibility, height, clip, content) in CSS', () => {
    const found: string[] = [];
    for (const { name, text } of styles) {
      for (const rule of hoverRules(text)) {
        if (/(^|[;\s])(display|visibility|height|max-height|clip|clip-path|content)\s*:/.test(rule.body)) {
          found.push(`${name}: ${rule.selector.trim()}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('finds :hover rules at any nesting depth, and only rules whose selector has :hover', () => {
    const css = '.a { display: none } @media (hover: hover) { .b:hover { display: block } .c { height: 1px } } .d:hover, .e { content: "x" } .f:hover { color: red }';
    expect(hoverRules(css).map((rule) => [rule.selector.trim(), rule.body.trim()])).toEqual([
      ['.b:hover', 'display: block'],
      ['.d:hover, .e', 'content: "x"'],
      ['.f:hover', 'color: red'],
    ]);
  });

  it('keeps hover-lift polish inside the mouse-only media query or paired with keyboard focus', () => {
    const css = files.find((file) => file.name === 'styles/global.css')!.text;
    const zoom = css.indexOf(':is(:hover, :has(.mode-open:focus-visible))');
    expect(zoom).toBeGreaterThan(-1);
    const before = css.slice(0, zoom);
    expect(before.slice(before.lastIndexOf('@media'))).toContain('(hover: hover) and (pointer: fine)');
  });
});
