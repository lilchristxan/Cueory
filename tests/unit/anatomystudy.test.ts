import { describe, expect, it, vi } from 'vitest';
import {
  anatomyStudyMessage,
  createAnatomyStudy,
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
  const rpc = vi.fn(async (fn: string, _args?: unknown) => options.replies?.[fn] ?? { data: null, error: null });
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

  it('records misses in batches of 50 with the SQL argument names, and adds up what was recorded', async () => {
    const { study, rpc } = fakeClient({ replies: { record_anatomy_misses: { data: 7, error: null } } });
    const ids = Array.from({ length: 60 }, (_unused, i) => `FMA${i}`);
    expect(await study.recordMisses('heart', [...ids, 'FMA0', 'BAD001'], 'student-1')).toEqual({ ok: true, value: 14 });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]![0]).toBe('record_anatomy_misses');
    expect(rpc.mock.calls[0]![1]).toEqual({ system_key: 'heart', structure_ids: ids.slice(0, 50) });
    expect(rpc.mock.calls[1]![1]).toEqual({ system_key: 'heart', structure_ids: ids.slice(50) });
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
    expect(rpc).toHaveBeenLastCalledWith('clear_anatomy_miss', { system_key: 'heart', structure_id: 'FMA1' });
    expect(await study.reviewQueue('student-1')).toEqual({ ok: true, value: queue });
    expect(rpc).toHaveBeenLastCalledWith('my_anatomy_review_queue');
    expect(await study.saveView({ systemKey: 'heart', name: ' front view ', camera, hidden: ['FMA1'] }, 'student-1')).toEqual({ ok: true, value: views[0]!.id });
    expect(rpc).toHaveBeenLastCalledWith('save_anatomy_view', { system_key: 'heart', name: 'front view', camera, hidden: ['FMA1'], faded: [], selected: null });
    expect(await study.views('heart', 'student-1')).toEqual({ ok: true, value: views });
    expect(rpc).toHaveBeenLastCalledWith('my_anatomy_views', { system_key: 'heart' });
    expect(await study.deleteView(views[0]!.id, 'student-1')).toEqual({ ok: true, value: false });
    expect(rpc).toHaveBeenLastCalledWith('delete_anatomy_view', { id: views[0]!.id });
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
