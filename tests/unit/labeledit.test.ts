import { describe, expect, it } from 'vitest';
import type { LabelSet } from '../../src/islands/labelit';
import {
  addLabel, boxFromDrag, clampBox, deleteLabel, fitSize, freshId, isOwnPicture, MAX_LABELS, MAX_PICTURE_CHARS, MAX_TEXT, MIN_BOX,
  moveLabel, ownImage, redo, renameLabel, resizeLabel, select, setBox, startEdit, studyProblem, undo, withPicture,
} from '../../src/islands/labeledit';

const set: LabelSet = {
  id: 'sample',
  image: { src: '/a.svg', alt: 'a drawing', width: 800, height: 600, credit: 'drawing: cueory' },
  labels: [
    { id: 'roof', text: 'roof', x: 10, y: 10, w: 20, h: 10 },
    { id: 'door', text: 'door', x: 50, y: 80, w: 14, h: 8 },
  ],
};

describe('label it editor', () => {
  it('keeps every box inside the picture and at least the smallest size', () => {
    expect(clampBox({ x: -5, y: 98, w: 1, h: 300 })).toEqual({ x: 0, y: 0, w: MIN_BOX, h: 100 });
    expect(clampBox({ x: 95, y: 95, w: 20, h: 20 })).toEqual({ x: 80, y: 80, w: 20, h: 20 });
    expect(clampBox({ x: Number.NaN, y: 10, w: Number.POSITIVE_INFINITY, h: 10 })).toEqual({ x: 0, y: 10, w: MIN_BOX, h: 10 });
    expect(boxFromDrag(60, 70, 30, 40)).toEqual({ x: 30, y: 40, w: 30, h: 30 });
    expect(boxFromDrag(10, 10, 11, 11)).toEqual({ x: 10, y: 10, w: MIN_BOX, h: MIN_BOX });
  });

  it('adds a selected cover with a fresh id, up to the limit', () => {
    let state = addLabel(startEdit(set), { x: 30, y: 30, w: 10, h: 10 });
    expect(state.selected).toBe('label-3');
    expect(state.set.labels[2]).toEqual({ id: 'label-3', text: '', x: 30, y: 30, w: 10, h: 10 });
    expect(freshId([{ id: 'label-2' }, { id: 'label-3' }])).toBe('label-4');
    for (let i = 0; i < MAX_LABELS + 5; i++) state = addLabel(state);
    expect(state.set.labels).toHaveLength(MAX_LABELS);
  });

  it('moves, resizes and places a cover without letting it leave the picture', () => {
    const start = startEdit(set);
    expect(moveLabel(start, 'roof', 5, -50).set.labels[0]).toMatchObject({ x: 15, y: 0 });
    expect(moveLabel(start, 'roof', 500, 0).set.labels[0]).toMatchObject({ x: 80, w: 20 });
    expect(resizeLabel(start, 'roof', 500, -500).set.labels[0]).toMatchObject({ x: 10, w: 90, h: MIN_BOX });
    expect(setBox(start, 'door', { x: 99, y: 99, w: 30, h: 30 }).set.labels[1]).toMatchObject({ x: 70, y: 70, w: 30, h: 30 });
    // An unknown id, or a change that changes nothing, leaves the set and the history alone.
    expect(moveLabel(start, 'nope', 5, 5).set).toBe(set);
    expect(moveLabel(start, 'roof', 0, 0).past).toHaveLength(0);
  });

  it('renames with tidy text and deletes', () => {
    const start = startEdit(set);
    const renamed = renameLabel(start, 'roof', `  the\nroof ${'x'.repeat(200)}`);
    expect(renamed.set.labels[0]!.text).toHaveLength(MAX_TEXT);
    expect(renamed.set.labels[0]!.text.startsWith(' the roof ')).toBe(true);
    const gone = deleteLabel(select(start, 'roof'), 'roof');
    expect(gone.set.labels.map((label) => label.id)).toEqual(['door']);
    expect(gone.selected).toBeNull();
    expect(select(start, 'missing').selected).toBeNull();
  });

  it('undoes and redoes each step, and a new step clears redo', () => {
    let state = moveLabel(startEdit(set), 'roof', 5, 0);
    state = renameLabel(state, 'roof', 'chimney');
    expect(undo(state).set.labels[0]).toMatchObject({ text: 'roof', x: 15 });
    expect(undo(undo(state)).set).toBe(set);
    expect(undo(undo(undo(state))).set).toBe(set);
    expect(redo(undo(state)).set.labels[0]!.text).toBe('chimney');
    const branched = deleteLabel(undo(state), 'door');
    expect(branched.future).toHaveLength(0);
    expect(redo(branched)).toBe(branched);
  });

  it('says in words why a set cannot be studied yet', () => {
    expect(studyProblem(set)).toBeNull();
    expect(studyProblem({ ...set, labels: [] })).toBe('cover at least one label first.');
    expect(studyProblem(addLabel(startEdit(set)).set)).toBe('type the words under every cover first.');
  });

  it("uses a student's own picture only when it is an image made in the page, and starts it with no covers", () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(fitSize(600, 400)).toEqual({ width: 600, height: 400 });
    expect(fitSize(0, 10)).toEqual({ width: 0, height: 0 });
    expect(isOwnPicture('data:image/jpeg;base64,AAAA')).toBe(true);
    expect(isOwnPicture('data:text/html;base64,AAAA')).toBe(false);
    expect(isOwnPicture('https://example.com/a.png')).toBe(false);
    expect(isOwnPicture(`data:image/png;base64,${'A'.repeat(MAX_PICTURE_CHARS)}`)).toBe(false);
    const own = withPicture(startEdit(set), ownImage('data:image/jpeg;base64,AAAA', 640, 480));
    expect(own.set.labels).toEqual([]);
    expect(own.set.image.credit).toContain('not uploaded');
    expect(undo(own).set).toBe(set);
  });
});
