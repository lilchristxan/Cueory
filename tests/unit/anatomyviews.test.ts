import { describe, expect, it } from 'vitest';
import {
  KEY_MAP,
  VIEW_PRESETS,
  canvasKeyAction,
  coverDownloadNote,
  focusFromSearch,
  formatDownloadSize,
  initialSystemKey,
  isViewPreset,
  presetDirection,
  tappableIds,
  tappableRound,
  spreadBlocksSaving,
  SPREAD_SAVE_NOTE,
} from '../../src/islands/anatomyviews';

describe('anatomy lab preset views', () => {
  it('offers the model\'s front, back, both sides and top, each with its own number key', () => {
    expect(VIEW_PRESETS.map((p) => p.id)).toEqual(['front', 'back', 'left', 'right', 'top']);
    expect(new Set(VIEW_PRESETS.map((p) => p.key)).size).toBe(VIEW_PRESETS.length);
    expect(new Set(VIEW_PRESETS.map((p) => p.label)).size).toBe(VIEW_PRESETS.length);
  });

  it('gives every preset a unit direction, with opposite views opposite', () => {
    for (const preset of VIEW_PRESETS) {
      expect(Math.hypot(...presetDirection(preset.id))).toBeCloseTo(1, 9);
    }
    expect(presetDirection('front')).toEqual([0, 0, 1]);
    expect(presetDirection('back')).toEqual([0, 0, -1]);
    expect(presetDirection('left')).toEqual([1, 0, 0]);
    expect(presetDirection('right')).toEqual([-1, 0, 0]);
  });

  it('never puts the top view exactly on the up axis', () => {
    const [x, y, z] = presetDirection('top');
    expect(x).toBe(0);
    expect(y).toBeGreaterThan(0.999);
    expect(z).toBeGreaterThan(0);
  });

  it('recognises only its own preset ids', () => {
    expect(isViewPreset('top')).toBe(true);
    expect(isViewPreset('bottom')).toBe(false);
    expect(isViewPreset(null)).toBe(false);
  });
});

describe('anatomy lab keyboard map', () => {
  const STEP = 0.25;
  const ZOOM = 0.8;

  it('turns and tilts with the arrow keys', () => {
    expect(canvasKeyAction('ArrowLeft', STEP, ZOOM)).toEqual({ kind: 'orbit', yaw: -STEP, pitch: 0 });
    expect(canvasKeyAction('ArrowRight', STEP, ZOOM)).toEqual({ kind: 'orbit', yaw: STEP, pitch: 0 });
    expect(canvasKeyAction('ArrowUp', STEP, ZOOM)).toEqual({ kind: 'orbit', yaw: 0, pitch: -STEP });
    expect(canvasKeyAction('ArrowDown', STEP, ZOOM)).toEqual({ kind: 'orbit', yaw: 0, pitch: STEP });
  });

  it('zooms with plus and minus, shifted or not', () => {
    for (const key of ['+', '=']) expect(canvasKeyAction(key, STEP, ZOOM)).toEqual({ kind: 'zoom', factor: ZOOM });
    for (const key of ['-', '_']) expect(canvasKeyAction(key, STEP, ZOOM)).toEqual({ kind: 'zoom', factor: 1 / ZOOM });
  });

  it('resets with 0 or Home and jumps to a preset with 1 to 5', () => {
    expect(canvasKeyAction('0', STEP, ZOOM)).toEqual({ kind: 'reset' });
    expect(canvasKeyAction('Home', STEP, ZOOM)).toEqual({ kind: 'reset' });
    for (const preset of VIEW_PRESETS) {
      expect(canvasKeyAction(preset.key, STEP, ZOOM)).toEqual({ kind: 'view', preset: preset.id });
    }
  });

  it('leaves every other key to the browser, Tab and Escape included', () => {
    for (const key of ['Tab', 'Escape', 'Enter', ' ', 'a', '6', '9', 'PageDown', 'End']) {
      expect(canvasKeyAction(key, STEP, ZOOM)).toBeNull();
    }
  });

  it('lists every preset key in the keys panel', () => {
    const listed = KEY_MAP.map((row) => row.keys);
    for (const preset of VIEW_PRESETS) expect(listed).toContain(preset.key);
    expect(KEY_MAP.every((row) => row.does.length > 0)).toBe(true);
    expect(new Set(listed).size).toBe(listed.length);
  });
});

describe('anatomy lab download-size notes', () => {
  it('rounds up so a note never promises less than the download', () => {
    expect(formatDownloadSize(1)).toBe('1 KB');
    expect(formatDownloadSize(44_001)).toBe('45 KB');
    expect(formatDownloadSize(999_999)).toBe('1000 KB');
    expect(formatDownloadSize(1_000_000)).toBe('1.0 MB');
    expect(formatDownloadSize(2_310_000)).toBe('2.4 MB');
  });

  it('says nothing for a size it cannot trust', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(formatDownloadSize(bad)).toBeNull();
  });

  it('names the first system and its size on the cover only when both are known', () => {
    expect(coverDownloadNote('[sample system]', 2_310_000)).toBe(
      'loads the 3D viewer, then one body system at a time. the first, [sample system], is a 2.4 MB download.',
    );
    const plain = 'loads the 3D viewer, then one body system at a time.';
    expect(coverDownloadNote(null, 2_310_000)).toBe(plain);
    expect(coverDownloadNote('[sample system]', undefined)).toBe(plain);
    expect(coverDownloadNote('[sample system]', 0)).toBe(plain);
  });
});

describe('anatomy lab lesson links', () => {
  it('reads a system and a structure from the address', () => {
    expect(focusFromSearch('?system=sample-system&structure=FIX003')).toEqual({ system: 'sample-system', structure: 'FIX003' });
    expect(focusFromSearch('?fixture&structure=FIX001')).toEqual({ system: null, structure: 'FIX001' });
    expect(focusFromSearch('')).toEqual({ system: null, structure: null });
  });

  it('ignores anything that is not a well-formed key or id', () => {
    for (const bad of ['../etc', 'Sample', 'a b', '<script>', 'a--b', '-a', 'a-', 'x'.repeat(65)]) {
      expect(focusFromSearch(`?system=${encodeURIComponent(bad)}`).system).toBeNull();
    }
    for (const bad of ['', ' ', 'a b', '<img>', '-FIX', 'javascript:1', 'x'.repeat(65)]) {
      expect(focusFromSearch(`?structure=${encodeURIComponent(bad)}`).structure).toBeNull();
    }
  });

  it('starts on the linked system only when this build has it', () => {
    const keys = ['one', 'two'];
    expect(initialSystemKey(keys, { system: 'two', structure: null })).toBe('two');
    expect(initialSystemKey(keys, { system: 'three', structure: null })).toBe('one');
    expect(initialSystemKey(keys, { system: null, structure: null })).toBe('one');
    expect(initialSystemKey([], { system: 'two', structure: null })).toBe('');
  });
});

describe('tappableIds (a find-it round never asks for an outlined structure that a tap cannot reach)', () => {
  const skin = new Set(['S1']);
  it('leaves the skin out while anything else is showing', () => {
    expect(tappableIds(['S1', 'A', 'B'], skin)).toEqual(['A', 'B']);
  });
  it('keeps the skin when it is the only thing showing, where it is solid and tappable', () => {
    expect(tappableIds(['S1'], skin)).toEqual(['S1']);
  });
  it('keeps everything when there is no outline', () => {
    expect(tappableIds(['A', 'B'], new Set())).toEqual(['A', 'B']);
  });
  it('is empty when nothing is visible', () => {
    expect(tappableIds([], skin)).toEqual([]);
  });
});

describe('saved views and spread structures', () => {
  it('only lets a view be saved while the structures are together', () => {
    expect(spreadBlocksSaving(0)).toBe(false);
    expect(spreadBlocksSaving(0.01)).toBe(true);
    expect(spreadBlocksSaving(1)).toBe(true);
  });
  it('tells the student what to do, in plain words', () => {
    expect(SPREAD_SAVE_NOTE).toBe('bring the structures back together to save a view.');
  });
  it('the lab brings structures together when a view opens and blocks saving while spread', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile('src/islands/AnatomyLab.tsx', 'utf8');
    const open = source.slice(source.indexOf('const openView ='), source.indexOf('const deleteView ='));
    expect(open).toMatch(/changeSpread\(0\);\s*\n\s*scene\.applyCameraState/);
    const save = source.slice(source.indexOf('const saveView ='), source.indexOf('const openView ='));
    expect(save).toContain('spreadBlocksSaving(spread)');
  });
});

describe('tappableRound (a review round shows its queue first)', () => {
  const skin = new Set(['S1']);
  it('drops a queued outlined structure when anything else will be showing', () => {
    expect(tappableRound(['S1', 'A'], ['S1', 'A', 'B'], skin)).toEqual(['A']);
    expect(tappableRound(['S1'], ['S1', 'B'], skin)).toEqual([]);
  });
  it('keeps it when nothing else will be showing, where it is solid and tappable', () => {
    expect(tappableRound(['S1'], ['S1'], skin)).toEqual(['S1']);
  });
  it('agrees with tappableIds for a round over what is visible', () => {
    expect(tappableRound(['S1', 'A'], ['S1', 'A'], skin)).toEqual(tappableIds(['S1', 'A'], skin));
  });
});

describe('review rounds use the same tap rule (the review queue needs a signed-in student, so it has no browser test)', () => {
  it('startReviewQuiz asks only what a tap can reach and says so when nothing is left', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/islands/AnatomyLab.tsx', 'utf8');
    const start = source.slice(source.indexOf('const startReviewQuiz ='), source.indexOf('const saveView ='));
    expect(start).toContain('tappableRound(reviewPool,');
    expect(start).toContain('startQuiz(round, Math.random)');
    expect(start).toContain('round.length === 0');
  });
});
