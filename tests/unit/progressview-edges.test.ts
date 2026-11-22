import { describe, expect, it } from 'vitest';
import { emptyProgress, withPile, withStars } from '../../src/scripts/progress';
import { examCountdown, progressView } from '../../src/islands/progressview';

describe('progressView edges', () => {
  it('returns an empty view for no decks and no saved progress', () => {
    const view = progressView(emptyProgress(), []);
    expect(view.decks).toEqual([]);
    expect(view.overall).toEqual({ know: 0, learning: 0, notStarted: 0, total: 0 });
    expect(view.hasSavedDecks).toBe(false);
  });

  it('shows a deck with no cards as total 0 and never negative not-started', () => {
    const view = progressView(emptyProgress(), [{ id: 'empty', title: 'empty deck', cardIds: [] }]);
    expect(view.decks[0]).toMatchObject({ total: 0, notStarted: 0, know: 0, learning: 0, retired: false });
    expect(view.overall.total).toBe(0);
  });

  it('counts a retired deck that only has stars as saved progress, with unknown totals', () => {
    const progress = withStars(emptyProgress(), 'gone', ['x']);
    const view = progressView(progress, []);
    expect(view.hasSavedDecks).toBe(true);
    expect(view.decks).toHaveLength(1);
    expect(view.decks[0]).toMatchObject({ id: 'gone', starred: 1, know: 0, learning: 0, total: null, notStarted: null, retired: true });
    expect(view.overall).toEqual({ know: 0, learning: 0, notStarted: 0, total: 0 });
  });

  it('names a retired deck by its id and lists it after the current decks', () => {
    let progress = withPile(emptyProgress(), 'gone', 'x', 'know');
    progress = withPile(progress, 'live', 'a', 'know');
    const view = progressView(progress, [{ id: 'live', title: 'live deck', cardIds: ['a', 'b'] }]);
    expect(view.decks.map((deck) => deck.id)).toEqual(['live', 'gone']);
    expect(view.decks[1]!.title).toBe('a deck no longer on the site (gone)');
    expect(view.overall).toEqual({ know: 1, learning: 0, notStarted: 1, total: 2 });
  });

  it('does not treat a current deck that also has saved data as retired', () => {
    const progress = withPile(emptyProgress(), 'live', 'a', 'learning');
    const view = progressView(progress, [{ id: 'live', title: 'live deck', cardIds: ['a'] }]);
    expect(view.decks).toHaveLength(1);
    expect(view.decks[0]).toMatchObject({ retired: false, learning: 1, notStarted: 0 });
  });

  it('adds up the overall counts across several decks', () => {
    let progress = withPile(emptyProgress(), 'one', 'a', 'know');
    progress = withPile(progress, 'two', 'd', 'learning');
    const view = progressView(progress, [
      { id: 'one', title: 'first', cardIds: ['a', 'b'] },
      { id: 'two', title: 'second', cardIds: ['d', 'e', 'f'] },
    ]);
    expect(view.overall).toEqual({ know: 1, learning: 1, notStarted: 3, total: 5 });
  });
});

describe('examCountdown edges', () => {
  it('uses singular wording for one day', () => {
    expect(examCountdown('2026-06-02', '2026-06-01')).toBe('1 day until your exam.');
    expect(examCountdown('2026-06-01', '2026-06-02')).toBe('that exam date was 1 day ago.');
  });

  it('uses plural wording for many days', () => {
    expect(examCountdown('2026-06-11', '2026-06-01')).toBe('10 days until your exam.');
    expect(examCountdown('2026-05-22', '2026-06-01')).toBe('that exam date was 10 days ago.');
  });

  it('counts across a year boundary', () => {
    expect(examCountdown('2027-01-01', '2026-12-31')).toBe('1 day until your exam.');
  });

  it.each(['1999-12-31', '2101-01-01', '2026-02-30', '2026-6-1', ''])('returns null for an exam date outside the supported range or shape: %j', (exam) => {
    expect(examCountdown(exam, '2026-06-01')).toBeNull();
  });

  it('returns null when today is not a supported date', () => {
    expect(examCountdown('2026-06-01', '1999-01-01')).toBeNull();
    expect(examCountdown('2026-06-01', 'today')).toBeNull();
  });
});
