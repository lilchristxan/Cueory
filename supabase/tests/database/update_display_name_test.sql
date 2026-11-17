-- update_display_name (Task 59): the only way a student changes their display name. Signed-in only, checked with the
-- profiles rules, changes only the caller's own row, and limited to 10 changes an hour per account, counted in two
-- fixed fields on the profile. Run by `supabase test db` on a throwaway local database; the accounts below exist only
-- inside this test.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'one@example.com'),
  ('00000000-0000-4000-8000-000000000002', 'two@example.com'),
  ('00000000-0000-4000-8000-000000000003', 'three@example.com');

-- ---- Who may do what.
select ok(
  has_function_privilege('authenticated', 'public.update_display_name(text, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.update_display_name(text, uuid)', 'execute'),
  'signed-in students can run update_display_name and signed-out visitors cannot'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.update_display_name(text, uuid)'::regprocedure)
    and (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.update_display_name(text, uuid)'::regprocedure),
  'update_display_name is security definer with an empty search_path'
);
select function_returns('public', 'update_display_name', array['text', 'uuid'], 'text', 'it returns the name as saved');
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'update')
    and not has_table_privilege('authenticated', 'public.profiles', 'insert')
    and not has_any_column_privilege('authenticated', 'public.profiles', 'update')
    and not has_any_column_privilege('authenticated', 'public.profiles', 'insert'),
  'students can no longer insert or update any column of profiles directly'
);
select column_privs_are(
  'public', 'profiles', 'name_change_window_start', 'authenticated', array['SELECT'],
  'students can only read when their name-change window began'
);
select column_privs_are(
  'public', 'profiles', 'name_changes_in_window', 'authenticated', array['SELECT'],
  'students can only read how many name changes they made in it'
);
select col_default_is('public', 'profiles', 'name_changes_in_window', '0', 'a new profile has made no name changes');
select hasnt_table('public', 'display_name_changes', 'there is no table of name-change notes');

-- ---- Signed out.
set local role anon;
set local "request.jwt.claims" to '{"role": "anon"}';
set local "request.jwt.claim.sub" to '';
select throws_ok(
  $$ select public.update_display_name('sam', (select auth.uid())) $$,
  '42501', null, 'signed-out visitors cannot run it at all'
);

reset role;
set local role authenticated;
set local "request.jwt.claims" to '{"role": "authenticated"}';
set local "request.jwt.claim.sub" to '';
select throws_ok(
  $$ select public.update_display_name('sam', (select auth.uid())) $$,
  '28000', 'sign in to change your display name', 'a call without an account is refused'
);

-- ---- Signed in as account one.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';

select throws_ok(
  $$ update public.profiles set name_changes_in_window = 0 where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'a student cannot reset their own name-change count'
);
select throws_ok(
  $$ update public.profiles set name_change_window_start = null where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'a student cannot move their own name-change window'
);

select is(public.update_display_name('  Sam Smith  ', (select auth.uid())), 'Sam Smith', 'a name is saved without its outer spaces');
select results_eq(
  $$ select id, display_name, name_change_window_start = now(), name_changes_in_window from public.profiles order by id $$,
  $$ values ('00000000-0000-4000-8000-000000000001'::uuid, 'Sam Smith'::text, true, 1::smallint) $$,
  'only the caller''s own row changes, and the first change starts a window'
);

reset role;
select results_eq(
  $$ select id, display_name, name_change_window_start, name_changes_in_window from public.profiles
     where id <> '00000000-0000-4000-8000-000000000001' order by id $$,
  $$ values ('00000000-0000-4000-8000-000000000002'::uuid, null::text, null::timestamptz, 0::smallint),
            ('00000000-0000-4000-8000-000000000003'::uuid, null::text, null::timestamptz, 0::smallint) $$,
  'other accounts are untouched'
);
set local role authenticated;

select throws_ok($$ select public.update_display_name(null, (select auth.uid())) $$, '22023', 'a display name is 1 to 50 characters of plain text', 'no name is refused');
select throws_ok($$ select public.update_display_name('   ', (select auth.uid())) $$, '22023', 'a display name is 1 to 50 characters of plain text', 'an all-space name is refused');
select throws_ok(
  $$ select public.update_display_name(repeat('a', 51), (select auth.uid())) $$, '22023', 'a display name is 1 to 50 characters of plain text',
  'a name over 50 characters is refused'
);
select throws_ok(
  $$ select public.update_display_name(E'sam\nsmith', (select auth.uid())) $$, '22023', 'a display name is 1 to 50 characters of plain text',
  'a name with a control character is refused'
);
select throws_ok(
  $$ select public.update_display_name(E'sam\u0085smith', (select auth.uid())) $$, '22023', 'a display name is 1 to 50 characters of plain text',
  'a name with a C1 control character is refused, like the browser check'
);
select is(public.update_display_name(repeat('é', 50), (select auth.uid())), repeat('é', 50), 'fifty characters are fine, counted as characters');
select is(
  (select name_changes_in_window from public.profiles where id = '00000000-0000-4000-8000-000000000001'),
  2::smallint,
  'refused names are not counted against the limit'
);

-- ---- The limit: 10 changes an hour per account.
select lives_ok(
  $$ select public.update_display_name('name ' || n, (select auth.uid())) from generate_series(3, 10) as n $$,
  'up to 10 changes in an hour are allowed'
);
select throws_ok(
  $$ select public.update_display_name('one too many', (select auth.uid())) $$,
  '54000', 'that is a lot of name changes; please try again later', 'the eleventh change in an hour is refused'
);
select results_eq(
  $$ select display_name, name_changes_in_window from public.profiles where id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values ('name 10'::text, 10::smallint) $$,
  'a refused change leaves the saved name and the count alone'
);

-- Another account has its own limit.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';
select is(public.update_display_name('two', (select auth.uid())), 'two', 'another account is not held back by the first one''s changes');

-- An hour after the window began, the next change starts a new window with a count of one.
reset role;
update public.profiles set name_change_window_start = now() - interval '61 minutes'
  where id = '00000000-0000-4000-8000-000000000001';
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000001';
select is(public.update_display_name('later', (select auth.uid())), 'later', 'changes made more than an hour ago no longer count');
select results_eq(
  $$ select name_change_window_start = now(), name_changes_in_window from public.profiles
     where id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values (true, 1::smallint) $$,
  'the window starts again from this change, so the old count is overwritten'
);

-- Just inside the hour, the old window still counts.
reset role;
update public.profiles set name_change_window_start = now() - interval '59 minutes', name_changes_in_window = 10
  where id = '00000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok(
  $$ select public.update_display_name('still too soon', (select auth.uid())) $$,
  '54000', 'that is a lot of name changes; please try again later', 'a full window less than an hour old still refuses'
);

-- export-my-data reads these two fields with the rest of the profile (exportload.ts), as the student.
select results_eq(
  $$ select display_name, name_changes_in_window from public.profiles $$,
  $$ values ('later'::text, 10::smallint) $$,
  'a student reads their own name-change fields for export-my-data'
);

-- An account without a profile row (it should never happen) is told so.
reset role;
delete from public.profiles where id = '00000000-0000-4000-8000-000000000003';
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000003", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000003';
select throws_ok(
  $$ select public.update_display_name('three', (select auth.uid())) $$,
  'P0002', 'your profile was not found', 'an account without a profile row is refused'
);

-- ---- Bound to the account the page shows (lane 2): another account's id, or none, is refused and nothing changes.
set local "request.jwt.claims" to '{"sub": "00000000-0000-4000-8000-000000000002", "role": "authenticated"}';
set local "request.jwt.claim.sub" to '00000000-0000-4000-8000-000000000002';
select throws_ok(
  $$ select public.update_display_name('meant for account one', '00000000-0000-4000-8000-000000000001') $$,
  '28000', 'the account signed in on this device changed; nothing was saved',
  'a name meant for another account is refused'
);
select throws_ok(
  $$ select public.update_display_name('no account named', null) $$,
  '28000', 'the account signed in on this device changed; nothing was saved',
  'a call that names no account is refused'
);
reset role;
select results_eq(
  $$ select id, display_name, name_changes_in_window from public.profiles order by id $$,
  $$ values ('00000000-0000-4000-8000-000000000001'::uuid, 'later'::text, 10::smallint),
            ('00000000-0000-4000-8000-000000000002'::uuid, 'two'::text, 1::smallint) $$,
  'neither account changed, and the refused calls were not counted'
);
select is(
  to_regprocedure('public.update_display_name(text)'), null,
  'the old one-argument update_display_name is gone, so every change names its account'
);

select * from finish();
rollback;
