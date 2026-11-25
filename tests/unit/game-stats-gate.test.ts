import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { statsVisibleFor } from '../../src/islands/gamestatsgate';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf-8');

describe('game stats are shown only to a signed-in visitor (2026-11-25)', () => {
  it('shows for a real signed-in session', async () => {
    expect(await statsVisibleFor(async () => ({ signedIn: true, userId: 'u1', email: 'a@example.com' }))).toBe(true);
  });

  it('stays hidden when signed out, with accounts off, or when the session read fails', async () => {
    expect(await statsVisibleFor(async () => ({ signedIn: false }))).toBe(false);
    expect(await statsVisibleFor(async () => { throw new Error('private detail'); })).toBe(false);
  });

  it('defaults to hidden before the check resolves and renders nothing when hidden', () => {
    const hook = read('src/islands/gamestatsgate.ts');
    expect(hook).toContain('useState(false)');
    const panel = read('src/islands/GameFrameStats.tsx');
    expect(panel).toContain('const visible = useStatsVisible();');
    expect(panel).toContain('if (!visible) return null;');
  });

  it('still records and tracks stats while hidden: the listeners sit above the early return', () => {
    const panel = read('src/islands/GameFrameStats.tsx');
    expect(panel.indexOf('window.addEventListener(GAME_STATS_CHANGED_EVENT, refresh)')).toBeLessThan(panel.indexOf('if (!visible) return null;'));
  });

  it('gates the finish screens of both daily word games and reuses the shared session read', () => {
    for (const file of ['src/islands/VialoGame.tsx', 'src/islands/PulseGame.tsx']) {
      const game = read(file);
      expect(game).toContain('const statsVisible = useStatsVisible();');
      expect(game).toMatch(/\{statsVisible && <section className="(vialo|pillo)-stats/);
    }
    expect(read('src/islands/gamestatsgate.ts')).toContain("import { getSessionState, type SessionState } from './supabaseclient';");
  });
});
