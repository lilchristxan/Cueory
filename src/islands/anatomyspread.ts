/**
 * "Spread structures apart" (Christian, 2026-11-27): at 100% every structure of the open body system sits on its own
 * spot of a flat board, in tidy rows, instead of where it is in the body. This file only works out the spots; the
 * scene (anatomyscene.ts) slides each structure from its place in the body toward its spot as the slider moves.
 *
 * Rows are packed like shelves: the tallest structures first, left to right, each row as tall as its tallest part.
 * A uniform grid would give every small part a cell as large as the largest one, and the small parts would vanish.
 */

/** One structure as seen from the front: its width and height on the board, in model units. */
export interface SpreadItem {
  id: string;
  width: number;
  height: number;
}

/** Where a structure's middle goes on the board: `u` runs right, `v` runs up, both measured from the board's middle. */
export interface SpreadSpot {
  u: number;
  v: number;
}

/** The board is about this much wider than tall, like the window it is shown in. */
const BOARD_ASPECT = 1.6;
/** The space between neighbours, as a share of the average height. */
const GAP_SHARE = 0.12;

export function spreadBoard(items: readonly SpreadItem[]): Map<string, SpreadSpot> {
  const spots = new Map<string, SpreadSpot>();
  const usable = items.filter((item) => Number.isFinite(item.width) && Number.isFinite(item.height) && item.width >= 0 && item.height >= 0);
  if (usable.length === 0) return spots;
  const sorted = [...usable].sort((a, b) => b.height - a.height || b.width - a.width || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const gap = (sorted.reduce((sum, item) => sum + item.height, 0) / sorted.length) * GAP_SHARE;
  const area = sorted.reduce((sum, item) => sum + (item.width + gap) * (item.height + gap), 0);
  const widest = Math.max(...sorted.map((item) => item.width));
  const rowWidth = Math.max(Math.sqrt(area * BOARD_ASPECT), widest);

  const rows: { items: SpreadItem[]; width: number; height: number }[] = [];
  for (const item of sorted) {
    const row = rows[rows.length - 1];
    if (row && row.width + gap + item.width <= rowWidth) {
      row.items.push(item);
      row.width += gap + item.width;
      row.height = Math.max(row.height, item.height);
    } else {
      rows.push({ items: [item], width: item.width, height: item.height });
    }
  }

  const boardHeight = rows.reduce((sum, row) => sum + row.height, 0) + gap * (rows.length - 1);
  let top = boardHeight / 2;
  for (const row of rows) {
    let left = -row.width / 2;
    for (const item of row.items) {
      spots.set(item.id, { u: left + item.width / 2, v: top - row.height / 2 });
      left += item.width + gap;
    }
    top -= row.height + gap;
  }
  return spots;
}
