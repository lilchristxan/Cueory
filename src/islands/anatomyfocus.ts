/**
 * "Choose what to focus on" (Task 178): the structures a student picks in the anatomy lab, and the hand-off of that
 * choice to "label it" and back. Pure logic, no DOM and no three.js, so it is unit tested (tests/unit/anatomyfocus.test.ts).
 *
 * A focus set is a list of structure ids that exist in content/visuals/anatomy-*.json. It travels as one short query
 * value, `?focus=FMA1,FMA2`: ids only, checked against the ids this build knows, unknown ones dropped, length capped.
 * It holds no name, no account and no personal data. The last set is kept on the device (localStorage) so a student
 * who comes back finds it again; storage that is missing or refuses to write is ignored. The storage functions take the
 * key from the caller and the lab does not call them yet: a new browser key must first be listed in
 * src/config/storage-keys.ts and described on /privacy (Christian approves that wording).
 */

/** The query name carrying the set, in the lab's address and in label it's. */
export const FOCUS_PARAM = 'focus';
/** The most structures one set holds, which keeps the address short. */
export const MAX_FOCUS = 100;
/** Where "practise these" goes, and where "see it in the lab" returns to. */
export const LABEL_IT_PATH = '/learn/study-skills/label-it';
export const LAB_PATH = '/preview/anatomy-lab';

/** The shape of every id in content/visuals/anatomy-*.json (BodyParts3D FMA ids) and the browser tests' fixture. */
const ID_SHAPE = /^(FMA\d{1,9}|FIX\d{1,6}|fixture-[a-z0-9-]{1,40})$/;

export type KnownIds = ReadonlySet<string>;

/** Keeps the first occurrence of each id that has a valid shape and, when `known` is given, exists; capped at MAX_FOCUS. */
export function cleanFocus(ids: readonly unknown[], known?: KnownIds): string[] {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.size >= MAX_FOCUS) break;
    if (typeof id !== 'string' || !ID_SHAPE.test(id)) continue;
    if (known && !known.has(id)) continue;
    seen.add(id);
  }
  return [...seen];
}

/** The query value for a set: ids joined by commas (every character is URL-safe already). Empty when nothing is chosen. */
export function encodeFocus(ids: readonly string[], known?: KnownIds): string {
  return cleanFocus(ids, known).join(',');
}

/** The set a query value describes. Anything that is not a known id is dropped; never throws. */
export function decodeFocus(value: string | null | undefined, known?: KnownIds): string[] {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_FOCUS * 40) return [];
  return cleanFocus(value.split(','), known);
}

/** The set in a page's query string ("?focus=…"), or an empty set. */
export function focusFromQuery(search: string, known?: KnownIds): string[] {
  return decodeFocus(new URLSearchParams(search).get(FOCUS_PARAM), known);
}

/** A same-site address for a path carrying the set; the bare path when the set is empty. */
export function withFocus(path: string, ids: readonly string[], known?: KnownIds): string {
  const value = encodeFocus(ids, known);
  return value ? `${path}?${FOCUS_PARAM}=${value}` : path;
}

/** The "practise these in label it" address. */
export const labelItHref = (ids: readonly string[], known?: KnownIds): string => withFocus(LABEL_IT_PATH, ids, known);
/** The "see it in the lab" address, for label it to link to. */
export const labHref = (ids: readonly string[], known?: KnownIds): string => withFocus(LAB_PATH, ids, known);

/** Adds the id, or takes it out when already chosen. A full set refuses a new id and says so through `full`. */
export function toggleFocus(ids: readonly string[], id: string): { ids: string[]; full: boolean } {
  if (ids.includes(id)) return { ids: ids.filter((x) => x !== id), full: false };
  if (!ID_SHAPE.test(id)) return { ids: [...ids], full: false };
  if (ids.length >= MAX_FOCUS) return { ids: [...ids], full: true };
  return { ids: [...ids, id], full: false };
}

/** Adds every id (up to the cap) when some are missing; takes them all out when every one is already chosen. */
export function toggleFocusGroup(ids: readonly string[], group: readonly string[]): { ids: string[]; full: boolean } {
  const chosen = new Set(ids);
  if (group.length > 0 && group.every((id) => chosen.has(id))) {
    const drop = new Set(group);
    return { ids: ids.filter((id) => !drop.has(id)), full: false };
  }
  const merged = cleanFocus([...ids, ...group]);
  return { ids: merged, full: merged.length < new Set([...ids, ...group]).size };
}

/** The words for the count, always with the number. */
export function focusCountWords(count: number): string {
  return count === 0 ? 'none chosen' : count === 1 ? '1 chosen' : `${count} chosen`;
}

/** What to show in place of the link while nothing is chosen. */
export const FOCUS_EMPTY_NOTE = 'choose at least one structure to practise it in label it.';

/** Ids that should fade: every listed id that is not chosen, or none while the set is empty (nothing to focus on). */
export function fadedByFocus(allIds: readonly string[], chosen: readonly string[]): Set<string> {
  const keep = new Set(chosen);
  if (!allIds.some((id) => keep.has(id))) return new Set();
  return new Set(allIds.filter((id) => !keep.has(id)));
}

/* ---------- On the device ---------- */

export type FocusStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The device's storage, or null when the browser has none or refuses access. */
export function browserFocusStorage(): FocusStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The last saved set, checked against the known ids. Empty when nothing is saved, or the storage or its content is bad. */
export function readFocus(storage: FocusStorage | null, key: string, known?: KnownIds): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    return raw ? decodeFocus(raw, known) : [];
  } catch {
    return [];
  }
}

/** Saves the set; an empty set clears the saved one. Returns false when the device would not take it. */
export function saveFocus(storage: FocusStorage | null, key: string, ids: readonly string[], known?: KnownIds): boolean {
  if (!storage) return false;
  try {
    const value = encodeFocus(ids, known);
    if (value) storage.setItem(key, value);
    else storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/* ---------- The label it side ---------- */

/**
 * The adapter label it calls. Give it the labels of the set being studied (each has an `id`) and the page's query
 * string. It returns only the labels whose ids are in the focus set, or null when the set is empty or none of its ids
 * is on this diagram, so label it quizzes everything as before instead of showing an empty round. Label ids and
 * structure ids are the same ids (the data contract with Task 177).
 */
export function labelsForFocus<T extends { id: string }>(labels: readonly T[], search: string): T[] | null {
  const wanted = new Set(focusFromQuery(search));
  if (wanted.size === 0) return null;
  const picked = labels.filter((label) => wanted.has(label.id));
  return picked.length > 0 ? picked : null;
}
