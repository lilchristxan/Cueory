/**
 * The anatomy lab's selected-structure inspector (Task 178, redesign part 2): the rows on its card, the index of the
 * selected structure's group, keyboard stepping through that index, the leader line from the selection to the card,
 * and the way its "flag or comment" button reaches the page's existing flag. Pure logic, unit tested
 * (tests/unit/anatomy-inspector.test.ts). Every word shown comes from the source files, never from here.
 */

import type { AnatomyStructure } from './anatomylab';

export interface InspectorRow {
  label: 'system' | 'group' | 'dataset' | 'source id';
  value: string;
}

/**
 * The card's rows: "system" is the structure's layer (the body system's own title when the source gives no layer),
 * "group" its group, "dataset" the manifest release, "source id" its mesh id. A row with nothing to say is left out.
 */
export function inspectorRows(
  structure: Pick<AnatomyStructure, 'id' | 'group' | 'layer'>,
  systemTitle: string,
  release: string | undefined,
  group: string | undefined,
): InspectorRow[] {
  const rows: InspectorRow[] = [{ label: 'system', value: structure.layer ?? systemTitle }];
  if (group) rows.push({ label: 'group', value: group });
  if (release) rows.push({ label: 'dataset', value: release });
  rows.push({ label: 'source id', value: structure.id });
  return rows;
}

export interface GroupIndex {
  group: string;
  items: { id: string; text: string }[];
}

/** The structures that share the selected one's group, in the source's order; null when it has no group. */
export function groupIndex<T extends Pick<AnatomyStructure, 'id' | 'text' | 'group'>>(
  structures: readonly T[],
  selectedId: string,
  group: string | undefined,
  sameTree: (structure: T) => boolean = () => true,
): GroupIndex | null {
  if (!group || !structures.some((structure) => structure.id === selectedId)) return null;
  const items = structures
    .filter((structure) => structure.group === group && sameTree(structure))
    .map((structure) => ({ id: structure.id, text: structure.text }));
  return items.length > 0 ? { group, items } : null;
}

/** "index · <group> · 6 structures", counted in words from the data. */
export function indexHeading(index: GroupIndex): string {
  return `index · ${index.group} · ${index.items.length === 1 ? '1 structure' : `${index.items.length} structures`}`;
}

/**
 * Where focus goes when a key is pressed on row `current` of `count`: up and down step one row, home and end go to the
 * ends, and nothing wraps. Null when the key is not one of those, or when focus would not move.
 */
export function indexStep(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  let next: number;
  if (key === 'ArrowDown') next = Math.min(count - 1, current + 1);
  else if (key === 'ArrowUp') next = Math.max(0, current - 1);
  else if (key === 'Home') next = 0;
  else if (key === 'End') next = count - 1;
  else return null;
  return next === current ? null : next;
}

export interface Point { x: number; y: number }
export interface Segment { x1: number; y1: number; x2: number; y2: number }

/**
 * The leader line from the ring around the selection to the card: it starts on the ring's edge, on the side facing
 * `target`, and ends at `target`. Null when the target is inside the ring (nothing to draw).
 */
export function leaderSegment(center: Point, radius: number, target: Point): Segment | null {
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  const length = Math.hypot(dx, dy);
  if (!(length > radius)) return null;
  return { x1: center.x + (dx / length) * radius, y1: center.y + (dy / length) * radius, x2: target.x, y2: target.y };
}
