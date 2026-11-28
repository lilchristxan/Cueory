import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dailyGames } from '../../src/config/games';
import { forbiddenGameWords } from '../../src/config/games';
import {
  GAME_HELP, GAME_HELP_STORAGE_KEY, HELP_GAMES, SHARED_SETTINGS_NOTE, helpSeen, markHelpSeen, parseHelpSeen,
} from '../../src/islands/gamehelpcontent';
import type { KeyValueStorage } from '../../src/scripts/storage';

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

const blocked: KeyValueStorage = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
  removeItem() { throw new Error('blocked'); },
};

describe('game help "seen" marks (#736)', () => {
  it('covers every daily game', () => {
    expect([...HELP_GAMES].sort()).toEqual(dailyGames.map((game) => game.id).sort());
  });

  it('starts unseen, and remembers each game on its own', () => {
    const storage = new MemoryStorage();
    expect(helpSeen(storage, 'triage')).toBe(false);
    markHelpSeen(storage, 'triage');
    expect(helpSeen(storage, 'triage')).toBe(true);
    expect(helpSeen(storage, 'pulse')).toBe(false);
    markHelpSeen(storage, 'pulse');
    markHelpSeen(storage, 'pulse');
    expect(JSON.parse(storage.getItem(GAME_HELP_STORAGE_KEY)!)).toEqual(['pulse', 'triage']);
  });

  it('keeps only game ids, so the key never holds anything else', () => {
    expect([...parseHelpSeen('["suture","someone@example.com",3,"cueword"]')]).toEqual(['suture', 'cueword']);
    for (const raw of [null, '', 'not json', '{"pulse":true}', '"pulse"']) expect(parseHelpSeen(raw).size).toBe(0);
  });

  it('shows the rules again when storage is missing or blocked, and never throws', () => {
    expect(helpSeen(undefined, 'pulse')).toBe(false);
    expect(helpSeen(blocked, 'pulse')).toBe(false);
    expect(() => markHelpSeen(blocked, 'pulse')).not.toThrow();
    expect(() => markHelpSeen(undefined, 'pulse')).not.toThrow();
  });
});

describe('game help text (#736)', () => {
  const texts = Object.values(GAME_HELP).flatMap((content) => [
    ...content.play, content.settingsIntro, ...content.settings.flatMap(({ name, detail }) => [name, detail]),
  ]).concat(SHARED_SETTINGS_NOTE);

  it('is in the lowercase brand voice and never names another puzzle game', () => {
    for (const text of texts) {
      expect(text, text).toBe(text.toLowerCase());
      for (const word of forbiddenGameWords) expect(text, text).not.toContain(word);
    }
  });

  it('gives every game its rules, and word path\'s two formats share one "seen" mark', () => {
    for (const content of Object.values(GAME_HELP)) expect(content.play.length).toBeGreaterThan(0);
    expect(GAME_HELP.suture.game).toBe('suture');
    expect(GAME_HELP['suture-search'].game).toBe('suture');
  });

  it('lists every pillo, sudoku and crossword setting the games offer', () => {
    const names = (topic: keyof typeof GAME_HELP) => GAME_HELP[topic].settings.map(({ name }) => name);
    // High contrast is the shared setting (#805), so pillo's own list holds only what lasts for the visit.
    expect(names('pulse')).toEqual(['hard mode', 'on-screen keyboard only']);
    // The sudoku labels come straight from the settings dialog, so a new setting there fails here until it is explained.
    const sudoku = readFileSync(new URL('../../src/islands/SudokuGame.tsx', import.meta.url), 'utf8');
    const labels = [...(/const labels: Record<keyof SudokuSettings, string> = \{([^}]+)\}/.exec(sudoku)?.[1] ?? '')
      .matchAll(/: '([^']+)'/g)].map((match) => match[1]);
    expect(labels.length).toBeGreaterThan(0);
    expect(names('triage')).toEqual(labels);
    const crossword = readFileSync(new URL('../../src/islands/CuewordGame.tsx', import.meta.url), 'utf8');
    const checkboxes = /const CHECKBOX_SETTINGS[^=]*= \[([\s\S]*?)\n\];/.exec(crossword)?.[1]?.match(/^\s*\['/gm) ?? [];
    expect(checkboxes.length).toBeGreaterThan(0);
    expect(names('cueword')).toHaveLength(checkboxes.length + 1);
    expect(names('cueword').at(-1)).toBe('cue text size');
  });

  it('keeps the sudoku pause sentence the pause test reads', () => {
    expect(GAME_HELP.triage.play).toContain('pause hides every number, the original ones too, until you press play. leaving the page pauses it for you.');
  });

  it('keeps every rule of the piccline board in its help, since the board no longer prints them', () => {
    const text = GAME_HELP.suture.play.join(' ');
    for (const part of ['each letter belongs to exactly one answer', 'the thread', 'drag across the letters', 'tapping the last letter again also submits', 'arrows move', 'a teal line joins', 'question marks', 'earn a cue']) {
      expect(text).toContain(part);
    }
  });
});
