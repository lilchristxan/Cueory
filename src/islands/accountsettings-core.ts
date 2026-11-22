import { checkDisplayName } from './displayname';
import { studentMessage } from './rpcerrors';
import { sessionCheckFrom } from './supabaseclient';
import type {
  AccountAdapters, AccountClient, AccountMessage, DownloadFile, ExportWatch,
} from './accountsettings';
import type { ExportReader, SupabaseExportClient } from './exportload';

export type { AccountAdapters, AccountClient, AccountMessage, DownloadFile, ExportWatch } from './accountsettings';

const messages: Record<AccountMessage, string> = {
  'name-saved': 'your display name is saved.', 'name-failed': "we couldn't save your display name. please try again.",
  'export-downloading': 'your data file is downloading.', 'export-csv-downloading': 'your spreadsheet files are downloading.',
  'export-failed': "we couldn't load all your saved data. please try again.", 'summary-failed': "we couldn't list what's saved, but deleting your account removes all of it.",
  'delete-unavailable': 'account deletion opens soon.', 'delete-failed': "we couldn't delete your account. please try again.",
  'delete-unconfirmed': 'we could not confirm deletion after the sign-in changed, so refresh this page and check your account.',
  deleted: 'your account is deleted, and this device no longer keeps your cueory data.',
  'deleted-not-cleared': "your account is deleted, but cueory couldn't confirm this browser cleared what it saved, so clear this site's data in your browser settings.",
  'deleted-other-account': 'your account is deleted, but this browser changed or could not confirm its sign-in, so its saved data was left alone.',
  'signout-failed': 'sign out did not work. please try again.', 'load-failed': 'your account could not load. please try again.',
  'identity-changed': 'the account signed in on this device changed, so nothing was done. your page is reloading for the current account.',
};

export function accountMessage(kind: AccountMessage): string { return messages[kind]; }

export async function otherAccountNow(adapters: Pick<AccountAdapters, 'session'>, userId: string): Promise<boolean> {
  try { const now = await adapters.session(); return now.signedIn && now.userId !== userId; } catch { return true; }
}

export async function sameIdentity(adapters: Pick<AccountAdapters, 'session'>, userId: string): Promise<boolean> {
  try { const now = await adapters.session(); return now.signedIn && now.userId === userId; } catch { return false; }
}

export function adaptersFor(client: AccountClient): AccountAdapters {
  return {
    async session() {
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
    async writeName(name) {
      const { data, error } = await client.rpc('update_display_name', { new_name: name });
      if (error != null || typeof data !== 'string') throw new Error('display name not saved', { cause: error });
      return data;
    },
    reader: lazyExportReader(client),
    async signInDetails() {
      const { data, error } = await client.auth.getSession();
      if (error != null) throw new Error('sign-in details not read');
      const user: unknown = data?.session?.user;
      return typeof user === 'object' && user !== null ? (user as { user_metadata?: unknown }).user_metadata : undefined;
    },
    async deleteAccount(expectedUserId, signal) {
      if (signal?.aborted) throw new Error('account deletion cancelled');
      const request = client.rpc('delete_my_account', { expected_user_id: expectedUserId });
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

function lazyExportReader(client: SupabaseExportClient): ExportReader {
  let loaded: Promise<ExportReader> | undefined;
  const load = () => {
    loaded ??= import('./exportload').then(({ fromSupabase }) => fromSupabase(client)).catch(error => {
      loaded = undefined;
      throw error;
    });
    return loaded;
  };
  return {
    select: (...args) => load().then(reader => reader.select(...args)),
    selectPages: (...args) => ({ async *[Symbol.asyncIterator]() { yield* (await load()).selectPages(...args); } }),
    rpc: (...args) => load().then(reader => reader.rpc(...args)),
    user: (...args) => load().then(reader => reader.user(...args)),
  };
}

export type SaveResult =
  | { kind: 'saved'; name: string; message: string }
  | { kind: 'invalid' | 'failed'; message: string };

export async function saveDisplayName(writeName: AccountAdapters['writeName'], input: string): Promise<SaveResult> {
  const checked = checkDisplayName(input);
  if (!checked.ok) return { kind: 'invalid', message: checked.message };
  try {
    const saved = await writeName(checked.name);
    const shown = checkDisplayName(saved);
    if (shown.ok && shown.name === saved) return { kind: 'saved', name: saved, message: accountMessage('name-saved') };
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    const said = studentMessage('update_display_name', cause);
    return { kind: 'failed', message: said === studentMessage('update_display_name', {}) ? accountMessage('name-failed') : said };
  }
  return { kind: 'failed', message: accountMessage('name-failed') };
}

export function watchExport(adapters: Pick<AccountAdapters, 'onIdentityChange'>, userId: string, onChanged: () => void = () => {}): ExportWatch {
  const controller = new AbortController(); let state: 'open' | 'changed' | 'closed' = 'open';
  const stop = adapters.onIdentityChange?.(next => { if (next === userId || state !== 'open') return; state = 'changed'; controller.abort(); onChanged(); });
  return { state: () => state, signal: controller.signal, close() { if (state === 'open') state = 'closed'; controller.abort(); stop?.(); } };
}

export interface DownloadDom {
  urls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
  document: Pick<Document, 'createElement' | 'body'>;
  later(run: () => void, ms: number): unknown;
}

export function offerFile(file: DownloadFile, dom: DownloadDom): void {
  const url = dom.urls.createObjectURL(file.blob);
  try { const link = dom.document.createElement('a'); link.href = url; link.download = file.fileName; dom.document.body.append(link); link.click(); link.remove(); }
  finally { dom.later(() => dom.urls.revokeObjectURL(url), 1000); }
}
export function offerIfOpen(file: DownloadFile, watch: Pick<ExportWatch, 'state'>, dom: DownloadDom): boolean {
  if (watch.state() !== 'open') return false; offerFile(file, dom); return true;
}
export function offerSpreadsheets(files: readonly DownloadFile[], watch: Pick<ExportWatch, 'state'>, dom: DownloadDom, gapMs = 300): void {
  files.forEach((file, index) => { if (index === 0) offerIfOpen(file, watch, dom); else dom.later(() => { offerIfOpen(file, watch, dom); }, index * gapMs); });
}

export function deleteGate(typed: string): { ready: boolean; hint: string } {
  const trimmed = typed.trim(); return trimmed.toLowerCase() === 'delete' ? { ready: true, hint: '' } : { ready: false, hint: trimmed === '' ? '' : 'type the word delete to confirm' };
}
export async function signOutHere(signOut: AccountAdapters['signOut']): Promise<{ ok: true; next: '/' } | { ok: false; message: string }> {
  try { await signOut(); return { ok: true, next: '/' }; } catch { return { ok: false, message: accountMessage('signout-failed') }; }
}
