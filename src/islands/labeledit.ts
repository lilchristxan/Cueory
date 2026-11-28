/**
 * Pure logic for editing a "label it" set (Christian, 2026-11-26: "make it editable for users"), kept separate so it
 * can be unit tested. A student can move, resize, add, rename and delete the covers on a picture, and use a picture of
 * their own. Everything stays in the page's memory: nothing here stores or sends anything.
 *
 * Boxes use the same units as labelit.ts: percentages of the picture, x and y being the top-left corner.
 */
import { parseSet, type Label, type LabelImage, type LabelSet } from './labelit';

/** A cover is never smaller than this, in percent of the picture, so it can always be tapped and seen. */
export const MIN_BOX = 4;
/** At most this many covers on one picture. */
export const MAX_LABELS = 40;
/** A label's words are cut to this many characters. */
export const MAX_TEXT = 80;
/** How many steps undo remembers. */
export const MAX_HISTORY = 50;
/** A student's own picture is scaled down so its longer side is at most this many pixels. */
export const MAX_PICTURE_SIDE = 1280;
/** A picture's data URL may be at most this long (about 1.5 MB of image data). */
export const MAX_PICTURE_CHARS = 2_000_000;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EditState {
  set: LabelSet;
  /** The cover being edited, if any. */
  selected: string | null;
  past: LabelSet[];
  future: LabelSet[];
}

const round = (n: number) => Math.round(n * 100) / 100;
const within = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** A box of at least the smallest size, moved and trimmed so all of it is inside the picture. */
export function clampBox(box: Box): Box {
  const w = within(Number.isFinite(box.w) ? box.w : MIN_BOX, MIN_BOX, 100);
  const h = within(Number.isFinite(box.h) ? box.h : MIN_BOX, MIN_BOX, 100);
  const x = within(Number.isFinite(box.x) ? box.x : 0, 0, 100 - w);
  const y = within(Number.isFinite(box.y) ? box.y : 0, 0, 100 - h);
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

/** The box between two corners of a drag, whichever way the drag went. */
export function boxFromDrag(ax: number, ay: number, bx: number, by: number): Box {
  return clampBox({ x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) });
}

export function startEdit(set: LabelSet): EditState {
  return { set, selected: null, past: [], future: [] };
}

function commit(state: EditState, set: LabelSet, selected: string | null = state.selected): EditState {
  if (set === state.set) return { ...state, selected };
  return { set, selected, past: [...state.past, state.set].slice(-MAX_HISTORY), future: [] };
}

const withLabels = (set: LabelSet, labels: Label[]): LabelSet => ({ ...set, labels });

/** A new id that no cover in the set uses. */
export function freshId(labels: readonly Pick<Label, 'id'>[]): string {
  const used = new Set(labels.map((label) => label.id));
  for (let n = labels.length + 1; ; n++) {
    const id = `label-${n}`;
    if (!used.has(id)) return id;
  }
}

/** Add a cover (selected, with no words yet). Nothing happens once the picture has the most covers allowed. */
export function addLabel(state: EditState, box: Box = { x: 40, y: 44, w: 20, h: 12 }): EditState {
  if (state.set.labels.length >= MAX_LABELS) return state;
  const id = freshId(state.set.labels);
  return commit(state, withLabels(state.set, [...state.set.labels, { id, text: '', ...clampBox(box) }]), id);
}

function change(state: EditState, id: string, next: (label: Label) => Label): EditState {
  let changed = false;
  const labels = state.set.labels.map((label) => {
    if (label.id !== id) return label;
    const updated = next(label);
    if (updated.x !== label.x || updated.y !== label.y || updated.w !== label.w || updated.h !== label.h || updated.text !== label.text) changed = true;
    return updated;
  });
  return changed ? commit(state, withLabels(state.set, labels), id) : { ...state, selected: state.selected };
}

/** Put a cover's box somewhere new (the end of a drag, or an arrow key). */
export function setBox(state: EditState, id: string, box: Box): EditState {
  return change(state, id, (label) => ({ ...label, ...clampBox(box) }));
}

export function moveLabel(state: EditState, id: string, dx: number, dy: number): EditState {
  return change(state, id, (label) => ({ ...label, ...clampBox({ x: label.x + dx, y: label.y + dy, w: label.w, h: label.h }) }));
}

/** Grow or shrink a cover from its bottom-right corner; it never leaves the picture. */
export function resizeLabel(state: EditState, id: string, dw: number, dh: number): EditState {
  return change(state, id, (label) => {
    const w = within(label.w + dw, MIN_BOX, 100 - label.x);
    const h = within(label.h + dh, MIN_BOX, 100 - label.y);
    return { ...label, w: round(w), h: round(h) };
  });
}

/** The words under a cover. Line breaks become spaces and the text is cut to MAX_TEXT. */
export function renameLabel(state: EditState, id: string, text: string): EditState {
  const clean = text.replace(/\s+/g, ' ').slice(0, MAX_TEXT);
  return change(state, id, (label) => ({ ...label, text: clean }));
}

export function deleteLabel(state: EditState, id: string): EditState {
  if (!state.set.labels.some((label) => label.id === id)) return state;
  return commit(state, withLabels(state.set, state.set.labels.filter((label) => label.id !== id)), state.selected === id ? null : state.selected);
}

export function select(state: EditState, id: string | null): EditState {
  if (id !== null && !state.set.labels.some((label) => label.id === id)) return state;
  return { ...state, selected: id };
}

export function undo(state: EditState): EditState {
  const previous = state.past[state.past.length - 1];
  if (!previous) return state;
  const selected = previous.labels.some((label) => label.id === state.selected) ? state.selected : null;
  return { set: previous, selected, past: state.past.slice(0, -1), future: [state.set, ...state.future] };
}

export function redo(state: EditState): EditState {
  const next = state.future[0];
  if (!next) return state;
  const selected = next.labels.some((label) => label.id === state.selected) ? state.selected : null;
  return { set: next, selected, past: [...state.past, state.set], future: state.future.slice(1) };
}

/** A different picture starts with no covers: the old boxes belonged to the old picture. */
export function withPicture(state: EditState, image: LabelImage): EditState {
  return commit(state, { ...state.set, image, labels: [] }, null);
}

/** Why the set cannot be studied yet, in words for the student, or null when it can. */
export function studyProblem(set: LabelSet): string | null {
  if (set.labels.length === 0) return 'cover at least one label first.';
  if (set.labels.some((label) => label.text.trim() === '')) return 'type the words under every cover first.';
  try {
    parseSet(set);
  } catch {
    return 'one of the covers is outside the picture. move it back and try again.';
  }
  return null;
}

/** The size to draw a picture at so its longer side is at most `max` pixels. Never larger than the picture itself. */
export function fitSize(width: number, height: number, max = MAX_PICTURE_SIDE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** True for a picture made in this page from the student's own file: an image data URL of a size we accept. */
export function isOwnPicture(src: string): boolean {
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src) && src.length <= MAX_PICTURE_CHARS;
}

/** The image entry for a student's own picture. */
export function ownImage(src: string, width: number, height: number): LabelImage {
  return { src, alt: 'your own picture', width, height, credit: 'your own picture. it stays in this page and is not uploaded.' };
}
