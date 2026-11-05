import { describe, expect, it, vi } from 'vitest';
import { createStudyScope, guardedRead, subscribeIdentity, viewsForSystem } from '../../src/islands/anatomyguard';
import type { SavedViewRow } from '../../src/islands/anatomystudy';

// Task 178: late answers from the account never repopulate the lab. Synthetic names only.
const view = (id: string, systemKey: string): SavedViewRow => ({
  id, system_key: systemKey, name: `view ${id}`, camera: { position: [0, 0, 3], target: [0, 0, 0] },
  hidden: [], faded: [], selected: null, created_at: '2026-11-05T08:00:00Z', updated_at: '2026-11-05T08:00:00Z',
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

/** The lab's rule in miniature: one list of views, read per system, filtered by system when shown. */
function lab() {
  const scope = createStudyScope();
  let shown: SavedViewRow[] = [];
  return {
    scope,
    open(user: string | null, system: string) { if (scope.set(user, system)) shown = []; },
    read(read: () => Promise<SavedViewRow[]>) { return guardedRead(scope, read, (rows) => { shown = rows; }); },
    visible: (system: string) => viewsForSystem(shown, system),
    raw: () => shown,
  };
}

describe('saved views read for the wrong system', () => {
  it('discards an older system\'s answer that arrives after the newer one', async () => {
    const l = lab();
    const heart = deferred<SavedViewRow[]>();
    const lungs = deferred<SavedViewRow[]>();
    l.open('u1', 'heart');
    const first = l.read(() => heart.promise);
    l.open('u1', 'lungs');
    const second = l.read(() => lungs.promise);
    lungs.resolve([view('b', 'lungs')]);
    await second;
    heart.resolve([view('a', 'heart')]);
    await first;
    expect(l.raw().map((v) => v.id)).toEqual(['b']);
    expect(l.visible('lungs').map((v) => v.id)).toEqual(['b']);
    expect(l.visible('heart')).toEqual([]);
  });

  it('never lists or offers a row of another system, whatever state holds', () => {
    const rows = [view('a', 'heart'), view('b', 'lungs')];
    expect(viewsForSystem(rows, 'lungs').map((v) => v.id)).toEqual(['b']);
    expect(viewsForSystem(rows, 'skin')).toEqual([]);
  });
});

describe('answers after the account changed', () => {
  it('discards a read that finishes after a sign-out, and after another account signs in', async () => {
    const l = lab();
    const late = deferred<SavedViewRow[]>();
    l.open('u1', 'heart');
    const first = l.read(() => late.promise);
    l.open(null, 'heart');
    late.resolve([view('old', 'heart')]);
    await first;
    expect(l.raw()).toEqual([]);

    const other = deferred<SavedViewRow[]>();
    l.open('u2', 'heart');
    const second = l.read(() => other.promise);
    l.open('u3', 'heart');
    other.resolve([view('u2-row', 'heart')]);
    await second;
    expect(l.raw()).toEqual([]);
  });

  it('keeps an answer when nothing changed, and ignores a repeat of the same identity', async () => {
    const l = lab();
    l.open('u1', 'heart');
    const pending = l.read(async () => [view('a', 'heart')]);
    expect(l.scope.set('u1', 'heart')).toBe(false);
    await pending;
    expect(l.raw().map((v) => v.id)).toEqual(['a']);
  });
});

describe('subscribeIdentity', () => {
  function client() {
    const unsubscribe = vi.fn();
    let emit: (event: string, session: { user?: { id?: unknown } | null } | null) => void = () => {};
    return {
      unsubscribe,
      emit: (event: string, session: { user?: { id?: unknown } | null } | null) => emit(event, session),
      client: { auth: { onAuthStateChange: (cb: typeof emit) => { emit = cb; return { data: { subscription: { unsubscribe } } }; } } },
    };
  }

  it('reports each auth event\'s user id (null for a sign-out) until unsubscribed', async () => {
    const c = client();
    const seen: (string | null)[] = [];
    const stop = subscribeIdentity(async () => c.client, (id) => seen.push(id));
    await Promise.resolve();
    c.emit('SIGNED_IN', { user: { id: 'u2' } });
    c.emit('SIGNED_OUT', null);
    c.emit('SIGNED_IN', { user: { id: '' } });
    expect(seen).toEqual(['u2', null, null]);
    stop();
    expect(c.unsubscribe).toHaveBeenCalledTimes(1);
    c.emit('SIGNED_IN', { user: { id: 'u3' } });
    expect(seen).toHaveLength(3);
  });

  it('unsubscribes at once when the lab closes before the client arrives', async () => {
    const c = client();
    const gate = deferred<typeof c.client>();
    const seen: (string | null)[] = [];
    const stop = subscribeIdentity(() => gate.promise, (id) => seen.push(id));
    stop();
    gate.resolve(c.client);
    await gate.promise;
    await Promise.resolve();
    expect(c.unsubscribe).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });

  it('copes with no client', async () => {
    const stop = subscribeIdentity(async () => null, () => { throw new Error('unexpected'); });
    await Promise.resolve();
    expect(() => stop()).not.toThrow();
  });
});
