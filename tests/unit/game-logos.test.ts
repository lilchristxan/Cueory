import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
// The .tsx extension is explicit: on a case-insensitive disk a bare 'PlayStatus' would resolve to playstatus.ts first.
import PlayStatus from '../../src/islands/PlayStatus.tsx';
import { gameLogos, imageLogo, type GameLogoKey } from '../../src/config/gamelogos';
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

describe("wordpill's artwork (the game formerly called vialo; Christian's glass capsule, 2026-11-26)", () => {
  const dir = new URL('../../public/design/games-v2/assets/', import.meta.url);
  const read = (name: string) => readFileSync(new URL(name, dir), 'utf8');
  const day = read('wordpill-wordmark-light.svg');
  const evening = read('wordpill-wordmark-dark.svg');
  const icon = read('wordpill-icon-l1.svg');

  it('is drawn in outlines only: no live text, so it looks the same everywhere', () => {
    for (const svg of [day, evening, icon]) {
      expect(svg).not.toMatch(/<text|font-family|<image/);
      expect(svg.match(/<path /g)).toHaveLength(2);
    }
  });

  it('has the same letters in Light and Evening, with no capsule round the name; only the two inks change', () => {
    const paths = (svg: string) => [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    const inks = (svg: string) => [...svg.matchAll(/<path d="[^"]+" fill="([^"]+)"/g)].map((m) => m[1]);
    expect(paths(evening)).toEqual(paths(day));
    expect(inks(day)).toEqual(['#053321', '#6e2019']);
    expect(inks(evening)).toEqual(['#f9f5ef', '#e0958c']);
    for (const svg of [day, evening]) expect(svg).not.toMatch(/<rect|<clipPath|<filter/);
  });

  it('draws the icon as a glass capsule with a one-pixel ivory hairline round it', () => {
    expect(icon).toContain('stroke="#f9f5ef" stroke-width="1" vector-effect="non-scaling-stroke"');
    expect(icon).toMatch(/<linearGradient id="glass"/);
  });

  it('keeps its frame: the wordmark is 300 by 100 and the icon 100 by 100, with no tile behind the icon', () => {
    expect(day).toContain('viewBox="0 0 300 100"');
    expect(evening).toContain('viewBox="0 0 300 100"');
    expect(icon).toContain('viewBox="0 0 100 100"');
    expect(icon).not.toContain('<rect width="100" height="100"');
  });

  it('is the wordmark and icon on every surface: Evening art on the hub and game page, Daytime on the cream carousel', () => {
    expect(gameLogos.vialo.wordmark).toEqual({ day: '/design/games-v2/assets/wordpill-wordmark-light.svg', evening: '/design/games-v2/assets/wordpill-wordmark-dark.svg', width: 300, height: 100 });
    expect(gameLogos.vialo.icon.day).toBe('/design/games-v2/assets/wordpill-icon-l1.svg');
    expect(gameLogos.vialo.icon.evening).toBe(gameLogos.vialo.icon.day);
    expect(gameLogos.vialo.card.wordmark).toBe(gameLogos.vialo.wordmark.day);
    expect(frameValue(frameConfig('pulse'), 'wordmarkSrc')).toBe(gameLogos.vialo.wordmark.day);
    expect(frameValue(frameConfig('pulse'), 'wordmarkEveningSrc')).toBe(gameLogos.vialo.wordmark.evening);
    expect(frameValue(frameConfig('pulse'), 'iconSrc')).toBe(gameLogos.vialo.icon.day);
    expect(frameValue(frameConfig('pulse'), 'brandName')).toBe('wordpill');
  });

  it('leaves no built page or stylesheet pointing at the old vialo artwork (the files stay in the repo for now)', () => {
    const oldArt = /vialo-(?:wordmark|icon)[\w-]*\.svg|brand\/games\/vialo-/;
    const walk = (dirUrl: URL): string[] =>
      readdirSync(dirUrl, { withFileTypes: true }).flatMap((entry) => {
        const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dirUrl);
        return entry.isDirectory() ? walk(child) : /\.(html|css)$/.test(entry.name) ? [fileURLToPath(child)] : [];
      });
    const files = walk(new URL('../../dist/', import.meta.url));
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((file) => oldArt.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
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

describe('the game deck on a game page shows the same art as the carousel, hub and sidebar (Christian, 2026-11-25)', () => {
  const deckSource = readFileSync(new URL('../../src/components/GameDeck.astro', import.meta.url), 'utf8');
  const deckPage = readFileSync(new URL('../../dist/play/sudoku.html', import.meta.url), 'utf8');
  const deckItem = (id: string) => {
    const match = deckPage.match(new RegExp(`<li class="game-deck-item"[^>]*data-game="${id}"[\\s\\S]*?</li>`));
    if (!match) throw new Error(`the built sudoku page has no ${id} deck card`);
    return match[0];
  };

  it('builds no logo path of its own', () => {
    expect(deckSource).not.toMatch(/\/brand\/games|games-v2\/assets|\.svg/);
    expect(deckSource).toContain("from '../config/gamelogos'");
  });

  for (const [key, id] of [['vialo', 'pulse'], ['piccline', 'suture']] as const) {
    it(`${key}: the deck's icon and wordmark files are gamelogos' files, Light and Evening`, () => {
      const source = imageLogo(key);
      const found = new Set(srcs(deckItem(id)));
      expect(found).toEqual(new Set([...Object.values(source.deckIcon ?? source.icon), source.wordmark.day, source.wordmark.evening]));
    });
  }

  it('tachyyy (a draft game, so on the page only when drafts are shown): its deck art is gamelogos\' light icon and wordmarks', () => {
    const page = readFileSync(new URL('../../dist/play/sudoku.html', import.meta.url), 'utf8');
    if (!page.includes('data-game="stat"')) return;
    const found = new Set(srcs(deckItem('stat')));
    expect(found).toEqual(new Set([gameLogos.tachyyy.icon.day, gameLogos.tachyyy.wordmark.day, gameLogos.tachyyy.wordmark.evening]));
  });
});
