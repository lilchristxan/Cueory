/**
 * "What's next to this?" (Task 178, part B): the structures nearest a chosen one, by the distance between the
 * centers of their bounding boxes, and a "radius blast" that reveals them when they are hidden. Pure math over plain
 * number triples, so it is unit tested with synthetic boxes; the scene feeds it from its three.js Box3 values.
 */

export type Vec3 = readonly [number, number, number];

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export interface NearbyStructure {
  id: string;
  /** Distance between the two box centers, in the model's units (metres in the lab's glTF files). */
  distance: number;
}

/** The middle of a box. */
export function boxCenter(box: Bounds): [number, number, number] {
  return [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
}

function isFinitePoint(point: Vec3): boolean {
  return point.length === 3 && point.every((value) => Number.isFinite(value));
}

/**
 * Build the boxes map from anything that exposes `id` and `box: { min, max }`, where min and max are either number
 * triples or objects with x, y, z (a three.js Box3's Vector3 corners). Entries with an empty or non-finite box are
 * skipped, so an unloaded structure never ranks as "nearby" at distance 0.
 */
export function boxesFromMeshes(
  entries: Iterable<{ id: string; box: { min: Vec3 | { x: number; y: number; z: number }; max: Vec3 | { x: number; y: number; z: number } } }>,
): Map<string, Bounds> {
  const boxes = new Map<string, Bounds>();
  for (const { id, box } of entries) {
    const min = toTriple(box.min);
    const max = toTriple(box.max);
    if (!isFinitePoint(min) || !isFinitePoint(max)) continue;
    if (min[0] > max[0] || min[1] > max[1] || min[2] > max[2]) continue;
    boxes.set(id, { min, max });
  }
  return boxes;
}

function toTriple(point: Vec3 | { x: number; y: number; z: number }): Vec3 {
  if (Array.isArray(point)) return point as Vec3;
  const { x, y, z } = point as { x: number; y: number; z: number };
  return [x, y, z];
}

/**
 * The `limit` structures nearest to `id`, nearest first, never the structure itself. Ties keep the map's insertion
 * order, so the result is the same on every call. An unknown id, or a limit below 1, gives an empty list.
 */
export function nearbyStructures(boxes: ReadonlyMap<string, Bounds>, id: string, limit = 8): NearbyStructure[] {
  const own = boxes.get(id);
  if (!own || !Number.isSafeInteger(limit) || limit < 1) return [];
  const [x, y, z] = boxCenter(own);
  const ranked: NearbyStructure[] = [];
  for (const [other, box] of boxes) {
    if (other === id) continue;
    const [ox, oy, oz] = boxCenter(box);
    const distance = Math.hypot(ox - x, oy - y, oz - z);
    if (!Number.isFinite(distance)) continue;
    ranked.push({ id: other, distance });
  }
  // Array.prototype.sort is stable, so equal distances stay in insertion order.
  ranked.sort((a, b) => a.distance - b.distance);
  return ranked.slice(0, limit);
}

/** A new hidden set with the nearby structures shown again (the "radius blast"). The given set is not changed. */
export function expandNearby(hidden: ReadonlySet<string>, nearbyIds: Iterable<string>): Set<string> {
  const next = new Set(hidden);
  for (const id of nearbyIds) next.delete(id);
  return next;
}
