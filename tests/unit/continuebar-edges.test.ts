import { describe, expect, it } from 'vitest';
import { RESUME_TOOLS, RESUME_TTL_MS, type ResumeSnapshot } from '../../src/scripts/resume';
import { continueBarView } from '../../src/islands/continue-bar';

const NOW = Date.UTC(2026, 2, 10, 12, 0);
const today = () => new Date(NOW);
const snap = (changes: Record<string, unknown> = {}) => ({
  version: 1, savedAt: NOW - 1000, tool: 'cards', page: '/learn/sample-unit/cards',
  itemIndex: 0, totalItems: 1, answers: {}, timer: null, phase: 'working', ...changes,
}) as unknown as ResumeSnapshot;

describe('continue bar view edges', () => {
  it('shows the first of one item as question 1 of 1', () => {
    expect(continueBarView(snap(), today())).toMatchObject({ current: 1, total: 1, accessibleLabel: 'continue cards, question 1 of 1' });
  });
  it('shows the last item of the biggest allowed round, and refuses one more', () => {
    expect(continueBarView(snap({ itemIndex: 499, totalItems: 500 }), today())).toMatchObject({ current: 500, total: 500 });
    expect(continueBarView(snap({ itemIndex: 0, totalItems: 501 }), today())).toBeNull();
  });
  it.each([-1, 1.5, '1', null, Number.NaN])('refuses item index %j', (itemIndex) => {
    expect(continueBarView(snap({ itemIndex }), today())).toBeNull();
  });
  it('writes the module and a dashed tool name as plain words with a dot between', () => {
    const view = continueBarView(snap({ tool: 'fill-in', module: 'sample-unit-one' }), today());
    expect(view?.title).toBe('sample unit one · fill in');
    expect(view?.accessibleLabel).toBe('continue sample unit one · fill in, question 1 of 1');
  });
  it('shows a view for every known study tool except a timed sharpening round', () => {
    for (const tool of RESUME_TOOLS) {
      const view = continueBarView(snap({ tool }), today());
      if (tool === 'sharpening') expect(view).toBeNull();
      else expect(view?.title).toBe(tool.replaceAll('-', ' '));
    }
  });
  it('shows a sharpening result screen', () => {
    expect(continueBarView(snap({ tool: 'sharpening', phase: 'results' }), today())?.accessibleLabel).toBe('continue sharpening, results');
  });
  it('sets the expiry from the saved time, not from the current time', () => {
    expect(continueBarView(snap({ savedAt: NOW - 5000 }), today())?.expiresAt).toBe(NOW - 5000 + RESUME_TTL_MS);
  });
  it('uses the supplied date for expiry, so a later date hides the same record', () => {
    const record = snap({ savedAt: NOW });
    expect(continueBarView(record, new Date(NOW + RESUME_TTL_MS - 1))).not.toBeNull();
    expect(continueBarView(record, new Date(NOW + RESUME_TTL_MS))).toBeNull();
  });
  it.each([
    '/learn/sample-unit/cards#part-2',
    '/play',
    '/review',
    '/sharpen/sample',
  ])('keeps the safe local link %s', (page) => {
    expect(continueBarView(snap({ page }), today())?.href).toBe(page);
  });
  it.each([
    '//evil.example/learn',
    '/learn/../admin',
    '/learn//x',
    'learn/sample',
    '/learn/sample?next=https://x.example',
    'javascript:alert(1)',
    '/learn/' + 'a'.repeat(240),
    '',
    5,
  ])('refuses link %j', (page) => {
    expect(continueBarView(snap({ page }), today())).toBeNull();
  });
  it('refuses unknown fields, a wrong version and a bad timer', () => {
    expect(continueBarView(snap({ extra: 1 }), today())).toBeNull();
    expect(continueBarView(snap({ version: 2 }), today())).toBeNull();
    expect(continueBarView(snap({ timer: { status: 'running', elapsedMs: 0, durationMs: 0 } }), today())).toBeNull();
    expect(continueBarView(snap({ timer: { status: 'off', elapsedMs: 0, durationMs: 0 } }), today())).not.toBeNull();
  });
  it('refuses a module name with unsafe characters or a blocked key', () => {
    expect(continueBarView(snap({ module: 'bad name' }), today())).toBeNull();
    expect(continueBarView(snap({ module: '__proto__' }), today())).toBeNull();
  });
  it.each([null, undefined, 5, 'text', [], true])('shows nothing for a non-record %j', (value) => {
    expect(continueBarView(value, today())).toBeNull();
  });
  it('shows nothing when the date is not a Date, or is an invalid one', () => {
    expect(continueBarView(snap(), NOW as unknown as Date)).toBeNull();
    expect(continueBarView(snap(), { getTime: () => NOW } as unknown as Date)).toBeNull();
    expect(continueBarView(snap(), new Date(Infinity))).toBeNull();
  });
  it('does not change the saved record it is shown', () => {
    const record = snap({ answers: { q1: 'a' } });
    const copy = structuredClone(record);
    continueBarView(record, today());
    expect(record).toEqual(copy);
  });
});
