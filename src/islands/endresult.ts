/**
 * The end-of-game block's home. On a desktop window every game's finish block (a short result word, one figure, the
 * share button and the wait for the next puzzle) shows in the game frame's left side panel, in the mount element below.
 * On tablets and phones the panel is a strip above the board, so the block stays under the board there (the CSS hides the
 * mount below the tablet breakpoint). Plain file so the choice can be unit tested.
 */
export const END_RESULT_SLOT_ID = 'game-frame-end-slot';

/** The panel's mount, or null when the page has none or the layout hides it (tablet and phone). */
export function findEndSlot(doc: Pick<Document, 'getElementById'>, style: (node: Element) => { display: string }): HTMLElement | null {
  const slot = doc.getElementById(END_RESULT_SLOT_ID);
  if (!slot) return null;
  return style(slot).display === 'none' ? null : slot;
}

/** The parts of one line, in order, without the empty ones: "5/6 · 0:31". */
export function joinFigure(parts: ReadonlyArray<string | undefined | false>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' · ');
}

/** "next word in 2 h 14 min" (the wait is empty for a moment before the first tick, so nothing half-written shows). */
export function nextLine(label: string, wait: string): string | undefined {
  return wait ? `${label} in ${wait}` : undefined;
}
