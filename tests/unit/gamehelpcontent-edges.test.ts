import { describe, expect, it } from 'vitest';
import {
  GAME_HELP,
  GAME_HELP_STORAGE_KEY,
  HELP_GAMES,
  helpSeen,
  markHelpSeen,
  parseHelpSeen,
  type HelpGame,
} from '../../src/islands/gamehelpcontent';
import type { KeyValueStorage } from '../../src/scripts/storage';

function memory(initial?: string): KeyValueStorage & { data: Map<string, string>; writes: number } {
  const data = new Map<string, string>(initial === undefined ? [] : [[GAME_HELP_STORAGE_KEY, initial]]);
  const storage = {
    data,
    writes: 0,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); storage.writes += 1; },
    removeItem: (key: string) => void data.delete(key),
  };
  return storage;
}
const saved = (storage: { data: Map<string, string> }) => JSON.parse(storage.data.get(GAME_HELP_STORAGE_KEY) ?? 'null');

describe('game help saved-value parsing edges', () => {
  it.each([undefined, null, '', 'not json', '{', '{}', '"vialo"', '5', 'null', 'true', '{"0":"vialo"}'])(
    'reads %j as nothing seen', (raw) => {
      expect(parseHelpSeen(raw).size).toBe(0);
    });
  it('keeps known ids once each, in a set, and drops everything else', () => {
    const seen = parseHelpSeen(JSON.stringify(['vialo', 'vialo', 'pulse', 'nope', 5, null, {}, ['triage'], 'constructor', '__proto__', 'Cueword', 'suture']));
    expect([...seen].sort()).toEqual(['pulse', 'suture', 'vialo']);
  });
  it('does not treat a topic id as a game id', () => {
    expect(parseHelpSeen('["suture-search"]').size).toBe(0);
  });
  it('reads an empty list as nothing seen', () => {
    expect(parseHelpSeen('[]').size).toBe(0);
  });
});

describe('game help seen marks edges', () => {
  it('writes a list in a fixed order no matter the order games were seen', () => {
    const storage = memory();
    markHelpSeen(storage, 'suture');
    markHelpSeen(storage, 'cueword');
    markHelpSeen(storage, 'triage');
    const first = saved(storage);
    const other = memory();
    markHelpSeen(other, 'triage');
    markHelpSeen(other, 'suture');
    markHelpSeen(other, 'cueword');
    expect(saved(other)).toEqual(first);
    expect([...first].sort()).toEqual(['cueword', 'suture', 'triage']);
  });
  it('marks the old pulse name too when vialo is seen, and the reverse is read as seen but not written', () => {
    const vialo = memory();
    markHelpSeen(vialo, 'vialo');
    expect(new Set(saved(vialo))).toEqual(new Set(['pulse', 'vialo']));
    const pulse = memory();
    markHelpSeen(pulse, 'pulse');
    expect(saved(pulse)).toEqual(['pulse']);
    expect(helpSeen(pulse, 'vialo')).toBe(true);
  });
  it('does not write again for a game that is already seen', () => {
    const storage = memory();
    markHelpSeen(storage, 'triage');
    markHelpSeen(storage, 'triage');
    expect(storage.writes).toBe(1);
  });
  it('adds the vialo mark once when only pulse was saved, and reads vialo as seen', () => {
    const storage = memory(JSON.stringify(['pulse']));
    markHelpSeen(storage, 'vialo');
    expect(storage.writes).toBe(1);
    expect(helpSeen(storage, 'vialo')).toBe(true);
  });
  it('replaces a garbage saved value with a clean list, losing nothing real', () => {
    const storage = memory(JSON.stringify(['triage', 'junk', 7]));
    markHelpSeen(storage, 'cueword');
    expect(saved(storage)).toEqual(['triage', 'cueword'].sort((a, b) => ['pulse', ...HELP_GAMES].indexOf(a) - ['pulse', ...HELP_GAMES].indexOf(b)));
  });
  it('starts from nothing when the saved value is unreadable', () => {
    const storage = memory('{{{');
    markHelpSeen(storage, 'suture');
    expect(saved(storage)).toEqual(['suture']);
  });
  it('does nothing and does not throw without storage', () => {
    expect(() => markHelpSeen(undefined, 'triage')).not.toThrow();
    expect(helpSeen(undefined, 'triage')).toBe(false);
  });
  it('does not throw when reading or writing storage throws, and reports unseen', () => {
    const broken: KeyValueStorage = {
      getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => undefined,
    };
    expect(() => markHelpSeen(broken, 'triage')).not.toThrow();
    expect(helpSeen(broken, 'triage')).toBe(false);
  });
  it('does not lose the seen mark when only writing is blocked, because nothing is cached', () => {
    const readOnly = memory(JSON.stringify(['triage']));
    readOnly.setItem = () => { throw new Error('full'); };
    markHelpSeen(readOnly, 'cueword');
    expect(helpSeen(readOnly, 'triage')).toBe(true);
    expect(helpSeen(readOnly, 'cueword')).toBe(false);
  });
  it('keeps the games apart: seeing one does not mark another', () => {
    const storage = memory();
    markHelpSeen(storage, 'cueword');
    for (const game of ['triage', 'suture', 'vialo', 'pulse'] as HelpGame[]) expect(helpSeen(storage, game)).toBe(false);
    expect(helpSeen(storage, 'cueword')).toBe(true);
  });
});

describe('game help content shape edges', () => {
  it('keeps the browser key stable, since privacy and account deletion name it', () => {
    expect(GAME_HELP_STORAGE_KEY).toBe('cueory-game-help-seen');
  });
  it('is frozen at the top level and gives each topic a seen-mark game that exists', () => {
    expect(Object.isFrozen(GAME_HELP)).toBe(true);
    const valid = new Set<string>(['pulse', ...HELP_GAMES]);
    for (const content of Object.values(GAME_HELP)) expect(valid.has(content.game)).toBe(true);
  });
  it('has no empty step, no empty settings line and no repeated setting name in any topic', () => {
    for (const [topic, content] of Object.entries(GAME_HELP)) {
      expect(content.play.length, topic).toBeGreaterThan(0);
      for (const step of content.play) expect(step.trim(), topic).not.toBe('');
      expect(content.settingsIntro.trim(), topic).not.toBe('');
      const names = content.settings.map((setting) => setting.name);
      expect(new Set(names).size, topic).toBe(names.length);
      for (const setting of content.settings) {
        expect(setting.name.trim(), topic).not.toBe('');
        expect(setting.detail.trim(), topic).not.toBe('');
      }
    }
  });
  it('has no unfilled template text in any line', () => {
    const lines = Object.values(GAME_HELP).flatMap((content) => [...content.play, content.settingsIntro, ...content.settings.flatMap((s) => [s.name, s.detail])]);
    for (const line of lines) expect(line).not.toMatch(/\$\{|undefined|NaN|\[object/);
  });
  it('uses lowercase for every settings name', () => {
    for (const content of Object.values(GAME_HELP)) for (const setting of content.settings) expect(setting.name).toBe(setting.name.toLowerCase());
  });
});
