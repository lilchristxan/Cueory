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
import { getSessionState, type SessionState } from './supabaseclient';

/** True only when the session read says signed in. A rejected read counts as signed out. */
export async function statsVisibleFor(read: () => Promise<SessionState>): Promise<boolean> {
  try {
    return (await read()).signedIn;
  } catch {
    return false;
  }
}

/** False on the server and until the browser's session check resolves; true only for a signed-in visitor. */
export function useStatsVisible(read: () => Promise<SessionState> = getSessionState): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let active = true;
    const check = () => {
      void statsVisibleFor(read).then((value) => { if (active) setVisible(value); });
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) check();
    };
    check();
    window.addEventListener('pageshow', onPageShow);
    return () => {
      active = false;
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [read]);
  return visible;
}
