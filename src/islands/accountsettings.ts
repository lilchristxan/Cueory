/**
 * The /account page's logic (Task 59): display name, download my data, delete my account and sign out.
 * No page, no DOM except the download helper, and no client of its own: the island passes in adapters, so tests use
 * fakes. Every permission check happens on the server; row-level security limits each read and write to the
 * signed-in student's own rows.
 *
 * Reuses checkDisplayName (displayname.ts), loadExport/fromSupabase (exportload.ts), exportJsonBlob/exportCsvBlobs
 * (exportdata.ts) and deletionSummary/confirmState/afterDeletion (deleteaccount.ts).
 */
import { afterDeletion, confirmState, deletionSummary, SESSION_KEYS_AFTER_DELETION } from './deleteaccount';
import { checkDisplayName } from './displayname';
import { exportCsvBlobs, exportJsonBlob, type ExportData } from './exportdata';
import { fromSupabase, loadExport, type ExportReader, type SupabaseExportClient } from './exportload';
import { loadStats } from './gameresults';
import { loadSudokuStats } from './sudokustats';
import { DELETE_IDENTITY, studentMessage } from './rpcerrors';
import { AUTH_STORAGE_KEY, sessionCheckFrom, type SessionReader, type SessionState } from './supabaseclient';
import { migrateLegacyStars } from '../scripts/progress';
import type { KeyValueStorage } from '../scripts/storage';

// ── Messages ──────────────────────────────────────────────────────────────────

export type AccountMessage =
  | 'name-saved' | 'name-failed'
  | 'export-downloading' | 'export-csv-downloading' | 'export-failed'
  | 'summary-failed'
  | 'delete-unavailable' | 'delete-failed' | 'delete-unconfirmed' | 'deleted' | 'deleted-not-cleared' | 'deleted-other-account'
  | 'signout-failed' | 'load-failed' | 'identity-changed';

/** Every outcome on the page, as one plain sentence in the lowercase voice (D-47). */
export function accountMessage(kind: AccountMessage): string {
  const messages: Record<AccountMessage, string> = {
    'name-saved': 'your display name is saved.',
    'name-failed': "we couldn't save your display name. please try again.",
    'export-downloading': 'your data file is downloading.',
    'export-csv-downloading': 'your spreadsheet files are downloading.',
    'export-failed': "we couldn't load all your saved data. please try again.",
    'summary-failed': "we couldn't list what's saved, but deleting your account removes all of it.",
    'delete-unavailable': 'account deletion opens soon.',
    'delete-failed': "we couldn't delete your account. please try again.",
    'delete-unconfirmed': 'we could not confirm deletion after the sign-in changed, so refresh this page and check your account.',
    deleted: 'your account is deleted, and this device no longer keeps your cueory data.',
    'deleted-not-cleared': "your account is deleted, but cueory couldn't confirm this browser cleared what it saved, so clear this site's data in your browser settings.",
    'deleted-other-account': 'your account is deleted, but this browser changed or could not confirm its sign-in, so its saved data was left alone.',
    'signout-failed': 'sign out did not work. please try again.',
    'load-failed': 'your account could not load. please try again.',
    'identity-changed': 'the account signed in on this device changed, so nothing was done. your page is reloading for the current account.',
  };
  return messages[kind];
}

// ── Adapters ──────────────────────────────────────────────────────────────────

interface Reply { data: unknown; error: unknown }

/**
 * The few parts of the Supabase client this page uses, so tests can pass a fake. The profile shape comes first so
 * `from('profiles')` picks it over the export reader's.
 */
export type AccountClient = {
  auth: {
    signOut(options: { scope: 'local' }): PromiseLike<{ error: unknown }>;
    /** https://supabase.com/docs/reference/javascript/auth-onauthstatechange */
    onAuthStateChange?(callback: (event: string, session: { user?: { id?: unknown } | null } | null) => void): {
      data: { subscription: { unsubscribe(): void } };
    };
  };
  from(table: 'profiles'): {
    select(columns: 'display_name'): { eq(column: 'id', value: string): { maybeSingle(): PromiseLike<Reply> } };
  };
  rpc(name: 'delete_my_account', args: { expected_user_id: string }): PromiseLike<{ error: unknown }> & {
    abortSignal?(signal: AbortSignal): PromiseLike<{ error: unknown }>;
  };
  rpc(name: 'update_display_name', args: { new_name: string; expected_user_id: string }): PromiseLike<Reply>;
} & SupabaseExportClient & SessionReader;

export interface AccountAdapters {
  session(): Promise<SessionState>;
  /** The student's own display name, or null when there is none or it can't be read. */
  readName(userId: string): Promise<string | null>;
  /** Saves the signed-in student's own display name and resolves with it as saved, or rejects with the database error as `cause`. */
  /** Saves the name for `expectedUserId`, the account on screen; the database refuses any other signed-in account. */
  writeName(name: string, expectedUserId: string): Promise<string>;
  reader: ExportReader;
  /** The signed-in session's `user.user_metadata` (the sign-in provider's profile details), for the download. */
  signInDetails?(): Promise<unknown>;
  /** Deletes the signed-in student's account, or rejects with the database error as `cause`. Null while deletion isn't open. */
  deleteAccount: ((expectedUserId: string, signal?: AbortSignal) => Promise<void>) | null;
  /** Signs out this device only, or rejects. */
  signOut(): Promise<void>;
  /** Calls back with the signed-in user id (null when signed out) on every sign-in state change, including from other tabs. Returns the unsubscribe. */
  onIdentityChange?(callback: (userId: string | null) => void): () => void;
}

/** True when a DIFFERENT account is signed in on this device right now. A failure to read the session counts as yes, so nothing is touched. */
export async function otherAccountNow(adapters: Pick<AccountAdapters, 'session'>, userId: string): Promise<boolean> {
  try {
    const now = await adapters.session();
    return now.signedIn && now.userId !== userId;
  } catch {
    return true;
  }
}

/** True only while the device's current session still belongs to `userId`. Any failure to read it counts as changed. */
export async function sameIdentity(adapters: Pick<AccountAdapters, 'session'>, userId: string): Promise<boolean> {
  try {
    const now = await adapters.session();
    return now.signedIn && now.userId === userId;
  } catch {
    return false;
  }
}

/**
 * Adapters over the shared client. writeName calls `update_display_name(new_name)` (20261102140000_update_display_name.sql),
 * the only way to change the name: it changes the caller's own row and limits how often. deleteAccount calls Task 60's
 * `delete_my_account(expected_user_id)`: it deletes the caller's own auth user, and the database refuses unless the id
 * passed is the signed-in account. Methods are always called on their
 * objects, because supabase-js relies on the receiver.
 */
export function adaptersFor(client: AccountClient): AccountAdapters {
  return {
    async session() {
      // Display-only sessionStateFrom swallows read errors. Account deletion must not.
      const current = await sessionCheckFrom(client);
      if ('error' in current) throw new Error('could not verify the current account');
      return current;
    },
    async readName(userId) {
      const { data, error } = await client.from('profiles').select('display_name').eq('id', userId).maybeSingle();
      if (error != null || typeof data !== 'object' || data === null) return null;
      const name = (data as { display_name?: unknown }).display_name;
      return typeof name === 'string' ? name : null;
    },
    async writeName(name, expectedUserId) {
      const { data, error } = await client.rpc('update_display_name', { new_name: name, expected_user_id: expectedUserId });
      if (error != null) throw new Error('display name not saved', { cause: error });
      if (typeof data !== 'string') throw new Error('display name not saved');
      return data;
    },
    reader: fromSupabase(client),
    async signInDetails() {
      // https://supabase.com/docs/reference/javascript/auth-getsession: the session's user carries user_metadata.
      const { data, error } = await client.auth.getSession();
      if (error != null) throw new Error('sign-in details not read');
      const user: unknown = data?.session?.user;
      return typeof user === 'object' && user !== null ? (user as { user_metadata?: unknown }).user_metadata : undefined;
    },
    async deleteAccount(expectedUserId, signal) {
      if (signal?.aborted) throw new Error('account deletion cancelled');
      const request = client.rpc('delete_my_account', { expected_user_id: expectedUserId });
      // Supabase PostgREST supports abortSignal; cancel a queued request if another account signs in.
      const { error } = await (signal && request.abortSignal ? request.abortSignal(signal) : request);
      if (error != null) throw new Error('account deletion failed', { cause: error });
    },
    onIdentityChange(callback) {
      const listener = client.auth.onAuthStateChange;
      if (typeof listener !== 'function') return () => {};
      const { data } = listener.call(client.auth, (_event, next) => {
        const id = next?.user?.id;
        callback(typeof id === 'string' && id !== '' ? id : null);
      });
      return () => data.subscription.unsubscribe();
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error != null) throw new Error('sign out failed');
    },
  };
}

// ── Display name ──────────────────────────────────────────────────────────────

export type SaveResult =
  | { kind: 'saved'; name: string; message: string }
  | { kind: 'invalid' | 'failed'; message: string };

/** A known refusal from update_display_name() gets its own sentence (rpcerrors.ts); anything else gets ours. */
function nameFailure(cause: unknown): string {
  const said = studentMessage('update_display_name', cause);
  return said === studentMessage('update_display_name', {}) ? accountMessage('name-failed') : said;
}

/** Checks the name with the database's own rules first, then saves it through update_display_name. */
export async function saveDisplayName(write: (name: string) => Promise<string>, input: string): Promise<SaveResult> {
  const checked = checkDisplayName(input);
  if (!checked.ok) return { kind: 'invalid', message: checked.message };
  try {
    const saved = await write(checked.name);
    // Show the name exactly as the database saved it; anything that isn't a valid name is a failed save.
    const shown = checkDisplayName(saved);
    if (shown.ok && shown.name === saved) return { kind: 'saved', name: saved, message: accountMessage('name-saved') };
  } catch (error) {
    // Never show a database error; it can hold SQL internals. Known refusals have their own sentence.
    return { kind: 'failed', message: nameFailure(error instanceof Error ? error.cause : undefined) };
  }
  return { kind: 'failed', message: accountMessage('name-failed') };
}

// ── Download my data ──────────────────────────────────────────────────────────

export interface GatherOptions {
  /** The signed-in email from the session. profiles doesn't store one. */
  email: string;
  /** The session's `user.user_metadata`, as `AccountAdapters.signInDetails` reads it. Left out, the section is empty. */
  signInDetails?: unknown;
  storage: KeyValueStorage | undefined;
  /** Today in the student's own time zone, YYYY-MM-DD. */
  today: string;
}

export type GatherResult = { ok: true; data: ExportData } | { ok: false; message: string };

/**
 * Everything the student has saved: the database's sections (all or nothing, from loadExport), the signed-in email,
 * the sign-in provider's profile details from the session, and this browser's own progress and game stats. A partial
 * load is never returned.
 */
export async function gatherExport(reader: ExportReader, { email, signInDetails, storage, today }: GatherOptions): Promise<GatherResult> {
  const loaded = await loadExport(reader);
  if (!loaded.ok) return { ok: false, message: loaded.message };
  // The same reading /progress uses: older per-deck stars move into the record first, so the file has all of it.
  const progress = migrateLegacyStars(storage);
  const stats = loadStats(storage, today);
  const sudoku = loadSudokuStats(storage, today);
  return {
    ok: true,
    data: {
      ...loaded.data,
      profile: { ...loaded.data.profile, email: email || null },
      signInDetails: detailRows(signInDetails),
      progress,
      ...(stats.on ? { gameStats: stats.stats } : {}),
      ...(sudoku.on ? { sudokuStats: sudoku.solves } : {}),
    },
  };
}

/**
 * One row per top-level field of `user_metadata`, in name order. Only own data properties are read, so a getter never
 * runs; exportdata.ts checks each value and drops anything that isn't plain.
 */
function detailRows(details: unknown): { name: string; value: unknown }[] {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return [];
  return Object.keys(details).sort().map(name => {
    const descriptor = Object.getOwnPropertyDescriptor(details, name);
    return { name, value: descriptor && 'value' in descriptor ? descriptor.value : undefined };
  });
}

export interface DownloadFile { fileName: string; blob: Blob }
export type DownloadResult =
  | { ok: true; json: DownloadFile; csv: DownloadFile[] }
  | { ok: false; message: string };

/** The JSON file and the spreadsheet files, built from the pages without joining a long study history into one string. */
export function downloadFiles(data: ExportData, today: string): DownloadResult {
  try {
    const name = `cueory-data-${today}`;
    return {
      ok: true,
      json: { fileName: `${name}.json`, blob: exportJsonBlob(data, today) },
      csv: exportCsvBlobs(data).map(({ fileName, blob }) => ({ fileName: `${name}-${fileName}`, blob })),
    };
  } catch {
    return { ok: false, message: accountMessage('export-failed') };
  }
}

/** Loads, adds this browser's data and builds the files. Any failure offers no file at all. */
export async function prepareDownload(reader: ExportReader, options: GatherOptions): Promise<DownloadResult> {
  const gathered = await gatherExport(reader, options);
  return gathered.ok ? downloadFiles(gathered.data, options.today) : gathered;
}

/** Like prepareDownload, but for the account the page was opened for: no file if the signed-in account differs before or after reading. */
export async function prepareDownloadFor(
  adapters: Pick<AccountAdapters, 'session' | 'reader'>, userId: string, options: GatherOptions,
): Promise<DownloadResult | { ok: false; message: string; changed: true }> {
  const changed = { ok: false as const, message: accountMessage('identity-changed'), changed: true as const };
  if (!(await sameIdentity(adapters, userId))) return changed;
  const files = await prepareDownload(adapters.reader, options);
  if (files.ok && !(await sameIdentity(adapters, userId))) return changed;
  return files;
}

export interface DownloadDom {
  urls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
  document: Pick<Document, 'createElement' | 'body'>;
  later(run: () => void, ms: number): unknown;
}

/** Offers one file through a temporary object URL, and revokes the URL once the download has started. */
export function offerFile(file: DownloadFile, dom: DownloadDom): void {
  const url = dom.urls.createObjectURL(file.blob);
  try {
    const link = dom.document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    dom.document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // The browser reads the Blob after the click returns, so the URL lives a moment longer.
    dom.later(() => dom.urls.revokeObjectURL(url), 1000);
  }
}

// ── Delete my account ─────────────────────────────────────────────────────────

/** Summary lines for the confirmation, from the same data the download uses. */
export async function deletionLines(reader: ExportReader, options: GatherOptions): Promise<{ ok: true; lines: string[] } | { ok: false; message: string }> {
  const gathered = await gatherExport(reader, options);
  return gathered.ok ? { ok: true, lines: deletionSummary(gathered.data) } : { ok: false, message: accountMessage('summary-failed') };
}

/** The delete button stays disabled until the typed confirmation matches. `hint` is empty until something is typed. */
export function deleteGate(typed: string): { ready: boolean; hint: string } {
  const reason = confirmState(typed);
  return { ready: reason === null, hint: reason !== null && typed.trim() !== '' ? reason : '' };
}

/** A known refusal from delete_my_account() gets its own sentence (rpcerrors.ts); anything else gets ours. */
function deleteFailure(cause: unknown): string {
  const said = studentMessage('delete_my_account', cause);
  return said === studentMessage('delete_my_account', {}) ? accountMessage('delete-failed') : said;
}

export type DeleteResult =
  | { kind: 'deleted'; message: string; next: '/' }
  | { kind: 'not-confirmed' | 'unavailable' | 'failed' | 'identity-changed'; message: string };

export interface DeleteOptions {
  /** The account id the page is showing; the database refuses unless it is still the signed-in account. */
  userId: string;
  /** Re-reads the current session just before deleting; false (or a throw) means the account changed, so nothing is deleted. */
  stillSame?: () => Promise<boolean>;
  /** Checked after the deletion: true means another account is now signed in here, so its session and data are left alone. */
  otherAccountNow?: () => Promise<boolean>;
  /** Aborted forever on ANY switch away from the initiating account, even if A -> B -> A returns to A. */
  signal?: AbortSignal;
  typed: string;
  deleteAccount: AccountAdapters['deleteAccount'];
  /** Compatibility with other account-page callers. Never invoked after deletion: shared signOut might sign out B. */
  signOut: AccountAdapters['signOut'];
  local: KeyValueStorage | undefined;
  session: KeyValueStorage | undefined;
}

/**
 * Capture the data present when A confirmed deletion. Do not remove new values that another sign-in writes while
 * the server request is in flight. If storage cannot be listed, clearing just the known auth key is still possible.
 */
type StorageSnapshot = { entries: Array<readonly [string, string | null]>; complete: boolean } | null;

function localSnapshot(storage: KeyValueStorage | undefined): StorageSnapshot {
  if (!storage) return null;
  const entries: Array<readonly [string, string | null]> = [];
  let complete = true;
  try {
    for (const key of afterDeletion(storage)) entries.push([key, storage.getItem(key)]);
  } catch {
    complete = false;
  }
  // Remove the auth token LAST so each earlier removal can verify that the original session is still present.
  try {
    entries.push([AUTH_STORAGE_KEY, storage.getItem(AUTH_STORAGE_KEY)]);
  } catch {
    complete = false;
  }
  return { entries, complete };
}

function sessionSnapshot(storage: KeyValueStorage | undefined): StorageSnapshot {
  if (!storage) return null;
  const entries: Array<readonly [string, string | null]> = [];
  let complete = true;
  for (const key of SESSION_KEYS_AFTER_DELETION) {
    try { entries.push([key, storage.getItem(key)]); } catch { complete = false; }
  }
  return { entries, complete };
}

function removeSnapshot(
  storage: KeyValueStorage | undefined, snapshot: StorageSnapshot, unchanged: () => boolean,
): { cleared: boolean; switched: boolean } {
  if (!storage || !snapshot) return { cleared: false, switched: false };
  let cleared = snapshot.complete;
  for (const [key, value] of snapshot.entries) {
    if (!unchanged()) return { cleared: false, switched: true };
    try {
      // A different sign-in or a new owner may have saved a new value for this shared browser key.
      if (storage.getItem(key) !== value) { cleared = false; continue; }
      storage.removeItem(key);
    } catch {
      cleared = false;
    }
  }
  return { cleared, switched: false };
}

/**
 * The server deletes only the confirmed user id. A sign-in switch cancels any queued network request. If the server
 * already completed deletion, this flow never calls the shared client's asynchronous signOut: that can target B.
 * Instead, it clears only A's unchanged browser values and removes A's auth key last. The page reloads on navigation.
 */
export async function deleteMyAccount({ userId, typed, stillSame, otherAccountNow, signal, deleteAccount, local, session }: DeleteOptions): Promise<DeleteResult> {
  const reason = confirmState(typed);
  if (reason !== null) return { kind: 'not-confirmed', message: reason };
  if (!deleteAccount) return { kind: 'unavailable', message: accountMessage('delete-unavailable') };
  if (signal?.aborted) return { kind: 'identity-changed', message: accountMessage('identity-changed') };
  const localAtStart = localSnapshot(local);
  const sessionAtStart = sessionSnapshot(session);
  let oldAuth: string | null | undefined;
  try { oldAuth = local?.getItem(AUTH_STORAGE_KEY); } catch { /* unreadable: never clear shared data */ }
  if (stillSame && !(await stillSame().catch(() => false))) {
    return { kind: 'identity-changed', message: accountMessage('identity-changed') };
  }
  // This synchronous check also catches A -> B -> A while the async preflight was resolving.
  if (signal?.aborted) return { kind: 'identity-changed', message: accountMessage('identity-changed') };
  try {
    await deleteAccount(userId, signal);
  } catch (error) {
    // Aborting a request after it starts does not prove the server did not finish deleting A.
    if (signal?.aborted) return { kind: 'failed', message: accountMessage('delete-unconfirmed') };
    const cause = error instanceof Error ? error.cause : undefined;
    if (typeof cause === 'object' && cause !== null && (cause as { message?: unknown }).message === DELETE_IDENTITY) {
      return { kind: 'identity-changed', message: accountMessage('identity-changed') };
    }
    return { kind: 'failed', message: deleteFailure(cause) };
  }

  const leftAlone = { kind: 'deleted' as const, message: accountMessage('deleted-other-account'), next: '/' as const };
  if (signal?.aborted || (otherAccountNow && await otherAccountNow().catch(() => true))) return leftAlone;
  // A different session's auth value is a hard stop, even if its event has not reached this tab yet.
  const unchanged = () => {
    if (signal?.aborted) return false;
    if (!local) return true;
    if (oldAuth === undefined) return false;
    try { return local.getItem(AUTH_STORAGE_KEY) === oldAuth; } catch { return false; }
  };
  if (!unchanged()) return leftAlone;

  // No await or signOut is allowed between the final identity check and these synchronous removals.
  const tab = removeSnapshot(session, sessionAtStart, unchanged);
  if (tab.switched) return leftAlone;
  const device = removeSnapshot(local, localAtStart, unchanged);
  if (device.switched) return leftAlone;
  return {
    kind: 'deleted', next: '/',
    message: accountMessage(tab.cleared && device.cleared ? 'deleted' : 'deleted-not-cleared'),
  };
}

// ── Sign out ──────────────────────────────────────────────────────────────────

export async function signOutHere(signOut: AccountAdapters['signOut']): Promise<{ ok: true; next: '/' } | { ok: false; message: string }> {
  try {
    await signOut();
    return { ok: true, next: '/' };
  } catch {
    return { ok: false, message: accountMessage('signout-failed') };
  }
}
