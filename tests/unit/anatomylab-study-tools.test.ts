import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CAMERA_MOVE_MS,
  COMPARE_SYNC_MS,
  compareSyncDelay,
  compareSyncDue,
  DEFAULT_MODE,
  EMPTY_VISIBILITY,
  FADED_MARK,
  HISTORY_CAP,
  LAB_MODES,
  POLE_TILT,
  VIEW_PRESETS,
  cameraForPreset,
  cameraMoveDuration,
  cameraPosition,
  canRedo,
  canUndo,
  createHistory,
  fadeStructure,
  focusCamera,
  hideStructure,
  historyShortcut,
  homePreset,
  isLabMode,
  labelTextFor,
  lerpVec3,
  modeLabel,
  moveProgress,
  postureAngleX,
  presetDirection,
  push,
  recallLegend,
  recallNumbers,
  redo,
  restoreAll,
  rotateX,
  savedVisibility,
  structureState,
  tapAction,
  toggleFaded,
  undo,
  visibilityEquals,
  type Visibility,
} from '../../src/islands/anatomylab';

import { needsSavedViewConsent } from '../../src/islands/anatomylazy';

describe('saved view downloads on phones', () => {
  it('asks consent for exactly the uncached files in that view, even one file', () => {
    expect(needsSavedViewConsent(true, [])).toBe(false);
    expect(needsSavedViewConsent(true, ['one-unloaded.glb'])).toBe(true);
    expect(needsSavedViewConsent(true, ['one-unloaded.glb', 'two-unloaded.glb'])).toBe(true);
    expect(needsSavedViewConsent(false, ['one-unloaded.glb'])).toBe(false);
  });
});

const vis = (hidden: string[] = [], faded: string[] = []): Visibility => ({ hidden: new Set(hidden), faded: new Set(faded) });

describe('saved visibility in lazy whole-body views', () => {
  it('preserves source-valid but unloaded hidden and faded IDs while dropping nonexistent ones', () => {
    const sourceIds = new Set(['FIX001', 'FIX002', 'FIX003']);
    const snapshot = { hidden: ['FIX002', 'invalid'], faded: ['FIX003', 'FIX002', 'invalid'] };
    expect(savedVisibility(snapshot, sourceIds)).toEqual({
      hidden: new Set(['FIX002']), faded: new Set(['FIX003']),
    });
    // Loaded-only filtering used to drop the saved intent for both deeper-layer IDs.
    expect(savedVisibility(snapshot, new Set(['FIX001']))).toEqual(vis());
  });
});

describe('compare camera trailing sync', () => {
  it('schedules a final camera copy when the last rendered frame falls inside the throttle window', () => {
    expect(COMPARE_SYNC_MS).toBe(50);
    expect(compareSyncDue(125, 100)).toBe(false);
    expect(compareSyncDelay(125, 100)).toBe(25);
    expect(compareSyncDue(150, 100)).toBe(true);
    expect(compareSyncDelay(150, 100)).toBe(0);
    expect(compareSyncDelay(125, null)).toBe(0);
  });
});

describe('interaction modes (Task 178 study tools)', () => {
  it('starts in navigate mode, and knows both modes', () => {
    expect(DEFAULT_MODE).toBe('navigate');
    expect(LAB_MODES).toEqual(['navigate', 'hide']);
    expect(isLabMode('hide')).toBe(true);
    expect(isLabMode('erase')).toBe(false);
  });

  it('names each mode in words, so the mode is never shown by color alone', () => {
    expect(modeLabel('navigate')).toBe('navigate: tap selects');
    expect(modeLabel('hide')).toBe('hide: tap hides');
  });

  it('a tap selects in navigate mode, hides in hide mode, and always answers during a quiz', () => {
    expect(tapAction('navigate', false)).toBe('select');
    expect(tapAction('hide', false)).toBe('hide');
    expect(tapAction('hide', true)).toBe('select');
    expect(tapAction('navigate', true)).toBe('select');
  });
});

describe('fading', () => {
  it('reports shown, faded or hidden; hidden wins over faded', () => {
    expect(structureState(vis(), 'a')).toBe('shown');
    expect(structureState(vis([], ['a']), 'a')).toBe('faded');
    expect(structureState(vis(['a'], ['a']), 'a')).toBe('hidden');
    expect(FADED_MARK).toBe('(faded)');
  });

  it('toggles the faded set without touching the given one', () => {
    const faded = new Set(['a']);
    expect([...toggleFaded(faded, 'b')].sort()).toEqual(['a', 'b']);
    expect([...toggleFaded(faded, 'a')]).toEqual([]);
    expect([...faded]).toEqual(['a']);
  });

  it('fading a hidden structure brings it back as faded; fading again shows it in full', () => {
    const once = fadeStructure(vis(['a', 'b']), 'a');
    expect([...once.hidden]).toEqual(['b']);
    expect([...once.faded]).toEqual(['a']);
    const twice = fadeStructure(once, 'a');
    expect([...twice.faded]).toEqual([]);
    expect([...twice.hidden]).toEqual(['b']);
  });

  it('hiding drops the fade, so "show it" brings the structure back in full', () => {
    const hidden = hideStructure(vis([], ['a']), 'a');
    expect([...hidden.hidden]).toEqual(['a']);
    expect([...hidden.faded]).toEqual([]);
    const shown = hideStructure(hidden, 'a');
    expect(shown).toEqual(vis());
  });

  it('restore all clears both sets and compares states by content', () => {
    expect(visibilityEquals(restoreAll(vis(['a'], ['b'])), EMPTY_VISIBILITY)).toBe(true);
    expect(visibilityEquals(vis(['a']), vis(['a']))).toBe(true);
    expect(visibilityEquals(vis(['a']), vis([], ['a']))).toBe(false);
    expect(visibilityEquals(vis(['a', 'b']), vis(['a']))).toBe(false);
  });
});

describe('visibility history', () => {
  it('starts with nothing to undo or redo', () => {
    const h = createHistory(vis());
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it('push, undo and redo walk the states in order', () => {
    let h = createHistory(vis());
    h = push(h, vis(['a']), visibilityEquals);
    h = push(h, vis(['a', 'b']), visibilityEquals);
    expect(canUndo(h)).toBe(true);
    h = undo(h);
    expect([...h.present.hidden]).toEqual(['a']);
    expect(canRedo(h)).toBe(true);
    h = undo(h);
    expect(h.present).toEqual(vis());
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    h = redo(h);
    expect([...h.present.hidden]).toEqual(['a', 'b']);
    expect(canRedo(h)).toBe(false);
  });

  it('a state equal to the present records nothing, so a no-op never fills the history', () => {
    const h = push(createHistory(vis(['a'])), vis(['a']), visibilityEquals);
    expect(canUndo(h)).toBe(false);
  });

  it('a new change after an undo forgets the redo states', () => {
    let h = createHistory(vis());
    h = push(h, vis(['a']), visibilityEquals);
    h = undo(h);
    h = push(h, vis(['b']), visibilityEquals);
    expect(canRedo(h)).toBe(false);
    expect([...h.present.hidden]).toEqual(['b']);
  });

  it('keeps at most 100 earlier states, dropping the oldest', () => {
    expect(HISTORY_CAP).toBe(100);
    let h = createHistory(0);
    for (let i = 1; i <= 150; i++) h = push(h, i);
    expect(h.past.length).toBe(100);
    expect(h.past[0]).toBe(50);
    expect(h.present).toBe(150);
    let steps = 0;
    while (canUndo(h)) { h = undo(h); steps++; }
    expect(steps).toBe(100);
    expect(h.present).toBe(50);
  });

  it('restore all is itself one undoable step', () => {
    let h = createHistory(vis());
    h = push(h, vis(['a'], ['b']), visibilityEquals);
    h = push(h, restoreAll(h.present), visibilityEquals);
    expect(h.present).toEqual(vis());
    h = undo(h);
    expect([...h.present.hidden]).toEqual(['a']);
    expect([...h.present.faded]).toEqual(['b']);
  });

  it('reads Ctrl/Cmd+Z as undo and Shift+Ctrl/Cmd+Z as redo, never inside a text field', () => {
    const key = (over: Partial<Parameters<typeof historyShortcut>[0]>) =>
      ({ key: 'z', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...over });
    expect(historyShortcut(key({ ctrlKey: true }), false)).toBe('undo');
    expect(historyShortcut(key({ metaKey: true }), false)).toBe('undo');
    expect(historyShortcut(key({ ctrlKey: true, shiftKey: true, key: 'Z' }), false)).toBe('redo');
    expect(historyShortcut(key({ metaKey: true, shiftKey: true }), false)).toBe('redo');
    expect(historyShortcut(key({ ctrlKey: true }), true)).toBeNull();
    expect(historyShortcut(key({}), false)).toBeNull();
    expect(historyShortcut(key({ ctrlKey: true, altKey: true }), false)).toBeNull();
    expect(historyShortcut(key({ ctrlKey: true, key: 'y' }), false)).toBeNull();
  });
});

describe('camera presets', () => {
  it('lists six standard views with a unit direction each (top and bottom lean a little toward the front)', () => {
    expect(VIEW_PRESETS).toEqual(['front', 'back', 'left', 'right', 'top', 'bottom']);
    expect(presetDirection('front')).toEqual({ x: 0, y: 0, z: 1 });
    expect(presetDirection('back')).toEqual({ x: 0, y: 0, z: -1 });
    expect(presetDirection('left')).toEqual({ x: 1, y: 0, z: 0 });
    expect(presetDirection('right')).toEqual({ x: -1, y: 0, z: 0 });
    expect(presetDirection('top')).toEqual({ x: 0, y: 1, z: POLE_TILT });
    expect(presetDirection('bottom')).toEqual({ x: 0, y: -1, z: POLE_TILT });
    expect(POLE_TILT).toBeGreaterThan(0);
    expect(POLE_TILT).toBeLessThan(0.01);
  });

  it('puts the camera `distance` from the center along the direction, whatever the direction\'s length', () => {
    const center = { x: 1, y: 2, z: 3 };
    expect(cameraPosition(center, { x: 0, y: 0, z: 2 }, 5)).toEqual({ x: 1, y: 2, z: 8 });
    const top = cameraForPreset('top', center, 10);
    expect(Math.hypot(top.x - 1, top.y - 2, top.z - 3)).toBeCloseTo(10, 6);
    expect(top.y).toBeGreaterThan(11.9);
    expect(top.z).toBeGreaterThan(3);
    expect(cameraForPreset('left', { x: 0, y: 0, z: 0 }, 4)).toEqual({ x: 4, y: 0, z: 0 });
    expect(cameraPosition(center, { x: 0, y: 0, z: 0 }, 5).z).toBeCloseTo(3, 6); // a zero direction never divides by zero
  });

  it('focus keeps the camera\'s direction and reframes on the new center', () => {
    const position = { x: 0, y: 0, z: 10 };
    const target = { x: 0, y: 0, z: 0 };
    expect(focusCamera(position, target, { x: 5, y: 5, z: 0 }, 2)).toEqual({ x: 5, y: 5, z: 2 });
    const diagonal = focusCamera({ x: 3, y: 4, z: 0 }, target, target, 10);
    expect(diagonal.x).toBeCloseTo(6, 6);
    expect(diagonal.y).toBeCloseTo(8, 6);
    // With the camera on its target there is no direction: the front view stands in.
    expect(focusCamera(target, target, { x: 1, y: 1, z: 1 }, 3)).toEqual({ x: 1, y: 1, z: 4 });
  });

  it('lying down turns the model so its front faces up and its top points away from the front', () => {
    expect(postureAngleX('standing')).toBe(0);
    const angle = postureAngleX('lying');
    const front = rotateX({ x: 0, y: 0, z: 1 }, angle);
    expect(front.y).toBeCloseTo(1, 9);
    expect(front.z).toBeCloseTo(0, 9);
    const top = rotateX({ x: 0, y: 1, z: 0 }, angle);
    expect(top.z).toBeCloseTo(-1, 9);
    expect(top.y).toBeCloseTo(0, 9);
    expect(rotateX({ x: 7, y: 1, z: 0 }, angle).x).toBe(7);
    expect(homePreset('lying')).toBe('top');
    expect(homePreset('standing')).toBe('front');
  });

  it('moves take no time with reduced motion, else a short eased move', () => {
    expect(cameraMoveDuration(true)).toBe(0);
    expect(cameraMoveDuration(false)).toBe(CAMERA_MOVE_MS);
    expect(CAMERA_MOVE_MS).toBeGreaterThan(0);
    expect(CAMERA_MOVE_MS).toBeLessThanOrEqual(400);
    expect(moveProgress(0, 0)).toBe(1);
    expect(moveProgress(0, 300)).toBe(0);
    expect(moveProgress(150, 300)).toBeCloseTo(0.5, 9);
    expect(moveProgress(300, 300)).toBe(1);
    expect(moveProgress(900, 300)).toBe(1);
    expect(moveProgress(75, 300)).toBeLessThan(0.25); // eased: slow at the start
    expect(moveProgress(-5, 300)).toBe(0);
    expect(lerpVec3({ x: 0, y: 0, z: 0 }, { x: 2, y: 4, z: 6 }, 0.5)).toEqual({ x: 1, y: 2, z: 3 });
  });
});

describe('recall mode', () => {
  const names = new Map([['a', 'fixture cube A'], ['b', 'fixture cube B'], ['c', 'fixture block C']]);

  it('numbers structures 1-based in the system\'s order, once each', () => {
    const numbers = recallNumbers(['a', 'b', 'a', 'c']);
    expect([...numbers]).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });

  it('labels say the number in recall mode and the name otherwise', () => {
    const numbers = recallNumbers(['a', 'b']);
    expect(labelTextFor('b', names, numbers)).toBe('2');
    expect(labelTextFor('b', names, null)).toBe('fixture cube B');
    expect(labelTextFor('zz', names, numbers)).toBe('zz'); // unknown to both: the id, never blank
    expect(labelTextFor('c', names, numbers)).toBe('fixture block C'); // not numbered: the name
  });

  it('the legend lists the labeled numbers in order, names only when revealed', () => {
    const numbers = recallNumbers(['a', 'b', 'c']);
    expect(recallLegend(['c', 'a'], numbers, names, false)).toEqual([
      { id: 'a', number: 1, name: null },
      { id: 'c', number: 3, name: null },
    ]);
    expect(recallLegend(['c', 'a'], numbers, names, true).map((row) => row.name)).toEqual(['fixture cube A', 'fixture block C']);
    expect(recallLegend([], numbers, names, true)).toEqual([]);
  });
});

describe('the faded-opacity token', () => {
  const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

  it('is defined in the Daytime block and both Evening copies, between 0 and 1', () => {
    const values = [...css.matchAll(/--anatomy-faded-opacity:\s*([0-9.]+);/g)].map((m) => Number(m[1]));
    expect(values.length).toBe(3);
    for (const value of values) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('is read at runtime by the scene, like the other model colors', () => {
    const source = readFileSync(new URL('../../src/islands/anatomyscene.ts', import.meta.url), 'utf8');
    expect(source).toContain("get('--anatomy-faded-opacity')");
    expect(source).not.toMatch(/opacity\s*=\s*0\.\d+\s*;/); // no raw opacity values in the scene
  });
});
