/**
 * Keeps late answers from the account out of the anatomy lab (Task 178). A read of the review queue or the saved views
 * starts under one student and one body system; if either changes before it answers (a system switch, a sign-out, an
 * account switch in another tab), its answer is discarded instead of repopulating the panels.
 */
import type { SavedViewRow } from './anatomystudy';

export interface StudyScope {
  /** Records who is signed in (null for nobody) and which system is open. Returns true, and ends every earlier ticket, when either changed. */
  set(userId: string | null, systemKey: string): boolean;
  /** The student now, or null. */
  userId(): string | null;
  /** The open system now. */
  systemKey(): string;
  /** A check that stays true only while the student and the system are the ones at the time of the call. */
  ticket(): () => boolean;
}

export function createStudyScope(): StudyScope {
  let user: string | null = null;
  let system = '';
  let n = 0;
  return {
    set(userId, systemKey) {
      if (userId === user && systemKey === system) return false;
      user = userId;
      system = systemKey;
      n += 1;
      return true;
    },
    userId: () => user,
    systemKey: () => system,
    ticket() {
      const mine = n;
      return () => mine === n;
    },
  };
}

/** Starts a read and hands its answer to `apply` only if the scope has not changed since the read began. */
export function guardedRead<T>(scope: StudyScope, read: () => PromiseLike<T>, apply: (value: T) => void): Promise<void> {
  const current = scope.ticket();
  return Promise.resolve(read()).then((value) => { if (current()) apply(value); });
}

/** Only the views of the open system: a row of another system is never shown or opened. */
export function viewsForSystem(rows: readonly SavedViewRow[], systemKey: string): SavedViewRow[] {
  return rows.filter((row) => row.system_key === systemKey);
}

interface AuthClient {
  auth: {
    onAuthStateChange?(callback: (event: string, session: { user?: { id?: unknown } | null } | null) => void): {
      data: { subscription: { unsubscribe(): void } };
    };
  };
}

/**
 * Calls `onChange` with the signed-in user id (null for nobody) on every auth event, for as long as the returned
 * function has not been called. Same pattern as accountsettings.ts. A client that arrives after unsubscribing is left alone.
 */
export function subscribeIdentity(getClient: () => Promise<AuthClient | null>, onChange: (userId: string | null) => void): () => void {
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  getClient().then((client) => {
    const listener = client?.auth.onAuthStateChange;
    if (stopped || !client || typeof listener !== 'function') return;
    const { data } = listener.call(client.auth, (_event, next) => {
      if (stopped) return;
      const id = next?.user?.id;
      onChange(typeof id === 'string' && id !== '' ? id : null);
    });
    if (stopped) data.subscription.unsubscribe();
    else unsubscribe = () => data.subscription.unsubscribe();
  }, () => { /* no client: the lab keeps what getSessionState said */ });
  return () => {
    stopped = true;
    unsubscribe?.();
  };
}
