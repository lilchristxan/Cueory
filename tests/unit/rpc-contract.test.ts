import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { checkAnswer, type AnswerTransport } from '../../src/islands/checkanswer';
import { exportCsv, exportJson, type ExportData } from '../../src/islands/exportdata';
import { checkReport } from '../../src/islands/flag';
import { flagArguments } from '../../src/islands/flagsubmit';
import { adaptersFor, type AccountClient } from '../../src/islands/accountsettings';
import {
  anatomyStudyMessage, createAnatomyStudy, viewSnapshot, type AnatomyStudyClient, type ReviewQueueRow, type SavedViewRow,
} from '../../src/islands/anatomystudy';
import { studentMessage } from '../../src/islands/rpcerrors';

const sql = [
  '20261101100000_attempts_and_check_answer.sql',
  '20261101120000_flags_and_submit_flag.sql',
  '20261102100000_study_events.sql',
  '20261102110000_delete_my_account.sql',
  // Task 169 redefines three RPCs. Read the last declaration for the effective contract.
  '20261102135000_confirmed_accounts_only.sql',
  '20261102140000_update_display_name.sql',
  '20261102170000_my_sessions.sql',
  '20261112020000_restate_delete_my_account_mfa.sql',
  '20261114151643_delete_my_account_identity_and_mfa.sql',
  '20261116235000_delete_account_recent_amr_proof.sql',
  '20261117030000_anatomy_study.sql',
].map(name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')).join('\n');

type FunctionName =
  | 'submit_flag' | 'check_answer' | 'my_flags' | 'record_study_events' | 'delete_my_account' | 'update_display_name' | 'my_sessions'
  | 'record_anatomy_misses' | 'clear_anatomy_miss' | 'my_anatomy_review_queue' | 'save_anatomy_view' | 'delete_anatomy_view'
  | 'my_anatomy_views';

/** Read the actual declarations and dollar-quoted bodies, rather than copying their contracts into a fixture. */
function declaration(name: FunctionName) {
  const match = [...sql.matchAll(new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(([^)]*)\\)\\s*returns([\\s\\S]*?)as\\s*\\$\\$([\\s\\S]*?)\\$\\$;`, 'gi',
  ))].at(-1);
  if (!match) throw new Error(`The SQL declaration for ${name} was not found; update the contract reader.`);
  const names = (text: string) => text.replace(/--[^\n]*/g, '').split(',')
    .map(part => part.trim().split(/\s+/)[0]!).filter(Boolean);
  const table = /\btable\s*\(([^)]*)\)/i.exec(match[2]!);
  const messages = [...match[3]!.matchAll(/\braise\s+exception\s+'((?:[^']|'')*)'/gi)]
    .map(message => message[1]!.replace(/''/g, "'"));
  if ([...match[3]!.matchAll(/\braise\s+exception\b/gi)].length !== messages.length) {
    throw new Error(`A nonliteral exception in ${name} needs an explicit contract check.`);
  }
  return { arguments: names(match[1]!), columns: table ? names(table[1]!) : [], messages: [...new Set(messages)] };
}

describe('SQL arguments and browser request helpers', () => {
  it('submit_flag names and argument order match the validated flagArguments result', () => {
    const checked = checkReport({ page: '/learn/sample', reason: 'typo', comment: 'sample report' });
    const result = flagArguments(checked, { page: '/learn/sample' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(Object.keys(result.args)).toEqual(declaration('submit_flag').arguments);
    expect(result.args).toMatchObject({ item_id: null, item_version_id: null });
  });

  it('my_flags takes no arguments', () => {
    expect(declaration('my_flags').arguments).toEqual([]);
  });

  it('the version-aware checkAnswer transport matches the SQL argument names and order', async () => {
    const version = { item_id: '00000000-0000-4000-8000-000000000001', id: '00000000-0000-4000-8000-000000000002' };
    const rpc = vi.fn<AnswerTransport['rpc']>(async () => ({
      data: { correct: false, key: ['b'], rationales: { b: 'sample rationale' }, version_id: version.id }, error: null,
    }));
    const result = await checkAnswer({ rpc }, version, ['c', 'a']);
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledOnce();
    const [name, args] = rpc.mock.calls[0]!;
    expect(name).toBe('check_answer');
    expect(Object.keys(args)).toEqual(declaration('check_answer').arguments);
    expect(args).toEqual({ item_id: version.item_id, version_id: version.id, picked: ['a', 'c'] });
  });
});

describe('every explicit SQL refusal has a student message', () => {
  for (const name of ['check_answer', 'submit_flag', 'my_flags', 'delete_my_account', 'update_display_name'] as const) {
    const messages = declaration(name).messages;
    if (name !== 'my_flags') {
      it(`${name} exposes refusals for this contract check to cover`, () => {
        expect(messages.length).toBeGreaterThan(0);
      });
    }
    for (const message of messages) {
      it(`${name}: ${message}`, () => {
        // SQL can gain a refusal before the browser's function-name union does. Such a change must fail this test.
        const fn = name as Parameters<typeof studentMessage>[0];
        const fallback = studentMessage(fn, { message: 'sample: an unmapped database refusal' });
        const mapped = studentMessage(fn, { message });
        expect(mapped, `Add a studentMessage mapping for ${name}: ${message}`).not.toBe(fallback);
        expect(mapped.trim()).not.toBe('');
      });
    }
    if (name === 'my_flags') {
      it('reads the my_flags body even when it currently has no explicit refusals', () => {
        expect(declaration(name).columns.length).toBeGreaterThan(0);
      });
    }
  }
});

describe('my_flags and the exported reports contract', () => {
  it('exports exactly the returned report columns in JSON and CSV using the export’s camel-case field names', () => {
    const report: NonNullable<ExportData['reports']>[number] = {
      id: '00000000-0000-4000-8000-000000000001', page: '/learn/sample',
      itemId: null, itemVersionId: null, reason: 'typo', comment: null, createdAt: '2026-11-01T00:00:00.000Z',
    };
    const expected = declaration('my_flags').columns.map(name => name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()));
    expect(expected.length).toBeGreaterThan(0);
    const data: ExportData = { reports: [report] };
    const json = JSON.parse(exportJson(data, '2026-11-01'));
    expect(json.reports).toEqual([report]);
    expect(Object.keys(json.reports[0])).toEqual(expected);
    const csv = exportCsv(data).find(file => file.fileName === 'reports.csv');
    expect(csv).toBeDefined();
    expect(csv!.text.split('\r\n')[0]!.split(',')).toEqual(expected);
  });
});

describe('record_study_events contract (Task 140)', () => {
  const studyEventsSql = readFileSync(
    new URL('../../supabase/migrations/20261102100000_study_events.sql', import.meta.url), 'utf8',
  );
  const body = /create\s+function\s+public\.record_study_events[\s\S]*?as\s*\$\$([\s\S]*?)\$\$;/i.exec(studyEventsSql)![1]!;

  it('takes one jsonb argument named events and returns the number stored', () => {
    expect(declaration('record_study_events').arguments).toEqual(['events']);
    expect(studyEventsSql).toMatch(/create\s+function\s+public\.record_study_events\(events jsonb\)\s+returns integer\s/i);
  });

  it('raises exactly these literal refusals, which the Task 146 recorder handles', () => {
    // A change here is a contract change for the browser recorder: update it in the same pull request.
    expect(declaration('record_study_events').messages).toEqual([
      'sign in to record study activity',
      'confirm your email to use this',
      'send between 1 and 50 study events',
      'a study event has the wrong shape',
      'a study event time must be between 7 days ago and 5 minutes from now',
      'a study event names a question that was not found',
      'too many study events recorded recently; try again later',
    ]);
  });

  it('accepts exactly the agreed event keys, kinds and marks', () => {
    const list = (pattern: RegExp) => [...pattern.exec(body)![1]!.matchAll(/'([^']*)'/g)].map(m => m[1]);
    expect(list(/k\s*<>\s*all\s*\(array\[([^\]]*)\]\)/i).sort())
      .toEqual(['at', 'item_id', 'kind', 'mark', 'ms_on_item', 'version_id']);
    expect(list(/'kind'\)\s*<>\s*all\s*\(array\[([^\]]*)\]\)/i)).toEqual(['answered', 'marked', 'skipped']);
    expect(list(/'mark'\)\s*<>\s*all\s*\(array\[([^\]]*)\]\)/i)).toEqual(['know', 'learning']);
    expect(body).toMatch(/> 1800000/);
    expect(body).toMatch(/n_events < 1 or n_events > 50/);
  });

  it('is signed-in only, security definer with an empty search_path, and writes as the caller', () => {
    expect(studyEventsSql).toMatch(/returns integer\s+language plpgsql\s+security definer\s+set search_path = ''/i);
    expect(studyEventsSql).toContain('revoke execute on function public.record_study_events(jsonb) from public, anon, authenticated;');
    expect(studyEventsSql).toContain('grant execute on function public.record_study_events(jsonb) to authenticated;');
    expect(body).toMatch(/select uid, \(e ->> 'item_id'\)::uuid/);
  });

  it('gives students only select on their own rows, which the export loader reads', () => {
    expect(studyEventsSql).toContain('grant select on table public.study_events to authenticated;');
    expect(studyEventsSql).not.toMatch(/grant\s+(insert|update|delete)[^;]*to\s+authenticated/i);
    expect(studyEventsSql).toContain('alter table public.study_events enable row level security;');
    expect(studyEventsSql).toMatch(/for select\s+to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/);
    // Every column the export loader selects exists in the table.
    const table = /create table public\.study_events \(([\s\S]*?)\n\);/.exec(studyEventsSql)![1]!;
    for (const column of 'id,item_id,item_version_id,kind,ms_on_item,mark,at,created_at'.split(',')) {
      expect(table).toMatch(new RegExp(`^\\s+${column} `, 'm'));
    }
    expect(table).toMatch(/user_id uuid not null references auth\.users \(id\) on delete cascade/);
  });
});

describe('delete_my_account migration replay order', () => {
  it('has unique versions and replays the recent-auth proof after the staging MFA restatement', () => {
    const names = readdirSync(new URL('../../supabase/migrations/', import.meta.url))
      .filter(name => /^\d{14}_.+\.sql$/.test(name)).sort();
    const versions = names.map(name => name.slice(0, 14));
    expect(new Set(versions).size).toBe(versions.length);
    expect(names).toContain('20261112020000_restate_delete_my_account_mfa.sql');
    expect(names.indexOf('20261112020000_restate_delete_my_account_mfa.sql'))
      .toBeLessThan(names.indexOf('20261116235000_delete_account_recent_amr_proof.sql'));
    // The recent-auth proof is the last file that defines delete_my_account; later migrations must not replace it.
    const lastDelete = names.filter(name =>
      readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8').includes('function public.delete_my_account'),
    ).at(-1);
    expect(lastDelete).toBe('20261116235000_delete_account_recent_amr_proof.sql');
    // Issue #758: anatomy_study was never applied, so it replays after everything already on hosted staging.
    expect(names.indexOf('20261117030000_anatomy_study.sql'))
      .toBeGreaterThan(names.indexOf('20261116235000_delete_account_recent_amr_proof.sql'));
  });
});

describe('delete_my_account contract (Tasks 60, 206)', () => {
  const deleteSql = readFileSync(
    new URL('../../supabase/migrations/20261116235000_delete_account_recent_amr_proof.sql', import.meta.url), 'utf8',
  );

  it('takes the shown account id and returns nothing, so the browser calls supabase.rpc(\'delete_my_account\', { expected_user_id })', () => {
    expect(declaration('delete_my_account').arguments).toEqual(['expected_user_id']);
    expect(deleteSql).toMatch(/create\s+or\s+replace\s+function\s+public\.delete_my_account\(expected_user_id uuid\)\s+returns void\s/i);
    expect(deleteSql).not.toMatch(/drop function if exists public\.delete_my_account\(\);/i);
  });

  it('keeps the sign-in, identity, two-factor and fresh-token refusals the account page handles', () => {
    expect(declaration('delete_my_account').messages).toEqual([
      'sign in to delete your account',
      'the account signed in on this device changed; nothing was deleted',
      'complete two-factor sign-in to continue',
      'please sign in again to delete your account',
    ]);
    expect(deleteSql).toContain('app_private.mfa_access_allowed()');
    expect(deleteSql).toContain('expected_user_id is distinct from uid');
  });

  it('is signed-in only and security definer with an empty search_path', () => {
    expect(deleteSql).toMatch(/returns void\s+language plpgsql\s+security definer\s+set search_path = ''/i);
    expect(deleteSql).toContain('revoke execute on function public.delete_my_account(uuid) from public, anon, authenticated;');
    expect(deleteSql).toContain('grant execute on function public.delete_my_account(uuid) to authenticated;');
    expect(deleteSql).not.toMatch(/grant\s+execute[^;]*to\s+(anon|public)\b/i);
  });
});

describe('update_display_name contract (Task 59, Codex on #230)', () => {
  const nameSql = readFileSync(
    new URL('../../supabase/migrations/20261102140000_update_display_name.sql', import.meta.url), 'utf8',
  );

  it('takes one text argument named new_name, which the account page sends, and returns the saved name', async () => {
    expect(declaration('update_display_name').arguments).toEqual(['new_name']);
    expect(nameSql).toMatch(/create function public\.update_display_name\(new_name text\)\s+returns text\s/i);
    const rpc = vi.fn(async () => ({ data: 'Sample', error: null }));
    const client = { rpc } as unknown as AccountClient;
    expect(await adaptersFor(client).writeName('Sample')).toBe('Sample');
    expect(rpc).toHaveBeenCalledWith('update_display_name', { new_name: 'Sample' });
  });

  it('is signed-in only, security definer with an empty search_path, rate limited, and the only way in', () => {
    expect(nameSql).toMatch(/returns text\s+language plpgsql\s+security definer\s+set search_path = ''/i);
    expect(nameSql).toContain('revoke execute on function public.update_display_name(text) from public, anon, authenticated;');
    expect(nameSql).toContain('grant execute on function public.update_display_name(text) to authenticated;');
    expect(nameSql).toContain('revoke update (display_name) on table public.profiles from authenticated;');
    expect(nameSql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('display-name:' \|\| uid::text, 0\)\)/);
    expect(nameSql).toMatch(/where p\.id = uid;/);
    // No grant to students in this file: the limit's two columns are written only by the function.
    expect(nameSql).not.toMatch(/\bgrant\s+(insert|update|delete)[^;]*\bto\s+(anon|authenticated|public)\b/i);
    expect(nameSql).not.toMatch(/create\s+table/i);
  });

  it('keeps the limit in two profile columns, which export-my-data reads', () => {
    expect(nameSql).toMatch(/add column name_change_window_start timestamptz,/);
    expect(nameSql).toMatch(/add column name_changes_in_window smallint not null default 0/);
    const exportSource = readFileSync(new URL('../../src/islands/exportload.ts', import.meta.url), 'utf8');
    expect(exportSource).toContain("profiles: 'display_name,created_at,name_change_window_start,name_changes_in_window',");
  });
});

describe('my_sessions contract (Task 309)', () => {
  const sessionsSql = readFileSync(new URL('../../supabase/migrations/20261102170000_my_sessions.sql', import.meta.url), 'utf8');

  it('takes no arguments and returns the cursor id plus exactly the exported session fields', () => {
    expect(declaration('my_sessions').arguments).toEqual([]);
    const camel = (name: string) => name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const session: NonNullable<ExportData['sessions']>[number] = {
      createdAt: '2026-11-01T00:00:00.000Z', updatedAt: null, notAfter: null, userAgent: 'sample browser', ip: '203.0.113.5',
    };
    const columns = declaration('my_sessions').columns;
    expect(columns[0]).toBe('id');
    const json = JSON.parse(exportJson({ sessions: [session] }, '2026-11-01'));
    expect(Object.keys(json.sessions[0]).sort()).toEqual(columns.slice(1).map(camel).sort());
    const csv = exportCsv({ sessions: [session] }).find(file => file.fileName === 'sessions.csv')!;
    expect(csv.text.split('\r\n')[0]!.split(',').sort()).toEqual(columns.slice(1).map(camel).sort());
  });

  it('is signed-in only, security definer with an empty search_path, and reads only the caller\'s sessions', () => {
    expect(sessionsSql).toMatch(/language sql\s+stable\s+security definer\s+set search_path = ''/i);
    expect(sessionsSql).toContain('revoke execute on function public.my_sessions() from public, anon, authenticated;');
    expect(sessionsSql).toContain('grant execute on function public.my_sessions() to authenticated;');
    expect(sessionsSql).not.toMatch(/grant\s+execute[^;]*to\s+(anon|public)\b/i);
    expect(sessionsSql).toMatch(/where s\.user_id = \(select auth\.uid\(\)\)/);
  });
});

describe('anatomy study contract (Task 178)', () => {
  const anatomySql = readFileSync(new URL('../../supabase/migrations/20261117030000_anatomy_study.sql', import.meta.url), 'utf8');
  const camera = { position: [0, 0, 3] as [number, number, number], target: [0, 0, 0] as [number, number, number] };
  const signatures = {
    record_anatomy_misses: 'text, text[], uuid', clear_anatomy_miss: 'text, text, uuid', my_anatomy_review_queue: 'uuid',
    save_anatomy_view: 'text, text, jsonb, text[], text[], text, uuid', delete_anatomy_view: 'uuid, uuid', my_anatomy_views: 'text, uuid',
  } as const;

  it('declares the six functions with the agreed argument names, in order', () => {
    expect(declaration('record_anatomy_misses').arguments).toEqual(['system_key', 'structure_ids', 'expected_user_id']);
    expect(declaration('clear_anatomy_miss').arguments).toEqual(['system_key', 'structure_id', 'expected_user_id']);
    expect(declaration('my_anatomy_review_queue').arguments).toEqual(['expected_user_id']);
    expect(declaration('save_anatomy_view').arguments).toEqual(['system_key', 'name', 'camera', 'hidden', 'faded', 'selected', 'expected_user_id']);
    expect(declaration('delete_anatomy_view').arguments).toEqual(['id', 'expected_user_id']);
    expect(declaration('my_anatomy_views').arguments).toEqual(['system_key', 'expected_user_id']);
    expect(anatomySql).toMatch(/create function public\.record_anatomy_misses\(system_key text, structure_ids text\[\], expected_user_id uuid\)\s+returns integer\s/);
    expect(anatomySql).toMatch(/create function public\.clear_anatomy_miss\(system_key text, structure_id text, expected_user_id uuid\)\s+returns boolean\s/);
    expect(anatomySql).toMatch(/create function public\.my_anatomy_review_queue\(expected_user_id uuid\)\s+returns setof public\.anatomy_review_queue\s/);
    expect(anatomySql).toMatch(/returns uuid\s+language plpgsql\s+security definer\s+set search_path = ''/);
    expect(anatomySql).toMatch(/create function public\.delete_anatomy_view\(id uuid, expected_user_id uuid\)\s+returns boolean\s/);
    expect(anatomySql).toMatch(/create function public\.my_anatomy_views\(system_key text, expected_user_id uuid\)\s+returns setof public\.anatomy_saved_views\s/);
  });

  it('is signed-in only, security definer with an empty search_path, and the only way to write', () => {
    for (const [name, args] of Object.entries(signatures)) {
      expect(anatomySql).toContain(`revoke execute on function public.${name}(${args}) from public, anon, authenticated;`);
      expect(anatomySql).toContain(`grant execute on function public.${name}(${args}) to authenticated;`);
    }
    expect([...anatomySql.matchAll(/security definer\s+set search_path = ''/g)]).toHaveLength(6);
    expect(anatomySql).not.toMatch(/grant\s+execute[^;]*to\s+(anon|public)\b/i);
    expect(anatomySql).not.toMatch(/grant\s+(insert|update|delete)[^;]*to\s+authenticated/i);
    for (const table of ['anatomy_review_queue', 'anatomy_saved_views']) {
      expect(anatomySql).toContain(`grant select on table public.${table} to authenticated;`);
      expect(anatomySql).toContain(`alter table public.${table} enable row level security;`);
      expect(anatomySql).toMatch(new RegExp(`on public\\.${table}\\s+for select\\s+to authenticated\\s+using \\(\\(select auth\\.uid\\(\\)\\) = user_id\\)`));
      expect(anatomySql).toMatch(new RegExp(`user_id uuid not null references auth\\.users \\(id\\) on delete cascade[\\s\\S]*?\\n\\);[\\s\\S]*?comment on table public\\.${table}`));
    }
    // Each writer takes its own lock and refuses confirmed-account and MFA failures the same way the others do.
    expect(anatomySql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('anatomy_misses:' \|\| uid::text, 0\)\)/);
    expect(anatomySql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('anatomy_views:' \|\| uid::text, 0\)\)/);
    expect([...anatomySql.matchAll(/u\.email_confirmed_at is not null and u\.is_anonymous is not true/g)]).toHaveLength(6);
    expect([...anatomySql.matchAll(/app_private\.mfa_access_allowed\(\)/g)]).toHaveLength(6 + 2 * 2);
    expect(anatomySql).toContain('hourly_limit constant integer := 600;');
    expect(anatomySql).toContain('max_views constant integer := 50;');
    // The write cap on a student's whole review history sits strictly below what export-my-data reads.
    const writeCap = Number(/lifetime_limit constant integer := (\d+);/.exec(anatomySql)![1]);
    const exportCap = Number(/anatomy_review_queue: ([\d_]+),/.exec(readFileSync(new URL('../../src/islands/exportload.ts', import.meta.url), 'utf8'))![1]!.replace(/_/g, ''));
    expect(writeCap).toBe(5000);
    expect(writeCap).toBeLessThan(exportCap);
  });

  it('raises exactly these literal refusals, which the browser module maps to student sentences', () => {
    const expected: Record<keyof typeof signatures, string[]> = {
      record_anatomy_misses: ['sign in to record what you missed', 'study account changed; reload before continuing', 'confirm your email to use this', 'complete two-factor sign-in to continue',
        'that anatomy system was not found', 'send between 1 and 50 structures', 'a structure id has the wrong shape',
        'too many misses recorded recently; try again later', 'your review history is full'],
      clear_anatomy_miss: ['sign in to change your review list', 'study account changed; reload before continuing', 'confirm your email to use this', 'complete two-factor sign-in to continue',
        'that anatomy system was not found', 'a structure id has the wrong shape'],
      my_anatomy_review_queue: ['sign in to see your review list', 'study account changed; reload before continuing', 'confirm your email to use this', 'complete two-factor sign-in to continue'],
      save_anatomy_view: ['sign in to save a view', 'study account changed; reload before continuing', 'confirm your email to use this', 'complete two-factor sign-in to continue',
        'that anatomy system was not found', 'a view name is 1 to 60 characters of plain text', 'the camera has the wrong shape',
        'a structure id has the wrong shape', 'you can keep up to 50 saved views; delete one first'],
      delete_anatomy_view: ['sign in to delete a view', 'study account changed; reload before continuing', 'confirm your email to use this', 'complete two-factor sign-in to continue',
        'that view was not found'],
      my_anatomy_views: ['sign in to see your saved views', 'study account changed; reload before continuing', 'confirm your email to use this', 'complete two-factor sign-in to continue',
        'that anatomy system was not found'],
    };
    const fallback = anatomyStudyMessage({ message: 'sample: an unmapped database refusal' });
    for (const [name, messages] of Object.entries(expected) as [keyof typeof signatures, string[]][]) {
      expect(declaration(name).messages, name).toEqual(messages);
      for (const message of messages) {
        expect(anatomyStudyMessage({ message }), `Add an anatomyStudyMessage mapping for ${name}: ${message}`).not.toBe(fallback);
      }
    }
  });

  it('sends the SQL argument names from the browser module', async () => {
    // Supabase's RPC builder supports range() for paginated set-returning functions.
    // Keep the test double faithful to that chain without changing the SQL argument checks.
    const rpc = vi.fn((fn: string, _args?: unknown) => {
      const replies: Record<string, unknown> = {
        record_anatomy_misses: 1, clear_anatomy_miss: true, my_anatomy_review_queue: [] as ReviewQueueRow[],
        save_anatomy_view: '00000000-0000-4000-8000-000000000001', delete_anatomy_view: true, my_anatomy_views: [] as SavedViewRow[],
      };
      const response = { data: replies[fn], error: null };
      return fn === 'my_anatomy_review_queue'
        ? { range: (_from: number, _to: number) => Promise.resolve(response) }
        : Promise.resolve(response);
    });
    const client = { auth: { getSession: async () => ({ data: { session: { user: { id: 'student-1' } } }, error: null }) }, rpc } as unknown as AnatomyStudyClient;
    const study = createAnatomyStudy(async () => client);
    await study.recordMisses('heart', ['FMA1'], 'student-1');
    await study.clearMiss('heart', 'FMA1', 'student-1');
    await study.reviewQueue('student-1');
    await study.saveView({ systemKey: 'heart', name: 'front', camera, hidden: [] }, 'student-1');
    await study.deleteView('00000000-0000-4000-8000-000000000001', 'student-1');
    await study.views('heart', 'student-1');
    const sent = Object.fromEntries(rpc.mock.calls.map(([fn, args]) => [fn, args ? Object.keys(args as object) : []]));
    for (const name of Object.keys(signatures) as (keyof typeof signatures)[]) {
      expect(sent[name], name).toEqual(declaration(name).arguments);
    }
    const snapshot = viewSnapshot({ systemKey: 'heart', name: 'front', camera, hidden: [] });
    expect(snapshot.ok && Object.keys(snapshot.args)).toEqual(declaration('save_anatomy_view').arguments.filter(name => name !== 'expected_user_id'));
  });

  it('the review row and saved view types name exactly the table columns the functions return', () => {
    const columns = (table: string) => [...new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(anatomySql)![1]!
      .matchAll(/^\s{2}([a-z_]+) /gm)].map((m) => m[1]!).filter((c) => c !== 'constraint');
    const queueRow: ReviewQueueRow = {
      id: '', system_key: '', structure_id: '', missed_count: 1, first_missed_at: '', last_missed_at: '', cleared_at: null,
    };
    const viewRow: SavedViewRow = {
      id: '', system_key: '', name: '', camera, hidden: [], faded: [], selected: null, created_at: '', updated_at: '',
    };
    expect(Object.keys(queueRow).sort()).toEqual(columns('anatomy_review_queue').filter((c) => c !== 'user_id').sort());
    expect(Object.keys(viewRow).sort()).toEqual(columns('anatomy_saved_views').filter((c) => c !== 'user_id').sort());
  });
});
