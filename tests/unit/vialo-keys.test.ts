import { describe, expect, it } from 'vitest';
import { VIALO_KEY_ROWS } from '../../src/islands/vialokeys';

describe('vialo key rows', () => {
  it('lays out every letter once, in keyboard order', () => {
    expect(VIALO_KEY_ROWS).toEqual(['qwertyuiop', 'asdfghjkl', 'zxcvbnm']);
    const letters = VIALO_KEY_ROWS.join('');
    expect(letters).toHaveLength(26);
    expect([...letters].sort().join('')).toBe('abcdefghijklmnopqrstuvwxyz');
  });

  it('leaves room in the last row for enter and delete: 7 letters plus two keys of one and a half', () => {
    expect(VIALO_KEY_ROWS[0]).toHaveLength(10);
    expect(VIALO_KEY_ROWS[1]).toHaveLength(9);
    expect(VIALO_KEY_ROWS[2].length + 2 * 1.5).toBe(VIALO_KEY_ROWS[0].length);
  });
});
