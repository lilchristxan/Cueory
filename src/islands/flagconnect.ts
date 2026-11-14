/**
 * Connects the "flag or comment" form to the page's shared Supabase client (Task 171).
 *
 * The client is handed in as a loader, so nothing is downloaded until the form asks and the logic can be tested with a
 * fake. Accounts off (a null client), no session, or any error reads as signed out. Sending goes through makeSend,
 * which checks the report, calls submit_flag and maps every refusal through studentMessage. The browser's session is
 * only used to decide which panel to show: submit_flag checks the signed token itself.
 */
import type { FlagArgs } from './flagsubmit';
import { makeSend, type SendResult } from './flagsend';
import { studentMessage } from './rpcerrors';
import { sessionStateFrom, type SessionReader } from './supabaseclient';
import type { FlagReport } from './flag';

/** A sign-in or sign-out, in this tab or (through supabase-js's broadcast) another one. */
type AuthListener = (event: string, session: { user?: { id?: unknown } | null } | null) => void;

/** The parts of the Supabase client the flag form uses. */
export interface FlagClient extends SessionReader {
  auth: SessionReader['auth'] & {
    onAuthStateChange?(callback: AuthListener): { data: { subscription: { unsubscribe(): void } } };
  };
  rpc(name: 'submit_flag', args: FlagArgs): PromiseLike<{ data: unknown; error: unknown }>;
}
export type LoadFlagClient = () => Promise<FlagClient | null>;

/** Whether this browser has a signed-in session. */
export async function flagSignedIn(load: LoadFlagClient): Promise<boolean> {
  try {
    return (await sessionStateFrom(await load())).signedIn;
  } catch {
    return false;
  }
}

export interface FlagSessionWatch {
  /** Reads the session again (when the page is idle and every time the form opens). A check already running is reused. */
  check(): void;
  /** Stops listening; nothing is reported afterwards. */
  stop(): void;
}

/**
 * Keeps the form's signed-in state current instead of trusting the first answer: every `check()` reads the browser's
 * session again, and once the client has loaded, sign-ins and sign-outs (from any tab) are followed as they happen.
 * A check that was already running when a newer sign-in or sign-out arrived is dropped, so the newest state wins.
 */
export function watchFlagSession(load: LoadFlagClient, report: (signedIn: boolean, userId: string | null) => void): FlagSessionWatch {
  let stopped = false;
  let running = false;
  let latest = 0;
  let subscription: { unsubscribe(): void } | null = null;

  const listen = (client: FlagClient | null) => {
    if (stopped || subscription || !client || typeof client.auth?.onAuthStateChange !== 'function') return;
    try {
      subscription = client.auth.onAuthStateChange((_event, session) => {
        if (stopped) return;
        latest += 1;
        const userId = typeof session?.user?.id === 'string' && session.user.id !== '' ? session.user.id : null;
        report(userId !== null, userId);
      }).data.subscription;
    } catch {
      // Rechecking when the form opens still keeps it current.
    }
  };

  return {
    check() {
      if (stopped || running) return;
      running = true;
      const mine = ++latest;
      void (async () => {
        let client: FlagClient | null = null;
        try {
          client = await load();
        } catch {
          client = null;
        }
        const state = await sessionStateFrom(client);
        running = false;
        if (stopped) return;
        if (mine === latest) report(state.signedIn, state.signedIn ? state.userId : null);
        listen(client);
      })();
    },
    stop() {
      stopped = true;
      subscription?.unsubscribe();
      subscription = null;
    },
  };
}

/**
 * A single PostgREST query builder can pin Authorization for this request.
 * In supabase-js 2.118.0, client.rpc() is lazy and fetchWithAuth() reads
 * the shared session again only when the returned builder is awaited. Without
 * a per-query header that later read could attach account B's JWT to account
 * A's draft after our final identity check.
 */
type FlagRpcRequest = PromiseLike<{ data: unknown; error: unknown }> & {
  setHeader?: (name: string, value: string) => unknown;
  abortSignal?: (signal: AbortSignal) => unknown;
};

async function currentFlagAccessSession(client: FlagClient): Promise<{ userId: string; accessToken: string } | null> {
  try {
    const reply = await client.auth.getSession();
    if (reply.error) return null;
    const session = reply.data?.session as {
      user?: { id?: unknown } | null;
      access_token?: unknown;
    } | null | undefined;
    const userId = session?.user?.id;
    const accessToken = session?.access_token;
    return typeof userId === 'string' && userId !== '' &&
      typeof accessToken === 'string' && accessToken !== ''
      ? { userId, accessToken }
      : null;
  } catch {
    return null;
  }
}

/**
 * Sends a report as the user who pressed Send. The per-request Authorization
 * header is explicitly frozen to that user's JWT. Even if the shared
 * Supabase client switches accounts during lazy token acquisition, it cannot
 * turn an A-origin report into a B-authenticated submission.
 *
 * An auth change also aborts the specific PostgREST builder before/in flight,
 * without modifying the shared client or any unrelated request. The database
 * still checks authentication, permissions and rate limits independently.
 *
 * Omitted expectedUserId is retained for older isolated transport callers.
 * Actual browser FlagMount always supplies the initiating account identity.
 */
export function makeFlagSend(
  load: LoadFlagClient,
  expectedUserId?: string | null,
): (report: FlagReport) => Promise<SendResult> {
  return async (report) => {
    let client: FlagClient | null;
    try {
      client = await load();
    } catch {
      return 'failed';
    }
    if (!client) return { message: studentMessage('submit_flag', { message: 'sign in to send a report' }) };
    const identityChanged = () => ({
      message: 'your account changed before this report was sent. please open the form again.',
    });
    let changedDuringSend = false;
    let unsubscribe = () => {};
    const abort = new AbortController();
    if (expectedUserId !== undefined) {
      const onAuth = client.auth.onAuthStateChange;
      // An A -> B -> A switch would pass an end-state-only session check.
      // Cancel this particular write on any intermediate identity change.
      if (typeof onAuth !== 'function') return identityChanged();
      try {
        const observer = onAuth.call(client.auth, (_event, session) => {
          if (session?.user?.id !== expectedUserId) {
            changedDuringSend = true;
            abort.abort();
          }
        }).data.subscription;
        unsubscribe = () => observer.unsubscribe();
      } catch {
        return identityChanged();
      }
    }
    try {
      if (expectedUserId !== undefined) {
        const initial = await currentFlagAccessSession(client);
        if (changedDuringSend || !initial ||
            !expectedUserId || initial.userId !== expectedUserId) return identityChanged();
      }
      let invalidatedBeforeRpc = false;
      const result = await makeSend(async (name, args) => {
        if (expectedUserId === undefined) return client.rpc(name, args);
        // The final session check immediately precedes construction of the
        // lazy builder. Do not let its later auth lookup override this token.
        const current = await currentFlagAccessSession(client);
        if (changedDuringSend || !current || current.userId !== expectedUserId) {
          invalidatedBeforeRpc = true;
          throw new Error('report identity changed');
        }
        const query = client.rpc(name, args) as FlagRpcRequest;
        // Fail closed if a substitute client lacks the pinned-version builder
        // API. Never send with the unbound shared-session token in that case.
        if (typeof query.setHeader !== 'function' || typeof query.abortSignal !== 'function') {
          invalidatedBeforeRpc = true;
          throw new Error('report identity could not be bound');
        }
        query.setHeader('Authorization', `Bearer ${current.accessToken}`);
        query.abortSignal(abort.signal);
        if (changedDuringSend || abort.signal.aborted) {
          invalidatedBeforeRpc = true;
          throw new Error('report identity changed');
        }
        return query;
      })(report);
      // makeSend masks low-level exceptions. Keep its public refusal specific
      // when an identity switch or missing request guard stopped dispatch.
      return invalidatedBeforeRpc || (changedDuringSend && result === 'failed')
        ? identityChanged()
        : result;
    } finally {
      unsubscribe();
    }
  };
}

/**
 * A report is an immutable snapshot of the structure the learner submitted.
 * Keep the acknowledgement outside a short-lived name card, even if the
 * student changes structures or systems while the RPC is pending.
 * Only public structure context and a redacted result reach the receipt.
 */
export async function sendReportWithReceipt(
  send: (report: FlagReport) => Promise<SendResult>,
  report: FlagReport,
  context?: string,
  onReportStart?: (context: string) => (result: SendResult) => void,
): Promise<SendResult> {
  const finish = context && onReportStart ? onReportStart(context) : undefined;
  let result: SendResult;
  try {
    result = await send(report);
  } catch {
    result = 'failed';
  }
  finish?.(result);
  return result;
}

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/**
 * The item a page shows, for its flag reports. Only real database ids are accepted (submit_flag's item_id and
 * item_version_id are uuids), so a page that passes a sample slug or half a pair fails the build instead of shipping
 * a form that can never send. Sample pages pass nothing.
 */
export function flagItemContext(
  flagItem: { itemId: string; itemVersionId: string } | undefined,
): { itemId?: string; itemVersionId?: string } {
  if (flagItem === undefined) return {};
  const { itemId, itemVersionId } = flagItem;
  if (typeof itemId !== 'string' || !UUID.test(itemId) || typeof itemVersionId !== 'string' || !UUID.test(itemVersionId)) {
    throw new Error('flagItem needs the item id and the item version id, both database uuids');
  }
  return { itemId, itemVersionId };
}
