import { describe, expect, it, vi } from 'vitest';
import {
  connectExamPlans,
  isConnectFailure,
  loadExamPlan,
  saveExamPlan,
  serverPlans,
  loadTickets,
  supabaseExamPlans,
  SYNC_MESSAGES,
  loadExamPlans,
  resolveAccountAnswers,
  saveSetupToAccount,
  withServerPlan,
  type DbError,
  type ExamPlanClient,
  type ExamPlanSyncDb,
} from '../../src/islands/examplansync';
import type { Onboarding } from '../../src/scripts/progress';

const TODAY = '2026-11-02';
const answers = (course: Onboarding['course'], examDate: string | null): Onboarding => ({ course, examDate, done: true });

/**
 * One student's exam_plans, with the migration's rules that matter here: insert sets only (course, exam_date),
 * update changes only exam_date, one plan per course (23505), at most ten (54000), the date window (23514).
 */
class FakePlans implements ExamPlanSyncDb {
  /** The account this adapter was made for, and who the page's client is signed in as now (#755). */
  readonly accountId = 'account-a';
  signedInAs: string | null = 'account-a';
  /** The account check itself fails (a dropped connection). */
  checkFails = false;
  /** Runs after an update, to stand in for another tab switching accounts mid-save. */
  afterUpdate?: () => void;
  rows: { course: string; exam_date: string }[] = [];
  calls: string[] = [];
  failOn?: (call: string) => DbError | undefined;
  /** Runs before an insert, to stand in for another tab adding the same course. */
  beforeInsert?: () => void;

  async accountCheck() {
    if (this.checkFails) return 'unknown' as const;
    return this.signedInAs === this.accountId ? 'same' as const : 'changed' as const;
  }

  private guard(examDate: string): DbError | undefined {
    const days = (Date.parse(examDate) - Date.parse(TODAY)) / 86_400_000;
    return days < -2 || days > 730 ? { code: '23514' } : undefined;
  }

  async list() {
    this.calls.push('list');
    const error = this.failOn?.('list');
    return error ? { data: null, error } : { data: this.rows.map((r) => ({ ...r })), error: null };
  }

  async update(course: string, examDate: string) {
    this.calls.push(`update ${course} ${examDate}`);
    const error = this.failOn?.('update') ?? this.guard(examDate);
    if (error) return { data: null, error };
    const hit = this.rows.filter((r) => r.course === course);
    for (const row of hit) row.exam_date = examDate;
    this.afterUpdate?.();
    return { data: hit.map((r) => ({ course: r.course })), error: null };
  }

  async insert(row: { course: string; exam_date: string }) {
    this.calls.push(`insert ${row.course} ${row.exam_date}`);
    expect(Object.keys(row).sort()).toEqual(['course', 'exam_date']);
    this.beforeInsert?.();
    const error = this.failOn?.('insert') ?? this.guard(row.exam_date);
    if (error) return { error };
    if (this.rows.some((r) => r.course === row.course)) return { error: { code: '23505' } };
    if (this.rows.length >= 10) return { error: { code: '54000' } };
    this.rows.push({ ...row });
    return { error: null };
  }

  async remove(course: string) {
    this.calls.push(`remove ${course}`);
    const error = this.failOn?.('remove');
    if (error) return { error };
    this.rows = this.rows.filter((r) => r.course !== course);
    return { error: null };
  }
}

describe('serverPlans', () => {
  it('keeps only known courses with real dates, one per course', () => {
    expect(serverPlans([
      { course: 'med-surg-1', exam_date: '2027-01-10' },
      { course: 'med-surg-1', exam_date: '2027-02-10' },
      { course: 'pharmacology', exam_date: '2027-01-10' },
      { course: 'fundamentals', exam_date: '2027-02-30' },
      { course: 'both', exam_date: 20270110 },
      null,
      'fundamentals',
    ])).toEqual([{ course: 'med-surg-1', examDate: '2027-01-10' }]);
    expect(serverPlans(null)).toEqual([]);
    expect(serverPlans({} as never)).toEqual([]);
  });
});

describe('withServerPlan — the account wins', () => {
  const plans = [{ course: 'med-surg-1', examDate: '2027-03-01' }, { course: 'fundamentals', examDate: '2027-04-01' }] as const;

  it("replaces the device's date with the account's for the same course", () => {
    expect(withServerPlan(answers('med-surg-1', '2027-05-12'), plans)).toEqual(answers('med-surg-1', '2027-03-01'));
    expect(withServerPlan(answers('med-surg-1', null), plans)).toEqual(answers('med-surg-1', '2027-03-01'));
  });

  it('changes nothing when they already match or the account has no plan for that course', () => {
    expect(withServerPlan(answers('med-surg-1', '2027-03-01'), plans)).toBeNull();
    expect(withServerPlan(answers('both', '2027-05-12'), plans)).toBeNull();
  });

  it("uses the account's only plan on a device with no course, and never guesses between several", () => {
    expect(withServerPlan({ course: null, examDate: null, done: false }, [plans[0]])).toEqual(answers('med-surg-1', '2027-03-01'));
    expect(withServerPlan(answers(null, '2027-05-12'), [plans[1]])).toEqual(answers('fundamentals', '2027-04-01'));
    expect(withServerPlan(answers(null, '2027-05-12'), plans)).toBeNull();
    expect(withServerPlan(answers(null, null), [])).toBeNull();
  });
});

describe('loadExamPlan', () => {
  it('applies the account date to the answers saved when the load lands, not when it started (Codex on #232)', async () => {
    const db = new FakePlans();
    db.rows = [{ course: 'fundamentals', exam_date: '2027-01-20' }, { course: 'med-surg-1', exam_date: '2027-03-01' }];
    let saved = answers('fundamentals', '2027-06-01');
    const pending = loadExamPlan(db, () => saved);
    saved = answers('med-surg-1', '2027-09-09');
    expect(await pending).toEqual({ ok: true, onboarding: answers('med-surg-1', '2027-03-01') });
  });

  it("returns the device answers with the account's date", async () => {
    const db = new FakePlans();
    db.rows = [{ course: 'fundamentals', exam_date: '2027-01-20' }];
    expect(await loadExamPlan(db, answers('fundamentals', '2027-06-01'))).toEqual({
      ok: true, onboarding: answers('fundamentals', '2027-01-20'),
    });
    expect(await loadExamPlan(db, answers('fundamentals', '2027-01-20'))).toEqual({ ok: true, onboarding: null });
  });

  it('fails in one plain sentence on an error, a throw or an odd response', async () => {
    const failed = { ok: false, message: SYNC_MESSAGES.loadFailed };
    const db = new FakePlans();
    db.failOn = () => ({ code: '500', message: 'provider-private-detail' });
    expect(await loadExamPlan(db, answers('both', null))).toEqual(failed);
    const throwing = Object.assign(new FakePlans(), { list: () => Promise.reject(new Error('offline')) });
    expect(await loadExamPlan(throwing, answers('both', null))).toEqual(failed);
    const odd = Object.assign(new FakePlans(), { list: async () => ({ data: null, error: null }) });
    expect(await loadExamPlan(odd, answers('both', null))).toEqual(failed);
    expect(SYNC_MESSAGES.loadFailed).not.toMatch(/provider-private-detail/);
  });
});

describe('resolveAccountAnswers — the date belongs to the course on screen (Codex on #232)', () => {
  const plans = [{ course: 'med-surg-1', examDate: '2026-12-10' }, { course: 'fundamentals', examDate: '2027-01-20' }] as const;
  const untouched = { course: false, examDate: false };

  it("fills an untouched date with the account's date for the course on screen", () => {
    expect(resolveAccountAnswers({ course: 'med-surg-1', examDate: '' }, untouched, plans))
      .toMatchObject({ course: 'med-surg-1', examDate: '2026-12-10' });
  });

  it('uses the course picked now, not the one saved on the device, and never borrows another course\'s date', () => {
    const picked = { course: true, examDate: false };
    expect(resolveAccountAnswers({ course: 'fundamentals', examDate: '' }, picked, plans))
      .toMatchObject({ course: 'fundamentals', examDate: '2027-01-20' });
    expect(resolveAccountAnswers({ course: 'fundamentals', examDate: '' }, picked, [plans[0]]))
      .toMatchObject({ course: 'fundamentals', examDate: '' });
    expect(resolveAccountAnswers({ course: 'both', examDate: '2027-03-01' }, picked, plans))
      .toMatchObject({ course: 'both', examDate: '2027-03-01' });
  });

  it('keeps a skipped course blank, and then has no course to take a date from', () => {
    expect(resolveAccountAnswers({ course: '', examDate: '' }, { course: true, examDate: false }, [plans[0]]))
      .toMatchObject({ course: '', examDate: '' });
  });

  it("takes the account's only plan when the course is untouched and blank", () => {
    expect(resolveAccountAnswers({ course: '', examDate: '' }, untouched, [plans[0]]))
      .toMatchObject({ course: 'med-surg-1', examDate: '2026-12-10' });
    expect(resolveAccountAnswers({ course: '', examDate: '' }, untouched, plans)).toMatchObject({ course: '', examDate: '' });
  });

  it('clears a date the account filled in when the course switches to one with no plan (Codex on #232)', () => {
    const picked = { course: true, examDate: false };
    const loaded = resolveAccountAnswers({ course: 'med-surg-1', examDate: '' }, untouched, [plans[0]]);
    expect(loaded).toEqual({ course: 'med-surg-1', examDate: '2026-12-10', dateFromAccount: true });
    expect(resolveAccountAnswers({ ...loaded, course: 'fundamentals' }, picked, [plans[0]]))
      .toEqual({ course: 'fundamentals', examDate: '', dateFromAccount: false });
    // A date from this device (not the account) stays, as it would without an account.
    expect(resolveAccountAnswers({ course: 'fundamentals', examDate: '2027-03-01', dateFromAccount: false }, picked, [plans[0]]))
      .toEqual({ course: 'fundamentals', examDate: '2027-03-01', dateFromAccount: false });
    // Switching back finds the account's date again.
    expect(resolveAccountAnswers({ course: 'med-surg-1', examDate: '' }, picked, [plans[0]]))
      .toEqual({ course: 'med-surg-1', examDate: '2026-12-10', dateFromAccount: true });
  });

  it('never replaces a date the student typed, cleared or skipped', () => {
    expect(resolveAccountAnswers({ course: 'med-surg-1', examDate: '' }, { course: false, examDate: true }, plans))
      .toMatchObject({ course: 'med-surg-1', examDate: '' });
    expect(resolveAccountAnswers({ course: 'med-surg-1', examDate: '2027-02-02' }, { course: false, examDate: true }, plans))
      .toMatchObject({ course: 'med-surg-1', examDate: '2027-02-02' });
  });
});

describe('saveSetupToAccount — the account plans are the baseline (Codex on #232)', () => {
  const save = (db: ExamPlanSyncDb, values: { plans: { course: 'med-surg-1' | 'fundamentals'; examDate: string }[] | null;
    deviceBefore: Onboarding; after: Onboarding; clearedDate?: boolean }) =>
    saveSetupToAccount(db, { clearedDate: false, today: TODAY, ...values });

  it('a cleared or skipped date removes the plan even when the device never had that date', async () => {
    const db = new FakePlans();
    db.rows = [{ course: 'med-surg-1', exam_date: '2026-12-10' }];
    const result = await save(db, {
      plans: [{ course: 'med-surg-1', examDate: '2026-12-10' }],
      deviceBefore: answers('med-surg-1', null), after: answers('med-surg-1', null), clearedDate: true,
    });
    expect(result).toEqual({ status: 'removed', message: SYNC_MESSAGES.removed });
    expect(db.calls).toEqual(['remove med-surg-1']);
  });

  it('a blank the student never touched removes nothing', async () => {
    const db = new FakePlans();
    expect(await save(db, {
      plans: [{ course: 'med-surg-1', examDate: '2026-12-10' }], deviceBefore: answers('med-surg-1', '2026-12-10'), after: answers('med-surg-1', null),
    })).toEqual({ status: 'unchanged' });
    expect(db.calls).toEqual([]);
  });

  it('a clear for a course the account has no plan for sends nothing, and a clear with no course uses the device course', async () => {
    const db = new FakePlans();
    expect(await save(db, {
      plans: [{ course: 'med-surg-1', examDate: '2026-12-10' }], deviceBefore: answers(null, null), after: answers('fundamentals', null), clearedDate: true,
    })).toEqual({ status: 'unchanged' });
    expect(await save(db, {
      plans: [{ course: 'med-surg-1', examDate: '2026-12-10' }], deviceBefore: answers('med-surg-1', null), after: answers(null, null), clearedDate: true,
    })).toEqual({ status: 'removed', message: SYNC_MESSAGES.removed });
    expect(db.calls).toEqual(['remove med-surg-1']);
  });

  it("a date equal to the account's plan sends nothing; a date for another course writes only that course", async () => {
    const db = new FakePlans();
    db.rows = [{ course: 'med-surg-1', exam_date: '2026-12-10' }, { course: 'fundamentals', exam_date: '2027-01-20' }];
    const plans = [{ course: 'med-surg-1' as const, examDate: '2026-12-10' }, { course: 'fundamentals' as const, examDate: '2027-01-20' }];
    expect(await save(db, { plans, deviceBefore: answers('med-surg-1', null), after: answers('fundamentals', '2027-01-20') }))
      .toEqual({ status: 'unchanged' });
    expect(await save(db, { plans, deviceBefore: answers('fundamentals', '2027-01-20'), after: answers('fundamentals', '2027-02-02') }))
      .toEqual({ status: 'saved', message: SYNC_MESSAGES.saved });
    expect(db.calls).toEqual(['update fundamentals 2027-02-02']);
    expect(db.rows).toContainEqual({ course: 'med-surg-1', exam_date: '2026-12-10' });
  });

  it('when the plans could not be read, still writes a date equal to the device one, and a clear (Codex on #232)', async () => {
    const db = new FakePlans();
    expect(await save(db, { plans: null, deviceBefore: answers('both', '2026-12-10'), after: answers('both', '2026-12-10') }))
      .toEqual({ status: 'saved', message: SYNC_MESSAGES.saved });
    expect(db.calls[0]).toBe('update both 2026-12-10');
    db.calls.length = 0;
    expect(await save(db, { plans: null, deviceBefore: answers('both', null), after: answers('both', null), clearedDate: true }))
      .toEqual({ status: 'removed', message: SYNC_MESSAGES.removed });
    expect(db.calls).toEqual(['remove both']);
  });

  it('a failed removal is one plain sentence', async () => {
    const db = new FakePlans();
    db.failOn = (call) => (call === 'remove' ? { code: '500', message: 'private' } : undefined);
    expect(await save(db, { plans: null, deviceBefore: answers('both', null), after: answers('both', null), clearedDate: true }))
      .toEqual({ status: 'failed', message: SYNC_MESSAGES.removeFailed });
  });
});

describe('loadExamPlans', () => {
  it('returns the plans by course, or the load sentence', async () => {
    const db = new FakePlans();
    db.rows = [{ course: 'med-surg-1', exam_date: '2026-12-10' }];
    expect(await loadExamPlans(db)).toEqual({ ok: true, plans: [{ course: 'med-surg-1', examDate: '2026-12-10' }] });
    db.failOn = () => ({ code: '500' });
    expect(await loadExamPlans(db)).toEqual({ ok: false, message: SYNC_MESSAGES.loadFailed });
  });
});

describe('loadTickets', () => {
  it('a load started before "forget" is cancelled for good (Codex on #232)', () => {
    const loads = loadTickets();
    const pending = loads.start();
    expect(pending()).toBe(true);
    loads.cancel();
    expect(pending()).toBe(false);
    expect(pending()).toBe(false);
  });

  it('only the newest load counts', () => {
    const loads = loadTickets();
    const first = loads.start();
    const second = loads.start();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it('keeps separate pages apart', () => {
    const a = loadTickets();
    const b = loadTickets();
    const pending = a.start();
    b.cancel();
    expect(pending()).toBe(true);
  });
});

describe('saveExamPlan', () => {
  it('adds a plan for a new course with only the two insertable columns', async () => {
    const db = new FakePlans();
    const result = await saveExamPlan(db, answers(null, null), answers('med-surg-1', '2026-12-10'), TODAY);
    expect(result).toEqual({ status: 'saved', message: SYNC_MESSAGES.saved });
    expect(db.calls).toEqual(['update med-surg-1 2026-12-10', 'insert med-surg-1 2026-12-10']);
    expect(db.rows).toEqual([{ course: 'med-surg-1', exam_date: '2026-12-10' }]);
  });

  it('changes an existing plan by updating only the date, so it works at the ten-plan cap', async () => {
    const db = new FakePlans();
    db.rows = Array.from({ length: 9 }, (_, i) => ({ course: `old-${i}`, exam_date: '2027-01-01' }));
    db.rows.push({ course: 'med-surg-1', exam_date: '2026-12-10' });
    const result = await saveExamPlan(db, answers('med-surg-1', '2026-12-10'), answers('med-surg-1', '2027-01-15'), TODAY);
    expect(result.status).toBe('saved');
    expect(db.calls).toEqual(['update med-surg-1 2027-01-15']);
    expect(db.rows.find((r) => r.course === 'med-surg-1')?.exam_date).toBe('2027-01-15');
    expect(db.rows).toHaveLength(10);
  });

  it('removes the plan when the date is cleared', async () => {
    const db = new FakePlans();
    db.rows = [{ course: 'both', exam_date: '2026-12-10' }];
    expect(await saveExamPlan(db, answers('both', '2026-12-10'), answers('both', null), TODAY))
      .toEqual({ status: 'removed', message: SYNC_MESSAGES.removed });
    expect(db.rows).toEqual([]);
  });

  it('sends nothing when nothing changed, or when no date was ever set', async () => {
    const db = new FakePlans();
    expect(await saveExamPlan(db, answers('both', '2026-12-10'), answers('both', '2026-12-10'), TODAY)).toEqual({ status: 'unchanged' });
    expect(await saveExamPlan(db, answers(null, null), answers('both', null), TODAY)).toEqual({ status: 'unchanged' });
    expect(await saveExamPlan(db, answers(null, '2026-12-10'), answers(null, null), TODAY)).toEqual({ status: 'unchanged' });
    expect(db.calls).toEqual([]);
  });

  it('keeps a date with no course on the device and says why', async () => {
    const db = new FakePlans();
    expect(await saveExamPlan(db, answers(null, null), answers(null, '2026-12-10'), TODAY))
      .toEqual({ status: 'failed', message: SYNC_MESSAGES.noCourse });
    expect(db.calls).toEqual([]);
  });

  it('checks the date window before sending', async () => {
    const db = new FakePlans();
    for (const date of ['2026-10-30', '2028-11-02']) {
      expect(await saveExamPlan(db, answers('both', null), answers('both', date), TODAY))
        .toEqual({ status: 'failed', message: SYNC_MESSAGES.outOfWindow });
    }
    expect(db.calls).toEqual([]);
    expect((await saveExamPlan(db, answers('both', null), answers('both', '2026-10-31'), TODAY)).status).toBe('saved');
  });

  it('updates the plan another tab added between the update and the insert', async () => {
    const db = new FakePlans();
    db.beforeInsert = () => { db.rows.push({ course: 'fundamentals', exam_date: '2027-02-02' }); };
    const result = await saveExamPlan(db, answers(null, null), answers('fundamentals', '2026-12-01'), TODAY);
    expect(result.status).toBe('saved');
    expect(db.calls).toEqual(['update fundamentals 2026-12-01', 'insert fundamentals 2026-12-01', 'update fundamentals 2026-12-01']);
    expect(db.rows).toEqual([{ course: 'fundamentals', exam_date: '2026-12-01' }]);
  });

  it.each([
    ['54000', 'insert', SYNC_MESSAGES.tooMany],
    ['23514', 'insert', SYNC_MESSAGES.outOfWindow],
    ['42501', 'update', SYNC_MESSAGES.signedOut],
    ['500', 'update', SYNC_MESSAGES.failed],
    ['500', 'insert', SYNC_MESSAGES.failed],
  ])('explains a %s refusal on %s in one plain sentence', async (code, call, message) => {
    const db = new FakePlans();
    db.failOn = (c) => (c === call ? { code, message: 'provider-private-detail' } : undefined);
    const result = await saveExamPlan(db, answers(null, null), answers('both', '2026-12-10'), TODAY);
    expect(result).toEqual({ status: 'failed', message });
    expect(message).not.toMatch(/provider-private-detail/);
    expect(message.split('. ').length).toBeLessThanOrEqual(2);
  });

  it('reports a failed clear, a throw, and an unexpected response without throwing', async () => {
    const db = new FakePlans();
    db.failOn = () => ({ code: '500' });
    expect(await saveExamPlan(db, answers('both', '2026-12-10'), answers('both', null), TODAY))
      .toEqual({ status: 'failed', message: SYNC_MESSAGES.removeFailed });
    const throwing: ExamPlanSyncDb = {
      accountId: 'account-a', accountCheck: async () => 'same',
      list: () => Promise.reject(new Error('x')), update: () => Promise.reject(new Error('x')),
      insert: () => Promise.reject(new Error('x')), remove: () => Promise.reject(new Error('x')),
    };
    expect(await saveExamPlan(throwing, answers('both', null), answers('both', '2026-12-10'), TODAY))
      .toEqual({ status: 'failed', message: SYNC_MESSAGES.failed });
    expect(await saveExamPlan(throwing, answers('both', '2026-12-10'), answers('both', null), TODAY))
      .toEqual({ status: 'failed', message: SYNC_MESSAGES.removeFailed });
    const odd = Object.assign(new FakePlans(), { update: async () => ({ data: null, error: null }) });
    expect((await saveExamPlan(odd, answers('both', null), answers('both', '2026-12-10'), TODAY)).status).toBe('failed');
  });
});

describe('supabaseExamPlans', () => {
  it('makes exactly the granted calls on exam_plans', async () => {
    const log: unknown[] = [];
    const done = <T>(value: T) => Promise.resolve(value);
    const client: ExamPlanClient = {
      from: (table) => {
        log.push(['from', table]);
        return {
          select: (columns) => ({ eq: (column, value) => ({ limit: (n) => {
            log.push(['select', columns, column, value, n]);
            return done({ data: [], error: null });
          } }) }),
          update: (patch) => ({ match: (filter) => ({ select: (columns) => {
            log.push(['update', patch, filter, columns]);
            return done({ data: [{ course: filter.course }], error: null });
          } }) }),
          insert: (row) => { log.push(['insert', row]); return done({ error: null }); },
          delete: () => ({ match: (filter) => { log.push(['delete', filter]); return done({ error: null }); } }),
        };
      },
    };
    const db = supabaseExamPlans(client, 'account-a', async () => 'same');
    expect(db.accountId).toBe('account-a');
    await db.list();
    await db.update('both', '2026-12-10');
    await db.insert({ course: 'both', exam_date: '2026-12-10', user_id: 'someone-else' } as never);
    await db.remove('both');
    expect(log).toEqual([
      ['from', 'exam_plans'], ['select', 'course,exam_date', 'user_id', 'account-a', 10],
      ['from', 'exam_plans'], ['update', { exam_date: '2026-12-10' }, { course: 'both', user_id: 'account-a' }, 'course'],
      ['from', 'exam_plans'], ['insert', { course: 'both', exam_date: '2026-12-10' }],
      ['from', 'exam_plans'], ['delete', { course: 'both', user_id: 'account-a' }],
    ]);
  });
});

describe('connectExamPlans', () => {
  const module = (client: unknown, signedIn: boolean) => async () => ({
    getSupabase: async () => client,
    sessionCheckFrom: vi.fn(async () => (signedIn ? { signedIn, userId: 'account-a' } : { signedIn })),
  });
  // The page's real session helper over a fake client, so a thrown or returned error goes the whole way through.
  const real = (getSession: () => Promise<unknown>) => async () => {
    const actual = await import('../../src/islands/supabaseclient');
    const client = { auth: { getSession }, from: vi.fn() };
    return { getSupabase: async () => client, sessionCheckFrom: actual.sessionCheckFrom as never };
  };

  it('is null with accounts off or confirmed signed out', async () => {
    expect(await connectExamPlans(module(null, true))).toBeNull();
    expect(await connectExamPlans(module({ from: vi.fn() }, false))).toBeNull();
  });

  it('reports a failure, not signed out, when loading or the session check fails', async () => {
    expect(await connectExamPlans(() => Promise.reject(new Error('offline')))).toEqual({ error: true });
    expect(await connectExamPlans(async () => ({
      getSupabase: () => Promise.reject(new Error('x')), sessionCheckFrom: async () => ({ signedIn: true }),
    }))).toEqual({ error: true });
    const rejected = await connectExamPlans(async () => ({
      getSupabase: async () => ({ from: vi.fn() }), sessionCheckFrom: () => Promise.reject(new Error('session')),
    }));
    expect(rejected).toEqual({ error: true });
    expect(isConnectFailure(rejected)).toBe(true);
    expect(isConnectFailure(null)).toBe(false);
  });

  it('the real session helper: a thrown or returned getSession error is a failure, no session is signed out', async () => {
    expect(await connectExamPlans(real(() => Promise.reject(new Error('offline'))))).toEqual({ error: true });
    expect(await connectExamPlans(real(async () => ({ data: { session: null }, error: new Error('x') })))).toEqual({ error: true });
    expect(await connectExamPlans(real(async () => ({ data: { session: null }, error: null })))).toBeNull();
    const db = await connectExamPlans(real(async () => ({ data: { session: { user: { id: 'u1' } } }, error: null })));
    expect(db).not.toBeNull();
    expect(isConnectFailure(db)).toBe(false);
    expect((db as ExamPlanSyncDb).accountId).toBe('u1');
  });

  it('a signed-in session with no account id is a failed check, never an unbound adapter (#755)', async () => {
    expect(await connectExamPlans(async () => ({
      getSupabase: async () => ({ from: vi.fn() }), sessionCheckFrom: async () => ({ signedIn: true }),
    }))).toEqual({ error: true });
    expect(await connectExamPlans(async () => ({
      getSupabase: async () => ({ from: vi.fn() }), sessionCheckFrom: async () => ({ signedIn: true, userId: '' }),
    }))).toEqual({ error: true });
  });

  it("the adapter's account check reads the session fresh: same, changed (A→B, signed out), back to A, unknown (#755)", async () => {
    let now: unknown = { signedIn: true, userId: 'account-a' };
    const db = await connectExamPlans(async () => ({
      getSupabase: async () => ({ from: vi.fn() }),
      sessionCheckFrom: async () => {
        if (now instanceof Error) throw now;
        return now as never;
      },
    })) as ExamPlanSyncDb;
    expect(db.accountId).toBe('account-a');
    expect(await db.accountCheck()).toBe('same');
    now = { signedIn: true, userId: 'account-b' };
    expect(await db.accountCheck()).toBe('changed');
    now = { signedIn: false };
    expect(await db.accountCheck()).toBe('changed');
    now = { signedIn: true, userId: 'account-a' };
    expect(await db.accountCheck()).toBe('same');
    now = { error: true };
    expect(await db.accountCheck()).toBe('unknown');
    now = new Error('offline');
    expect(await db.accountCheck()).toBe('unknown');
  });

  it('gives the adapter when someone is signed in', async () => {
    const from = vi.fn();
    const db = await connectExamPlans(module({ from }, true));
    expect(db).not.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});

describe("account binding — A's setup never reaches B (#755)", () => {
  const plansA = [{ course: 'med-surg-1' as const, examDate: '2026-12-01' }];

  it('A→B before finishing: nothing is written, and the note says so with no retry message', async () => {
    const db = new FakePlans();
    db.rows = [{ course: 'med-surg-1', exam_date: '2026-12-01' }];
    db.signedInAs = 'account-b';
    const saved = await saveSetupToAccount(db, {
      plans: plansA, deviceBefore: answers('med-surg-1', '2026-12-01'), after: answers('med-surg-1', '2026-12-20'),
      clearedDate: false, today: TODAY,
    });
    expect(saved).toEqual({ status: 'failed', message: SYNC_MESSAGES.accountChanged });
    expect(db.calls).toEqual([]);
    expect(db.rows).toEqual([{ course: 'med-surg-1', exam_date: '2026-12-01' }]);
  });

  it('A→B before a clear: nothing is removed', async () => {
    const db = new FakePlans();
    db.rows = [{ course: 'med-surg-1', exam_date: '2026-12-01' }];
    db.signedInAs = 'account-b';
    const cleared = await saveSetupToAccount(db, {
      plans: plansA, deviceBefore: answers('med-surg-1', '2026-12-01'), after: answers('med-surg-1', null),
      clearedDate: true, today: TODAY,
    });
    expect(cleared).toEqual({ status: 'failed', message: SYNC_MESSAGES.accountChanged });
    expect(db.calls).toEqual([]);
    expect(db.rows).toHaveLength(1);
  });

  it('A→B between the update and the insert: the insert is never sent', async () => {
    const db = new FakePlans();
    db.afterUpdate = () => { db.signedInAs = 'account-b'; };
    const saved = await saveExamPlan(db, answers(null, null), answers('fundamentals', '2026-12-10'), TODAY);
    expect(saved).toEqual({ status: 'failed', message: SYNC_MESSAGES.accountChanged });
    expect(db.calls).toEqual(['update fundamentals 2026-12-10']);
    expect(db.rows).toEqual([]);
  });

  it('A→B before the retried update after a duplicate: the retry is never sent', async () => {
    const db = new FakePlans();
    db.beforeInsert = () => {
      db.rows.push({ course: 'both', exam_date: '2026-12-30' });
      db.signedInAs = 'account-b';
    };
    const saved = await saveExamPlan(db, answers(null, null), answers('both', '2026-12-10'), TODAY);
    expect(saved).toEqual({ status: 'failed', message: SYNC_MESSAGES.accountChanged });
    expect(db.calls).toEqual(['update both 2026-12-10', 'insert both 2026-12-10']);
    expect(db.rows).toEqual([{ course: 'both', exam_date: '2026-12-30' }]);
  });

  it('A→B→A: back as A, the save goes to A as normal', async () => {
    const db = new FakePlans();
    db.rows = [{ course: 'med-surg-1', exam_date: '2026-12-01' }];
    db.signedInAs = 'account-b';
    const save = {
      plans: plansA, deviceBefore: answers('med-surg-1', '2026-12-01'), after: answers('med-surg-1', '2026-12-20'),
      clearedDate: false, today: TODAY,
    };
    expect((await saveSetupToAccount(db, save)).status).toBe('failed');
    db.signedInAs = 'account-a';
    expect(await saveSetupToAccount(db, save)).toEqual({ status: 'saved', message: SYNC_MESSAGES.saved });
    expect(db.calls).toEqual(['update med-surg-1 2026-12-20']);
    expect(db.rows).toEqual([{ course: 'med-surg-1', exam_date: '2026-12-20' }]);
  });

  it('signed out mid-save counts as a changed account', async () => {
    const db = new FakePlans();
    db.signedInAs = null;
    expect(await saveExamPlan(db, answers(null, null), answers('both', '2026-12-10'), TODAY))
      .toEqual({ status: 'failed', message: SYNC_MESSAGES.accountChanged });
    expect(db.calls).toEqual([]);
  });

  it('a failed account check writes nothing and gives the ordinary, retryable failure', async () => {
    const db = new FakePlans();
    db.rows = [{ course: 'both', exam_date: '2026-12-01' }];
    db.checkFails = true;
    expect(await saveExamPlan(db, answers(null, null), answers('both', '2026-12-10'), TODAY))
      .toEqual({ status: 'failed', message: SYNC_MESSAGES.failed });
    expect(await saveExamPlan(db, answers('both', '2026-12-01'), answers('both', null), TODAY))
      .toEqual({ status: 'failed', message: SYNC_MESSAGES.removeFailed });
    const throws = Object.assign(new FakePlans(), { accountCheck: () => Promise.reject(new Error('x')) });
    expect(await saveExamPlan(throws, answers(null, null), answers('both', '2026-12-10'), TODAY))
      .toEqual({ status: 'failed', message: SYNC_MESSAGES.failed });
    expect(db.calls).toEqual([]);
    expect(throws.calls).toEqual([]);
  });

  it('the account-changed note is one plain lowercase sentence pair', () => {
    expect(SYNC_MESSAGES.accountChanged).toBe(SYNC_MESSAGES.accountChanged.toLowerCase());
    expect(SYNC_MESSAGES.accountChanged).toContain('this device only');
  });
});
