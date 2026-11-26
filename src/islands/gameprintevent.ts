/**
 * One print mechanism for the Frame (Christian, 25 Nov): the printer button in a game page's corner does not print and
 * does not decide anything. It announces `cueory:print` on the document with the game's id, and the game's own code
 * answers: a finished game prints, an unfinished one asks first (vialo, the print-to-share helper); sudoku, crossword and
 * piccline run what their old print buttons ran. Plain file so it can be unit tested.
 *
 * The Frame's controls often hydrate before the game. A press that finds no game listening is remembered (once per game)
 * and answered the moment the game's listener registers, so a click on a slow load is never lost.
 */
export const PRINT_EVENT = 'cueory:print';

export interface PrintEventTarget {
  dispatchEvent(event: Event): boolean;
}

const listening = new Map<string, number>();
const pending = new Set<string>();

/** A game's listener (usePrintRequest) is registered. Returns true when a press was waiting for it. */
export function registerPrintListener(game: string): boolean {
  listening.set(game, (listening.get(game) ?? 0) + 1);
  return pending.delete(game);
}

export function unregisterPrintListener(game: string): void {
  const left = (listening.get(game) ?? 0) - 1;
  if (left <= 0) listening.delete(game); else listening.set(game, left);
}

/** The ids a game page announces: the same ids the game's print rules use (gameprint.ts). */
export function requestPrint(game: string, target: PrintEventTarget = document): void {
  if (!listening.has(game)) pending.add(game);
  target.dispatchEvent(new CustomEvent(PRINT_EVENT, { detail: { game } }));
}

/** Test hook: forget every listener and waiting press. */
export function resetPrintRequests(): void {
  listening.clear();
  pending.clear();
}

/** The game id carried by a print event, or undefined when the event is not a well-formed one. */
export function printEventGame(event: Event): string | undefined {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!detail || typeof detail !== 'object') return undefined;
  const { game } = detail as { game?: unknown };
  return typeof game === 'string' ? game : undefined;
}
