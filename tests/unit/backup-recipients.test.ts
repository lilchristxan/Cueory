import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lines = readFileSync(new URL('../../.github/age/backup-recipients.txt', import.meta.url), 'utf8')
  .split(/\r?\n/)
  .filter((line) => line.trim() !== '' && !line.startsWith('#'));

describe('backup recipients', () => {
  it('holds exactly one age public key and never a secret key', () => {
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^age1[0-9a-z]{58}$/);
    expect(readFileSync(new URL('../../.github/age/backup-recipients.txt', import.meta.url), 'utf8')).not.toContain('AGE-SECRET-KEY');
  });
});
