import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const GAMES = ['vialo', 'tachyyy', 'piccline'] as const;

describe('daily games brand assets (20 Nov 2026 rebrand)', () => {
  const brandGamesDir = new URL('../../public/brand/games/', import.meta.url);

  for (const game of GAMES) {
    describe(`${game} assets`, () => {
      const icons = [`${game}-light.svg`, `${game}-dark.svg`];
      const wordmarks = [`${game}-wordmark-light.svg`, `${game}-wordmark-dark.svg`];

      it.each(icons)('icon %s exists, has 100x100 viewBox and aria-label', (filename) => {
        const fileUrl = new URL(filename, brandGamesDir);
        expect(existsSync(fileUrl), `${filename} must exist`).toBe(true);
        const svg = readFileSync(fileUrl, 'utf8');

        expect(svg).toMatch(/viewBox="0 0 100 100"/);
        expect(svg).toMatch(/role="img"/);
        expect(svg).toMatch(new RegExp(`aria-label="${game}"`));
      });

      it.each(wordmarks)('wordmark %s exists, has viewBox and aria-label', (filename) => {
        const fileUrl = new URL(filename, brandGamesDir);
        expect(existsSync(fileUrl), `${filename} must exist`).toBe(true);
        const svg = readFileSync(fileUrl, 'utf8');

        expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
        expect(svg).toMatch(/role="img"/);
        expect(svg).toMatch(new RegExp(`aria-label="${game}"`));
      });
    });
  }

  it('keeps Sacramento font OFL notice in public/fonts/', () => {
    const oflUrl = new URL('../../public/fonts/sacramento-OFL.txt', import.meta.url);
    expect(existsSync(oflUrl)).toBe(true);
    const ofl = readFileSync(oflUrl, 'utf8');
    expect(ofl).toContain('SIL Open Font License');
    expect(ofl).toContain('Sacramento');
  });

  it('defines game accents in tokens.css and documents them in BRAND.md', () => {
    const tokens = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
    expect(tokens).toContain('--color-game-teal: #2f7a78;');
    expect(tokens).toContain('--color-game-teal: #4fb3ae;');
    expect(tokens).toContain('--color-game-dim: #5a463a;');

    const brandMd = readFileSync(new URL('../../docs/BRAND.md', import.meta.url), 'utf8');
    expect(brandMd).toContain('Game accents');
    expect(brandMd).toContain('piccline');
    expect(brandMd).toContain('#2F7A78');
    expect(brandMd).toContain('#5A463A');
  });
});
