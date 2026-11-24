/**
 * The five cards in the home page's daily-games stage (copy deck, docs/design/copy-deck.md, home rows "games line" to
 * "game 5"). Names and readiness come from the real game list in games.ts, so the counts on the stage ("01 / 05",
 * "play one, or all three") follow it and are never typed by hand. The card order and the two drawn lines (word path,
 * hello cards) are the deck's "ship" column.
 */
import { dailyGames, helloCardsGame, type DailyGame } from './games';

export interface HomeGameCard {
  /** Stable key for tests (data-game-card); the visitor-facing name. */
  name: string;
  /** One short line, as the copy deck ships it. */
  line: string;
  /** Playable today; false shows a "coming soon" tag. */
  available: boolean;
}

/** The first sentence of a games.ts line (deck: "games.ts line, shortened to its first sentence (same words)"). */
export function firstSentence(line: string): string {
  const end = line.indexOf('. ');
  return end === -1 ? line : line.slice(0, end + 1);
}

/** Lines the deck ships "as drawn" rather than from games.ts. */
const drawnLines: Partial<Record<DailyGame['id'], string>> = {
  suture: 'trace hidden words through the letters.',
};
const helloCardsLine = 'flip a card, start a conversation.';

/** Deck order: vialo, crossword, sudoku, word path, hello cards (card positions as drawn). */
const deckOrder: readonly DailyGame['id'][] = ['vialo', 'cueword', 'triage', 'suture'];

/**
 * The stage's cards. `crosswordOpen` is the crossword's launch switch (site.ts); closed, its line is "coming soon."
 * (deck rule [C]). Hello cards is a draft game, so it is always tagged coming soon ([C]).
 */
export function homeGameCards(crosswordOpen: boolean): HomeGameCard[] {
  const daily = deckOrder.map((id): HomeGameCard => {
    const game = dailyGames.find((entry) => entry.id === id)!;
    const available = game.ready && (id !== 'cueword' || crosswordOpen);
    const line = available ? (drawnLines[id] ?? firstSentence(game.line)) : 'coming soon.';
    return { name: game.name, line, available };
  });
  return [...daily, { name: helloCardsGame.name, line: helloCardsLine, available: false }];
}

const numberWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] as const;

/** A small count in words, in the lowercase brand voice; larger counts stay as digits. */
export function countWord(count: number): string {
  return numberWords[count] ?? String(count);
}

/** The deck's games line, with the number of games that can be played today. */
export function homeGamesSummary(cards: readonly HomeGameCard[]): string {
  const live = cards.filter((card) => card.available).length;
  return `a new set of nursing games each day. play one, or all ${countWord(live)}.`;
}

/** "01 / 05": the active card's position and the number of cards, two digits each. */
export function stageCounter(position: number, total: number): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(position)} / ${pad(total)}`;
}

/**
 * The short line for each game on the /play hub, in the same words the home page's daily-games cards show
 * (src/components/DailyGamesSection.astro, the approved Home v2 copy), so a hub row is one or two lines.
 */
export const hubLines = {
  vialo: 'guess the five-letter word in six tries.',
  tachyyy: 'quick questions against the clock.',
  piccline: 'trace hidden words through the letters.',
  crossword: "a mini crossword from this week's lessons.",
  sudoku: 'a calm numbers break.',
  helloCards: helloCardsLine,
} as const;
