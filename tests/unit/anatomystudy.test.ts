import { describe, expect, it, vi } from 'vitest';
import {
  anatomyStudyMessage,
  createAnatomyStudy,
  createReviewQueueRequestGuard,
  REVIEW_PAGE_SIZE,
  createSavedViewsRequestGuard,
  createStudyIdentityGuard,
  isViewCamera,
  missBatches,
  queueFromQuizMisses,
  STRUCTURE_ID,
  viewSnapshot,
  type AnatomyStudyClient,
  type ReviewQueueRow,
  type SavedViewRow,
  type ViewCamera,
} from '../../src/islands/anatomystudy';
import { answerQuiz, revealQuiz, startQuiz } from '../../src/islands/anatomylab';

const camera: ViewCamera = { position: [0, 0, 3], target: [0, 0, 0], up: [0, 1, 0] };

/** A fake of the shared client: a session (or none) and one canned reply per function. */
function fakeClient(options: { signedIn?: boolean; userId?: string; replies?: Partial<Record<string, { data: unknown; error: unknown }>> } = {}) {
  const rpc = vi.fn((fn: string, _args?: unknown) => {
    const reply = options.replies?.[fn] ?? { data: null, error: null };
    const promise = Promise.resolve(reply);
    return fn === 'my_anatomy_review_queue'
      ? Object.assign(promise, { range: async (from: number, to: number) => ({
          ...reply, data: Array.isArray(reply.data) ? reply.data.slice(from, to + 1) : reply.data,
        }) })
      : promise;
  });
  const client = {
    auth: { getSession: async () => ({ data: { session: options.signedIn === false ? null : { user: { id: options.userId ?? 'student-1' } } }, error: null }) },
    rpc,
  } as unknown as AnatomyStudyClient;
  return { client, rpc, study: createAnatomyStudy(async () => client) };
}

describe('study identity changes', () => {
  it('retires in-flight personal-data completions on sign-out and account switching', () => {
    const identity = createStudyIdentityGuard();
    expect(identity.update('student-a')).toBe(true);
    const a = identity.snapshot();
    expect(identity.isCurrent(a)).toBe(true);
    expect(identity.update('student-b')).toBe(true);
    expect(identity.isCurrent(a)).toBe(false);
    const b = identity.snapshot();
    expect(identity.isCurrent(b)).toBe(true);
    expect(identity.update(null)).toBe(true);
    expect(identity.isCurrent(b)).toBe(false);
    expect(identity.snapshot().userId).toBeNull();
  });
});

describe('review-queue request ordering', () => {
  it('ignores a stale response from the same account after a newer response', async () => {
    const guard = createReviewQueueRequestGuard();
    const applied: string[] = [];
    let finishOld!: (value: string) => void;
    let finishNew!: (value: string) => void;
    const oldRead = new Promise<string>((resolve) => { finishOld = resolve; });
    const newRead = new Promise<string>((resolve) => { finishNew = resolve; });
    const read = (response: Promise<string>) => {
      const request = guard.begin();
      return response.then((value) => { if (guard.isCurrent(request)) applied.push(value); });
    };
    const first = read(oldRead);
    const second = read(newRead);
    finishNew('newly recorded miss');
    await second;
    finishOld('old empty queue');
    await first;
    expect(applied).toEqual(['newly recorded miss']);
  });

  it('retires a pending read when a miss is cleared, and across account A to B', () => {
    const guard = createReviewQueueRequestGuard();
    const identities = createStudyIdentityGuard();
    identities.update('student-a');
    const accountA = identities.snapshot();
    const beforeClear = guard.begin();
    guard.invalidate(); // a successful clear must cancel the pending read
    expect(guard.isCurrent(beforeClear)).toBe(false);
    const afterClear = guard.begin();
    expect(guard.isCurrent(afterClear)).toBe(true);
    identities.update('student-b');
    guard.invalidate(); // a direct authenticated account switch
    const accountB = identities.snapshot();
    const bRead = guard.begin();
    expect(identities.isCurrent(accountA)).toBe(false);
    expect(guard.isCurrent(afterClear)).toBe(false);
    expect(identities.isCurrent(accountB) && guard.isCurrent(bRead)).toBe(true);
  });
});

describe('saved-view request ordering', () => {
  it('ignores an older system response that resolves after the newer system response', async () => {
    const guard = createSavedViewsRequestGuard();
    let activeSystem = 'heart';
    const applied: string[] = [];
    let resolveOld!: (value: string) => void;
    let resolveNew!: (value: string) => void;
    const oldResponse = new Promise<string>((resolve) => { resolveOld = resolve; });
    const newResponse = new Promise<string>((resolve) => { resolveNew = resolve; });
    const refresh = (key: string, response: Promise<string>) => {
      const request = guard.begin(key);
      return response.then((value) => {
        if (guard.isCurrent(request, activeSystem)) applied.push(value);
      });
    };
    const oldLoad = refresh('heart', oldResponse);
    activeSystem = 'lungs';
    guard.invalidate();
    const newLoad = refresh('lungs', newResponse);
    resolveNew('lungs saved views');
    await newLoad;
    resolveOld('heart saved views');
    await oldLoad;
    expect(applied).toEqual(['lungs saved views']);
  });
});

describe('queueFromQuizMisses', () => {
  it('collects the targets of wrong first picks and "show me", each once, and skips right answers and unfinished questions', () => {
    const random = () => 0;
    const wrong = answerQuiz(startQuiz(['FMA1', 'FMA2'], random), 'FMA2'); // target FMA1, picked FMA2
    const shown = revealQuiz(startQuiz(['FMA3'], random));
    const right = answerQuiz(startQuiz(['FMA4'], random), 'FMA4');
    const open = startQuiz(['FMA5'], random);
    // A right second pick replaces the feedback, so the integrator records a question when it is first answered.
    const wrongThenRight = answerQuiz(wrong, 'FMA1');
    expect(queueFromQuizMisses([wrongThenRight])).toEqual([]);
    expect(queueFromQuizMisses([wrong, shown, right, open, wrongThenRight, wrong])).toEqual(['FMA1', 'FMA3']);
  });

  it('accepts FMA ids, labeled fixture ids and the browser tests\' FIX ids, nothing else', () => {
    for (const id of ['FMA7204', 'FIX001', 'fixture-cube-a']) expect(STRUCTURE_ID.test(id), id).toBe(true);
    for (const id of ['fma1', 'FIX', 'FIX-1', 'BAD001', 'fixture-', 'FMA1 ', '']) expect(STRUCTURE_ID.test(id), id).toBe(false);
  });

  it('drops ids the database would refuse and an empty round', () => {
    expect(queueFromQuizMisses([
      { target: 'BAD001', feedback: { kind: 'wrong', picked: 'FIX002' } },
      { target: 'fixture-cube-a', feedback: { kind: 'shown' } },
      { target: 'FIX001', feedback: { kind: 'shown' } },
      { target: null, feedback: null },
    ])).toEqual(['fixture-cube-a', 'FIX001']);
    expect(queueFromQuizMisses([])).toEqual([]);
  });
});

describe('missBatches', () => {
  it('splits into batches of at most 50, in order', () => {
    const ids = Array.from({ length: 101 }, (_unused, i) => `FMA${i}`);
    const batches = missBatches(ids);
    expect(batches.map((b) => b.length)).toEqual([50, 50, 1]);
    expect(batches[0]![0]).toBe('FMA0');
    expect(batches[2]![0]).toBe('FMA100');
    expect(missBatches([])).toEqual([]);
  });
});

describe('isViewCamera and viewSnapshot', () => {
  it('accepts exactly position, target and an optional up of three finite numbers', () => {
    expect(isViewCamera(camera)).toBe(true);
    expect(isViewCamera({ position: [0, 0, 3], target: [0, 0, 0] })).toBe(true);
    expect(isViewCamera({ position: [0, 0], target: [0, 0, 0] })).toBe(false);
    expect(isViewCamera({ position: [0, 0, Number.NaN], target: [0, 0, 0] })).toBe(false);
    expect(isViewCamera({ position: [0, 0, 3], target: [0, 0, 0], zoom: 2 })).toBe(false);
    expect(isViewCamera({ position: [0, 0, 3] })).toBe(false);
    expect(isViewCamera(null)).toBe(false);
  });

  it('builds the save_anatomy_view arguments: trimmed name, each id once, bad ids dropped, copies of the camera', () => {
    const result = viewSnapshot({
      systemKey: 'heart', name: '  front view ', camera,
      hidden: new Set(['FMA1', 'FMA1', 'BAD001']), faded: ['FMA2'], selected: 'FMA3',
    });
    expect(result).toEqual({
      ok: true,
      args: { system_key: 'heart', name: 'front view', camera, hidden: ['FMA1'], faded: ['FMA2'], selected: 'FMA3' },
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.args.camera).not.toBe(camera);
    expect(result.args.camera.position).not.toBe(camera.position);
  });

  it('saves no selection for a missing or odd selected id, no faded list and no up', () => {
    const result = viewSnapshot({ systemKey: 'heart', name: 'a', camera: { position: [1, 2, 3], target: [0, 0, 0] }, hidden: [], selected: 'BAD001' });
    expect(result).toEqual({ ok: true, args: { system_key: 'heart', name: 'a', camera: { position: [1, 2, 3], target: [0, 0, 0] }, hidden: [], faded: [], selected: null } });
  });

  it('refuses what the database would refuse, with a plain message', () => {
    const base = { systemKey: 'heart', name: 'front', camera, hidden: [] };
    expect(viewSnapshot({ ...base, systemKey: 'Heart' })).toEqual({ ok: false, message: 'that anatomy system could not be found.' });
    expect(viewSnapshot({ ...base, name: '   ' })).toEqual({ ok: false, message: 'a view name is 1 to 60 characters of plain text.' });
    expect(viewSnapshot({ ...base, name: 'n'.repeat(61) }).ok).toBe(false);
    expect(viewSnapshot({ ...base, name: 'front\tview' }).ok).toBe(false);
    expect(viewSnapshot({ ...base, name: 'n'.repeat(60) }).ok).toBe(true);
    expect(viewSnapshot({ ...base, camera: { position: [0, 0, 3], target: [0, 0, 0], zoom: 1 } as unknown as ViewCamera }))
      .toEqual({ ok: false, message: 'the camera could not be read. move the view and try again.' });
  });
});

describe('anatomyStudyMessage', () => {
  it('maps every literal refusal of the six functions to a student sentence, and anything else to a general one', () => {
    expect(anatomyStudyMessage({ message: 'sign in to save a view' })).toBe('please sign in to use this.');
    expect(anatomyStudyMessage({ message: 'confirm your email to use this' })).toContain('confirm your email');
    expect(anatomyStudyMessage({ message: 'complete two-factor sign-in to continue' })).toContain('two-factor');
    expect(anatomyStudyMessage({ message: 'you can keep up to 50 saved views; delete one first' })).toContain('50 saved views');
    expect(anatomyStudyMessage({ message: 'too many misses recorded recently; try again later' })).toContain('a lot of misses');
    expect(anatomyStudyMessage({ message: 'the camera has the wrong shape' })).toContain('reload the page');
    expect(anatomyStudyMessage({ message: 'select * from secret' })).toBe('something went wrong — please try again.');
    expect(anatomyStudyMessage(null)).toBe('something went wrong — please try again.');
    expect(anatomyStudyMessage({ message: 'select * from secret' })).not.toContain('secret');
  });
});

describe('createAnatomyStudy', () => {
  it('does not send an operation captured under A when the delayed session check resolves as B', async () => {
    let started!: () => void;
    let resolveSession!: (value: { data: { session: { user: { id: string } } | null }; error: unknown }) => void;
    const sessionStarted = new Promise<void>((resolve) => { started = resolve; });
    const pendingSession = new Promise<{ data: { session: { user: { id: string } } | null }; error: unknown }>((resolve) => {
      resolveSession = resolve;
    });
    const rpc = vi.fn(async () => ({ data: 1, error: null }));
    const client = {
      auth: { getSession: () => { started(); return pendingSession; } },
      rpc,
    } as unknown as AnatomyStudyClient;
    const study = createAnatomyStudy(async () => client);
    const operation = study.recordMisses('heart', ['FMA7204'], 'student-a');
    await sessionStarted;
    // A second tab signed into B while A's operation was awaiting its session check.
    resolveSession({ data: { session: { user: { id: 'student-b' } } }, error: null });
    expect(await operation).toEqual({ ok: true, value: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(['my_anatomy_review_queue', 'my_anatomy_views'] as const)(
    'discards %s when another tab switches from account A to B during the RPC',
    async (functionName) => {
      let userId = 'student-a';
      let releaseRead!: (reply: { data: unknown; error: null }) => void;
      let readStarted!: () => void;
      const started = new Promise<void>((resolve) => { readStarted = resolve; });
      const pending = new Promise<{ data: unknown; error: null }>((resolve) => { releaseRead = resolve; });
      const rpc = vi.fn((name: string, args: { expected_user_id: string }) => {
        expect(name).toBe(functionName);
        expect(args.expected_user_id).toBe('student-a');
        readStarted();
        return name === 'my_anatomy_review_queue'
          ? Object.assign(pending, { range: () => pending })
          : pending;
      });
      const client = {
        auth: { getSession: async () => ({ data: { session: { user: { id: userId } } }, error: null }) },
        rpc,
      } as unknown as AnatomyStudyClient;
      const study = createAnatomyStudy(async () => client);
      const read = functionName === 'my_anatomy_review_queue'
        ? study.reviewQueue('student-a')
        : study.views('heart', 'student-a');
      await started;
      userId = 'student-b';
      releaseRead({ data: [{ id: 'belongs-to-student-b' }], error: null });
      expect(await read).toEqual({ ok: false, message: 'please sign in to use this.' });
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(await study.reviewQueue('student-a')).toEqual({ ok: true, value: [] });
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['my_anatomy_review_queue', 'my_anatomy_views'] as const)(
    'fails closed on %s when A→B→A occurs before a delayed server read executes',
    async (functionName) => {
      let userId = 'student-a';
      let release!: (reply: { data: unknown; error: unknown }) => void;
      let started!: () => void;
      const atRpc = new Promise<void>((resolve) => { started = resolve; });
      const deferred = new Promise<{ data: unknown; error: unknown }>((resolve) => { release = resolve; });
      const rpc = vi.fn((name: string, args: { expected_user_id: string; system_key?: string }) => {
        expect(name).toBe(functionName);
        expect(args.expected_user_id).toBe('student-a');
        started();
        return name === 'my_anatomy_review_queue'
          ? { range: () => deferred }
          : deferred;
      });
      const client = {
        auth: { getSession: async () => ({ data: { session: { user: { id: userId } } }, error: null }) },
        rpc,
      } as unknown as AnatomyStudyClient;
      const study = createAnatomyStudy(async () => client);
      const request = functionName === 'my_anatomy_review_queue'
        ? study.reviewQueue('student-a')
        : study.views('heart', 'student-a');
      await atRpc;
      // A captured the identity. B owns the database RPC at execution time,
      // and a subsequent return to A must never make B's rows acceptable.
      userId = 'student-b';
      const databaseReply = { data: null, error: { message: 'study account changed; reload before continuing', code: '28000' } };
      userId = 'student-a';
      release(databaseReply);
      const response = await request;
      expect(response.ok).toBe(false);
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects an after-read session error instead of returning potentially cross-account data', async () => {
    let checks = 0;
    const rpc = vi.fn(() => ({ range: async () => ({ data: [{ id: 'untrusted-row' }], error: null }) }));
    const client = {
      auth: { getSession: async () => {
        checks += 1;
        return checks === 1
          ? { data: { session: { user: { id: 'student-a' } } }, error: null }
          : { data: { session: null }, error: { message: 'session unavailable' } };
      } },
      rpc,
    } as unknown as AnatomyStudyClient;
    const study = createAnatomyStudy(async () => client);
    expect(await study.reviewQueue('student-a')).toEqual({ ok: false, message: 'please sign in to use this.' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('records misses in batches of 50 with the SQL argument names, and adds up what was recorded', async () => {
    const { study, rpc } = fakeClient({ replies: { record_anatomy_misses: { data: 7, error: null } } });
    const ids = Array.from({ length: 60 }, (_unused, i) => `FMA${i}`);
    expect(await study.recordMisses('heart', [...ids, 'FMA0', 'BAD001'], 'student-1')).toEqual({ ok: true, value: 14 });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]![0]).toBe('record_anatomy_misses');
    expect(rpc.mock.calls[0]![1]).toEqual({ system_key: 'heart', structure_ids: ids.slice(0, 50), expected_user_id: 'student-1' });
    expect(rpc.mock.calls[1]![1]).toEqual({ system_key: 'heart', structure_ids: ids.slice(50), expected_user_id: 'student-1' });
  });

  it('sends nothing when accounts are off, nobody is signed in, or there is nothing valid to send', async () => {
    const off = createAnatomyStudy(async () => null);
    expect(await off.recordMisses('heart', ['FMA1'], 'student-1')).toEqual({ ok: true, value: 0 });
    expect(await off.reviewQueue('student-1')).toEqual({ ok: true, value: [] });
    expect(await off.views('heart', 'student-1')).toEqual({ ok: true, value: [] });
    expect(await off.saveView({ systemKey: 'heart', name: 'front', camera, hidden: [] }, 'student-1')).toEqual({ ok: false, message: 'please sign in to use this.' });
    const { study, rpc } = fakeClient({ signedIn: false });
    expect(await study.recordMisses('heart', ['FMA1'], 'student-1')).toEqual({ ok: true, value: 0 });
    expect(await study.clearMiss('heart', 'FMA1', 'student-1')).toEqual({ ok: false, message: 'please sign in to use this.' });
    expect(await study.deleteView('00000000-0000-4000-8000-000000000001', 'student-1')).toEqual({ ok: false, message: 'please sign in to use this.' });
    const signedIn = fakeClient();
    expect(await signedIn.study.recordMisses('heart', ['BAD001'], 'student-1')).toEqual({ ok: true, value: 0 });
    expect(await signedIn.study.recordMisses('Heart', ['FMA1'], 'student-1')).toEqual({ ok: true, value: 0 });
    expect(await signedIn.study.views('Heart', 'student-1')).toEqual({ ok: true, value: [] });
    expect(rpc).not.toHaveBeenCalled();
    expect(signedIn.rpc).not.toHaveBeenCalled();
  });

  it('turns a database refusal into a student message and keeps the cause', async () => {
    const error = { message: 'too many misses recorded recently; try again later', code: '54000' };
    const { study } = fakeClient({ replies: { record_anatomy_misses: { data: null, error } } });
    const outcome = await study.recordMisses('heart', ['FMA1'], 'student-1');
    expect(outcome).toEqual({ ok: false, message: "you've recorded a lot of misses recently. they'll be kept again in a little while.", cause: error });
  });

  it('reads all 1,254 active whole-body rows in bounded RPC ranges, not only the first 1,000', async () => {
    const all: ReviewQueueRow[] = Array.from({ length: 1254 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      system_key: 'whole-body', structure_id: `FMA${i + 1}`, missed_count: 1,
      first_missed_at: '2026-11-05T10:00:00Z', last_missed_at: '2026-11-05T10:00:00Z', cleared_at: null,
    }));
    const ranges: Array<[number, number]> = [];
    const client = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'student-1' } } }, error: null }) },
      rpc: (name: string) => {
        expect(name).toBe('my_anatomy_review_queue');
        return { range: async (from: number, to: number) => {
          ranges.push([from, to]);
          return { data: all.slice(from, to + 1), error: null };
        } };
      },
    } as unknown as AnatomyStudyClient;
    const response = await createAnatomyStudy(async () => client).reviewQueue('student-1');
    expect(response).toEqual({ ok: true, value: all });
    expect(ranges).toEqual([[0, REVIEW_PAGE_SIZE - 1], [500, 999], [1000, 1499]]);
  });

  it('rejects a full review queue when a later page fails or repeats an earlier row', async () => {
    const first: ReviewQueueRow[] = Array.from({ length: REVIEW_PAGE_SIZE }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      system_key: 'heart', structure_id: `FMA${i + 1}`, missed_count: 1,
      first_missed_at: '2026-11-05T10:00:00Z', last_missed_at: '2026-11-05T10:00:00Z', cleared_at: null,
    }));
    const create = (second: { data: ReviewQueueRow[] | null; error: unknown }) => {
      const client = {
        auth: { getSession: async () => ({ data: { session: { user: { id: 'student-1' } } }, error: null }) },
        rpc: () => ({ range: async (from: number) => from === 0
          ? { data: first, error: null } : second }),
      } as unknown as AnatomyStudyClient;
      return createAnatomyStudy(async () => client);
    };
    const failed = await create({ data: null, error: { message: 'private network detail' } }).reviewQueue('student-1');
    expect(failed.ok).toBe(false);
    expect(await create({ data: [first[499]!], error: null }).reviewQueue('student-1')).toEqual({
      ok: false, message: 'could not load your full review queue. please try again.',
    });
  });

  it('clears a miss, lists the queue, saves, lists and deletes views with the SQL argument names', async () => {
    const queue: ReviewQueueRow[] = [{
      id: '00000000-0000-4000-8000-000000000001', system_key: 'heart', structure_id: 'FMA1', missed_count: 2,
      first_missed_at: '2026-11-05T10:00:00+00:00', last_missed_at: '2026-11-05T11:00:00+00:00', cleared_at: null,
    }];
    const views: SavedViewRow[] = [{
      id: '00000000-0000-4000-8000-000000000002', system_key: 'heart', name: 'front view', camera,
      hidden: ['FMA1'], faded: [], selected: null, created_at: '2026-11-05T10:00:00+00:00', updated_at: '2026-11-05T10:00:00+00:00',
    }];
    const { study, rpc } = fakeClient({ replies: {
      clear_anatomy_miss: { data: true, error: null },
      my_anatomy_review_queue: { data: queue, error: null },
      save_anatomy_view: { data: views[0]!.id, error: null },
      my_anatomy_views: { data: views, error: null },
      delete_anatomy_view: { data: false, error: null },
    } });
    expect(await study.clearMiss('heart', 'FMA1', 'student-1')).toEqual({ ok: true, value: true });
    expect(rpc).toHaveBeenLastCalledWith('clear_anatomy_miss', { system_key: 'heart', structure_id: 'FMA1', expected_user_id: 'student-1' });
    expect(await study.reviewQueue('student-1')).toEqual({ ok: true, value: queue });
    expect(rpc).toHaveBeenLastCalledWith('my_anatomy_review_queue', { expected_user_id: 'student-1' });
    expect(await study.saveView({ systemKey: 'heart', name: ' front view ', camera, hidden: ['FMA1'] }, 'student-1')).toEqual({ ok: true, value: views[0]!.id });
    expect(rpc).toHaveBeenLastCalledWith('save_anatomy_view', { system_key: 'heart', name: 'front view', camera, hidden: ['FMA1'], faded: [], selected: null, expected_user_id: 'student-1' });
    expect(await study.views('heart', 'student-1')).toEqual({ ok: true, value: views });
    expect(rpc).toHaveBeenLastCalledWith('my_anatomy_views', { system_key: 'heart', expected_user_id: 'student-1' });
    expect(await study.deleteView(views[0]!.id, 'student-1')).toEqual({ ok: true, value: false });
    expect(rpc).toHaveBeenLastCalledWith('delete_anatomy_view', { id: views[0]!.id, expected_user_id: 'student-1' });
  });

  it('refuses a view the database would refuse before calling it', async () => {
    const { study, rpc } = fakeClient();
    expect(await study.saveView({ systemKey: 'heart', name: '', camera, hidden: [] }, 'student-1')).toEqual({ ok: false, message: 'a view name is 1 to 60 characters of plain text.' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('treats a reply of the wrong shape as a failure', async () => {
    const { study } = fakeClient({ replies: { my_anatomy_views: { data: 'not rows', error: null }, record_anatomy_misses: { data: '3', error: null } } });
    expect((await study.views('heart', 'student-1')).ok).toBe(false);
    expect((await study.recordMisses('heart', ['FMA1'], 'student-1')).ok).toBe(false);
  });
});

describe('the review history cap message', () => {
  it('reads as a plain sentence', () => {
    expect(anatomyStudyMessage({ message: 'your review history is full' })).toBe("your review history is full, so new misses can't be kept.");
  });
});

describe('local storage fallback when database migration is held', () => {
  it('falls back gracefully to local storage when RPCs are missing in schema cache', async () => {
    const missingRpcError = { code: 'PGRST202', message: 'Could not find the function public.save_anatomy_view in the schema cache' };
    const { study } = fakeClient({
      userId: 'student-fallback',
      replies: {
        record_anatomy_misses: { data: null, error: missingRpcError },
        clear_anatomy_miss: { data: null, error: missingRpcError },
        my_anatomy_review_queue: { data: null, error: missingRpcError },
        save_anatomy_view: { data: null, error: missingRpcError },
        my_anatomy_views: { data: null, error: missingRpcError },
        delete_anatomy_view: { data: null, error: missingRpcError },
      },
    });

    // 1. Record misses falls back locally
    const recordOutcome = await study.recordMisses('heart', ['FMA1', 'FMA2'], 'student-fallback');
    expect(recordOutcome).toEqual({ ok: true, value: 2 });

    // 2. Review queue returns recorded misses
    const queueOutcome = await study.reviewQueue('student-fallback');
    expect(queueOutcome.ok).toBe(true);
    if (queueOutcome.ok) {
      expect(queueOutcome.value).toHaveLength(2);
      expect(queueOutcome.value.map((r) => r.structure_id).sort()).toEqual(['FMA1', 'FMA2']);
    }

    // 3. Clear miss updates local queue
    const clearOutcome = await study.clearMiss('heart', 'FMA1', 'student-fallback');
    expect(clearOutcome).toEqual({ ok: true, value: true });
    const queueAfterClear = await study.reviewQueue('student-fallback');
    expect(queueAfterClear.ok).toBe(true);
    if (queueAfterClear.ok) {
      expect(queueAfterClear.value).toHaveLength(1);
      expect(queueAfterClear.value[0]?.structure_id).toBe('FMA2');
    }

    // 4. Save view falls back locally
    const saveOutcome = await study.saveView({ systemKey: 'heart', name: 'front local', camera, hidden: [] }, 'student-fallback');
    expect(saveOutcome.ok).toBe(true);
    let savedId = '';
    if (saveOutcome.ok) savedId = saveOutcome.value;

    // 5. Views returns saved local view
    const viewsOutcome = await study.views('heart', 'student-fallback');
    expect(viewsOutcome.ok).toBe(true);
    if (viewsOutcome.ok) {
      expect(viewsOutcome.value).toHaveLength(1);
      expect(viewsOutcome.value[0]?.name).toBe('front local');
      expect(viewsOutcome.value[0]?.id).toBe(savedId);
    }

    // 6. Delete view removes local view
    const deleteOutcome = await study.deleteView(savedId, 'student-fallback');
    expect(deleteOutcome).toEqual({ ok: true, value: true });
    const viewsAfterDelete = await study.views('heart', 'student-fallback');
    expect(viewsAfterDelete.ok).toBe(true);
    if (viewsAfterDelete.ok) {
      expect(viewsAfterDelete.value).toHaveLength(0);
    }

    // 7. Limit check allows replacing existing view at 50 views, but rejects a 51st new view
    for (let i = 0; i < 50; i++) {
      const res = await study.saveView({ systemKey: 'heart', name: `view ${i}`, camera, hidden: [] }, 'student-fallback');
      expect(res.ok).toBe(true);
    }
    // Re-saving existing view name replaces it
    const replaceOutcome = await study.saveView({ systemKey: 'heart', name: 'view 0', camera, hidden: ['FMA1'] }, 'student-fallback');
    expect(replaceOutcome.ok).toBe(true);

    // Saving a 51st view name is refused
    const overflowOutcome = await study.saveView({ systemKey: 'heart', name: 'view 50', camera, hidden: [] }, 'student-fallback');
    expect(overflowOutcome).toEqual({ ok: false, message: 'you can keep up to 50 saved views; delete one first.' });
  });
});
