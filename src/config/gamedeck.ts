/**
 * The order of the card deck at the right edge of a game page (Games v2). The games sit in one loop, and the front card
 * is the NEXT game in it; the cards behind follow in order. A game that is closed in this build is skipped, and the game
 * you are on is never shown. The ids are GameFrame's game ids.
 */
export const DECK_LOOP = ['pulse', 'hello-cards', 'triage', 'cueword', 'suture', 'stat'] as const;

export type DeckGameId = (typeof DECK_LOOP)[number];

/** The ids to show, front card first: the loop read from just after `current`, open games only. */
export function deckOrder(current: string, isOpen: (id: DeckGameId) => boolean): DeckGameId[] {
  const start = DECK_LOOP.indexOf(current as DeckGameId);
  // An unknown game starts the loop from its beginning.
  const turned = start < 0 ? [...DECK_LOOP] : [...DECK_LOOP.slice(start + 1), ...DECK_LOOP.slice(0, start)];
  return turned.filter((id) => id !== current && isOpen(id));
}
