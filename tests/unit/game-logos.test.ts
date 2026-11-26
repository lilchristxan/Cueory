import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
// The .tsx extension is explicit: on a case-insensitive disk a bare 'PlayStatus' would resolve to playstatus.ts first.
import PlayStatus from '../../src/islands/PlayStatus.tsx';
import { gameLogos, type GameLogoKey } from '../../src/config/gamelogos';
import { hubLines } from '../../src/config/homegames';

// One logo source (src/config/gamelogos.ts) feeds the home carousel and the /play hub, and must equal what the game
// pages' sidebar (src/components/GameFrame.astro) uses, so the three cannot drift. GameFrame is read, never changed.
const frame = readFileSync(new URL('../../src/components/GameFrame.astro', import.meta.url), 'utf8');
/** The text of one game's entry in GameFrame's `configs` table. */
function frameConfig(id: string): string {
  const start = frame.indexOf(`  ${id.includes('-') ? `'${id}'` : id}: {\n    id: '${id}'`);
  if (start === -1) throw new Error(`GameFrame has no ${id} config`);
  const end = frame.indexOf('\n  },', start);
  return frame.slice(start, end);
}
const frameValue = (config: string, key: string) => config.match(new RegExp(`${key}: '([^']+)'`))?.[1];

const tokens = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
const globalCss = readFileSync(new URL('../../src/styles/global.css', import.meta.url), 'utf8');

// The verify script builds dist/ before unit tests, so the carousel side is read from the real built home page.
const home = readFileSync(new URL('../../dist/index.html', import.meta.url), 'utf8');

/** carousel card id (data-game-card) and hub art key, per game, in the carousel's order. */
const games: ReadonlyArray<{ card: string; art: GameLogoKey; id: string }> = [
  { card: 'vialo', art: 'vialo', id: 'vialo' },
  { card: 'tachyyy', art: 'tachyyy', id: 'tachyyy' },
  { card: 'piccline', art: 'piccline', id: 'suture' },
  { card: 'crossword', art: 'crossword', id: 'cueword' },
  { card: 'sudoku', art: 'sudoku', id: 'triage' },
  { card: 'hello cards', art: 'helloCards', id: 'hello-cards' },
];

function cardMarkup(card: string): string {
  const match = home.match(new RegExp(`<a\\b[^>]*data-game-card="${card}"[^>]*>[\\s\\S]*?</a>`));
  if (!match) throw new Error(`the built home page has no ${card} card`);
  return match[0];
}
const srcs = (markup: string) => [...markup.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]!);

const hub = renderToStaticMarkup(
  createElement(PlayStatus, {
    games: games.map(({ art, id }) => ({
      id: id as 'vialo',
      testId: id,
      name: id,
      line: hubLines.vialo,
      href: `/play/${id}`,
      open: true,
      art,
    })),
  }),
);
function rowMarkup(id: string): string {
  const start = hub.indexOf(`data-testid="play-status-${id}"`);
  const next = hub.indexOf('data-testid="play-status-', start + 1);
  return hub.slice(start, next === -1 ? undefined : next);
}

describe('the /play hub rows draw the same game artwork as the home page carousel', () => {
  for (const { card, art, id } of games) {
    it(`${card}: same icon and wordmark files, or the same glyph and serif name`, () => {
      const cardHtml = cardMarkup(card);
      const row = rowMarkup(id);
      const cardFiles = srcs(cardHtml);
      const rowFiles = srcs(row);
      const source = gameLogos[art];
      if (source.kind === 'image') {
        // The carousel draws its icon twice (top-left and upside down at the bottom right) and the wordmark once.
        expect(cardFiles).toEqual([source.card.icon, source.card.wordmark, source.card.icon]);
        // The hub draws the icon (one file, or Daytime then Evening) and the wordmark's Daytime then Evening files.
        const icons = source.icon.day === source.icon.evening ? [source.icon.day] : [source.icon.day, source.icon.evening];
        expect(rowFiles).toEqual([...icons, source.wordmark.day, source.wordmark.evening]);
        // Same file, never resized by attribute into another shape: natural width and height are set.
        expect(row).toContain(`width="${source.wordmark.width}" height="${source.wordmark.height}"`);
        expect(row.match(/<img\b[^>]*>/g)!.every((tag) => /\bwidth="\d+"/.test(tag) && /\bheight="\d+"/.test(tag))).toBe(true);
      } else {
        // No artwork on the card: no image on the hub row either, and the same glyph in the tile.
        expect(cardFiles).toEqual([]);
        expect(rowFiles).toEqual([]);
        if (source.kind === 'text') {
          expect(cardHtml).toContain(`>${source.text}</span>`);
          expect(row).toContain(`>${source.text}</span>`);
        }
      }
    });
  }
});

describe('the shared logo source equals what the game pages use (GameFrame.astro)', () => {
  const frameIds: ReadonlyArray<readonly [GameLogoKey, string]> = [['vialo', 'pulse'], ['tachyyy', 'stat'], ['piccline', 'suture']];
  for (const [key, id] of frameIds) {
    it(`${key}: same wordmark files, and the hub's icon files`, () => {
      const config = frameConfig(id);
      const source = gameLogos[key];
      if (source.kind !== 'image') throw new Error('image art expected');
      expect(frameValue(config, 'wordmarkSrc')).toBe(source.wordmark.day);
      expect(frameValue(config, 'wordmarkEveningSrc')).toBe(source.wordmark.evening);
      if (key === 'tachyyy') {
        // GameFrame draws the tachyyy icon as a Daytime/Evening pair, outside its configs table.
        expect(frame).toContain(`class="logo-day" src="${source.icon.day}"`);
        expect(frame).toContain(`class="logo-evening" src="${source.icon.evening}"`);
      } else {
        expect(frameValue(config, 'iconSrc')).toBe(source.icon.day);
        expect(source.icon.evening).toBe(source.icon.day);
      }
    });
    it(`${key}: the carousel's wordmark is the game page's Daytime wordmark (the card is cream in both palettes)`, () => {
      const source = gameLogos[key];
      if (source.kind !== 'image') throw new Error('image art expected');
      expect(source.card.wordmark).toBe(source.wordmark.day);
    });
  }
  it('has no difference left: every surface draws the same icon file, in both palettes (tachyyy uses its light tile everywhere, 2026-11-25)', () => {
    const differing = frameIds.filter(([key]) => {
      const source = gameLogos[key];
      return source.kind === 'image' && source.card.icon !== source.icon.day;
    }).map(([key]) => key);
    expect(differing).toEqual([]);
    for (const key of ['vialo', 'tachyyy', 'piccline'] as const) {
      const source = gameLogos[key];
      if (source.kind !== 'image') throw new Error('image art expected');
      expect(source.icon.evening).toBe(source.icon.day);
    }
    expect(gameLogos.tachyyy.icon.day).toBe('/brand/games/tachyyy-light.svg');
  });
  it('has the same glyphs as the game page for crossword, sudoku and hello cards', () => {
    expect(frameConfig('cueword')).toContain("iconType: 'grid'");
    expect(frameConfig('triage')).toContain("iconType: '9'");
    expect(frameConfig('hello-cards')).toContain("iconType: 'hi'");
    expect(frame).toContain('game-frame-emblem-9">9<');
    expect(frame).toContain('game-frame-emblem-hi">hi<');
    expect(gameLogos.sudoku.text).toBe('9');
    expect(gameLogos.helloCards.text).toBe('hi');
  });
});

describe("vialo's Evening wordmark: the Daytime path unchanged, with a 1 px gold outline", () => {
  const dir = new URL('../../public/design/games-v2/assets/', import.meta.url);
  const day = readFileSync(new URL('vialo-wordmark-oxblood-v3.svg', dir), 'utf8');
  const evening = readFileSync(new URL('vialo-wordmark-oxblood-v3-evening.svg', dir), 'utf8');
  const pathOf = (svg: string) => svg.match(/<path d="([^"]+)"/)![1];
  const box = (svg: string) => svg.match(/viewBox="([^"]+)"/)![1]!.split(' ').map(Number) as [number, number, number, number];

  it('has the same single path and fill, plus the outline', () => {
    expect(pathOf(evening)).toBe(pathOf(day));
    expect(evening.match(/<path /g)).toHaveLength(1);
    expect(evening).toContain('fill="#5E1914"');
    expect(evening).toContain('stroke="#d9976a"');
    expect(evening).toContain('stroke-width="1"');
    expect(evening).toContain('vector-effect="non-scaling-stroke"');
    expect(evening).toContain('stroke-linejoin="round"');
  });

  it('pads the canvas evenly around the Daytime one, in its proportions, and the scale token undoes the padding', () => {
    const [dx, dy, dw, dh] = box(day);
    const [ex, ey, ew, eh] = box(evening);
    expect(ex).toBeLessThan(dx);
    expect(ey).toBeLessThan(dy);
    expect(ex + ew - (dx + dw)).toBe(-ex); // the same margin on both sides
    expect(ey + eh - (dy + dh)).toBe(-ey);
    expect(Math.abs(ew / eh - dw / dh)).toBeLessThan(0.001); // same proportions: same box at the same CSS height
    const scale = Number(tokens.match(/--vialo-evening-wordmark-scale:\s*([\d.]+)/)![1]);
    expect(Math.abs(scale - eh / dh)).toBeLessThan(0.0002);
    expect(globalCss).toContain('img[src$="vialo-wordmark-oxblood-v3-evening.svg"] {\n    scale: var(--vialo-evening-wordmark-scale);');
  });

  it('is vialo\'s Evening wordmark on the hub and the game page, and the carousel (cream in both palettes) keeps Daytime', () => {
    expect(gameLogos.vialo.wordmark.evening).toBe('/design/games-v2/assets/vialo-wordmark-oxblood-v3-evening.svg');
    expect(gameLogos.vialo.wordmark.day).toBe('/design/games-v2/assets/vialo-wordmark-oxblood-v3.svg');
    expect(gameLogos.vialo.card.wordmark).toBe(gameLogos.vialo.wordmark.day);
    expect(frameValue(frameConfig('pulse'), 'wordmarkEveningSrc')).toBe(gameLogos.vialo.wordmark.evening);
  });
});

describe("piccline's wordmark is drawn larger so it stands a little above the others' (Christian, 2026-11-25)", () => {
  it('scales both of its files by one token (its lowercase is a third of its box, so well above 10 to 15 percent), in every place', () => {
    const scale = Number(tokens.match(/--piccline-wordmark-scale:\s*([\d.]+)/)![1]);
    expect(scale).toBeGreaterThanOrEqual(1.1);
    expect(scale).toBeLessThanOrEqual(1.6);
    expect(globalCss).toContain('img[src$="piccline-wordmark-light.svg"],\n  img[src$="piccline-wordmark-dark.svg"] {\n    scale: var(--piccline-wordmark-scale);');
    const source = gameLogos.piccline;
    if (source.kind !== 'image') throw new Error('image art expected');
    expect(source.wordmark.day.endsWith('piccline-wordmark-light.svg')).toBe(true);
    expect(source.wordmark.evening.endsWith('piccline-wordmark-dark.svg')).toBe(true);
  });
});
