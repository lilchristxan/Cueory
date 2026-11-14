import { describe, expect, it, vi } from 'vitest';
import type { FlagReport } from '../../src/islands/flag';
import { flagItemContext, flagSignedIn, makeFlagSend, sendReportWithReceipt, watchFlagSession, type FlagClient } from '../../src/islands/flagconnect';
import type { FlagArgs } from '../../src/islands/flagsubmit';

const reportId = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const good: FlagReport = { page: '/learn/study-skills/questions', reason: 'confusing', comment: 'the second choice reads oddly' };

/** A fake shared client. It never touches the network. */
function fakeClient(options: {
  session?: { user: { id: string; email?: string | null }; access_token?: string } | null;
  sessionError?: unknown;
  reply?: { data: unknown; error: unknown };
} = {}) {
  const calls: { name: string; args: FlagArgs; receiver: unknown }[] = [];
  const requestHeaders: Array<{ name: string; value: string }> = [];
  const requestSignals: AbortSignal[] = [];
  const client: FlagClient = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: options.session === undefined ? { user: { id: 'user-1', email: 'student@example.test' }, access_token: 'synthetic-user-1-token' } : options.session },
        error: options.sessionError ?? null,
      })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    rpc(name, args) {
      calls.push({ name, args, receiver: this });
      // Supabase PostgREST v2.118 builder executes lazily and supports these
      // per-query modifiers. Keep fake modifiers scoped to this operation.
      return Object.assign(Promise.resolve(options.reply ?? { data: reportId, error: null }), {
        setHeader(name: string, value: string) {
          requestHeaders.push({ name, value });
          return this;
        },
        abortSignal(signal: AbortSignal) {
          requestSignals.push(signal);
          return this;
        },
      });
    },
  };
  return { client, calls, requestHeaders, requestSignals, load: vi.fn(async () => client) };
}

describe('flagSignedIn', () => {
  it('is true with a session on this browser', async () => {
    expect(await flagSignedIn(fakeClient().load)).toBe(true);
  });

  it('is false with no session, a session error, accounts off or a failed load', async () => {
    expect(await flagSignedIn(fakeClient({ session: null }).load)).toBe(false);
    expect(await flagSignedIn(fakeClient({ sessionError: { message: 'private detail' } }).load)).toBe(false);
    expect(await flagSignedIn(async () => null)).toBe(false);
    expect(await flagSignedIn(async () => { throw new Error('package download failed'); })).toBe(false);
  });
});

/** A client whose session can change between reads, and which announces sign-ins and sign-outs like supabase-js. */
function switchableClient() {
  let session: { user: { id: string }; access_token: string } | null = null;
  const listeners = new Set<(event: string, session: { user: { id: string } } | null) => void>();
  const unsubscribed = vi.fn();
  const client: FlagClient = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      onAuthStateChange: vi.fn((callback) => {
        listeners.add(callback);
        return { data: { subscription: { unsubscribe: () => { listeners.delete(callback); unsubscribed(); } } } };
      }),
    },
    rpc: () => Promise.resolve({ data: reportId, error: null }),
  };
  return {
    client,
    unsubscribed,
    listeners,
    /** Changes the stored session without announcing it (another tab wrote it). */
    store: (id: string | null) => { session = id ? { user: { id }, access_token: `synthetic-${id}-token` } : null; },
    /** Announces a change, as supabase-js does for this tab and, by broadcast, for other tabs. */
    announce: (id: string | null) => { session = id ? { user: { id }, access_token: `synthetic-${id}-token` } : null; for (const l of listeners) l(id ? 'SIGNED_IN' : 'SIGNED_OUT', session); },
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('watchFlagSession (Codex on #237)', () => {
  it('reads the session again on every check, so a sign-in in another tab is picked up when the form reopens', async () => {
    const fake = switchableClient();
    const seen: boolean[] = [];
    const watch = watchFlagSession(async () => fake.client, (signedIn) => seen.push(signedIn));
    watch.check();
    await settle();
    expect(seen).toEqual([false]);
    fake.store('user-1');
    watch.check();
    await settle();
    expect(seen).toEqual([false, true]);
    expect(fake.client.auth.getSession).toHaveBeenCalledTimes(2);
    watch.stop();
  });

  it('follows announced sign-ins and sign-outs once the client has loaded, and stops listening when stopped', async () => {
    const fake = switchableClient();
    const seen: boolean[] = [];
    const watch = watchFlagSession(async () => fake.client, (signedIn) => seen.push(signedIn));
    watch.check();
    await settle();
    expect(fake.listeners.size).toBe(1);
    fake.announce('user-1');
    fake.announce(null);
    expect(seen).toEqual([false, true, false]);
    watch.check();
    await settle();
    expect(fake.listeners.size).toBe(1); // one subscription, however many checks
    watch.stop();
    expect(fake.unsubscribed).toHaveBeenCalledTimes(1);
    fake.announce('user-1');
    watch.check();
    await settle();
    expect(seen).toEqual([false, true, false, false]);
  });

  it('reuses a check that is still running, and lets a newer announcement win over it', async () => {
    const fake = switchableClient();
    let gate: Promise<void> = Promise.resolve();
    let loads = 0;
    const seen: boolean[] = [];
    const watch = watchFlagSession(async () => { loads += 1; await gate; return fake.client; }, (signedIn) => seen.push(signedIn));
    watch.check();
    await settle();
    expect(seen).toEqual([false]);

    let release: () => void = () => {};
    gate = new Promise<void>((resolve) => { release = resolve; });
    fake.store('user-1');
    watch.check(); // the form opens while signed in elsewhere: this check reads true once its load finishes
    watch.check(); // a second open while it runs reuses it
    fake.announce(null); // ...but a sign-out is announced before it finishes
    fake.store('user-1'); // what the slow check will read: older than the announcement
    release();
    await settle();
    expect(loads).toBe(2);
    expect(seen).toEqual([false, false]); // the stale "signed in" from the slow check is dropped
    watch.stop();
  });

  it('reads as signed out, without listening, when accounts are off or the client cannot load', async () => {
    for (const load of [async () => null, async () => { throw new Error('offline'); }]) {
      const seen: boolean[] = [];
      const watch = watchFlagSession(load, (signedIn) => seen.push(signedIn));
      watch.check();
      await settle();
      expect(seen).toEqual([false]);
      watch.stop();
    }
  });

  it('still rechecks on open when the client has no auth events', async () => {
    const { client } = fakeClient({ session: null });
    const seen: boolean[] = [];
    const watch = watchFlagSession(async () => client, (signedIn) => seen.push(signedIn));
    watch.check();
    await settle();
    expect(seen).toEqual([false]);
    watch.stop();
  });
});

describe('makeFlagSend', () => {
  it('sends the exact submit_flag arguments on the shared client and reports sent', async () => {
    const { client, calls, load } = fakeClient();
    const send = makeFlagSend(load);
    expect(await send({ ...good, itemId, itemVersionId: versionId })).toBe('sent');
    expect(calls).toEqual([{
      name: 'submit_flag',
      args: { page: good.page, item_id: itemId, item_version_id: versionId, reason: 'confusing', comment: good.comment },
      receiver: client,
    }]);
  });

  it('sends a page-only report with null item context', async () => {
    const { calls, load } = fakeClient();
    expect(await makeFlagSend(load)(good)).toBe('sent');
    expect(calls[0]!.args).toEqual({ page: good.page, item_id: null, item_version_id: null, reason: 'confusing', comment: good.comment });
  });

  it('asks a signed-out student to sign in when accounts are off, without calling anything', async () => {
    expect(await makeFlagSend(async () => null)(good)).toEqual({ message: 'please sign in to send a report.' });
  });

  it('fails quietly when the client cannot load', async () => {
    expect(await makeFlagSend(async () => { throw new Error('a private connection error'); })(good)).toBe('failed');
  });

  it('turns the rate limit into too-many', async () => {
    const { load } = fakeClient({ reply: { data: null, error: { code: '54000', message: 'that is a lot of reports; please try again later' } } });
    expect(await makeFlagSend(load)(good)).toBe('too-many');
  });

  it.each([
    ['sign in to send a report', 'please sign in to send a report.'],
    ['confirm your email to use this', 'please confirm your email to send a report — look for the link in your inbox.'],
    ['the page must be an address on this site', 'something went wrong — please try again from the page you were on.'],
    ['pick what is wrong from the list', 'choose what is wrong from the list.'],
    ['the comment is up to 1,000 characters of plain text', 'keep the comment to 1,000 characters or fewer.'],
    ['that question was not found', 'that question could not be found — it may have been removed.'],
  ])('maps "%s" to its plain sentence', async (raw, sentence) => {
    const { load } = fakeClient({ reply: { data: null, error: { message: raw } } });
    expect(await makeFlagSend(load)(good)).toEqual({ message: sentence });
  });

  it.each([
    { data: null, error: { code: 'XX000', message: 'internal database details' } },
    { data: null, error: null },
    { data: 'not-a-report-id', error: null },
  ])('never claims an unsuccessful report was sent, or echoes raw text', async reply => {
    const { load } = fakeClient({ reply });
    expect(await makeFlagSend(load)(good)).toBe('failed');
  });

  it('does not call submit_flag for a sample slug', async () => {
    const { calls, load } = fakeClient();
    expect(await makeFlagSend(load)({ ...good, itemId: 'sample_1', itemVersionId: versionId })).toBe('failed');
    expect(calls).toEqual([]);
  });
});

describe('contextual flag send receipts', () => {
  const contextA = 'anatomy structure FIX001 in test shapes (fixture)';
  const reportA: FlagReport = { page: '/preview/anatomy-lab', reason: 'typo', comment: `about: ${contextA}\nthe label looks wrong` };

  it('reports an immutable original structure after a deferred RPC, even when selection switches', async () => {
    const calls: FlagArgs[] = [];
    let finishRpc: (reply: { data: unknown; error: unknown }) => void = () => {};
    const deferred = new Promise<{ data: unknown; error: unknown }>((resolve) => { finishRpc = resolve; });
    const { client } = fakeClient();
    client.rpc = (name, args) => { calls.push(args); return deferred; };
    const events: string[] = [];
    const selected = { current: contextA };
    const sending = sendReportWithReceipt(makeFlagSend(async () => client), reportA, selected.current, (context) => {
      events.push(`sending: ${context}`);
      return (result) => events.push(`finished: ${context}: ${result}`);
    });
    await settle();
    expect(calls).toEqual([{
      page: '/preview/anatomy-lab', item_id: null, item_version_id: null,
      reason: 'typo', comment: reportA.comment,
    }]);
    selected.current = 'anatomy structure FIX002 in test shapes (fixture)';
    expect(events).toEqual([`sending: ${contextA}`]);
    finishRpc({ data: reportId, error: null });
    expect(await sending).toBe('sent');
    expect(events).toEqual([`sending: ${contextA}`, `finished: ${contextA}: sent`]);
    expect(selected.current).toContain('FIX002');
  });

  it('also completes its independent receipt for an RPC failure', async () => {
    const notifications: string[] = [];
    const result = await sendReportWithReceipt(
      async () => { throw new Error('private network detail'); },
      reportA,
      contextA,
      (context) => (outcome) => notifications.push(`${context}: ${outcome}`),
    );
    expect(result).toBe('failed');
    expect(notifications).toEqual([`${contextA}: failed`]);
  });

  it('preserves ordinary unscoped footer sending without extra receipts', async () => {
    const spy = vi.fn();
    expect(await sendReportWithReceipt(async () => 'sent', good, undefined, spy)).toBe('sent');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('flagItemContext', () => {
  it('passes nothing for sample pages and both ids for a real item', () => {
    expect(flagItemContext(undefined)).toEqual({});
    expect(flagItemContext({ itemId, itemVersionId: versionId })).toEqual({ itemId, itemVersionId: versionId });
  });

  it.each([
    { itemId: 'study-skills-01-q1', itemVersionId: versionId },
    { itemId, itemVersionId: '' },
    { itemId: '', itemVersionId: versionId },
  ])('fails the build for a slug or half a pair', flagItem => {
    expect(() => flagItemContext(flagItem)).toThrow('database uuids');
  });
});

describe('flag reports are bound to the account that pressed Send (Task 178)', () => {
  const accountChanged = {
    message: 'your account changed before this report was sent. please open the form again.',
  };

  it('tracks account A -> B even though both sessions are signed in', async () => {
    const fake = switchableClient();
    const identities: Array<{ signedIn: boolean; userId: string | null }> = [];
    const watch = watchFlagSession(async () => fake.client, (signedIn, userId) => {
      identities.push({ signedIn, userId });
    });
    watch.check();
    await settle();
    fake.announce('account-A');
    fake.announce('account-B');
    fake.announce(null);
    expect(identities).toEqual([
      { signedIn: false, userId: null },
      { signedIn: true, userId: 'account-A' },
      { signedIn: true, userId: 'account-B' },
      { signedIn: false, userId: null },
    ]);
    watch.stop();
  });

  it('will not send account A\'s drafted report as B when client loading is delayed', async () => {
    const { client, calls } = fakeClient();
    let active = 'account-A';
    client.auth.getSession = vi.fn(async () => ({
      data: { session: { user: { id: active, email: 'synthetic@example.test' }, access_token: `synthetic-${active}-token` } },
      error: null,
    }));
    let release: (client: FlagClient) => void = () => {};
    const deferred = new Promise<FlagClient>((resolve) => { release = resolve; });
    const pending = makeFlagSend(async () => deferred, active)(good);
    // Simulate an auth broadcast from another tab *after* Send was pressed
    // but before the same shared Supabase client becomes available.
    active = 'account-B';
    release(client);
    expect(await pending).toEqual(accountChanged);
    expect(calls, 'B must never submit A\'s text').toEqual([]);
    expect(client.auth.getSession).toHaveBeenCalledTimes(1);
  });

  it('sends with the original user, without affecting ordinary flag RPC arguments', async () => {
    const { client, calls, load } = fakeClient();
    expect(await makeFlagSend(load, 'user-1')({ ...good, itemId, itemVersionId: versionId }))
      .toBe('sent');
    expect(client.auth.getSession).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual({
      page: good.page,
      item_id: itemId,
      item_version_id: versionId,
      reason: 'confusing',
      comment: good.comment,
    });
  });

  it('rejects an A to B to A auth switch while the first identity read is pending', async () => {
    const fake = switchableClient();
    fake.store('account-A');
    let release: () => void = () => {};
    const held = new Promise<void>(resolve => { release = resolve; });
    const initial = fake.client.auth.getSession;
    fake.client.auth.getSession = vi.fn(async () => {
      await held;
      return initial();
    });
    const rpc = vi.fn(() => Promise.resolve({ data: reportId, error: null }));
    fake.client.rpc = rpc;
    const pending = makeFlagSend(async () => fake.client, 'account-A')(good);
    await settle(); // subscription is active before this auth broadcast
    fake.announce('account-B');
    fake.announce('account-A');
    release();
    expect(await pending).toEqual(accountChanged);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks a rapid A to B to A switch during the final pre-RPC session read', async () => {
    const fake = switchableClient();
    fake.store('account-A');
    const originalRead = fake.client.auth.getSession;
    let reads = 0;
    let signalSecond: () => void = () => {};
    let releaseSecond: () => void = () => {};
    const secondReadStarted = new Promise<void>((resolve) => { signalSecond = resolve; });
    const heldSecondRead = new Promise<void>((resolve) => { releaseSecond = resolve; });
    fake.client.auth.getSession = vi.fn(async () => {
      reads += 1;
      if (reads === 2) {
        signalSecond();
        await heldSecondRead;
      }
      return originalRead();
    });
    const rpc = vi.fn(() => Promise.resolve({ data: reportId, error: null }));
    fake.client.rpc = rpc;

    const sending = makeFlagSend(async () => fake.client, 'account-A')(good);
    await secondReadStarted;
    // Initial identity check succeeded for A, but the RPC callback must
    // invalidate a subsequent transient account switch even when A returns.
    fake.announce('account-B');
    fake.announce('account-A');
    releaseSecond();

    expect(await sending).toEqual(accountChanged);
    expect(rpc, 'no account may receive a stale draft').not.toHaveBeenCalled();
    expect(reads).toBe(2);
  });

  it('fails closed if the account is missing or cannot be checked before dispatch', async () => {
    for (const options of [{ session: null }, { sessionError: { message: 'offline' } }]) {
      const { calls, load } = fakeClient(options);
      expect(await makeFlagSend(load, 'account-A')(good)).toEqual(accountChanged);
      expect(calls).toEqual([]);
    }
    const { calls, load } = fakeClient();
    expect(await makeFlagSend(load, null)(good)).toEqual(accountChanged);
    expect(calls).toEqual([]);
  });
});
