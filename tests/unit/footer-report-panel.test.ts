import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Footer as drawn (#918): the link row is always visible, right above the bar. The report panel that opens from the
 * flag must never cover part of a link (axe "target-size" fails on a partly covered link), so the panel is placed
 * against one box that holds both the bar and the link row, and opens above them. The form itself is unchanged: on
 * its own (tests/e2e/flag-send.spec.ts mounts it that way) it still opens right above its button.
 * tests/e2e/footer-as-drawn.spec.ts measures the result in the browser; this guards the two halves of the wiring.
 */
const footer = readFileSync(new URL('../../src/components/SiteFooter.astro', import.meta.url), 'utf8');
const form = readFileSync(new URL('../../src/islands/FlagForm.tsx', import.meta.url), 'utf8');

describe('footer report panel placement', () => {
  it('holds the bar, the flag and the link row in one positioned box', () => {
    const open = /<div\s+class="([^"]*)"\s+data-footer-base\s*>/.exec(footer);
    expect(open, 'data-footer-base').not.toBeNull();
    const classes = open![1].split(/\s+/);
    // Positioned (the panel is placed against it), and the link row is drawn above the bar that comes first.
    expect(classes).toContain('relative');
    expect(classes).toContain('flex-col-reverse');
    // In the footer the form's own wrapper is not positioned, and the panel keeps the flag's inset.
    expect(classes).toContain('[&_[data-testid=flag-form]]:static');
    expect(classes).toContain('[&_[data-testid=flag-form]>.absolute]:left-gutter');

    const start = open!.index;
    const end = footer.indexOf('<div id="site-footer-panel"');
    expect(end).toBeGreaterThan(start);
    const box = footer.slice(start, end);
    const flag = box.indexOf('id="footer-flag"');
    const links = box.indexOf('<nav aria-label="footer"');
    expect(flag).toBeGreaterThan(-1);
    expect(links).toBeGreaterThan(flag);
    // Nothing between the box and the form may be positioned, or the panel would be placed against that instead.
    expect(box.slice(open![0].length, links)).not.toMatch(/class="[^"]*\b(?:relative|absolute|sticky|fixed)\b/);
  });

  it('matches the form as it is written: a marked wrapper with the panel and the note as positioned children', () => {
    // The footer's two classes select these, so a rename in FlagForm must be made in SiteFooter too.
    expect(form).toContain(`className={icon ? 'relative text-ink' : 'max-w-full text-ink'} data-testid="flag-form"`);
    expect(form.match(/'absolute bottom-full left-0 /g)).toHaveLength(2);
  });
});
