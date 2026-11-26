/** Sent on `window` after a forfeit (detail: { game, day }), so the game on screen ends as lost for that day. */
export const FORFEIT_EVENT = 'cueory:game-forfeited';

/** Where the forfeits of this visit are remembered on the page (announceForfeit, in the print gate, writes them). */
export const FORFEIT_MEMORY_ATTR = 'data-print-forfeits';

/** The levels forfeited this visit for that game and day (an empty string for a game without levels); empty when none. */
export function rememberedForfeits(game: string, day: string): string[] {
  if (typeof document === 'undefined') return [];
  return (document.documentElement.getAttribute(FORFEIT_MEMORY_ATTR) ?? '').split(' ')
    .map((entry) => entry.split('|'))
    .filter((parts) => parts[0] === game && parts[1] === day)
    .map((parts) => parts[2] ?? '');
}
