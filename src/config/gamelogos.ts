/**
 * Every game's logo artwork, in one place (Christian, 2026-11-25). The home page's game carousel
 * (src/components/DailyGamesSection.astro), the /play hub rows (src/islands/PlayStatus.tsx) and the game pages'
 * sidebar (src/components/GameFrame.astro) must show the same artwork, so the first two read this module and
 * tests/unit/game-logos.test.ts asserts it equals what GameFrame uses, game by game. The files are Christian's
 * artwork: plain images, never redrawn, recoloured, filtered or cropped.
 *
 * `icon` and `wordmark` are what the game page and the hub draw: the Daytime file, and the Evening file for the dark
 * palette. `card` is what the carousel draws. Its cards are cream in both palettes, so it always draws Daytime art
 * (dark ink) and never the Evening wordmark: tachyyy's and piccline's are ivory, which would vanish on cream.
 */
export interface GameImageLogo {
  kind: 'image';
  icon: { day: string; evening: string };
  /** The wordmark's two versions and its natural size (the viewBox of the files). */
  wordmark: { day: string; evening: string; width: number; height: number };
  /** What the home carousel's card draws. */
  card: { icon: string; wordmark: string };
  /** An icon the game deck draws instead of `icon`, where tests/e2e/game-deck.spec.ts still pins another file. */
  deckIcon?: { day: string; evening: string };
}
/** A game with no image: a glyph in the tile (a drawn grid, a "9", an italic "hi") and its name in the serif font. */
export interface GameGlyphLogo {
  kind: 'grid' | 'text';
  text?: string;
  italic?: boolean;
}
export type GameLogoKey = 'vialo' | 'tachyyy' | 'piccline' | 'crossword' | 'sudoku' | 'helloCards';

// The game's players-facing name is wordpill (Christian, 2026-11-26); the key, ids and storage keys stay `vialo`.
const vialoIcon = '/design/games-v2/assets/wordpill-icon-l1.svg';

export const gameLogos = {
  vialo: {
    kind: 'image',
    icon: { day: vialoIcon, evening: vialoIcon },
    wordmark: { day: '/design/games-v2/assets/wordpill-wordmark-light.svg', evening: '/design/games-v2/assets/wordpill-wordmark-dark.svg', width: 300, height: 100 },
    card: { icon: vialoIcon, wordmark: '/design/games-v2/assets/wordpill-wordmark-light.svg' },
  },
  tachyyy: {
    kind: 'image',
    icon: { day: '/brand/games/tachyyy-light.svg', evening: '/brand/games/tachyyy-light.svg' },
    wordmark: { day: '/brand/games/tachyyy-wordmark-light.svg', evening: '/brand/games/tachyyy-wordmark-dark.svg', width: 5729, height: 2100 },
    // Christian (2026-11-25): the light tile on all branding, in Light and Evening, card included.
    card: { icon: '/brand/games/tachyyy-light.svg', wordmark: '/brand/games/tachyyy-wordmark-light.svg' },
  },
  piccline: {
    kind: 'image',
    icon: { day: '/brand/games/piccline-dark.svg', evening: '/brand/games/piccline-dark.svg' },
    wordmark: { day: '/brand/games/piccline-wordmark-light.svg', evening: '/brand/games/piccline-wordmark-dark.svg', width: 5060, height: 2555 },
    card: { icon: '/brand/games/piccline-dark.svg', wordmark: '/brand/games/piccline-wordmark-light.svg' },
    // The deck's Light tile is the cream one (game-deck.spec.ts pins it); every other place draws the teal tile.
    deckIcon: { day: '/brand/games/piccline-light.svg', evening: '/brand/games/piccline-dark.svg' },
  },
  crossword: { kind: 'grid' },
  sudoku: { kind: 'text', text: '9' },
  helloCards: { kind: 'text', text: 'hi', italic: true },
} as const satisfies Readonly<Record<GameLogoKey, GameImageLogo | GameGlyphLogo>>;

/** The image art of a game that has some (vialo, tachyyy, piccline). */
export function imageLogo(key: 'vialo' | 'tachyyy' | 'piccline'): GameImageLogo {
  return gameLogos[key];
}
