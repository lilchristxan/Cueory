import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// piccline's page sky (Christian, 2026-11-27): blue, cream and peach in Light, the same sky at dusk in Evening.
// These checks keep the Evening copies in step and keep the text that sits on the sky readable.
const tokens = readFileSync('src/styles/tokens.css', 'utf8');
const frame = readFileSync('src/styles/gameframe.css', 'utf8');
const frameMarkup = readFileSync('src/components/GameFrame.astro', 'utf8');

const names = ['blue', 'mist', 'cream', 'sun', 'blush', 'peach'] as const;

function values(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of block.matchAll(/--piccline-sky-([a-z]+):\s*(#[0-9a-f]{6});/g)) out[match[1]!] = match[2]!;
  return out;
}

function luminance(hex: string): number {
  const channel = (index: number) => {
    const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const blocks = [...tokens.matchAll(/\{[^{}]*--piccline-sky-blue:[^{}]*\}/g)].map((match) => values(match[0]));

describe("piccline's page sky", () => {
  it('has one Daytime set and two matching Evening sets (device setting and the footer pick)', () => {
    expect(blocks).toHaveLength(3);
    for (const block of blocks) expect(Object.keys(block).sort()).toEqual([...names].sort());
    expect(blocks[1]).toEqual(blocks[2]);
    expect(blocks[0]).not.toEqual(blocks[1]);
  });

  it('keeps the main ink readable on every sky colour, in Daytime and Evening', () => {
    const [day, evening] = blocks as [Record<string, string>, Record<string, string>];
    for (const name of names) {
      expect(contrast('#3e2c23', day[name]!), `daytime ${name}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#f9f5ef', evening[name]!), `evening ${name}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('is painted by the frame on piccline only, with ink for the text that sits straight on it', () => {
    expect(frameMarkup).toContain("key === 'suture' ? 'piccline'");
    const rule = frame.match(/\.game-frame\[data-game-look="piccline"\] \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('background: var(--piccline-sky)');
    expect(rule).toContain('--color-ink-soft: var(--color-ink)');
    expect(frame).toMatch(/\[data-game-look="piccline"\] \.wordpath-cue \{\s*color: var\(--color-ink\);/);
  });
});
