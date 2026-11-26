import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { followStatsAuth, statsVisibleFor } from '../../src/islands/gamestatsgate';
import { accountLaunch, accountStatsCta, signupState } from '../../src/config/site';

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
    expect(panel).toContain('{statsCta.label}');
    expect(panel).toContain('{statsCta.note}');
    expect(read('src/islands/PlayTotals.tsx')).toContain('{statsCta.label}');
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

describe('the account bar says what is true in each launch state', () => {
  it('open accounts: an account link, with the stats line', () => {
    expect(accountStatsCta(true)).toEqual({ href: '/signup', label: 'create an account', note: 'to save your daily game stats' });
  });
  it('closed accounts with neither Kit form nor landing page: a plain message, no link (nothing to complete at /#signup)', () => {
    expect(accountStatsCta(false, 'pending')).toEqual({ href: '', label: 'sign ups open soon.', note: '' });
    expect(signupState('', '')).toBe('pending');
    expect(accountStatsCta(false, signupState('', ''))).toEqual(accountStatsCta(false, 'pending'));
    // Open accounts do not depend on the launch box.
    expect(accountStatsCta(true, 'pending').href).toBe('/signup');
    // The words are the home page's own (src/components/home-v3/ComingSoon.astro).
    expect(read('src/components/home-v3/ComingSoon.astro')).toContain('sign ups open soon.');
  });
  it('closed accounts with the form or the landing page: the launch list (the launch-updates form), in the promo panel\'s own words', () => {
    expect(accountStatsCta(false, 'landing')).toEqual(accountStatsCta(false, 'form'));
    expect(accountStatsCta(false)).toEqual({ href: '/#signup', label: 'join the launch list', note: 'accounts open soon' });
    expect(accountStatsCta(false).label).toBe(accountLaunch(false).promoJoinLabel);
  });
});
