/**
 * Who may see the game stats (played, % solved, streaks): only a visitor with a real signed-in session (Christian,
 * 2026-11-25). The stats are still recorded in this browser for everyone, exactly as before; this only decides whether
 * they are shown. It reuses the shared lazy client's session read (./supabaseclient), the same one the account corner
 * and the guest-import offer use, so nothing new decides who is signed in.
 *
 * Hidden is the default. A build with accounts off has no client, so the session reads as signed out and the stats
 * stay hidden for everyone. Nothing is shown until the session check says signed in, so there is no flash of numbers.
 */
import { useEffect, useState } from 'react';
import { getSessionState, getSupabase, type SessionState } from './supabaseclient';

/** True only when the session read says signed in. A rejected read counts as signed out. */
export async function statsVisibleFor(read: () => Promise<SessionState>): Promise<boolean> {
  try {
    return (await read()).signedIn;
  } catch {
    return false;
  }
}

/** The part of the shared client this gate listens to; the same shape GuestImportOffer uses. */
export interface StatsAuthClient {
  auth: {
    onAuthStateChange(
      callback: (event: string, session: { user?: { id?: unknown } | null } | null) => void,
    ): { data: { subscription: { unsubscribe(): void } } };
  };
}

/**
 * Follows sign-in and sign-out, here or in another tab, through the shared client's auth events. Calls `onChange` with
 * whether a real user is signed in, straight from the event's session (no extra session read inside the callback).
 * Returns a function that stops listening. No client, or a failed load, means nothing to follow.
 */
export async function followStatsAuth(
  getClient: () => Promise<object | null>,
  onChange: (signedIn: boolean) => void,
): Promise<() => void> {
  try {
    const client = (await getClient()) as StatsAuthClient | null;
    if (!client) return () => {};
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id;
      onChange(typeof id === 'string' && id !== '');
    });
    return () => data.subscription.unsubscribe();
  } catch {
    return () => {};
  }
}

/**
 * The gate's three answers: `undefined` while the first session check is still running, then true (signed in) or false
 * (signed out, accounts off, or a failed read). A panel that must not flash either state while it waits (the /play
 * hub's totals) reads this; everything else uses `useStatsVisible`.
 */
export function useStatsGate(
  read: () => Promise<SessionState> = getSessionState,
  getClient: () => Promise<object | null> = getSupabase,
): boolean | undefined {
  const [visible, setVisible] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let active = true;
    // Only the newest answer counts: a session read that was already on its way must not overwrite a newer read or a
    // newer sign-in/sign-out event (for example a slow "signed in" read landing after the visitor signed out).
    let latest = 0;
    const check = () => {
      const mine = ++latest;
      void statsVisibleFor(read).then((value) => { if (active && mine === latest) setVisible(value); });
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) check();
    };
    check();
    let stop: (() => void) | null = null;
    void followStatsAuth(getClient, (signedIn) => {
      if (!active) return;
      latest += 1;
      setVisible(signedIn);
    }).then((unsubscribe) => {
      if (active) stop = unsubscribe; else unsubscribe();
    });
    window.addEventListener('pageshow', onPageShow);
    return () => {
      active = false;
      stop?.();
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [read, getClient]);
  return visible;
}

/** True only for a signed-in visitor, once the browser's session check has resolved. */
export function useStatsVisible(
  read: () => Promise<SessionState> = getSessionState,
  getClient: () => Promise<object | null> = getSupabase,
): boolean {
  return useStatsGate(read, getClient) === true;
}
