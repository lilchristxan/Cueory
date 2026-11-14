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
 * Send using the identity that was active when the student pressed Send.
 * Another tab can switch accounts while the Supabase module/client is loading.
 * Verify the same user on that exact client immediately before dispatching
 * submit_flag, rather than allowing account B to submit account A's draft.
 * The database still authenticates and rate-limits the RPC independently.
 *
 * An omitted expectedUserId is retained only for legacy callers and focused
 * transport tests. Browser flag forms always bind a session identity.
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
    if (expectedUserId !== undefined) {
      // A new browser session or an unsuccessful session read cannot
      // authorize the old form's report. This check must follow load().
      const current = await sessionStateFrom(client);
      if (!current.signedIn || !expectedUserId || current.userId !== expectedUserId) {
        return { message: 'your account changed before this report was sent. please open the form again.' };
      }
    }
    // Called on the client itself: supabase-js's rpc needs its receiver.
    return makeSend((name, args) => client.rpc(name, args))(report);
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
