import { describe, expect, it, vi } from 'vitest';
import {
  accountMessage, adaptersFor, deleteGate, deleteMyAccount, deletionLines, downloadFiles, gatherExport, offerFile, prepareDownloadFor, sameIdentity, otherAccountNow,
  offerIfOpen, offerSpreadsheets, watchExport,
  prepareDownload, saveDisplayName, signOutHere, type AccountClient, type AccountMessage, type DownloadDom,
} from '../../src/islands/accountsettings';
import { afterDeletion, SESSION_KEYS_AFTER_DELETION } from '../../src/islands/deleteaccount';
import { DELETE_IDENTITY } from '../../src/islands/rpcerrors';
import type { ExportReader } from '../../src/islands/exportload';
import { STATS_STORAGE_KEY } from '../../src/islands/gameresults';
import { AUTH_STORAGE_KEY } from '../../src/islands/supabaseclient';
import { BREAK_STORAGE_KEY } from '../../src/scripts/breakstore';
import { legacyStarsKey, PROGRESS_STORAGE_KEY } from '../../src/scripts/progress';
import { THEME_STORAGE_KEY } from '../../src/scripts/theme';
import type { KeyValueStorage } from '../../src/scripts/storage';

class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const when = '2026-11-01T08:00:00.000Z';
const today = '2026-11-02';
const itemId = '22222222-2222-4222-8222-222222222222';
const versionId = '11111111-1111-4111-8111-111111111111';
const eventId = '44444444-4444-4444-8444-444444444444';

/** A reader with the student's own rows, or one that fails a read. */
function reader({ fails = false, events = [] as unknown[] } = {}): ExportReader {
  const rows: Record<string, unknown[]> = {
    profiles: [{ display_name: 'Sample Student', created_at: when, name_change_window_start: null, name_changes_in_window: 0 }],
    attempts: [],
    exam_plans: [{ id: eventId, course: 'med-surg-1', exam_date: '2026-12-15', created_at: when }],
    review_state: [],
  };
  return {
    select: async (table) => fails && table === 'attempts' ? { data: null, error: { message: 'private detail' } } : { data: rows[table], error: null },
    async *selectPages() { yield { data: events, error: null }; },
    rpc: async () => ({ data: [], error: null }),
    user: async () => ({ data: { user: { created_at: when } }, error: null }),
  };
}

const event = { id: eventId, item_id: itemId, item_version_id: versionId, kind: 'answered', ms_on_item: 1200, mark: null, at: when, created_at: when };

describe('every outcome is one plain sentence', () => {
  const kinds: AccountMessage[] = [
    'name-saved', 'name-failed', 'export-downloading', 'export-csv-downloading', 'export-failed', 'summary-failed',
    'delete-unavailable', 'delete-failed', 'delete-unconfirmed', 'deleted', 'deleted-not-cleared', 'deleted-other-account', 'signout-failed', 'load-failed',
  ];
  it.each(kinds)('%s', (kind) => {
    const text = accountMessage(kind);
    expect(text).toMatch(/^[a-z][^A-Z]*\.$/);
    expect(text).not.toMatch(/\n/);
  });
  it('gives each outcome its own sentence', () => {
    expect(new Set(kinds.map(accountMessage)).size).toBe(kinds.length);
  });
});

describe('saveDisplayName', () => {
  it('saves a trimmed name through update_display_name and shows it as saved', async () => {
    const write = vi.fn(async (name: string) => name);
    expect(await saveDisplayName(write, '  Sample  ')).toEqual({ kind: 'saved', name: 'Sample', message: 'your display name is saved.' });
    expect(write).toHaveBeenCalledWith('Sample');
  });

  it("refuses a bad name with the database's own rule and never writes", async () => {
    const write = vi.fn(async (name: string) => name);
    expect(await saveDisplayName(write, '   ')).toEqual({ kind: 'invalid', message: 'a name is required.' });
    expect(await saveDisplayName(write, 'x'.repeat(51))).toEqual({ kind: 'invalid', message: 'a name can be 1 to 50 characters.' });
    expect(write).not.toHaveBeenCalled();
  });

  it("gives the server's limit and sign-in refusals their own sentence (Codex on #230)", async () => {
    const refusing = (message: string) => async () => { throw new Error('display name not saved', { cause: { message, code: 'P0001' } }); };
    expect(await saveDisplayName(refusing('that is a lot of name changes; please try again later'), 'Sample'))
      .toEqual({ kind: 'failed', message: "you've changed your name a lot this hour. please try again later." });
    expect(await saveDisplayName(refusing('sign in to change your display name'), 'Sample'))
      .toEqual({ kind: 'failed', message: 'please sign in again to change your display name.' });
  });

  it('reports a refused or broken save in one sentence', async () => {
    const failed = { kind: 'failed', message: "we couldn't save your display name. please try again." };
    expect(await saveDisplayName(async () => '', 'Sample')).toEqual(failed);
    expect(await saveDisplayName(async () => { throw new Error('private detail'); }, 'Sample')).toEqual(failed);
    expect(await saveDisplayName(async () => { throw new Error('x', { cause: { message: 'private detail', code: 'XX000' } }); }, 'Sample'))
      .toEqual(failed);
  });
});

describe('download my data', () => {
  it("adds the signed-in email and this browser's progress and game stats", async () => {
    const local = new MemoryStorage();
    local.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, onboarding: { course: null, examDate: null, done: true }, decks: {} }));
    local.setItem(legacyStarsKey('sample-deck'), JSON.stringify(['card-1']));
    local.setItem(STATS_STORAGE_KEY, JSON.stringify([]));
    const result = await gatherExport(reader(), { email: 'student@example.test', storage: local, today });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.profile).toEqual({
      displayName: 'Sample Student', createdAt: when, nameChangeWindowStart: null, nameChangesInWindow: 0, email: 'student@example.test',
    });
    expect(result.data.progress).toMatchObject({ decks: { 'sample-deck': { starred: ['card-1'] } } });
    expect(result.data.gameStats).toEqual([]);
  });

  it("adds the sign-in provider's details from the session, one row per field in name order, without running getters", async () => {
    const details = { full_name: 'Sample Student', avatar_url: 'https://example.invalid/sample.png', email_verified: true };
    Object.defineProperty(details, 'secret', { enumerable: true, get: () => { throw new Error('getter ran'); } });
    const result = await gatherExport(reader(), { email: 'student@example.test', signInDetails: details, storage: undefined, today });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.signInDetails).toEqual([
      { name: 'avatar_url', value: 'https://example.invalid/sample.png' },
      { name: 'email_verified', value: true },
      { name: 'full_name', value: 'Sample Student' },
      { name: 'secret', value: undefined },
    ]);
    const files = downloadFiles(result.data, today);
    expect(files.ok).toBe(true);
    if (!files.ok) return;
    const json = JSON.parse(await files.json.blob.text());
    expect(json.signInDetails).toEqual([
      { name: 'avatar_url', value: 'https://example.invalid/sample.png' },
      { name: 'email_verified', value: true },
      { name: 'full_name', value: 'Sample Student' },
    ]);
    expect(json.dropped).toContain('signInDetails[3]');
  });

  it('has an empty sign-in details section when the session has none', async () => {
    for (const signInDetails of [undefined, null, ['not', 'an', 'object']]) {
      const result = await gatherExport(reader(), { email: '', signInDetails, storage: undefined, today });
      expect(result.ok && result.data.signInDetails).toEqual([]);
    }
  });

  it('leaves game stats out when they are off in this browser', async () => {
    const result = await gatherExport(reader(), { email: '', storage: new MemoryStorage(), today });
    expect(result.ok && 'gameStats' in result.data).toBe(false);
    expect(result.ok && result.data.profile?.email).toBeNull();
  });

  it("builds the JSON file and the spreadsheet files from loadExport's pages", async () => {
    const result = await prepareDownload(reader({ events: [event] }), { email: 'student@example.test', storage: undefined, today });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.json.fileName).toBe('cueory-data-2026-11-02.json');
    expect(result.json.blob.type).toBe('application/json');
    const json = JSON.parse(await result.json.blob.text());
    expect(json.profile.email).toBe('student@example.test');
    expect(json.studyEvents).toHaveLength(1);
    expect(result.csv.map(file => file.fileName)).toContain('cueory-data-2026-11-02-studyEvents.csv');
    expect(result.csv.every(file => file.fileName.startsWith('cueory-data-2026-11-02-'))).toBe(true);
    const events = result.csv.find(file => file.fileName.endsWith('studyEvents.csv'))!;
    expect((await events.blob.text()).split('\r\n')[1]).toContain(itemId);
  });

  it("offers no file when any read fails, and never shows the database's error", async () => {
    const result = await prepareDownload(reader({ fails: true }), { email: 'student@example.test', storage: undefined, today });
    expect(result).toEqual({ ok: false, message: "we couldn't load all your saved data. please try again." });
    expect(JSON.stringify(result)).not.toContain('private detail');
  });

  it('offers no file when the files cannot be built', () => {
    expect(downloadFiles({}, 'not a day')).toEqual({ ok: false, message: accountMessage('export-failed') });
  });

  it('offers each file through an object URL and revokes it after the download starts', () => {
    const later: (() => void)[] = [];
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    const fake: DownloadDom = {
      urls: { createObjectURL: vi.fn(() => 'blob:sample'), revokeObjectURL: vi.fn() },
      document: { createElement: vi.fn(() => link), body: { append: vi.fn() } } as unknown as DownloadDom['document'],
      later: (run) => later.push(run),
    };
    const blob = new Blob(['{}']);
    offerFile({ fileName: 'cueory-data-2026-11-02.json', blob }, fake);
    expect(fake.urls.createObjectURL).toHaveBeenCalledWith(blob);
    expect(link).toMatchObject({ href: 'blob:sample', download: 'cueory-data-2026-11-02.json' });
    expect(link.click).toHaveBeenCalledOnce();
    expect(fake.urls.revokeObjectURL).not.toHaveBeenCalled();
    later.forEach(run => run());
    expect(fake.urls.revokeObjectURL).toHaveBeenCalledWith('blob:sample');
  });
});

/** A client whose delete_my_account() refuses exactly as Task 60's migration does. */
function refusingClient() {
  const client = {
    rpc: async () => ({ data: null, error: { message: 'sign in to delete your account', code: '28000' } }),
    auth: { signOut: async () => ({ error: null }) },
  };
  return { client: client as unknown as AccountClient };
}
const pick = ({ deleteAccount, signOut }: ReturnType<typeof adaptersFor>) => ({ deleteAccount, signOut });

describe('delete my account', () => {
  const seeded = () => {
    const local = new MemoryStorage();
    for (const key of [AUTH_STORAGE_KEY, PROGRESS_STORAGE_KEY, THEME_STORAGE_KEY, legacyStarsKey('old-deck')]) local.setItem(key, '1');
    local.setItem('not-cueory', 'kept');
    const session = new MemoryStorage();
    session.setItem(BREAK_STORAGE_KEY, '1');
    return { local, session };
  };

  it('stays disabled until the typed confirmation matches', () => {
    expect(deleteGate('')).toEqual({ ready: false, hint: '' });
    expect(deleteGate('delet')).toEqual({ ready: false, hint: 'type the word delete to confirm' });
    expect(deleteGate(' DELETE ')).toEqual({ ready: true, hint: '' });
  });

  it('never calls the server before the confirmation matches', async () => {
    const deleteAccount = vi.fn(async () => {});
    const result = await deleteMyAccount({ userId: 'user-1', typed: 'delet', deleteAccount, signOut: async () => {}, ...seeded() });
    expect(result).toEqual({ kind: 'not-confirmed', message: 'type the word delete to confirm' });
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('says deletion opens soon when no delete callback is provided', async () => {
    expect(await deleteMyAccount({ userId: 'user-1', typed: 'delete', deleteAccount: null, signOut: async () => {}, ...seeded() }))
      .toEqual({ kind: 'unavailable', message: 'account deletion opens soon.' });
  });

  it('keeps everything and stays signed in when the server refuses', async () => {
    const storage = seeded();
    const signOut = vi.fn(async () => {});
    const result = await deleteMyAccount({ userId: 'user-1', typed: 'delete', deleteAccount: async () => { throw new Error('private'); }, signOut, ...storage });
    expect(result).toEqual({ kind: 'failed', message: "we couldn't delete your account. please try again." });
    expect(signOut).not.toHaveBeenCalled();
    expect(storage.local.getItem(AUTH_STORAGE_KEY)).toBe('1');
  });

  it('clears the deleted account locally without calling shared-client signOut', async () => {
    const storage = seeded();
    const order: string[] = [];
    const result = await deleteMyAccount({
      userId: 'user-1', typed: 'delete', deleteAccount: async () => { order.push('delete'); },
      signOut: async () => { order.push('signout'); }, ...storage,
    });
    expect(order).toEqual(['delete']);
    expect(result).toEqual({ kind: 'deleted', next: '/', message: 'your account is deleted, and this device no longer keeps your cueory data.' });
    expect([...storage.local.values.keys()]).toEqual(['not-cueory']);
    expect(storage.session.getItem(BREAK_STORAGE_KEY)).toBeNull();
  });

  it('maps the signed-out refusal to a plain sentence and keeps everything', async () => {
    const storage = seeded();
    const { client } = refusingClient();
    const result = await deleteMyAccount({ userId: 'user-1', typed: 'delete', ...pick(adaptersFor(client)), ...storage });
    expect(result).toEqual({ kind: 'failed', message: 'please sign in again to delete your account.' });
    expect(storage.local.getItem(AUTH_STORAGE_KEY)).toBe('1');
  });

  it('gives any other server error our own sentence, never its text', async () => {
    const result = await deleteMyAccount({
      userId: 'user-1', typed: 'delete', signOut: async () => {}, ...seeded(),
      deleteAccount: async () => { throw new Error('account deletion failed', { cause: { message: 'private detail', code: 'XX000' } }); },
    });
    expect(result).toEqual({ kind: 'failed', message: "we couldn't delete your account. please try again." });
  });

  it('removes the sign-in key and still lands home when sign-out rejects', async () => {
    const storage = seeded();
    const result = await deleteMyAccount({
      userId: 'user-1', typed: 'delete', deleteAccount: async () => {}, signOut: async () => { throw new Error('user not found'); }, ...storage,
    });
    expect(storage.local.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(result).toEqual({ kind: 'deleted', next: '/', message: accountMessage('deleted') });
  });

  it('removes every key afterDeletion lists', async () => {
    const storage = seeded();
    const planned = afterDeletion(storage.local);
    await deleteMyAccount({ userId: 'user-1', typed: 'delete', deleteAccount: async () => {}, signOut: async () => {}, ...storage });
    for (const key of planned) expect(storage.local.getItem(key)).toBeNull();
    for (const key of planned.sessionKeys) expect(storage.session.getItem(key)).toBeNull();
  });

  it("says so when the browser won't let it clear the device", async () => {
    const storage = seeded();
    const stubborn = Object.assign(storage.local, { removeItem: () => { throw new Error('blocked'); } });
    const result = await deleteMyAccount({ userId: 'user-1', typed: 'delete', deleteAccount: async () => {}, signOut: async () => {}, local: stubborn, session: storage.session });
    expect(result).toEqual({ kind: 'deleted', next: '/', message: accountMessage('deleted-not-cleared') });
  });

  it('clears session storage even when local storage is missing, and never calls that clear (Codex on #230)', async () => {
    const { session } = seeded();
    for (const key of SESSION_KEYS_AFTER_DELETION) session.setItem(key, '1');
    const result = await deleteMyAccount({ userId: 'user-1', typed: 'delete', deleteAccount: async () => {}, signOut: async () => {}, local: undefined, session });
    for (const key of SESSION_KEYS_AFTER_DELETION) expect(session.getItem(key)).toBeNull();
    expect(result).toEqual({ kind: 'deleted', next: '/', message: accountMessage('deleted-not-cleared') });
  });

  it('clears session storage when local storage throws, and still clears the rest of local storage', async () => {
    const storage = seeded();
    const removeItem = storage.local.removeItem.bind(storage.local);
    // Only the sign-in key refuses; every other local key and the session keys still go.
    storage.local.removeItem = (key: string) => { if (key === AUTH_STORAGE_KEY) throw new Error('blocked'); removeItem(key); };
    const result = await deleteMyAccount({ userId: 'user-1', typed: 'delete', deleteAccount: async () => {}, signOut: async () => {}, ...storage });
    expect([...storage.local.values.keys()].sort()).toEqual([AUTH_STORAGE_KEY, 'not-cueory']);
    expect(storage.session.getItem(BREAK_STORAGE_KEY)).toBeNull();
    expect(result.message).toBe(accountMessage('deleted-not-cleared'));
  });

  it('clears session storage when local storage cannot be listed', async () => {
    const storage = seeded();
    const unlistable = Object.assign(storage.local, { key: undefined }) as unknown as KeyValueStorage;
    const result = await deleteMyAccount({ userId: 'user-1', typed: 'delete', deleteAccount: async () => {}, signOut: async () => {}, local: unlistable, session: storage.session });
    expect(storage.local.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(storage.session.getItem(BREAK_STORAGE_KEY)).toBeNull();
    expect(result.message).toBe(accountMessage('deleted-not-cleared'));
  });

  it('reports cleanup it cannot confirm when session storage is missing or refuses', async () => {
    for (const session of [undefined, Object.assign(new MemoryStorage(), { removeItem: () => { throw new Error('blocked'); } })]) {
      const { local } = seeded();
      const result = await deleteMyAccount({ userId: 'user-1', typed: 'delete', deleteAccount: async () => {}, signOut: async () => {}, local, session });
      expect([...local.values.keys()]).toEqual(['not-cueory']);
      expect(result.message).toBe(accountMessage('deleted-not-cleared'));
    }
  });

  it("lists what will go, or says it couldn't", async () => {
    expect(await deletionLines(reader(), { email: 'student@example.test', storage: undefined, today }))
      .toEqual({ ok: true, lines: ['your display name and email address', '1 exam date'] });
    expect(await deletionLines(reader({ fails: true }), { email: '', storage: undefined, today }))
      .toEqual({ ok: false, message: "we couldn't list what's saved, but deleting your account removes all of it." });
  });
});

describe('sign out', () => {
  it("goes home after signing out, or says it didn't work", async () => {
    expect(await signOutHere(async () => {})).toEqual({ ok: true, next: '/' });
    expect(await signOutHere(async () => { throw new Error('x'); })).toEqual({ ok: false, message: 'sign out did not work. please try again.' });
  });
});

describe('adaptersFor', () => {
  function fakeClient({ error = null as unknown, saved = null as unknown } = {}) {
    const calls: unknown[][] = [];
    const client = {
      auth: {
        async getSession() {
          const user_metadata = { full_name: 'Sample Student', avatar_url: 'https://example.invalid/sample.png' };
          return { data: { session: { user: { id: 'user-1', email: 'student@example.test', user_metadata } } }, error: null };
        },
        signOut(this: unknown, options: unknown) {
          if (this !== client.auth) throw new Error('auth receiver was lost');
          calls.push(['signOut', options]);
          return Promise.resolve({ error });
        },
      },
      from(table: string) {
        return {
          select: (columns: string) => ({ eq: (column: string, value: string) => ({
            maybeSingle: async () => { calls.push(['read', table, columns, column, value]); return { data: error ? null : { display_name: 'Sample' }, error }; },
          }) }),
        };
      },
      rpc(this: unknown, name: string, args?: unknown) {
        if (this !== client) throw new Error('client receiver was lost');
        calls.push(args === undefined ? ['rpc', name] : ['rpc', name, args]);
        return Promise.resolve({ data: error ? null : saved, error });
      },
    };
    return { client: client as unknown as AccountClient, calls };
  }

  it("reads the session and the student's own name", async () => {
    const { client, calls } = fakeClient();
    const adapters = adaptersFor(client);
    expect(await adapters.session()).toEqual({ signedIn: true, userId: 'user-1', email: 'student@example.test' });
    expect(await adapters.readName('user-1')).toBe('Sample');
    expect(calls).toEqual([['read', 'profiles', 'display_name', 'id', 'user-1']]);
  });

  it("reads the session's user_metadata for the download", async () => {
    const { client } = fakeClient();
    expect(await adaptersFor(client).signInDetails!())
      .toEqual({ full_name: 'Sample Student', avatar_url: 'https://example.invalid/sample.png' });
  });

  it('saves the name only through update_display_name, never a direct table update (Codex on #230)', async () => {
    const { client, calls } = fakeClient({ saved: 'Sample' });
    expect(await adaptersFor(client).writeName('Sample')).toBe('Sample');
    expect(calls).toEqual([['rpc', 'update_display_name', { new_name: 'Sample' }]]);
    await expect(adaptersFor(fakeClient({ saved: null }).client).writeName('Sample')).rejects.toThrow();
    const refusal = { code: '54000', message: 'that is a lot of name changes; please try again later' };
    await expect(adaptersFor(fakeClient({ error: refusal }).client).writeName('Sample')).rejects.toMatchObject({ cause: refusal });
  });

  it('refuses browser cleanup when the current session cannot be verified', async () => {
    const client = { auth: { getSession: async () => ({
      data: { session: null }, error: { message: 'session read failed' },
    }) } } as unknown as AccountClient;
    const adapters = adaptersFor(client);
    await expect(adapters.session()).rejects.toThrow('could not verify the current account');
    expect(await sameIdentity(adapters, 'a')).toBe(false);
    expect(await otherAccountNow(adapters, 'a')).toBe(true);
    const local = new MemoryStorage();
    local.setItem(AUTH_STORAGE_KEY, 'a-token');
    local.setItem(PROGRESS_STORAGE_KEY, 'a-progress');
    const signOut = vi.fn(async () => {});
    const outcome = await deleteMyAccount({
      userId: 'a', typed: 'delete', signOut, local, session: new MemoryStorage(),
      deleteAccount: async () => {}, otherAccountNow: () => otherAccountNow(adapters, 'a'),
    });
    expect(outcome).toEqual({ kind: 'deleted', next: '/', message: accountMessage('deleted-other-account') });
    expect(signOut).not.toHaveBeenCalled();
    expect(local.getItem(AUTH_STORAGE_KEY)).toBe('a-token');
    expect(local.getItem(PROGRESS_STORAGE_KEY)).toBe('a-progress');
  });

  it('deletes through delete_my_account(expected_user_id) and signs out this device only', async () => {
    const { client, calls } = fakeClient();
    const adapters = adaptersFor(client);
    await adapters.deleteAccount!('user-1');
    await adapters.signOut();
    expect(calls).toEqual([['rpc', 'delete_my_account', { expected_user_id: 'user-1' }], ['signOut', { scope: 'local' }]]);
  });

  it('binds the destructive RPC to the abort signal from the confirmed sign-in', async () => {
    const controller = new AbortController();
    const abortSignal = vi.fn(async () => ({ error: null }));
    const rpc = vi.fn(() => ({ abortSignal }));
    const client = { rpc } as unknown as AccountClient;
    await adaptersFor(client).deleteAccount!('user-1', controller.signal);
    expect(rpc).toHaveBeenCalledWith('delete_my_account', { expected_user_id: 'user-1' });
    expect(abortSignal).toHaveBeenCalledWith(controller.signal);
  });

  it('rejects when the server returns an error', async () => {
    const adapters = adaptersFor(fakeClient({ error: { message: 'private' } }).client);
    await expect(adapters.deleteAccount!('user-1')).rejects.toThrow('account deletion failed');
    await expect(adapters.signOut()).rejects.toThrow('sign out failed');
    expect(await adapters.readName('user-1')).toBeNull();
  });
});

describe('a different account signed in from another tab (Codex on #230)', () => {
  const session = (userId: string | null) => async () => userId
    ? { signedIn: true as const, userId, email: `${userId}@example.test` } : { signedIn: false as const };

  it('sameIdentity is true only for the same signed-in user', async () => {
    expect(await sameIdentity({ session: session('a') }, 'a')).toBe(true);
    expect(await sameIdentity({ session: session('b') }, 'a')).toBe(false);
    expect(await sameIdentity({ session: session(null) }, 'a')).toBe(false);
    expect(await sameIdentity({ session: async () => { throw new Error('x'); } }, 'a')).toBe(false);
  });

  it('delete aborts and never calls the RPC when the account changed during the confirmation', async () => {
    let current: string | null = 'a';
    const deleteAccount = vi.fn(async () => {});
    const signOut = vi.fn(async () => {});
    const options = {
      userId: 'a', typed: 'delete', deleteAccount, signOut, local: new MemoryStorage(), session: new MemoryStorage(),
      stillSame: () => sameIdentity({ session: session(current) }, 'a'),
    };
    current = 'b';
    const result = await deleteMyAccount(options);
    expect(result).toEqual({ kind: 'identity-changed', message: accountMessage('identity-changed') });
    current = null;
    expect((await deleteMyAccount(options)).kind).toBe('identity-changed');
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    current = 'a';
    expect((await deleteMyAccount(options)).kind).toBe('deleted');
    expect(deleteAccount).toHaveBeenCalledTimes(1);
  });

  it('a session switched after stillSame() and before the RPC deletes nothing: the database refuses the shown id (Task 206)', async () => {
    // A fake database that, like delete_my_account(expected_user_id), compares the passed id to the CURRENT session.
    let current = 'a';
    const accounts = new Set(['a', 'b']);
    const rpc = vi.fn(async (_name: string, args: { expected_user_id: string }) => {
      if (args.expected_user_id !== current) {
        return { error: { message: DELETE_IDENTITY, code: '28000' } };
      }
      accounts.delete(current);
      return { error: null };
    });
    const client = { rpc, auth: { signOut: async () => ({ error: null }) } } as unknown as AccountClient;
    const signOut = vi.fn(async () => {});
    const result = await deleteMyAccount({
      userId: 'a', typed: 'delete', deleteAccount: adaptersFor(client).deleteAccount, signOut,
      local: new MemoryStorage(), session: new MemoryStorage(),
      // The check passes, then another tab signs in as b before the RPC goes out.
      stillSame: async () => { const same = current === 'a'; current = 'b'; return same; },
    });
    expect(rpc).toHaveBeenCalledWith('delete_my_account', { expected_user_id: 'a' });
    expect(result).toEqual({ kind: 'identity-changed', message: accountMessage('identity-changed') });
    expect([...accounts].sort()).toEqual(['a', 'b']);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('B signing in while the deletion of A is in flight: A is deleted, B keeps its session and data (Task 206)', async () => {
    let current: string | null = 'a';
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const deleted: string[] = [];
    const signOut = vi.fn(async () => {});
    const local = new MemoryStorage();
    local.setItem(AUTH_STORAGE_KEY, 'b-session');
    local.setItem(PROGRESS_STORAGE_KEY, 'b-progress');
    const running = deleteMyAccount({
      userId: 'a', typed: 'delete', signOut, local, session: new MemoryStorage(),
      deleteAccount: async id => { await held; deleted.push(id); },
      otherAccountNow: () => otherAccountNow({ session: session(current) }, 'a'),
    });
    current = 'b';
    release();
    const result = await running;
    expect(deleted).toEqual(['a']);
    expect(result).toEqual({ kind: 'deleted', next: '/', message: accountMessage('deleted-other-account') });
    expect(signOut).not.toHaveBeenCalled();
    expect(local.getItem(AUTH_STORAGE_KEY)).toBe('b-session');
    expect(local.getItem(PROGRESS_STORAGE_KEY)).toBe('b-progress');
  });

  it('A -> B -> A during delayed RPC dispatch aborts the call and never deletes A or B', async () => {
    let current: string | null = 'a';
    const controller = new AbortController();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const accounts = new Set(['a', 'b']);
    const dispatched: string[] = [];
    const signOut = vi.fn(async () => {});
    const local = new MemoryStorage();
    local.setItem(AUTH_STORAGE_KEY, 'a-session');
    const running = deleteMyAccount({
      userId: 'a', typed: 'delete', signal: controller.signal, signOut, local, session: new MemoryStorage(),
      deleteAccount: async (id, signal) => {
        entered();
        await held;
        if (signal?.aborted) throw new Error('aborted before dispatch');
        dispatched.push(id);
        accounts.delete(current!);
      },
      stillSame: () => sameIdentity({ session: session(current) }, 'a'),
    });
    // Wait for the RPC adapter to enter its deliberate pre-dispatch hold.
    await started;
    current = 'b';
    controller.abort(); // Supabase auth event from B's sign-in
    current = 'a'; // same user id again, but the first transition permanently invalidated the request
    release();
    expect((await running).message).toBe(accountMessage('delete-unconfirmed'));
    expect(dispatched).toEqual([]);
    expect([...accounts].sort()).toEqual(['a', 'b']);
    expect(signOut).not.toHaveBeenCalled();
    expect(local.getItem(AUTH_STORAGE_KEY)).toBe('a-session');
  });

  it('an A -> B -> A switch after server completion also leaves the replacement browser data alone', async () => {
    const controller = new AbortController();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const local = new MemoryStorage();
    local.setItem(AUTH_STORAGE_KEY, 'a-session');
    const signOut = vi.fn(async () => {});
    const running = deleteMyAccount({
      userId: 'a', typed: 'delete', signal: controller.signal, signOut, local, session: new MemoryStorage(),
      deleteAccount: async () => { await held; },
    });
    local.setItem(AUTH_STORAGE_KEY, 'b-session');
    controller.abort();
    local.setItem(AUTH_STORAGE_KEY, 'a-new-session');
    release();
    expect((await running).message).toBe(accountMessage('deleted-other-account'));
    expect(local.getItem(AUTH_STORAGE_KEY)).toBe('a-new-session');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('a session that cannot be read after the deletion leaves the device untouched; a signOut failure for A still clears A', async () => {
    const signOut = vi.fn(async () => {});
    const local = new MemoryStorage();
    local.setItem(AUTH_STORAGE_KEY, 'x');
    const unreadable = await deleteMyAccount({
      userId: 'a', typed: 'delete', signOut, local, session: new MemoryStorage(), deleteAccount: async () => {},
      otherAccountNow: () => otherAccountNow({ session: async () => { throw new Error('x'); } }, 'a'),
    });
    expect(unreadable.message).toBe(accountMessage('deleted-other-account'));
    expect(signOut).not.toHaveBeenCalled();
    expect(local.getItem(AUTH_STORAGE_KEY)).toBe('x');
    const failing = await deleteMyAccount({
      userId: 'a', typed: 'delete', local, session: new MemoryStorage(), deleteAccount: async () => {},
      signOut: async () => { throw new Error('fail'); },
      otherAccountNow: () => otherAccountNow({ session: session('a') }, 'a'),
    });
    expect(failing.kind).toBe('deleted');
    expect(local.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('A -> B after the last async session check never signs out B or clears B data', async () => {
    let current: string | null = 'a';
    const local = new MemoryStorage();
    local.setItem(AUTH_STORAGE_KEY, 'a-session');
    local.setItem(PROGRESS_STORAGE_KEY, 'a-progress');
    const signOut = vi.fn(async () => {});
    const tab = new MemoryStorage();
    tab.setItem(BREAK_STORAGE_KEY, 'b-break');
    const result = await deleteMyAccount({
      userId: 'a', typed: 'delete', deleteAccount: async () => {}, signOut, local, session: tab,
      otherAccountNow: async () => {
        // The read saw A; B's new token and progress arrive before the synchronous cleanup.
        current = 'b';
        local.setItem(AUTH_STORAGE_KEY, 'b-session');
        local.setItem(PROGRESS_STORAGE_KEY, 'b-progress');
        return current === 'a';
      },
    });
    expect(result.message).toBe(accountMessage('deleted-other-account'));
    expect(signOut).not.toHaveBeenCalled();
    expect(local.getItem(AUTH_STORAGE_KEY)).toBe('b-session');
    expect(local.getItem(PROGRESS_STORAGE_KEY)).toBe('b-progress');
    expect(tab.getItem(BREAK_STORAGE_KEY)).toBe('b-break');
  });

  it('does not clear browser values replaced during a pending deletion even if the auth key is unchanged', async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const local = new MemoryStorage();
    local.setItem(AUTH_STORAGE_KEY, 'a-session');
    local.setItem(PROGRESS_STORAGE_KEY, 'a-progress');
    const running = deleteMyAccount({
      userId: 'a', typed: 'delete', deleteAccount: async () => { await held; },
      signOut: async () => {}, local, session: new MemoryStorage(),
    });
    local.setItem(PROGRESS_STORAGE_KEY, 'new-progress');
    release();
    expect((await running).message).toBe(accountMessage('deleted-not-cleared'));
    expect(local.getItem(PROGRESS_STORAGE_KEY)).toBe('new-progress');
  });


  it('a missing or mismatched delete_my_account signature shows a refresh message and clears nothing', async () => {
    for (const code of ['PGRST202', '42883']) {
      const local = new MemoryStorage();
      local.setItem(AUTH_STORAGE_KEY, 'a-session');
      const signOut = vi.fn(async () => {});
      const client = { rpc: async () => ({ error: { code, message: 'Could not find the function public.delete_my_account' } }),
        auth: { signOut } } as unknown as AccountClient;
      const result = await deleteMyAccount({
        userId: 'a', typed: 'delete', signOut, local, session: new MemoryStorage(), deleteAccount: adaptersFor(client).deleteAccount,
      });
      expect(result).toEqual({ kind: 'failed', message: 'account deletion is temporarily unavailable. refresh the page and try again.' });
      expect(signOut).not.toHaveBeenCalled();
      expect(local.getItem(AUTH_STORAGE_KEY)).toBe('a-session');
    }
  });

  it('export aborts with no files when the account differs before or after reading', async () => {
    const options = { email: 'a@example.test', signInDetails: undefined, storage: new MemoryStorage(), today };
    const swapped = { session: session('b'), reader: reader() };
    expect(await prepareDownloadFor(swapped, 'a', options)).toMatchObject({ ok: false, changed: true });
    let reads = 0;
    const midway = { session: async () => (++reads > 1 ? { signedIn: true as const, userId: 'b', email: 'b@example.test' } : { signedIn: true as const, userId: 'a', email: 'a@example.test' }), reader: reader() };
    expect(await prepareDownloadFor(midway, 'a', options)).toMatchObject({ ok: false, changed: true });
    expect((await prepareDownloadFor({ session: session('a'), reader: reader() }, 'a', options)).ok).toBe(true);
  });

  it('onIdentityChange reports the new user id (or null) and unsubscribes', () => {
    let listener: ((event: string, next: { user?: { id?: unknown } | null } | null) => void) | undefined;
    const unsubscribe = vi.fn();
    const client = {
      auth: { onAuthStateChange(this: unknown, callback: typeof listener) { listener = callback; return { data: { subscription: { unsubscribe } } }; } },
    } as unknown as AccountClient;
    const seen: Array<string | null> = [];
    const stop = adaptersFor(client).onIdentityChange!(id => seen.push(id));
    listener!('SIGNED_IN', { user: { id: 'b' } });
    listener!('SIGNED_OUT', null);
    expect(seen).toEqual(['b', null]);
    stop();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('download my data stops on an account change or a closed section (#757)', () => {
  const options = () => ({ email: 'a@example.test', signInDetails: undefined, storage: new MemoryStorage(), today });
  const asA = async () => ({ signedIn: true as const, userId: 'a', email: 'a@example.test' });
  /** A sign-in event source like onIdentityChange, so a test can play A→B, A→B→A or sign-out. */
  function events() {
    const listeners = new Set<(userId: string | null) => void>();
    return {
      emit: (userId: string | null) => listeners.forEach(listener => listener(userId)),
      count: () => listeners.size,
      adapters: { onIdentityChange(callback: (userId: string | null) => void) { listeners.add(callback); return () => listeners.delete(callback); } },
    };
  }
  function fakeDom() {
    const later: (() => void)[] = [];
    const offered: string[] = [];
    const dom: DownloadDom = {
      urls: { createObjectURL: vi.fn(() => 'blob:sample'), revokeObjectURL: vi.fn() },
      document: {
        createElement: vi.fn(() => {
          const link = { href: '', download: '', click: () => offered.push(link.download), remove: vi.fn() };
          return link;
        }),
        body: { append: vi.fn() },
      } as unknown as DownloadDom['document'],
      later: (run) => later.push(run),
    };
    return { dom, offered, runLater: () => later.splice(0).forEach(run => run()) };
  }
  const file = (fileName: string) => ({ fileName, blob: new Blob(['x']) });

  it('A→B ends the watch for good and aborts its signal; the same account again changes nothing', () => {
    const source = events();
    const changed = vi.fn();
    const watch = watchExport(source.adapters, 'a', changed);
    source.emit('a');
    expect(watch.state()).toBe('open');
    expect(watch.signal.aborted).toBe(false);
    source.emit('b');
    expect(watch.state()).toBe('changed');
    expect(watch.signal.aborted).toBe(true);
    source.emit('a');
    expect(watch.state()).toBe('changed');
    expect(changed).toHaveBeenCalledOnce();
  });

  it('signing out counts as a change', () => {
    const source = events();
    const watch = watchExport(source.adapters, 'a');
    source.emit(null);
    expect(watch.state()).toBe('changed');
  });

  it('closing the section aborts, unsubscribes, and stays closed', () => {
    const source = events();
    const watch = watchExport(source.adapters, 'a');
    expect(source.count()).toBe(1);
    watch.close();
    expect(watch.state()).toBe('closed');
    expect(watch.signal.aborted).toBe(true);
    expect(source.count()).toBe(0);
    source.emit('b');
    expect(watch.state()).toBe('closed');
  });

  it('works without an identity source (tests, older adapters)', () => {
    const watch = watchExport({}, 'a');
    expect(watch.state()).toBe('open');
    watch.close();
    expect(watch.state()).toBe('closed');
  });

  it('A→B→A while the data is read: both session checks say A, yet no file is built', async () => {
    const source = events();
    const watch = watchExport(source.adapters, 'a');
    const base = reader();
    const slow: ExportReader = {
      ...base,
      select(table, columns) {
        // Another tab signs in as B and back as A while this read is on its way.
        source.emit('b');
        source.emit('a');
        return base.select(table, columns);
      },
    };
    const result = await prepareDownloadFor({ session: asA, reader: slow }, 'a', options(), watch.signal);
    expect(result).toEqual({ ok: false, message: accountMessage('identity-changed'), changed: true });
  });

  it('an already aborted signal reads nothing', async () => {
    const controller = new AbortController();
    controller.abort();
    const read = vi.fn();
    const result = await prepareDownloadFor({ session: asA, reader: { ...reader(), select: read } }, 'a', options(), controller.signal);
    expect(result).toMatchObject({ ok: false, changed: true });
    expect(read).not.toHaveBeenCalled();
  });

  it('an open watch still gives the files', async () => {
    const watch = watchExport(events().adapters, 'a');
    expect((await prepareDownloadFor({ session: asA, reader: reader() }, 'a', options(), watch.signal)).ok).toBe(true);
  });

  it('offers a file only while the watch is open', () => {
    const source = events();
    const { dom, offered } = fakeDom();
    const watch = watchExport(source.adapters, 'a');
    expect(offerIfOpen(file('one.json'), watch, dom)).toBe(true);
    source.emit('b');
    expect(offerIfOpen(file('two.json'), watch, dom)).toBe(false);
    const closed = watchExport(events().adapters, 'a');
    closed.close();
    expect(offerIfOpen(file('three.json'), closed, dom)).toBe(false);
    expect(offered).toEqual(['one.json']);
  });

  it('spreadsheet files still waiting their turn are never offered after A→B→A or after the section closes', () => {
    const source = events();
    const first = fakeDom();
    const watch = watchExport(source.adapters, 'a');
    offerSpreadsheets([file('a.csv'), file('b.csv'), file('c.csv')], watch, first.dom);
    expect(first.offered).toEqual(['a.csv']);
    source.emit('b');
    source.emit('a');
    first.runLater();
    expect(first.offered).toEqual(['a.csv']);

    const second = fakeDom();
    const open = watchExport(events().adapters, 'a');
    offerSpreadsheets([file('a.csv'), file('b.csv')], open, second.dom);
    open.close();
    second.runLater();
    expect(second.offered).toEqual(['a.csv']);
  });

  it('spreadsheet files are offered one at a time while the watch stays open', () => {
    const { dom, offered, runLater } = fakeDom();
    const watch = watchExport(events().adapters, 'a');
    offerSpreadsheets([file('a.csv'), file('b.csv'), file('c.csv')], watch, dom);
    runLater();
    expect(offered).toEqual(['a.csv', 'b.csv', 'c.csv']);
  });
});
