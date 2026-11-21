import { describe, expect, it } from 'vitest';
import { showPlayDate } from '../../src/scripts/playdate';

interface FakeTime { dateTime: string; textContent: string }
interface FakeHolder { hidden: boolean; querySelector: (selector: string) => FakeTime | null }

const rootWith = (holder: FakeHolder | null): ParentNode =>
  ({ querySelector: (selector: string) => (selector === '[data-play-date]' ? holder : null) }) as unknown as ParentNode;
const holderWith = (time: FakeTime | null): FakeHolder => ({ hidden: true, querySelector: () => time });

describe('showPlayDate', () => {
  it('fills the words and the machine value from one local date, then reveals the holder', () => {
    const time = { dateTime: '', textContent: '' };
    const holder = holderWith(time);
    showPlayDate(rootWith(holder), new Date(2026, 10, 1, 12));
    expect(time.dateTime).toBe('2026-11-01');
    expect(time.textContent).toBe('sun 1 nov');
    expect(holder.hidden).toBe(false);
  });

  it('pads single-digit months and days in the machine value but not in the words', () => {
    const time = { dateTime: '', textContent: '' };
    showPlayDate(rootWith(holderWith(time)), new Date(2026, 0, 5, 9));
    expect(time.dateTime).toBe('2026-01-05');
    expect(time.textContent).toBe('mon 5 jan');
  });

  it('uses the local calendar day just after midnight and just before the next midnight', () => {
    const early = { dateTime: '', textContent: '' };
    const late = { dateTime: '', textContent: '' };
    showPlayDate(rootWith(holderWith(early)), new Date(2026, 11, 31, 0, 0, 1));
    showPlayDate(rootWith(holderWith(late)), new Date(2026, 11, 31, 23, 59, 59));
    expect(early.dateTime).toBe('2026-12-31');
    expect(late.dateTime).toBe('2026-12-31');
    expect(late.textContent).toBe('thu 31 dec');
  });

  it('handles a leap day', () => {
    const time = { dateTime: '', textContent: '' };
    showPlayDate(rootWith(holderWith(time)), new Date(2028, 1, 29, 12));
    expect(time.dateTime).toBe('2028-02-29');
    expect(time.textContent).toBe('tue 29 feb');
  });

  it('does nothing when the page has no date holder', () => {
    expect(() => showPlayDate(rootWith(null), new Date(2026, 10, 1))).not.toThrow();
  });

  it('leaves the holder hidden when it has no time element', () => {
    const holder = holderWith(null);
    showPlayDate(rootWith(holder), new Date(2026, 10, 1));
    expect(holder.hidden).toBe(true);
  });
});
