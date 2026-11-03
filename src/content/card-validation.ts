export type CardIdentity = { id: string };

/** Return content-build problems for card decks with ambiguous progress identities. */
export function cardContentProblems(cards: CardIdentity[]): string[] {
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const card of cards) {
    if (seen.has(card.id)) problems.push(`card id "${card.id}" is repeated`);
    seen.add(card.id);
  }
  return problems;
}
