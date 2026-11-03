import { describe, expect, it } from 'vitest';
import { studyModes } from '../../src/config/modes';

describe('study mode configuration', () => {
  it('has one non-empty entry for every mode id', () => {
    const ids = studyModes.map((mode) => mode.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const mode of studyModes) {
      expect(mode.name.trim(), mode.id).not.toBe('');
      expect(mode.text.trim(), mode.id).not.toBe('');
      expect(mode.more.trim(), mode.id).not.toBe('');
    }
  });

  it('keeps visible mode copy in the lowercase brand voice', () => {
    for (const mode of studyModes) {
      expect(mode.name, mode.id).toBe(mode.name.toLowerCase());
      expect(mode.text, mode.id).toBe(mode.text.toLowerCase());
      expect(mode.more, mode.id).toBe(mode.more.toLowerCase());
      if (mode.link) {
        expect(mode.link.label, mode.id).toBe(mode.link.label.toLowerCase());
      }
    }
  });

  it('requires an accessible label whenever a mode has an open link', () => {
    for (const mode of studyModes) {
      if (!mode.link) continue;
      expect(mode.link.href, mode.id).toMatch(/^\/[a-z0-9][a-z0-9/?-]*$/);
      expect(mode.link.label.trim(), mode.id).not.toBe('');
    }
  });
});
