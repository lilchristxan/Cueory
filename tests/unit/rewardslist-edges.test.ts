import { describe, expect, it } from 'vitest';
import { buildRewardsPreview, type LabeledSampleEvent } from '../../src/islands/rewards-list';

const TODAY = '2026-03-10';
const game = (day: string, label = '[sample finished game]', id: 'pulse' | 'cueword' | 'triage' | 'suture' = 'pulse'): LabeledSampleEvent => ({
  label, event: { type: 'game', finished: true, game: id, day, solved: true, slips: 1, cues: 0 },
});
const study = (day: string, id: string): LabeledSampleEvent => ({
  label: '[sample finished study session]', event: { type: 'study', finished: true, id, day, mode: 'cards' },
});
const text = (preview: ReturnType<typeof buildRewardsPreview>, id: string) => preview.summary.find((row) => row.id === id)?.text;

describe('rewards preview label edges', () => {
  it.each([
    'sample finished game',
    '[Sample finished game]',
    '[sample]',
    '[sample ]',
    '[sample a] extra',
    ' [sample a]',
    '[sample a]\n',
    '[sample a\nb]',
    '[sample a]]',
    '[sample [nested]]',
    '',
  ])('rejects label %j', (label) => {
    expect(() => buildRewardsPreview([game('2026-03-09', label)], TODAY)).toThrow(/bracketed sample/);
  });
  it('accepts a label of exactly 120 characters after the prefix, and refuses 121', () => {
    expect(() => buildRewardsPreview([game('2026-03-09', `[sample ${'a'.repeat(120)}]`)], TODAY)).not.toThrow();
    expect(() => buildRewardsPreview([game('2026-03-09', `[sample ${'a'.repeat(121)}]`)], TODAY)).toThrow();
  });
  it('checks every label, not only the first one', () => {
    expect(() => buildRewardsPreview([game('2026-03-08'), game('2026-03-09', 'plain')], TODAY)).toThrow(/bracketed/);
  });
});

describe('rewards preview day edges', () => {
  it.each(['2026-02-30', '2026-13-01', '10-03-2026', '', 'today'])('throws for the fixed day %j', (day) => {
    expect(() => buildRewardsPreview([], day)).toThrow();
  });
  it('allows a sample on the fixed day itself and refuses the day after', () => {
    expect(buildRewardsPreview([game(TODAY)], TODAY).events).toHaveLength(1);
    expect(() => buildRewardsPreview([game('2026-03-11')], TODAY)).toThrow(/future/);
  });
  it('echoes the fixed day it was given', () => {
    expect(buildRewardsPreview([], TODAY).today).toBe(TODAY);
  });
});

describe('rewards preview wording edges', () => {
  it('gives seven summary rows with stable ids, even when empty', () => {
    const preview = buildRewardsPreview([], TODAY);
    expect(preview.summary.map((row) => row.id)).toEqual([
      'points', 'games', 'studies', 'current-streak', 'best-streak', 'passes', 'achievements',
    ]);
    expect(preview.events).toEqual([]);
    expect(preview.achievements).toEqual([]);
    expect(text(preview, 'points')).toBe('0 points earned.');
    expect(text(preview, 'games')).toBe('0 games finished.');
    expect(text(preview, 'studies')).toBe('0 sessions finished.');
  });
  it('uses singular words for exactly one', () => {
    const preview = buildRewardsPreview([game('2026-03-09'), study('2026-03-09', 's1')], TODAY);
    expect(text(preview, 'games')).toBe('1 game finished.');
    expect(text(preview, 'studies')).toBe('1 session finished.');
    expect(text(preview, 'current-streak')).toBe('1 day in the current streak.');
    expect(text(preview, 'best-streak')).toBe('1 day in the best streak.');
  });
  it('words each event by its kind and its own day', () => {
    const preview = buildRewardsPreview([game('2026-03-09'), study('2026-03-08', 's1')], TODAY);
    const texts = preview.events.map((event) => event.text);
    expect(texts.some((line) => /for this finished game on 2026-03-09\.$/.test(line))).toBe(true);
    expect(texts.some((line) => /for this finished study session on 2026-03-08\.$/.test(line))).toBe(true);
  });
  it('numbers event ids by the position the caller gave, even after sorting by day', () => {
    const preview = buildRewardsPreview([game('2026-03-09'), study('2026-03-08', 's1')], TODAY);
    expect(preview.events.map((event) => event.id)).toEqual(['sample-2', 'sample-1']);
    expect(preview.events.map((event) => event.label)).toEqual(['[sample finished study session]', '[sample finished game]']);
  });
  it('shows the points in the event line as the sum shown in the summary', () => {
    const preview = buildRewardsPreview([game('2026-03-08'), game('2026-03-09', '[sample two]', 'cueword'), study('2026-03-09', 's1')], TODAY);
    const earned = preview.events.map((event) => Number(/^(\d+) point/.exec(event.text)?.[1]));
    const total = Number(/^(\d+) point/.exec(text(preview, 'points')!)?.[1]);
    expect(earned.reduce((sum, value) => sum + value, 0)).toBe(total);
  });
  it('shows an achievement with the day it was earned', () => {
    const preview = buildRewardsPreview([game('2026-03-09')], TODAY);
    expect(preview.achievements.length).toBeGreaterThan(0);
    for (const achievement of preview.achievements) {
      expect(achievement.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(achievement.name).not.toBe('');
    }
  });
  it('gives the same preview every time for the same input', () => {
    const samples = [game('2026-03-09'), study('2026-03-09', 's1')];
    expect(buildRewardsPreview(samples, TODAY)).toEqual(buildRewardsPreview(samples, TODAY));
  });
});
