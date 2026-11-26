import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { followStatsAuth, statsVisibleFor } from '../../src/islands/gamestatsgate';

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

  it('defaults to hidden before the check resolves and shows the create-an-account bar instead of stats', () => {
    const hook = read('src/islands/gamestatsgate.ts');
    expect(hook).toContain('useState<boolean | undefined>(undefined)');
    expect(hook).toContain('return useStatsGate(read, getClient) === true;');
    const panel = read('src/islands/GameFrameStats.tsx');
    expect(panel).toContain('const visible = useStatsVisible();');
    expect(panel).toContain('if (!visible) {');
    expect(panel).toContain('create an account');
    expect(panel).toContain('to save your daily game stats');
  });

  it('still records and tracks stats while hidden: the listeners sit above the early return', () => {
    const panel = read('src/islands/GameFrameStats.tsx');
    expect(panel.indexOf('window.addEventListener(GAME_STATS_CHANGED_EVENT, refresh)')).toBeLessThan(panel.indexOf('if (!visible) {'));
  });

  it('gates the finish screens of both daily word games and reuses the shared session read', () => {
    for (const file of ['src/islands/VialoGame.tsx', 'src/islands/PulseGame.tsx']) {
      const game = read(file);
      expect(game).toContain('const statsVisible = useStatsVisible();');
      expect(game).toMatch(/\{statsVisible && <section className="(vialo|pillo)-stats/);
    }
    expect(read('src/islands/gamestatsgate.ts')).toContain("import { getSessionState, getSupabase, type SessionState } from './supabaseclient';");
  });

  describe('follows sign-in and sign-out in this or another tab', () => {
    const fakeClient = () => {
      let callback: ((event: string, session: { user?: { id?: unknown } | null } | null) => void) | undefined;
      let unsubscribed = 0;
      return {
        emit: (event: string, session: { user?: { id?: unknown } | null } | null) => callback?.(event, session),
        unsubscribed: () => unsubscribed,
        client: { auth: { onAuthStateChange: (cb: NonNullable<typeof callback>) => { callback = cb; return { data: { subscription: { unsubscribe: () => { unsubscribed += 1; } } } }; } } },
      };
    };

    it('hides on sign-out and shows on sign-in, and stops listening when told to', async () => {
      const fake = fakeClient();
      const seen: boolean[] = [];
      const stop = await followStatsAuth(async () => fake.client, (value) => seen.push(value));
      fake.emit('SIGNED_OUT', null);
      fake.emit('SIGNED_IN', { user: { id: 'u1' } });
      fake.emit('SIGNED_IN', { user: { id: '' } });
      expect(seen).toEqual([false, true, false]);
      stop();
      expect(fake.unsubscribed()).toBe(1);
    });

    it('has nothing to follow with accounts off or a failed client load', async () => {
      const seen: boolean[] = [];
      await (await followStatsAuth(async () => null, (value) => seen.push(value)))();
      await (await followStatsAuth(async () => { throw new Error('load failed'); }, (value) => seen.push(value)))();
      expect(seen).toEqual([]);
    });

    it('the hook subscribes and unsubscribes on unmount', () => {
      const hook = read('src/islands/gamestatsgate.ts');
      expect(hook).toContain('followStatsAuth(getClient');
      expect(hook).toContain('stop?.();');
    });
  });
});
