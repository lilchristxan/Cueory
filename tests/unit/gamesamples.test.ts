import { beforeEach, describe, expect, it, vi } from 'vitest';

const collections = vi.hoisted(() => ({ data: {} as Record<string, { id: string; data: Record<string, unknown> }[]> }));

vi.mock('astro:content', () => ({ getCollection: async (name: string) => [...(collections.data[name] ?? [])] }));
vi.mock('../../src/islands/cueword', () => ({
  parsePuzzle: vi.fn((input: { id: string }) => {
    if (input.id === 'bad') throw new Error('the grid must have 3 to 15 rows.');
    return { parsed: 'crossword', ...input };
  }),
}));
vi.mock('../../src/islands/suturepath', () => ({
  parseWordPath: vi.fn((input: { id: string }) => {
    if (input.id === 'bad') throw new Error('the only puzzle format name is "path".');
    return { parsed: 'word-path', ...input };
  }),
}));

import { crosswordSamples, pilloSamples, wordPathSamples } from '../../src/config/gamesamples';
import { parsePuzzle } from '../../src/islands/cueword';
import { parseWordPath } from '../../src/islands/suturepath';

const entry = (id: string, data: Record<string, unknown> = {}) => ({ id, data });

beforeEach(() => {
  collections.data = {};
  vi.mocked(parsePuzzle).mockClear();
  vi.mocked(parseWordPath).mockClear();
});

describe('pilloSamples', () => {
  it('returns an empty list for an empty collection', async () => {
    expect(await pilloSamples()).toEqual([]);
  });

  it('sorts by id and keeps only the word and cue', async () => {
    collections.data.pulse = [
      entry('sample-10', { word: 'ten', cue: 'c10', extra: 1 }),
      entry('sample-02', { word: 'two', cue: 'c2' }),
      entry('sample-01', { word: 'one', cue: 'c1' }),
    ];
    expect(await pilloSamples()).toEqual([
      { word: 'one', cue: 'c1' },
      { word: 'two', cue: 'c2' },
      { word: 'ten', cue: 'c10' },
    ]);
  });
});

describe('crosswordSamples', () => {
  it('passes each sample through the game parser as a sample, in id order', async () => {
    collections.data.cueword = [
      entry('b', { level: 'easy', grid: ['AAA'], clues: { across: [], down: [] } }),
      entry('a', { grid: ['BBB'], clues: { across: [], down: [] } }),
    ];
    const result = await crosswordSamples();
    expect(result.map((p) => (p as { id: string }).id)).toEqual(['a', 'b']);
    expect(vi.mocked(parsePuzzle).mock.calls[0]![0]).toMatchObject({ id: 'a', sample: true, level: undefined });
    expect(vi.mocked(parsePuzzle).mock.calls[1]![0]).toMatchObject({ id: 'b', sample: true, level: 'easy' });
  });

  it('names the failing file when the parser rejects a sample', async () => {
    collections.data.cueword = [entry('ok', {}), entry('bad', {})];
    await expect(crosswordSamples()).rejects.toThrow('content/games/cueword/bad.json: the grid must have 3 to 15 rows.');
  });
});

describe('wordPathSamples', () => {
  it('uses the board shape for format "path" and drops theme', async () => {
    collections.data.suture = [
      entry('p1', { format: 'path', clue: 'c', grid: ['AB'], words: ['AB'], extras: ['X'], theme: 'ignored' }),
    ];
    await wordPathSamples();
    expect(vi.mocked(parseWordPath).mock.calls[0]![0]).toEqual({
      id: 'p1', sample: true, format: 'path', clue: 'c', grid: ['AB'], words: ['AB'], extras: ['X'],
    });
  });

  it('uses the older theme shape when there is no format', async () => {
    collections.data.suture = [entry('s1', { theme: 't', grid: ['AB'], words: ['AB'], clue: 'ignored' })];
    await wordPathSamples();
    expect(vi.mocked(parseWordPath).mock.calls[0]![0]).toEqual({ id: 's1', sample: true, theme: 't', grid: ['AB'], words: ['AB'] });
  });

  it('sorts by id', async () => {
    collections.data.suture = [entry('z', { theme: 't' }), entry('m', { theme: 't' })];
    const result = await wordPathSamples();
    expect(result.map((p) => (p as { id: string }).id)).toEqual(['m', 'z']);
  });

  it('names the failing file when the parser rejects a sample', async () => {
    collections.data.suture = [entry('bad', { theme: 't' })];
    await expect(wordPathSamples()).rejects.toThrow('content/games/suture/bad.json: the only puzzle format name is "path".');
  });
});
