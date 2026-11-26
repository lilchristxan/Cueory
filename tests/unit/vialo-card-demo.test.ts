import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The home carousel's vialo preview is a miniature of the live board (src/styles/vialo.css): oblong capsule pills on
// a strip of the same grey foil, in the game's own white, red and green, each result with its own mark.
const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const card = read('src/components/DailyGamesSection.astro');
const tokens = read('src/styles/tokens.css');
const live = read('src/styles/vialo.css');

const token = (name: string) => tokens.match(new RegExp(`--${name}:\\s*([^;]+);`))![1]!.trim();
const rem = (name: string) => Number.parseFloat(token(name));
const channel = (v: number) => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const luminance = (hex: string) => {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const demoStyle = card.slice(card.indexOf('/* Vialo Demo'), card.indexOf('/* Reduced Motion */'));

describe('the home vialo card preview', () => {
  it('draws capsules, wider than tall, not circles', () => {
    expect(rem('game-demo-vialo-cell-width')).toBeGreaterThan(rem('game-demo-vialo-cell-height'));
    expect(demoStyle).toContain('width: var(--game-demo-vialo-cell-width)');
    expect(demoStyle).toContain('height: var(--game-demo-vialo-cell-height)');
    expect(demoStyle).toContain('border-radius: var(--radius-pill)');
  });

  it('uses the live board\'s states: white absent, red elsewhere, green in place, each with its own mark', () => {
    expect(token('game-demo-vialo-green')).toBe(token('game-dark-green'));
    expect(token('game-demo-vialo-red')).toBe(token('game-oxblood'));
    expect(token('game-demo-vialo-absent-face')).toBe(token('vialo-absent-face'));
    expect(token('game-demo-vialo-absent-ink')).toBe(token('vialo-absent-ink'));
    for (const [state, mark] of [['here', '25CF'], ['elsewhere', '25CB'], ['absent', '00B7']] as const) {
      expect(live).toContain(`.vialo-pill.vialo-${state}::after { content: "\\${mark}" / ""; }`);
      expect(demoStyle).toContain(`.gc.gc-${state}::after { content: "\\${mark}" / ""; }`);
    }
    // The three results appear in the markup, and the guess is a real one: CARES against NURSE.
    expect(card.match(/class="gc gc-here/g)!.length).toBeGreaterThan(0);
    expect(card.match(/class="gc gc-elsewhere/g)!.length).toBeGreaterThan(0);
    expect(card.match(/class="gc gc-absent/g)!.length).toBeGreaterThan(0);
  });

  it('keeps its letters readable: at least 4.5 to 1 on every pill', () => {
    expect(contrast('#ffffff', token('game-demo-vialo-green'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', token('game-demo-vialo-red'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('game-demo-vialo-absent-ink'), token('game-demo-vialo-absent-face'))).toBeGreaterThanOrEqual(4.5);
  });

  it('uses tokens only in its styles, with no raw colours', () => {
    expect(demoStyle).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsl\(/);
  });

  it('stops under reduced motion, where the pills rest on their finished look', () => {
    const reduced = card.slice(card.indexOf('/* Reduced Motion */'));
    expect(reduced).toMatch(/\.gc,\n[\s\S]*animation: none !important/);
    // The resting style of a pill is the filled one, so a stopped animation is the final frame.
    expect(demoStyle).toMatch(/\.gc \{[^}]*background-color: var\(--gc-face\)/);
  });

  it('keeps the animation\'s timing: 4.8 seconds with the same stagger classes', () => {
    expect(demoStyle).toContain('animation: gfill 4.8s ease-in-out infinite');
    for (const delay of ['d-0', 'd-30', 'd-60', 'd-90', 'd-120', 'd-180', 'd-210', 'd-240', 'd-270', 'd-300']) {
      expect(card).toContain(`gc gc-`);
      expect(card).toContain(delay);
    }
  });
});
