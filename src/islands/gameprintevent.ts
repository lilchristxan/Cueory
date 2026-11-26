/**
 * One print mechanism for the Frame (Christian, 25 Nov): the printer button in a game page's corner does not print and
 * does not decide anything. It announces `cueory:print` on the document with the game's id, and the game's own code
 * answers: a finished game prints, an unfinished one asks first (vialo, the print-to-share helper); sudoku, crossword and
 * piccline run what their old print buttons ran. Plain file so it can be unit tested.
 */
export const PRINT_EVENT = 'cueory:print';

export interface PrintEventTarget {
  dispatchEvent(event: Event): boolean;
}

/** The ids a game page announces: the same ids the game's print rules use (gameprint.ts). */
export function requestPrint(game: string, target: PrintEventTarget = document): void {
  target.dispatchEvent(new CustomEvent(PRINT_EVENT, { detail: { game } }));
}

/** The game id carried by a print event, or undefined when the event is not a well-formed one. */
export function printEventGame(event: Event): string | undefined {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!detail || typeof detail !== 'object') return undefined;
  const { game } = detail as { game?: unknown };
  return typeof game === 'string' ? game : undefined;
}
